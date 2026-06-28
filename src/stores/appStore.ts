import { computed, ref, toRaw } from 'vue';
import { defineStore } from 'pinia';
import { deleteEntity, loadSnapshot, putEntity, replaceSnapshot } from '@/data/db';
import { defaultSettings } from '@/data/seed';
import type { AppSettings, AppSnapshot, CharacterProfile, CharacterProfileHistoryEntry, CharacterProfileHistoryField, ChatImageAttachment, ChatImageCandidate, ChatLocationAttachment, ChatMessage, ChatMessageQuote, ChatMode, ChatModelOverrides, ChatModelScope, ChatOfflineInvitationAttachment, ChatOfflineInvitationStatus, ChatTransferAttachment, ChatTransferStatus, ChatVoiceAttachment, Conversation, ConversationMemoryRecord, ConversationSettings, FavoriteMessageKind, FavoriteMessageRecord, GeneratedImageRecord, ImageModuleId, MusicCommentThread, MusicTrack, Sticker, StickerGroup, UserProfile, VisualProfile, VoomComment, VoomFrequency, VoomImageCandidate, VoomPost, VoomPostVisibility, WorldBookEntry } from '@/types/domain';
import { createAccountId, createId } from '@/utils/id';
import { getCharacterInitialProfile, getCharacterVoomAuthorName, normalizeCharacterMindStateLines, normalizeCharacterProfile } from '@/utils/character';
import { normalizeUserProfile, normalizeVisualProfile } from '@/utils/profile';
import { getImageGenerationSize, getImagePromptPresetForProvider, getSelectedImageModelOption, mergeVendorModels, normalizeAppSettings, normalizeChatModelOverrides } from '@/utils/settings';
import { normalizeWorldBookEntry, normalizeWorldBooks } from '@/utils/worldBook';
import { RECENT_STICKER_GROUP_NAME, createStickerFromDraft, createStickerGroup, isLegacyGanadiSticker, isLegacyGanadiStickerGroup, isRecentStickerGroupId, localizeStickerImageUrl, normalizeSticker, normalizeStickerGroup, shouldLocalizeStickerImageUrl, sortRecentStickers, type StickerImportDraft } from '@/utils/stickers';
import { ageMemoryKind, createMemoryRecord, estimateTokenCount, getConversationFloorCount, getHiddenMessageIds, getMemoryContext, getMemoryHiddenEndFloor, getMessageFloorMap, getMessagesInFloorRange, getNextSummaryRange, getVisibleMessages, normalizeConversationSettings, renderCharacterMemoryPrompt, shouldCompressMemory } from '@/utils/memory';
import { formatContentWithChineseTranslation, normalizeTranslationText } from '@/utils/translation';
import { estimateRoleplayReplyInputTokens, fetchVendorModels, generateConversationSummary, generateEmbeddingVector, generateImageByProvider, generateRoleplayReply, generateUserVoomComments, generateVoomCommentReplies, generateVoomPost, hasTextGenerationConfig, shouldAutoGenerateMoment, type RoleplayReplyResult, type RoleplayReplySegment } from '@/services/ai';
import { GitHubBackupError, downloadGitHubBackup, downloadGitHubBackupVersion, ensureGitHubBackupRepository, formatGitHubBackupError, listGitHubBackupHistory, uploadGitHubBackup } from '@/services/githubBackup';
import { showLinkNotification } from '@/services/keepAlive';
import { playRingtone } from '@/services/ringtone';
import { synthesizeSpeech } from '@/services/tts';
import { createLinkBackupFile, parseLinkBackupFileText, parseLinkBackupText, stickerBackupPlaceholder, stringifyLinkBackupFile } from '@/utils/backup';
import { getVoomFrequencyChance, stripVoomCommentReplyPrefix } from '@/utils/voom';
import { compressInlineImageDataUrl } from '@/utils/imageFile';

interface CreateUserVoomPostPayload {
  userId: string;
  content: string;
  image?: string;
  imageDescription?: string;
  visibility: VoomPostVisibility;
  characterIds: string[];
}

type ConversationSummaryResultStatus = 'created' | 'updated' | 'existing' | 'busy';

export type DataCleanupAction = 'generated-images' | 'message-media' | 'sticker-local-cache' | 'image-candidates' | 'voice-audio' | 'memory-vectors';
export type ClearableDataSection = 'messages' | 'voomPosts' | 'music' | 'worldBooks' | 'stickers' | 'conversationSettings' | 'conversationMemories' | 'generatedImages';

interface ConversationSummaryResult {
  record: ConversationMemoryRecord;
  status: ConversationSummaryResultStatus;
}

interface ProfileHistorySource {
  sourceConversationId?: string;
  sourceReplyBatchId?: string;
}

const memoryTimelineTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function formatMemoryTimelineTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '未知时间';
  return memoryTimelineTimeFormatter.format(timestamp);
}

function renderMessageTimelineContext(messages: ChatMessage[], floorMap: Map<string, number>, fallbackFloor: number) {
  return messages
    .map((message) => `${floorMap.get(message.id) ?? fallbackFloor}楼：${formatMemoryTimelineTime(message.createdAt)}`)
    .join('\n');
}

function renderMemoryRangeTimelineContext(memories: ConversationMemoryRecord[]) {
  return memories
    .map((memory) => `【${memory.startFloor}-${memory.endFloor}楼】记忆创建：${formatMemoryTimelineTime(memory.createdAt)}；最近更新：${formatMemoryTimelineTime(memory.updatedAt)}`)
    .join('\n');
}

function getCharacterTrackedMood(character: CharacterProfile) {
  return normalizeCharacterMindStateLines(character.mindState?.lines).join('\n');
}

function createCharacterProfileHistoryEntries(previousCharacter: CharacterProfile, nextCharacter: CharacterProfile, source: ProfileHistorySource = {}): CharacterProfileHistoryEntry[] {
  const createdAt = Date.now();
  const changes: Array<{ field: CharacterProfileHistoryField; previousValue: string; nextValue: string }> = [
    { field: 'nickname', previousValue: previousCharacter.nickname, nextValue: nextCharacter.nickname },
    { field: 'signature', previousValue: previousCharacter.signature, nextValue: nextCharacter.signature },
    { field: 'mood', previousValue: getCharacterTrackedMood(previousCharacter), nextValue: getCharacterTrackedMood(nextCharacter) }
  ];

  return changes.flatMap((change) => {
    const previousValue = String(change.previousValue ?? '').trim();
    const nextValue = String(change.nextValue ?? '').trim();
    if (previousValue === nextValue) return [];
    return [{
      id: createId('profile-history'),
      field: change.field,
      previousValue,
      nextValue,
      createdAt,
      ...(source.sourceConversationId ? { sourceConversationId: source.sourceConversationId } : {}),
      ...(source.sourceReplyBatchId ? { sourceReplyBatchId: source.sourceReplyBatchId } : {})
    }];
  });
}

export const useAppStore = defineStore('app', () => {
  const ready = ref(false);
  let hydratePromise: Promise<void> | null = null;
  let githubBackupRunning = false;
  let stickerImportCacheQueue = Promise.resolve();
  const summarizingConversationRanges = new Set<string>();
  const generatingMomentConversationIds = new Set<string>();
  const regeneratingChatImageMessageIds = new Set<string>();
  const regeneratingVoomImagePostIds = new Set<string>();
  const replyingConversationIds = ref<string[]>([]);
  const loadingReply = computed(() => replyingConversationIds.value.length > 0);
  const replyingVoomCommentPostIds = ref<string[]>([]);
  const configAlert = ref({ open: false, title: '提示', message: '' });
  const users = ref<UserProfile[]>([]);
  const characters = ref<CharacterProfile[]>([]);
  const conversations = ref<Conversation[]>([]);
  const activeConversationId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const voomPosts = ref<VoomPost[]>([]);
  const musicFavoriteTracks = ref<MusicTrack[]>([]);
  const musicCommentThreads = ref<MusicCommentThread[]>([]);
  const worldBooks = ref<WorldBookEntry[]>([]);
  const stickerGroups = ref<StickerGroup[]>([]);
  const stickers = ref<Sticker[]>([]);
  const conversationSettings = ref<ConversationSettings[]>([]);
  const conversationMemories = ref<ConversationMemoryRecord[]>([]);
  const generatedImages = ref<GeneratedImageRecord[]>([]);
  const favorites = ref<FavoriteMessageRecord[]>([]);
  const settings = ref<AppSettings | null>(null);
  const user = computed(() => {
    if (!users.value.length) return null;
    const activeUserId = settings.value?.activeUserId?.trim();
    return users.value.find((item) => item.id === activeUserId) ?? users.value[0] ?? null;
  });

  const charactersForActiveUser = computed(() => {
    const activeUserId = user.value?.id;
    return activeUserId ? characters.value.filter((character) => character.boundUserId === activeUserId) : characters.value;
  });
  const conversationsForActiveUser = computed(() => {
    const activeUserId = user.value?.id;
    return activeUserId ? conversations.value.filter((conversation) => conversation.userId === activeUserId) : conversations.value;
  });
  const sortedConversations = computed(() => [...conversationsForActiveUser.value].sort((a, b) => b.updatedAt - a.updatedAt));
  const sortedVoomPosts = computed(() => [...voomPosts.value].sort((a, b) => b.createdAt - a.createdAt));
  const sortedStickerGroups = computed(() => [...stickerGroups.value].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt);
    if (orderDiff) return orderDiff;
    const createdDiff = a.createdAt - b.createdAt;
    if (createdDiff) return createdDiff;
    return a.id.localeCompare(b.id);
  }));
  const sortedStickers = computed(() => [...stickers.value].sort((a, b) => b.updatedAt - a.updatedAt));
  const recentStickers = computed(() => sortRecentStickers(stickers.value));
  const unreadConversationCount = computed(() => conversationsForActiveUser.value.reduce((total, conversation) => total + conversation.unreadCount, 0));
  const accounts = computed(() => users.value);

  function dedupeStickerGroups(groups: StickerGroup[], entries: Sticker[]) {
    const seenByName = new Map<string, StickerGroup>();
    const removedIdToKeptId = new Map<string, string>();
    const dedupedGroups: StickerGroup[] = [];

    for (const group of groups) {
      const key = group.name.trim().toLocaleLowerCase();
      const existingGroup = seenByName.get(key);
      if (existingGroup) {
        removedIdToKeptId.set(group.id, existingGroup.id);
        continue;
      }
      seenByName.set(key, group);
      dedupedGroups.push(group);
    }

    const dedupedStickers = entries.map((sticker) => {
      const groupIds = sticker.groupIds.map((id) => removedIdToKeptId.get(id) ?? id);
      return { ...sticker, groupIds: [...new Set(groupIds)] };
    });

    return { dedupedGroups, dedupedStickers, removedGroupIds: [...removedIdToKeptId.keys()] };
  }

  function normalizeStickerLibrary(rawGroups: StickerGroup[], rawStickers: Sticker[]) {
    const removedGroupIds = new Set<string>();
    const removedStickerIds = new Set<string>();
    const normalizedGroups = rawGroups
      .map((entry) => normalizeStickerGroup(entry))
      .filter((entry): entry is StickerGroup => Boolean(entry))
      .filter((entry) => {
        if (isRecentStickerGroupId(entry.id) || isLegacyGanadiStickerGroup(entry)) {
          removedGroupIds.add(entry.id);
          return false;
        }
        return true;
      });
    const fallbackGroupId = normalizedGroups[0]?.id ?? '';
    const normalizedStickers = rawStickers
      .map((entry) => normalizeSticker(entry, fallbackGroupId))
      .filter((entry): entry is Sticker => Boolean(entry))
      .filter((entry) => {
        if (isLegacyGanadiSticker(entry) || entry.groupIds.some((id) => removedGroupIds.has(id) || isRecentStickerGroupId(id))) {
          removedStickerIds.add(entry.id);
          return false;
        }
        return true;
      });
    const { dedupedGroups, dedupedStickers, removedGroupIds: duplicateGroupIds } = dedupeStickerGroups(normalizedGroups, normalizedStickers);
    duplicateGroupIds.forEach((id) => removedGroupIds.add(id));
    return {
      groups: dedupedGroups,
      stickers: dedupedStickers,
      removedGroupIds: [...removedGroupIds],
      removedStickerIds: [...removedStickerIds]
    };
  }

  function normalizeSnapshotForRestore(snapshot: AppSnapshot): AppSnapshot {
    const normalizedUsers = snapshot.users.map((entry) => normalizeUserProfile(entry));
    if (!normalizedUsers.length) throw new Error('备份文件里没有用户资料。');

    const fallbackUserId = snapshot.settings.activeUserId || normalizedUsers[0].id;
    const stickerLibrary = normalizeStickerLibrary(snapshot.stickerGroups, snapshot.stickers);

    return {
      users: normalizedUsers,
      characters: snapshot.characters.map((entry) => normalizeCharacterProfile(entry, fallbackUserId)),
      conversations: snapshot.conversations,
      messages: snapshot.messages,
      voomPosts: snapshot.voomPosts,
      musicFavoriteTracks: snapshot.musicFavoriteTracks ?? [],
      musicCommentThreads: snapshot.musicCommentThreads ?? [],
      worldBooks: normalizeWorldBooks(snapshot.worldBooks),
      stickerGroups: stickerLibrary.groups,
      stickers: stickerLibrary.stickers,
      conversationSettings: snapshot.conversationSettings.map((entry) => normalizeConversationSettings({
        ...entry,
        characterStickerGroupIds: entry.characterStickerGroupIds.filter((id) => !isRecentStickerGroupId(id) && !stickerLibrary.removedGroupIds.includes(id))
      }, entry.conversationId)),
      conversationMemories: dedupeConversationMemories(snapshot.conversationMemories.map((memory) => ({
        ...memory,
        kind: ageMemoryKind(memory.createdAt),
        vector: Array.isArray(memory.vector) ? memory.vector : []
      }))).memories,
      generatedImages: normalizeGeneratedImages(snapshot.generatedImages ?? []),
      favorites: normalizeFavorites(snapshot.favorites ?? []),
      settings: normalizeAppSettings({
        ...defaultSettings,
        ...snapshot.settings,
        activeUserId: snapshot.settings.activeUserId || normalizedUsers[0].id
      })
    };
  }

  function getMemoryRangeKey(memory: Pick<ConversationMemoryRecord, 'conversationId' | 'mode' | 'startFloor' | 'endFloor' | 'isMergedSummary'>) {
    return `${memory.conversationId}:${memory.mode}:${memory.isMergedSummary ? 'merged' : 'single'}:${memory.startFloor}-${memory.endFloor}`;
  }

  function isSameMemoryRange(
    memory: Pick<ConversationMemoryRecord, 'conversationId' | 'mode' | 'startFloor' | 'endFloor' | 'isMergedSummary'>,
    target: Pick<ConversationMemoryRecord, 'conversationId' | 'mode' | 'startFloor' | 'endFloor' | 'isMergedSummary'>
  ) {
    return getMemoryRangeKey(memory) === getMemoryRangeKey(target);
  }

  function sortMemoriesByFreshness(memories: ConversationMemoryRecord[]) {
    return [...memories].sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
      if (right.createdAt !== left.createdAt) return right.createdAt - left.createdAt;
      return right.id.localeCompare(left.id);
    });
  }

  function dedupeConversationMemories(memories: ConversationMemoryRecord[]) {
    const latestByRange = new Map<string, ConversationMemoryRecord>();
    const duplicateIds: string[] = [];

    for (const memory of sortMemoriesByFreshness(memories)) {
      const rangeKey = getMemoryRangeKey(memory);
      if (latestByRange.has(rangeKey)) {
        duplicateIds.push(memory.id);
        continue;
      }
      latestByRange.set(rangeKey, memory);
    }

    return {
      memories: [...latestByRange.values()],
      duplicateIds
    };
  }

  async function removeDuplicateConversationMemories(memories: ConversationMemoryRecord[]) {
    const { memories: dedupedMemories, duplicateIds } = dedupeConversationMemories(memories);
    if (duplicateIds.length) {
      await Promise.all(duplicateIds.map((memoryId) => deleteEntity('conversationMemories', memoryId)));
    }
    return dedupedMemories;
  }

  function keepDeviceGitHubBackupSettings(snapshot: AppSnapshot): AppSnapshot {
    const currentBackup = settings.value?.githubBackup;
    if (!currentBackup || (!currentBackup.token && !currentBackup.owner && !currentBackup.enabled && !currentBackup.lastBackupAt)) return snapshot;

    return {
      ...snapshot,
      settings: normalizeAppSettings({
        ...snapshot.settings,
        githubBackup: currentBackup
      })
    };
  }

  function applySnapshotToStore(snapshot: AppSnapshot) {
    users.value = snapshot.users;
    characters.value = snapshot.characters;
    conversations.value = snapshot.conversations;
    messages.value = snapshot.messages;
    voomPosts.value = snapshot.voomPosts;
    musicFavoriteTracks.value = snapshot.musicFavoriteTracks ?? [];
    musicCommentThreads.value = snapshot.musicCommentThreads ?? [];
    worldBooks.value = snapshot.worldBooks;
    stickerGroups.value = snapshot.stickerGroups;
    stickers.value = snapshot.stickers;
    conversationSettings.value = snapshot.conversationSettings;
    conversationMemories.value = dedupeConversationMemories(snapshot.conversationMemories).memories;
    generatedImages.value = snapshot.generatedImages;
    favorites.value = normalizeFavorites(snapshot.favorites ?? []);
    settings.value = snapshot.settings;
    activeConversationId.value = null;
    ready.value = true;
  }

  async function hydrate() {
    if (ready.value) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
    const snapshot = await loadSnapshot();
    users.value = snapshot.users.map((entry) => normalizeUserProfile(entry));
    const fallbackUserId = snapshot.settings.activeUserId || snapshot.users[0]?.id || '';
    characters.value = snapshot.characters.map((entry) => normalizeCharacterProfile(entry, fallbackUserId));
    conversations.value = snapshot.conversations;
    messages.value = snapshot.messages;
    voomPosts.value = snapshot.voomPosts;
    musicFavoriteTracks.value = snapshot.musicFavoriteTracks ?? [];
    musicCommentThreads.value = snapshot.musicCommentThreads ?? [];
    worldBooks.value = snapshot.worldBooks;
    const stickerLibrary = normalizeStickerLibrary(snapshot.stickerGroups, snapshot.stickers);
    stickerGroups.value = stickerLibrary.groups;
    stickers.value = stickerLibrary.stickers;
    if (stickerLibrary.removedGroupIds.length || stickerLibrary.removedStickerIds.length) {
      await Promise.all([
        ...stickerLibrary.removedGroupIds.map((groupId) => deleteEntity('stickerGroups', groupId)),
        ...stickerLibrary.removedStickerIds.map((stickerId) => deleteEntity('stickers', stickerId)),
        ...stickerLibrary.stickers.map((sticker) => putEntity('stickers', sticker))
      ]);
    }
    conversationSettings.value = snapshot.conversationSettings.map((entry) => normalizeConversationSettings({
      ...entry,
      characterStickerGroupIds: entry.characterStickerGroupIds.filter((id) => !isRecentStickerGroupId(id) && !stickerLibrary.removedGroupIds.includes(id))
    }, entry.conversationId));
    conversationMemories.value = await removeDuplicateConversationMemories(snapshot.conversationMemories.map((memory) => ({
      ...memory,
      kind: ageMemoryKind(memory.createdAt),
      vector: Array.isArray(memory.vector) ? memory.vector : []
    })));
    generatedImages.value = normalizeGeneratedImages(snapshot.generatedImages ?? []);
    favorites.value = normalizeFavorites(snapshot.favorites ?? []);
    settings.value = normalizeAppSettings({
      ...snapshot.settings,
      activeUserId: snapshot.settings.activeUserId || snapshot.users[0]?.id || ''
    });
    ready.value = true;
    void refreshEnabledVendorModels();
    })().finally(() => {
      hydratePromise = null;
    });
    return hydratePromise;
  }

  function userById(id: string) {
    return users.value.find((account) => account.id === id);
  }

  function characterById(id: string) {
    return characters.value.find((character) => character.id === id);
  }

  function conversationById(id: string) {
    return conversations.value.find((conversation) => conversation.id === id);
  }

  function setActiveConversation(conversationId: string | null) {
    activeConversationId.value = conversationId;
  }

  function unreadCountAfterIncomingMessage(conversation: Conversation, messageCount: number) {
    return activeConversationId.value === conversation.id ? 0 : conversation.unreadCount + messageCount;
  }

  function messagesForConversation(id: string) {
    return messages.value.filter((message) => message.conversationId === id).sort((a, b) => a.createdAt - b.createdAt);
  }

  function normalizeGeneratedImages(entries: GeneratedImageRecord[]) {
    return entries
      .map((entry) => ({
        ...entry,
        provider: (['openai', 'novelai', 'pollinations'].includes(entry.provider) ? entry.provider : 'openai') as ImageModuleId,
        imageUrl: String(entry.imageUrl ?? '').trim(),
        title: String(entry.title ?? '').trim(),
        prompt: String(entry.prompt ?? '').trim(),
        negativePrompt: String(entry.negativePrompt ?? '').trim(),
        model: String(entry.model ?? '').trim(),
        size: String(entry.size ?? '').trim(),
        source: ['settings', 'world-book', 'voom'].includes(entry.source) ? entry.source : 'settings',
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now()
      } satisfies GeneratedImageRecord))
      .filter((entry) => entry.id && entry.imageUrl);
  }

  function generatedImagesForProvider(provider: ImageModuleId) {
    return generatedImages.value
      .filter((entry) => entry.provider === provider)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function settingsForConversation(id: string) {
    const existing = conversationSettings.value.find((entry) => entry.conversationId === id);
    if (existing) return normalizeConversationSettings(existing, id);
    const conversation = conversationById(id);
    const character = conversation ? characterById(conversation.charId) : null;
    return normalizeConversationSettings({ voomFrequency: character?.voomFrequency }, id);
  }

  function memoriesForConversation(id: string) {
    return conversationMemories.value
      .filter((memory) => memory.conversationId === id)
      .sort((a, b) => a.startFloor - b.startFloor);
  }

  function stickersForGroup(groupId: string) {
    if (isRecentStickerGroupId(groupId)) return recentStickers.value;
    if (!groupId || groupId === 'all') return sortedStickers.value;
    return sortedStickers.value.filter((sticker) => sticker.groupIds[0] === groupId);
  }

  function stickersForGroups(groupIds: string[]) {
    const groupIdSet = new Set(groupIds.map((id) => id.trim()).filter((id) => Boolean(id) && !isRecentStickerGroupId(id)));
    if (!groupIdSet.size) return [];
    return sortedStickers.value.filter((sticker) => groupIdSet.has(sticker.groupIds[0] ?? ''));
  }

  function resolveCharacterStickerSelections(selections: string[] | undefined, allowedStickers: Sticker[]) {
    if (!selections?.length || !allowedStickers.length) return [];
    const byId = new Map(allowedStickers.map((sticker) => [sticker.id.toLocaleLowerCase(), sticker]));
    const byDescription = new Map(allowedStickers.map((sticker) => [sticker.description.toLocaleLowerCase(), sticker]));
    const resolved: Sticker[] = [];
    const seenIds = new Set<string>();
    for (const selection of selections) {
      const key = selection.trim().toLocaleLowerCase();
      if (!key) continue;
      const sticker = byId.get(key) ?? byDescription.get(key);
      if (!sticker || seenIds.has(sticker.id)) continue;
      seenIds.add(sticker.id);
      resolved.push(sticker);
    }
    return resolved.slice(0, 4);
  }

  function visibleMessagesForConversation(id: string) {
    return getVisibleMessages(messagesForConversation(id), memoriesForConversation(id), settingsForConversation(id));
  }

  function hiddenMessageIdsForConversation(id: string) {
    return getHiddenMessageIds(messagesForConversation(id), memoriesForConversation(id), settingsForConversation(id));
  }

  function memoryContextForConversation(id: string) {
    return getMemoryContext(memoriesForConversation(id));
  }

  function nextReplyTokenCountForConversation(id: string) {
    const conversation = conversationById(id);
    if (!conversation) return 0;
    const character = characterById(conversation.charId);
    if (!character) return 0;
    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return 0;
    const chatSettings = settingsForConversation(id);
    const availableCharacterStickers = stickersForGroups(chatSettings.characterStickerGroupIds);
    const conversationMessages = messagesForConversation(id).filter((message) => message.replyVariantState !== 'inactive');
    const lastUserMessages = [...conversationMessages].reverse().filter((message, index, reversedMessages) => {
      const previousMessages = reversedMessages.slice(0, index);
      return message.sender === 'user' && !previousMessages.some((previous) => previous.sender === 'char');
    }).reverse();
    const userMessageText = lastUserMessages.map((message) => messageReadableContent(message)).join('\n');
    return estimateRoleplayReplyInputTokens({
      user: boundUser,
      character,
      boundUser,
      mode: conversation.activeMode,
      messages: visibleMessagesForConversation(id),
      worldBooks: worldBooks.value,
      conversationSummary: conversation.summary,
      memorySummary: memoryContextForConversation(id),
      stickerVisionEnabled: chatSettings.stickerVisionEnabled,
      narrationModeEnabled: chatSettings.narrationModeEnabled,
      offlineInvitationEnabled: chatSettings.offlineInvitationEnabled,
      timeAwareness: chatSettings.timeAwareness,
      offlineSettings: chatSettings.offline,
      availableStickers: availableCharacterStickers.map((sticker) => ({
        stickerId: sticker.id,
        description: sticker.description,
        imageUrl: sticker.imageUrl
      })),
      userMessage: userMessageText,
      settings: settings.value ?? undefined,
      modelOverride: getConversationTextModelOverride(chatSettings, conversation.activeMode)
    });
  }

  function lastMessageForConversation(id: string) {
    const conversationMessages = messagesForConversation(id);
    return conversationMessages[conversationMessages.length - 1];
  }

  function showConfigAlert(message: string, title = '提示') {
    configAlert.value = { open: true, title, message };
  }

  function hasConfiguredTextModel(modelOverride = '') {
    return hasTextGenerationConfig(settings.value ?? undefined, modelOverride);
  }

  function getGlobalTextModelOverride(scope: ChatModelScope) {
    return settings.value?.modelOverrides[scope]?.trim() ?? '';
  }

  function modelOverridesForConversation(id: string): ChatModelOverrides {
    const chatSettings = settingsForConversation(id);
    const conversation = conversationById(id);
    const character = conversation ? characterById(conversation.charId) : null;
    const characterOverrides = normalizeChatModelOverrides(character?.modelOverrides);
    const legacyConversationOverrides = normalizeChatModelOverrides(chatSettings.modelOverrides);

    return normalizeChatModelOverrides({
      online: characterOverrides.online || legacyConversationOverrides.online,
      offline: characterOverrides.offline || legacyConversationOverrides.offline,
      summary: characterOverrides.summary || legacyConversationOverrides.summary,
      voom: characterOverrides.voom || legacyConversationOverrides.voom
    });
  }

  function getConversationTextModelOverride(chatSettings: ConversationSettings, scope: ChatModelScope, fallbackScope?: ChatModelScope) {
    const localOverrides = modelOverridesForConversation(chatSettings.conversationId);
    const localOverride = localOverrides[scope]?.trim() ?? '';
    if (localOverride) return localOverride;

    const globalOverride = getGlobalTextModelOverride(scope);
    if (globalOverride) return globalOverride;

    if (fallbackScope && fallbackScope !== scope) {
      const fallbackLocalOverride = localOverrides[fallbackScope]?.trim() ?? '';
      if (fallbackLocalOverride) return fallbackLocalOverride;
      return getGlobalTextModelOverride(fallbackScope);
    }

    return '';
  }

  async function clearLegacyModelOverridesForCharacter(characterId: string) {
    const emptyOverrides = normalizeChatModelOverrides(null);
    const updates = conversationSettings.value
      .filter((entry) => conversationById(entry.conversationId)?.charId === characterId)
      .filter((entry) => Object.values(normalizeChatModelOverrides(entry.modelOverrides)).some(Boolean))
      .map((entry) => normalizeConversationSettings({
        ...entry,
        modelOverrides: emptyOverrides
      }, entry.conversationId));

    if (!updates.length) return;

    const updatesById = new Map(updates.map((entry) => [entry.conversationId, entry]));
    conversationSettings.value = conversationSettings.value.map((entry) => updatesById.get(entry.conversationId) ?? entry);
    await Promise.all(updates.map((entry) => putEntity('conversationSettings', entry)));
  }

  async function saveCharacterModelOverridesForConversation(conversationId: string, nextOverrides: ChatModelOverrides) {
    const normalizedOverrides = normalizeChatModelOverrides(nextOverrides);
    const conversation = conversationById(conversationId);
    const character = conversation ? characterById(conversation.charId) : null;
    const chatSettings = settingsForConversation(conversationId);

    if (character) {
      await saveCharacter({
        ...character,
        modelOverrides: normalizedOverrides
      });
      await clearLegacyModelOverridesForCharacter(character.id);
      return;
    }

    await saveConversationSettings({
      ...chatSettings,
      modelOverrides: normalizedOverrides
    });
  }

  function isReplyingVoomComments(postId: string) {
    return replyingVoomCommentPostIds.value.includes(postId);
  }

  function isConversationReplying(conversationId: string) {
    return replyingConversationIds.value.includes(conversationId);
  }

  function startConversationReply(conversationId: string) {
    if (isConversationReplying(conversationId)) return false;
    replyingConversationIds.value = [...replyingConversationIds.value, conversationId];
    return true;
  }

  function finishConversationReply(conversationId: string) {
    replyingConversationIds.value = replyingConversationIds.value.filter((id) => id !== conversationId);
  }

  function proactiveReplyCooldownMs(frequency: VoomFrequency) {
    return {
      'very-low': 6 * 60 * 60 * 1000,
      low: 3 * 60 * 60 * 1000,
      medium: 60 * 60 * 1000,
      high: 30 * 60 * 1000,
      'very-high': 10 * 60 * 1000,
      always: 2 * 60 * 1000
    }[frequency];
  }

  async function touchProactiveReplyAttempt(chatSettings: ConversationSettings, timestamp = Date.now()) {
    await saveConversationSettings({
      ...chatSettings,
      proactiveReply: {
        ...chatSettings.proactiveReply,
        lastTriggeredAt: timestamp
      }
    });
  }

  function conversationForVoomPost(post: VoomPost) {
    const explicitConversation = post.conversationId ? conversationById(post.conversationId) : null;
    if (explicitConversation) return explicitConversation;

    const firstConversationId = post.conversationIds?.find(Boolean);
    if (firstConversationId) return conversationById(firstConversationId) ?? null;

    return post.charId ? conversations.value.find((entry) => entry.charId === post.charId) ?? null : null;
  }

  function conversationsForVoomPost(post: VoomPost) {
    const explicitIds = post.conversationIds?.map((id) => id.trim()).filter(Boolean) ?? [];
    const candidates = explicitIds.length
      ? explicitIds.map((id) => conversationById(id))
      : [conversationForVoomPost(post)];
    const seen = new Set<string>();
    return candidates.filter((conversation): conversation is Conversation => {
      if (!conversation || seen.has(conversation.id)) return false;
      seen.add(conversation.id);
      return true;
    });
  }

  function formatVoomCommentEvent(comment: VoomComment, comments: VoomComment[]) {
    const parentName = comment.parentId ? comments.find((entry) => entry.id === comment.parentId)?.authorName : '';
    const content = formatContentWithChineseTranslation(comment.content, comment.contentTranslation);
    return parentName
      ? `【VOOM 评论】${comment.authorName} 回复 ${parentName}: ${content}`
      : `【VOOM 评论】${comment.authorName}: ${content}`;
  }

  function voomAuthorNameForPost(post: VoomPost) {
    const character = characterById(post.charId);
    return character ? getCharacterVoomAuthorName(character) : post.authorName;
  }

  function notificationPreview(content: string, fallback: string) {
    const normalizedContent = content.replace(/\s+/g, ' ').trim() || fallback;
    return normalizedContent.length > 120 ? `${normalizedContent.slice(0, 117)}...` : normalizedContent;
  }

  function characterForVoomComment(comment: VoomComment) {
    const authorId = String(comment.authorId ?? '').trim();
    const authorName = comment.authorName.trim().toLocaleLowerCase();
    return characters.value.find((character) => {
      if (authorId && character.id === authorId) return true;
      return [character.nickname, character.name, getCharacterVoomAuthorName(character)]
        .map((name) => name.trim().toLocaleLowerCase())
        .includes(authorName);
    }) ?? null;
  }

  function isCurrentUserVoomComment(comment: VoomComment) {
    const currentUser = user.value;
    if (!currentUser) return false;
    if (comment.authorId && comment.authorId === currentUser.id) return true;
    const authorName = comment.authorName.trim().toLocaleLowerCase();
    return [currentUser.nickname, currentUser.name]
      .map((name) => name.trim().toLocaleLowerCase())
      .filter(Boolean)
      .includes(authorName);
  }

  function notifyCharacterMessages(conversation: Conversation, charMessages: ChatMessage[]) {
    const character = characterById(conversation.charId);
    const displayName = character?.nickname || character?.name || conversation.title || '角色';
    const latestMessage = charMessages[charMessages.length - 1];
    const body = notificationPreview(
      charMessages.map((message) => messageReadableContent(message)).join('\n'),
      '发来了新消息'
    );
    void playRingtone(settings.value, 'message', conversation.charId);
    void showLinkNotification(settings.value?.keepAlive, {
      kind: 'message',
      title: `${displayName} 发来消息`,
      body,
      tag: `link-message-${conversation.id}`,
      icon: character?.avatar,
      url: `/chats/${conversation.id}`
    });
  }

  function notifyVoomPost(post: VoomPost, conversation?: Conversation | null) {
    if (post.authorType === 'user') return;
    const characterId = post.charId || conversation?.charId || '';
    const character = characterId ? characterById(characterId) : null;
    const authorName = voomAuthorNameForPost(post);
    const body = notificationPreview(formatContentWithChineseTranslation(post.content, post.contentTranslation), '发布了新的 VOOM 动态');
    void playRingtone(settings.value, 'voom', characterId);
    void showLinkNotification(settings.value?.keepAlive, {
      kind: 'voom',
      title: `${authorName} 发布了 VOOM`,
      body,
      tag: `link-voom-post-${post.id}`,
      icon: character?.avatar || post.authorAvatar,
      url: '/voom'
    });
  }

  function notifyVoomComments(post: VoomPost, comments: VoomComment[], conversation?: Conversation | null) {
    const characterComments = comments.filter((comment) => !isCurrentUserVoomComment(comment));
    if (!characterComments.length) return;
    const latestComment = characterComments[characterComments.length - 1];
    const character = characterForVoomComment(latestComment) ?? (conversation?.charId ? characterById(conversation.charId) : null);
    const title = characterComments.length > 1
      ? `${latestComment.authorName} 等评论了 VOOM`
      : `${latestComment.authorName} 评论了 VOOM`;
    const body = notificationPreview(formatContentWithChineseTranslation(latestComment.content, latestComment.contentTranslation), '有新的 VOOM 评论');
    void playRingtone(settings.value, 'voom', character?.id || conversation?.charId || post.charId);
    void showLinkNotification(settings.value?.keepAlive, {
      kind: 'voom',
      title,
      body,
      tag: `link-voom-comment-${post.id}`,
      icon: character?.avatar || post.authorAvatar,
      url: '/voom'
    });
  }

  function formatVoomLikeEvent(likes: string[], authorName: string) {
    return `【VOOM】${likes.join('、')} 赞了 ${authorName} 的动态。`;
  }

  function createPersistableVoomPost(post: VoomPost): VoomPost {
    const rawPost = toRaw(post);
    return {
      ...rawPost,
      conversationIds: rawPost.conversationIds ? [...rawPost.conversationIds] : undefined,
      visibleCharacterIds: rawPost.visibleCharacterIds ? [...rawPost.visibleCharacterIds] : undefined,
      imageCandidates: rawPost.imageCandidates?.map((candidate) => ({ ...toRaw(candidate) })),
      comments: rawPost.comments.map((comment) => ({ ...toRaw(comment) })),
      likes: [...rawPost.likes]
    };
  }

  function createVoomImageCandidate(input: Omit<VoomImageCandidate, 'id' | 'createdAt'> & Partial<Pick<VoomImageCandidate, 'id' | 'createdAt'>>): VoomImageCandidate {
    return {
      id: input.id || createId('voom-image'),
      image: input.image,
      description: input.description,
      provider: input.provider,
      model: input.model,
      size: input.size,
      createdAt: input.createdAt ?? Date.now()
    };
  }

  function createChatImageCandidate(input: Omit<ChatImageCandidate, 'id' | 'createdAt'> & Partial<Pick<ChatImageCandidate, 'id' | 'createdAt'>>): ChatImageCandidate {
    return {
      id: input.id || createId('chat-image'),
      image: input.image,
      description: input.description,
      provider: input.provider,
      model: input.model,
      size: input.size,
      createdAt: input.createdAt ?? Date.now()
    };
  }

  function imageSizeToDimensions(size = '') {
    const [width, height] = size.split('x').map((value) => Number.parseInt(value, 10));
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? { width, height }
      : {};
  }

  function normalizeDuplicateKey(value = '') {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  function estimateVoiceDuration(content: string, duration?: number) {
    if (Number.isFinite(duration) && duration && duration > 0) return Math.max(1, Math.round(duration));
    return Math.max(1, Math.ceil(content.trim().length / 4));
  }

  function estimateJsonBytes(value: unknown) {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      return 0;
    }
  }

  function isInlineMediaUrl(value = '') {
    return /^data:(?:image|audio)\//i.test(value.trim());
  }

  async function compactInlineDisplayImage(value = '') {
    const imageUrl = value.trim();
    if (!/^data:image\//i.test(imageUrl)) return value;
    try {
      return await compressInlineImageDataUrl(imageUrl, { maxDimension: 800, quality: 0.62, minBytes: 160 * 1024 });
    } catch {
      return value;
    }
  }

  function stripInlineMediaUrl(value: string | undefined, fallback = '') {
    const normalizedValue = String(value ?? '').trim();
    return isInlineMediaUrl(normalizedValue) ? fallback : normalizedValue;
  }

  function stripChatImageCache(image: ChatImageAttachment): ChatImageAttachment {
    return {
      ...image,
      url: stripInlineMediaUrl(image.url),
      candidates: image.candidates?.map((candidate) => ({ ...candidate, image: stripInlineMediaUrl(candidate.image) })).filter((candidate) => candidate.image)
    };
  }

  function stripVoiceAudioCache(voice: ChatVoiceAttachment): ChatVoiceAttachment {
    return {
      ...voice,
      audioUrl: stripInlineMediaUrl(voice.audioUrl)
    };
  }

  function stripMessageMediaCache(message: ChatMessage): ChatMessage {
    return {
      ...message,
      sticker: message.sticker ? { ...message.sticker, imageUrl: stripInlineMediaUrl(message.sticker.imageUrl, stickerBackupPlaceholder) } : undefined,
      image: message.image ? stripChatImageCache(message.image) : undefined,
      voice: message.voice ? stripVoiceAudioCache(message.voice) : undefined,
      quote: message.quote ? {
        ...message.quote,
        sticker: message.quote.sticker ? { ...message.quote.sticker, imageUrl: stripInlineMediaUrl(message.quote.sticker.imageUrl, stickerBackupPlaceholder) } : undefined,
        image: message.quote.image ? stripChatImageCache(message.quote.image) : undefined,
        voice: message.quote.voice ? stripVoiceAudioCache(message.quote.voice) : undefined
      } : undefined
    };
  }

  function stripImageCandidates(message: ChatMessage): ChatMessage {
    return message.image?.candidates?.length
      ? { ...message, image: { ...message.image, candidates: undefined } }
      : message;
  }

  function stripVoiceAudio(message: ChatMessage): ChatMessage {
    return message.voice?.audioUrl || message.quote?.voice?.audioUrl
      ? {
        ...message,
        voice: message.voice ? { ...message.voice, audioUrl: '' } : undefined,
        quote: message.quote?.voice ? { ...message.quote, voice: { ...message.quote.voice, audioUrl: '' } } : message.quote
      }
      : message;
  }

  function estimateFreedBytes(beforeValue: unknown, afterValue: unknown) {
    return Math.max(0, estimateJsonBytes(beforeValue) - estimateJsonBytes(afterValue));
  }

  function normalizeLocationAttachment(location: ChatLocationAttachment): ChatLocationAttachment | null {
    const name = location.name.trim();
    const distance = location.distance.trim();
    if (!name || !distance) return null;
    return {
      name,
      address: location.address?.trim() || undefined,
      distance
    };
  }

  function formatLocationContent(location: ChatLocationAttachment) {
    return `[定位] ${[location.name, location.address, location.distance].map((item) => item?.trim()).filter(Boolean).join(' · ')}`;
  }

  function normalizeTransferAttachment(transfer: Pick<ChatTransferAttachment, 'amount' | 'note'>): ChatTransferAttachment | null {
    const amount = String(transfer.amount ?? '').replace(/[￥¥,\s]/g, '').trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return null;
    return {
      amount,
      currency: 'CNY',
      note: transfer.note?.trim() || undefined,
      status: 'pending'
    };
  }

  function formatTransferContent(transfer: Pick<ChatTransferAttachment, 'amount' | 'note' | 'status'>) {
    const statusText = {
      pending: '待处理',
      accepted: '已接收',
      rejected: '已拒绝'
    }[transfer.status];
    return `[转账] ¥${transfer.amount}${transfer.note ? ` · ${transfer.note}` : ''} · ${statusText}`;
  }

  function formatOfflineInvitationContent(invitation: Pick<ChatOfflineInvitationAttachment, 'status'>) {
    const statusText = {
      pending: '等待选择',
      accepted: '已接受',
      rejected: '已拒绝'
    }[invitation.status];
    return `[线下邀请] ${statusText}`;
  }

  function normalizeOfflineInvitationAttachment(prompt: string): ChatOfflineInvitationAttachment | null {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return null;
    return {
      prompt: normalizedPrompt,
      status: 'pending'
    };
  }

  async function appendConversationEvent(conversationId: string, content: string, options: Partial<Pick<ChatMessage, 'mode' | 'voomPostId' | 'voomCommentId' | 'voomEventType' | 'replyBatchId' | 'createdAt'>> = {}) {
    const conversation = conversationById(conversationId);
    if (!conversation || !content.trim()) return null;
    const message: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'system',
      mode: options.mode ?? conversation.activeMode,
      content: content.trim(),
      createdAt: options.createdAt ?? Date.now(),
      displayStyle: 'narration',
      status: 'sent',
      voomPostId: options.voomPostId,
      voomCommentId: options.voomCommentId,
      voomEventType: options.voomEventType,
      replyBatchId: options.replyBatchId
    };
    messages.value.push(message);
    await putEntity('messages', message);
    const nextConversation = { ...conversation, updatedAt: message.createdAt };
    const index = conversations.value.findIndex((item) => item.id === conversationId);
    if (index >= 0) conversations.value[index] = nextConversation;
    await putEntity('conversations', nextConversation);
    return message;
  }

  function expandMessageIds(messageIds: string | string[]) {
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    return [...new Set(ids.flatMap((id) => String(id).split('__')).map((id) => id.trim()).filter(Boolean))];
  }

  function isRoleplayNarrationMessage(message: ChatMessage) {
    return message.sender === 'system'
      && message.displayStyle === 'narration'
      && !message.voomPostId
      && !message.voomCommentId
      && !message.voomEventType;
  }

  function cloneMessageQuote(quote?: ChatMessageQuote | null): ChatMessageQuote | undefined {
    if (!quote?.messageId || !quote.content.trim()) return undefined;
    return {
      messageId: quote.messageId,
      sender: quote.sender,
      authorName: quote.authorName.trim() || '未知',
      content: quote.content.trim(),
      sticker: quote.sticker ? { ...quote.sticker } : undefined,
      image: quote.image ? { ...quote.image } : undefined,
      voice: quote.voice ? { ...quote.voice } : undefined,
      location: quote.location ? { ...quote.location } : undefined,
      transfer: quote.transfer ? { ...quote.transfer } : undefined,
      offlineInvitation: quote.offlineInvitation ? { ...quote.offlineInvitation } : undefined
    };
  }

  function messageReadableContent(message: ChatMessage) {
    if (message.sticker) return `[Sticker] ${message.sticker.description}`.trim();
    if (message.image) return `[图片] ${message.image.description}`.trim();
    if (message.voice) return `[语音] ${message.voice.transcript}`.trim();
    if (message.location) return formatLocationContent(message.location).trim();
    if (message.transfer) return formatTransferContent(message.transfer).trim();
    if (message.offlineInvitation) return formatOfflineInvitationContent(message.offlineInvitation).trim();
    return message.content.trim();
  }

  function favoriteKindForMessage(message: ChatMessage): FavoriteMessageKind {
    if (message.sticker) return 'sticker';
    if (message.image) return 'image';
    if (message.voice) return 'voice';
    if (message.location) return 'location';
    if (message.transfer) return 'transfer';
    if (message.offlineInvitation) return 'offlineInvitation';
    if (message.displayStyle === 'narration') return 'narration';
    return 'text';
  }

  function normalizeFavorites(entries: FavoriteMessageRecord[]) {
    return entries
      .filter((entry) => entry?.id && entry.sourceMessageId && entry.message)
      .map((entry) => ({
        ...entry,
        kind: favoriteKindForMessage(entry.message),
        summary: entry.summary?.trim() || messageReadableContent(entry.message),
        messageCreatedAt: Number.isFinite(entry.messageCreatedAt) ? entry.messageCreatedAt : entry.message.createdAt,
        favoritedAt: Number.isFinite(entry.favoritedAt) ? entry.favoritedAt : Date.now()
      }))
      .sort((left, right) => right.favoritedAt - left.favoritedAt);
  }

  const sortedFavorites = computed(() => [...favorites.value].sort((left, right) => right.favoritedAt - left.favoritedAt));

  function messageAuthorName(message: ChatMessage) {
    const conversation = conversationById(message.conversationId);
    if (message.sender === 'char') {
      const character = conversation ? characterById(conversation.charId) : null;
      return character?.nickname || character?.name || '角色';
    }
    if (message.sender === 'user') {
      const character = conversation ? characterById(conversation.charId) : null;
      const boundUser = character ? userById(character.boundUserId) : null;
      return boundUser?.nickname || boundUser?.name || user.value?.nickname || user.value?.name || '我';
    }
    return '系统';
  }

  function createMessageQuoteSnapshot(message: ChatMessage): ChatMessageQuote | null {
    const content = messageReadableContent(message);
    if (!content) return null;
    return {
      messageId: message.id,
      sender: message.sender,
      authorName: messageAuthorName(message),
      content,
      sticker: message.sticker ? { ...message.sticker } : undefined,
      image: message.image ? { ...message.image } : undefined,
      voice: message.voice ? { ...message.voice } : undefined,
      location: message.location ? { ...message.location } : undefined,
      transfer: message.transfer ? { ...message.transfer } : undefined,
      offlineInvitation: message.offlineInvitation ? { ...message.offlineInvitation } : undefined
    };
  }

  function createFavoriteSnapshot(message: ChatMessage): FavoriteMessageRecord {
    const conversation = conversationById(message.conversationId);
    const character = conversation ? characterById(conversation.charId) : null;
    const boundUser = conversation ? userById(conversation.userId) : null;
    const authorName = messageAuthorName(message);
    const authorAvatar = message.sender === 'char'
      ? character?.avatar
      : message.sender === 'user'
        ? boundUser?.avatar || user.value?.avatar
        : undefined;

    return {
      id: createId('fav'),
      sourceMessageId: message.id,
      conversationId: message.conversationId,
      mode: message.mode,
      kind: favoriteKindForMessage(message),
      sender: message.sender,
      authorName,
      authorAvatar,
      characterId: character?.id,
      characterName: character?.nickname || character?.name,
      characterAvatar: character?.avatar,
      userId: boundUser?.id,
      userName: boundUser?.nickname || boundUser?.name,
      userAvatar: boundUser?.avatar,
      summary: messageReadableContent(message),
      message: toRaw(message),
      messageCreatedAt: message.createdAt,
      favoritedAt: Date.now()
    };
  }

  function isMessageFavorited(messageId: string) {
    return favorites.value.some((entry) => entry.sourceMessageId === messageId);
  }

  async function addFavoriteMessage(message: ChatMessage) {
    const existing = favorites.value.find((entry) => entry.sourceMessageId === message.id);
    if (existing) return existing;
    const favorite = createFavoriteSnapshot(message);
    favorites.value = normalizeFavorites([favorite, ...favorites.value]);
    await putEntity('favorites', favorite);
    return favorite;
  }

  async function deleteFavorite(favoriteId: string) {
    const index = favorites.value.findIndex((entry) => entry.id === favoriteId);
    if (index < 0) return false;
    favorites.value.splice(index, 1);
    await deleteEntity('favorites', favoriteId);
    return true;
  }

  async function pruneMemoriesForMessageIds(messageIds: string[]) {
    const idSet = new Set(messageIds);
    if (!idSet.size) return;
    const memoriesToRemove = conversationMemories.value.filter((memory) => memory.sourceMessageIds.some((id) => idSet.has(id)));
    if (!memoriesToRemove.length) return;
    const removedMemoryIds = new Set(memoriesToRemove.map((memory) => memory.id));
    conversationMemories.value = conversationMemories.value.filter((memory) => !removedMemoryIds.has(memory.id));
    await Promise.all(memoriesToRemove.map((memory) => deleteEntity('conversationMemories', memory.id)));
  }

  async function touchConversationAfterMessageChange(conversationId: string, fallbackTime = Date.now()) {
    const conversation = conversationById(conversationId);
    if (!conversation) return;
    const remainingMessages = messagesForConversation(conversationId);
    const latestMessage = remainingMessages[remainingMessages.length - 1];
    const nextConversation = {
      ...conversation,
      updatedAt: latestMessage?.createdAt ?? fallbackTime,
      unreadCount: 0
    };
    const conversationIndex = conversations.value.findIndex((item) => item.id === conversationId);
    if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    await putEntity('conversations', nextConversation);
  }

  async function deleteMessages(messageIds: string | string[]) {
    const ids = expandMessageIds(messageIds);
    if (!ids.length) return 0;
    const idSet = new Set(ids);
    const messagesToRemove = messages.value.filter((message) => idSet.has(message.id));
    if (!messagesToRemove.length) return 0;
    const affectedConversationIds = [...new Set(messagesToRemove.map((message) => message.conversationId))];
    messages.value = messages.value.filter((message) => !idSet.has(message.id));
    await Promise.all(messagesToRemove.map((message) => deleteEntity('messages', message.id)));
    await pruneMemoriesForMessageIds(messagesToRemove.map((message) => message.id));
    await Promise.all(affectedConversationIds.map((conversationId) => touchConversationAfterMessageChange(conversationId)));
    return messagesToRemove.length;
  }

  async function saveMessages(nextMessages: ChatMessage[]) {
    if (!nextMessages.length) return;
    const nextById = new Map(nextMessages.map((message) => [message.id, message]));
    messages.value = messages.value.map((message) => nextById.get(message.id) ?? message);
    await Promise.all(nextMessages.map((message) => putEntity('messages', message)));
    const affectedConversationIds = [...new Set(nextMessages.map((message) => message.conversationId))];
    await Promise.all(affectedConversationIds.map((conversationId) => touchConversationAfterMessageChange(conversationId)));
  }

  async function updateMessageContent(messageId: string, content: string) {
    const trimmedContent = content.trim();
    if (!trimmedContent) return null;
    const messageIndex = messages.value.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return null;
    const existingMessage = messages.value[messageIndex];
    const nextMessage: ChatMessage = {
      ...existingMessage,
      content: existingMessage.sticker
        ? `[Sticker] ${trimmedContent}`
        : existingMessage.image
          ? `[图片] ${trimmedContent}`
          : existingMessage.voice
            ? `[语音] ${trimmedContent}`
            : existingMessage.location
              ? `[定位] ${trimmedContent}`
          : trimmedContent,
      sticker: existingMessage.sticker ? { ...existingMessage.sticker, description: trimmedContent } : existingMessage.sticker,
      image: existingMessage.image ? { ...existingMessage.image, description: trimmedContent } : existingMessage.image,
      voice: existingMessage.voice ? { ...existingMessage.voice, transcript: trimmedContent } : existingMessage.voice,
      location: existingMessage.location ? { ...existingMessage.location, name: trimmedContent } : existingMessage.location,
      editedAt: Date.now()
    };
    messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    await pruneMemoriesForMessageIds([nextMessage.id]);
    await touchConversationAfterMessageChange(nextMessage.conversationId, nextMessage.editedAt);
    return nextMessage;
  }

  async function updateMessageLocation(messageId: string, location: ChatLocationAttachment) {
    const normalizedLocation = normalizeLocationAttachment(location);
    if (!normalizedLocation) return null;
    const messageIndex = messages.value.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return null;
    const existingMessage = messages.value[messageIndex];
    if (!existingMessage.location) return null;
    const editedAt = Date.now();
    const nextMessage: ChatMessage = {
      ...existingMessage,
      content: formatLocationContent(normalizedLocation),
      location: normalizedLocation,
      editedAt
    };
    messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    await pruneMemoriesForMessageIds([nextMessage.id]);
    await touchConversationAfterMessageChange(nextMessage.conversationId, editedAt);
    return nextMessage;
  }

  async function updateMessageTransfer(messageId: string, transfer: Pick<ChatTransferAttachment, 'amount' | 'note' | 'status'>) {
    const amount = String(transfer.amount ?? '').replace(/[￥¥,\s]/g, '').trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return null;
    const status: ChatTransferStatus = ['accepted', 'rejected'].includes(transfer.status) ? transfer.status : 'pending';
    const messageIndex = messages.value.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return null;
    const existingMessage = messages.value[messageIndex];
    if (!existingMessage.transfer) return null;
    const editedAt = Date.now();
    const nextTransfer: ChatTransferAttachment = {
      amount,
      currency: 'CNY',
      note: transfer.note?.trim() || undefined,
      status,
      ...(status === 'pending'
        ? {}
        : { respondedAt: existingMessage.transfer.respondedAt ?? editedAt })
    };
    const nextMessage: ChatMessage = {
      ...existingMessage,
      content: formatTransferContent(nextTransfer),
      transfer: nextTransfer,
      editedAt
    };
    messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    await pruneMemoriesForMessageIds([nextMessage.id]);
    await touchConversationAfterMessageChange(nextMessage.conversationId, editedAt);
    return nextMessage;
  }

  async function generateMessageVoiceAudio(messageId: string, options: { force?: boolean } = {}) {
    const messageIndex = messages.value.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) throw new Error('语音消息不存在。');

    const existingMessage = messages.value[messageIndex];
    if (!existingMessage.voice) throw new Error('这条消息不是语音消息。');
    if (existingMessage.voice.audioUrl && !options.force) return existingMessage.voice.audioUrl;
    if (existingMessage.sender !== 'char') throw new Error('这条语音没有可播放的本地录音。');

    const currentSettings = settings.value;
    if (!currentSettings) throw new Error('设置尚未载入。');

    const generated = await synthesizeSpeech(existingMessage.voice.transcript, currentSettings);
    const nextMessage: ChatMessage = {
      ...existingMessage,
      voice: {
        ...existingMessage.voice,
        audioUrl: generated.audioUrl,
        mimeType: generated.mimeType,
        ttsProvider: generated.provider,
        ttsVoiceId: generated.voiceId,
        ttsGeneratedAt: Date.now()
      }
    };
    messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    return generated.audioUrl;
  }

  async function recallMessage(messageId: string, options: { actor?: 'user' | 'char'; replyBatchId?: string } = {}) {
    const [id] = expandMessageIds(messageId);
    if (!id) return null;
    const targetMessage = messages.value.find((message) => message.id === id);
    if (!targetMessage || targetMessage.sender === 'system') return null;
    if (options.actor && targetMessage.sender !== options.actor) return null;
    const conversation = conversationById(targetMessage.conversationId);
    if (!conversation) return null;
    const actorName = targetMessage.sender === 'user' ? '你' : messageAuthorName(targetMessage);
    const recalledContent = messageReadableContent(targetMessage);
    await deleteMessages(targetMessage.id);
    return appendConversationEvent(
      targetMessage.conversationId,
      `${actorName}撤回了一条消息：${recalledContent}`,
      { mode: targetMessage.mode, replyBatchId: options.replyBatchId }
    );
  }

  async function recordVoomPostEvents(post: VoomPost, mode?: ChatMode) {
    const targetConversations = conversationsForVoomPost(post);
    if (!targetConversations.length) return;
    const authorName = voomAuthorNameForPost(post);
    const imageEventText = post.imageDescription ? `配图：${post.imageDescription}` : post.image ? '配图：本地图片' : '';

    for (const targetConversation of targetConversations) {
      const eventMode = mode ?? targetConversation.activeMode;
      await appendConversationEvent(
        targetConversation.id,
        [
          `【VOOM】${authorName} 发布了动态：${formatContentWithChineseTranslation(post.content, post.contentTranslation)}`,
          imageEventText
        ].filter(Boolean).join('\n'),
        { mode: eventMode, voomPostId: post.id, voomEventType: 'post', createdAt: post.createdAt }
      );
      if (post.likes.length) {
        await appendConversationEvent(
          targetConversation.id,
          formatVoomLikeEvent(post.likes, authorName),
          { mode: eventMode, voomPostId: post.id, voomEventType: 'like', createdAt: post.createdAt + 1 }
        );
      }
      for (const [index, comment] of post.comments.entries()) {
        await appendConversationEvent(
          targetConversation.id,
          formatVoomCommentEvent(comment, post.comments),
          { mode: eventMode, voomPostId: post.id, voomCommentId: comment.id, voomEventType: 'comment', createdAt: comment.createdAt ?? post.createdAt + post.likes.length + index + 1 }
        );
      }
    }
  }

  async function saveUserProfile(nextUser: UserProfile) {
    const normalizedUser = normalizeUserProfile(nextUser);
    const index = users.value.findIndex((item) => item.id === normalizedUser.id);
    if (index >= 0) users.value[index] = normalizedUser;
    else users.value.unshift(normalizedUser);
    await putEntity('user', normalizedUser);
  }

  async function saveUsers(nextUsers: UserProfile[]) {
    users.value = nextUsers.map((entry) => normalizeUserProfile(entry));
    await Promise.all(users.value.map((entry) => putEntity('user', entry)));
  }

  async function setActiveUser(userId: string) {
    if (!settings.value) return;
    const normalizedSettings = normalizeAppSettings({ ...settings.value, activeUserId: userId });
    settings.value = normalizedSettings;
    await putEntity('settings', normalizedSettings, 'main');
  }

  async function markVoomCharactersRead(characterIds: string[]) {
    if (!settings.value || !user.value) return;
    const readableCharacterIds = [...new Set(characterIds.map((id) => id.trim()).filter(Boolean))];
    if (!readableCharacterIds.length) return;

    const userId = user.value.id;
    const currentUserReadAt = settings.value.voomReadAtByUser[userId] ?? {};
    const nextUserReadAt = { ...currentUserReadAt };
    const now = Date.now();
    let changed = false;

    for (const characterId of readableCharacterIds) {
      if ((nextUserReadAt[characterId] ?? 0) >= now) continue;
      nextUserReadAt[characterId] = now;
      changed = true;
    }

    if (!changed) return;
    const normalizedSettings = normalizeAppSettings({
      ...settings.value,
      voomReadAtByUser: {
        ...settings.value.voomReadAtByUser,
        [userId]: nextUserReadAt
      }
    });
    settings.value = normalizedSettings;
    await putEntity('settings', normalizedSettings, 'main');
  }

  async function saveVisualProfile(nextProfile: VisualProfile) {
    if (!user.value) return;
    await saveUserProfile({ ...user.value, profile: normalizeVisualProfile(nextProfile, user.value) });
  }

  async function saveCharacter(nextCharacter: CharacterProfile, options: { profileHistorySource?: ProfileHistorySource } = {}) {
    const existingCharacter = characters.value.find((character) => character.id === nextCharacter.id);
    const characterToNormalize = existingCharacter?.initialProfile && !nextCharacter.initialProfile
      ? { ...nextCharacter, initialProfile: existingCharacter.initialProfile }
      : nextCharacter;
    const normalizedCharacterBase = normalizeCharacterProfile(characterToNormalize, user.value?.id || users.value[0]?.id || '');
    const profileHistoryEntries = existingCharacter
      ? createCharacterProfileHistoryEntries(existingCharacter, normalizedCharacterBase, options.profileHistorySource)
      : [];
    const profileHistory = [
      ...(normalizedCharacterBase.profileHistory?.length ? normalizedCharacterBase.profileHistory : existingCharacter?.profileHistory ?? []),
      ...profileHistoryEntries
    ];
    const normalizedCharacter = profileHistory.length
      ? { ...normalizedCharacterBase, profileHistory }
      : normalizedCharacterBase;
    const index = characters.value.findIndex((character) => character.id === normalizedCharacter.id);
    if (index >= 0) characters.value[index] = normalizedCharacter;
    else characters.value.push(normalizedCharacter);

    if (existingCharacter?.boundUserId !== normalizedCharacter.boundUserId) {
      const previousUser = existingCharacter ? userById(existingCharacter.boundUserId) : null;
      if (previousUser) {
        await saveUserProfile({
          ...previousUser,
          boundCharacterIds: previousUser.boundCharacterIds.filter((id) => id !== normalizedCharacter.id)
        });
      }
      const nextBoundUser = userById(normalizedCharacter.boundUserId);
      if (nextBoundUser) {
        await saveUserProfile({
          ...nextBoundUser,
          boundCharacterIds: [...new Set([...nextBoundUser.boundCharacterIds, normalizedCharacter.id])]
        });
      }
    }

    await putEntity('characters', normalizedCharacter);

    const linkedConversation = conversations.value.find((conversation) => conversation.charId === normalizedCharacter.id);
    if (linkedConversation) {
      const nextConversation = {
        ...linkedConversation,
        title: normalizedCharacter.nickname,
        userId: normalizedCharacter.boundUserId
      };
      const conversationIndex = conversations.value.findIndex((conversation) => conversation.id === nextConversation.id);
      if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
      await putEntity('conversations', nextConversation);
    }
  }

  async function saveCharacterSnapshot(nextCharacter: CharacterProfile) {
    const normalizedCharacter = normalizeCharacterProfile(nextCharacter, user.value?.id || users.value[0]?.id || '');
    const index = characters.value.findIndex((character) => character.id === normalizedCharacter.id);
    if (index >= 0) characters.value[index] = normalizedCharacter;
    else characters.value.push(normalizedCharacter);
    await putEntity('characters', normalizedCharacter);
  }

  async function updateCharacterMindState(characterId: string, lines: unknown, conversationId: string, options: { replyBatchId?: string } = {}) {
    const character = characterById(characterId);
    const mindStateLines = normalizeCharacterMindStateLines(lines);
    if (!character || !mindStateLines.length) return;
    const sourceReplyBatchId = String(options.replyBatchId ?? '').trim();

    await saveCharacter({
      ...character,
      mindState: {
        lines: mindStateLines,
        updatedAt: Date.now(),
        readAt: character.mindState?.readAt ?? 0,
        sourceConversationId: conversationId,
        sourceReplyBatchId: sourceReplyBatchId || undefined
      }
    }, {
      profileHistorySource: {
        sourceConversationId: conversationId,
        sourceReplyBatchId: sourceReplyBatchId || undefined
      }
    });
  }

  function findRegeneratedReplyMoodHistoryEntry(character: CharacterProfile, conversationId: string, messagesToRemove: ChatMessage[]) {
    const moodEntries = (character.profileHistory ?? []).filter((entry) => entry.field === 'mood');
    if (!moodEntries.length) return null;

    const replyBatchIds = new Set(messagesToRemove
      .map((message) => String(message.replyBatchId ?? '').trim())
      .filter(Boolean));
    const directEntry = [...moodEntries].reverse().find((entry) => {
      const sourceConversationId = String(entry.sourceConversationId ?? '').trim();
      const sourceReplyBatchId = String(entry.sourceReplyBatchId ?? '').trim();
      return sourceReplyBatchId
        && replyBatchIds.has(sourceReplyBatchId)
        && (!sourceConversationId || sourceConversationId === conversationId);
    });
    if (directEntry) return directEntry;

    const messageTimestamps = messagesToRemove
      .map((message) => Number(message.createdAt))
      .filter((timestamp) => Number.isFinite(timestamp));
    const windowStart = messageTimestamps.length ? Math.min(...messageTimestamps) - 60_000 : Number.NEGATIVE_INFINITY;
    const windowEnd = messageTimestamps.length ? Math.max(...messageTimestamps) + 60_000 : Number.POSITIVE_INFINITY;
    const currentMood = getCharacterTrackedMood(character);

    return [...moodEntries].reverse().find((entry) => {
      const sourceConversationId = String(entry.sourceConversationId ?? '').trim();
      const sourceReplyBatchId = String(entry.sourceReplyBatchId ?? '').trim();
      if (sourceConversationId && sourceConversationId !== conversationId) return false;
      if (sourceReplyBatchId && replyBatchIds.size && !replyBatchIds.has(sourceReplyBatchId)) return false;
      if (entry.createdAt < windowStart || entry.createdAt > windowEnd) return false;
      return !currentMood || normalizeCharacterMindStateLines(entry.nextValue).join('\n') === currentMood;
    }) ?? null;
  }

  async function rollbackCharacterMoodForOnlineRegeneration(conversation: Conversation, messagesToRemove: ChatMessage[]) {
    const character = characterById(conversation.charId);
    if (!character?.profileHistory?.length) return;
    const moodEntryToRemove = findRegeneratedReplyMoodHistoryEntry(character, conversation.id, messagesToRemove);
    if (!moodEntryToRemove) return;

    const nextProfileHistory = character.profileHistory.filter((entry) => entry.id !== moodEntryToRemove.id);
    const currentMood = getCharacterTrackedMood(character);
    const removedMood = normalizeCharacterMindStateLines(moodEntryToRemove.nextValue).join('\n');
    const sourceReplyBatchId = String(moodEntryToRemove.sourceReplyBatchId ?? '').trim();
    const shouldRestoreMindState = currentMood === removedMood
      || Boolean(sourceReplyBatchId && character.mindState?.sourceReplyBatchId === sourceReplyBatchId);
    const restoredLines = normalizeCharacterMindStateLines(moodEntryToRemove.previousValue);
    const restoredMood = restoredLines.join('\n');
    const previousMatchingMoodEntry = [...nextProfileHistory].reverse().find((entry) => entry.field === 'mood'
      && entry.createdAt <= moodEntryToRemove.createdAt
      && normalizeCharacterMindStateLines(entry.nextValue).join('\n') === restoredMood);
    const previousMoodEntry = previousMatchingMoodEntry
      ?? [...nextProfileHistory].reverse().find((entry) => entry.field === 'mood' && entry.createdAt <= moodEntryToRemove.createdAt);
    const restoredUpdatedAt = previousMoodEntry?.createdAt ?? Math.max(0, moodEntryToRemove.createdAt - 1);
    const restoredMindState = restoredLines.length
      ? {
        lines: restoredLines,
        updatedAt: restoredUpdatedAt,
        readAt: Math.min(character.mindState?.readAt ?? 0, restoredUpdatedAt),
        sourceConversationId: previousMoodEntry?.sourceConversationId,
        sourceReplyBatchId: previousMoodEntry?.sourceReplyBatchId
      }
      : undefined;

    await saveCharacterSnapshot({
      ...character,
      profileHistory: nextProfileHistory,
      mindState: shouldRestoreMindState ? restoredMindState : character.mindState
    });
  }

  async function markCharacterMindStateRead(characterId: string) {
    const character = characterById(characterId);
    if (!character?.mindState?.lines.length) return;
    if (character.mindState.readAt >= character.mindState.updatedAt) return;

    await saveCharacter({
      ...character,
      mindState: {
        ...character.mindState,
        readAt: Date.now()
      }
    });
  }

  async function saveConversationSettings(nextSettings: ConversationSettings) {
    const normalizedSettings = normalizeConversationSettings(nextSettings, nextSettings.conversationId);
    const index = conversationSettings.value.findIndex((entry) => entry.conversationId === normalizedSettings.conversationId);
    if (index >= 0) conversationSettings.value[index] = normalizedSettings;
    else conversationSettings.value.push(normalizedSettings);

    const conversation = conversationById(normalizedSettings.conversationId);
    const character = conversation ? characterById(conversation.charId) : null;
    if (character && character.voomFrequency !== normalizedSettings.voomFrequency) {
      const normalizedCharacter = normalizeCharacterProfile({ ...character, voomFrequency: normalizedSettings.voomFrequency }, character.boundUserId);
      const characterIndex = characters.value.findIndex((entry) => entry.id === normalizedCharacter.id);
      if (characterIndex >= 0) characters.value[characterIndex] = normalizedCharacter;
      await putEntity('characters', normalizedCharacter);
    }

    await putEntity('conversationSettings', normalizedSettings);
  }

  async function saveStickerGroup(nextGroup: StickerGroup) {
    if (isRecentStickerGroupId(nextGroup.id)) {
      showConfigAlert('“最近”是固定分组，不能更改。', '无法保存分组');
      return;
    }
    const normalizedGroup = normalizeStickerGroup({ ...nextGroup, updatedAt: Date.now() });
    if (!normalizedGroup) return;
    if (normalizedGroup.name.trim() === RECENT_STICKER_GROUP_NAME) {
      showConfigAlert('“最近”是固定分组名，请换一个名称。', '无法保存分组');
      return;
    }
    const index = stickerGroups.value.findIndex((group) => group.id === normalizedGroup.id);
    if (index >= 0) stickerGroups.value[index] = normalizedGroup;
    else stickerGroups.value.push(normalizedGroup);
    await putEntity('stickerGroups', normalizedGroup);
  }

  async function addStickerGroup(name: string) {
    if (name.trim() === RECENT_STICKER_GROUP_NAME) {
      showConfigAlert('“最近”是固定分组名，请换一个名称。', '无法创建分组');
      return;
    }
    const group = createStickerGroup(name);
    stickerGroups.value.push(group);
    await putEntity('stickerGroups', group);
    return group;
  }

  async function deleteStickerGroup(groupId: string) {
    if (isRecentStickerGroupId(groupId)) {
      showConfigAlert('“最近”是固定分组，不能删除。', '无法删除分组');
      return false;
    }
    const deletingGroup = stickerGroups.value.find((group) => group.id === groupId);
    if (!deletingGroup) return false;
    const fallbackGroup = stickerGroups.value.find((group) => group.id !== groupId);
    stickerGroups.value = stickerGroups.value.filter((group) => group.id !== groupId);
    const affectedStickers = stickers.value.filter((sticker) => sticker.groupIds.includes(groupId));
    await Promise.all([
      deleteEntity('stickerGroups', groupId),
      ...affectedStickers.map((sticker) => {
        const nextGroupIds = sticker.groupIds.filter((id) => id !== groupId);
        const normalizedSticker = normalizeSticker({
          ...sticker,
          groupIds: nextGroupIds.length ? nextGroupIds : fallbackGroup ? [fallbackGroup.id] : [],
          updatedAt: Date.now()
        }, fallbackGroup?.id ?? '');
        if (!normalizedSticker) return Promise.resolve();
        const index = stickers.value.findIndex((item) => item.id === normalizedSticker.id);
        if (index >= 0) stickers.value[index] = normalizedSticker;
        return putEntity('stickers', normalizedSticker);
      })
    ]);
    return true;
  }

  async function moveStickerGroup(groupId: string, direction: 'up' | 'down') {
    const orderedGroups = [...sortedStickerGroups.value];
    const currentIndex = orderedGroups.findIndex((group) => group.id === groupId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedGroups.length) return false;

    const reorderedGroups = [...orderedGroups];
    [reorderedGroups[currentIndex], reorderedGroups[targetIndex]] = [reorderedGroups[targetIndex], reorderedGroups[currentIndex]];
    const now = Date.now();
    const updates = reorderedGroups.map((group, index) => ({
      ...group,
      sortOrder: (index + 1) * 1000,
      updatedAt: group.id === groupId || group.id === orderedGroups[targetIndex].id ? now : group.updatedAt
    } satisfies StickerGroup));
    const updateMap = new Map(updates.map((group) => [group.id, group]));
    stickerGroups.value = stickerGroups.value.map((group) => updateMap.get(group.id) ?? group);
    await Promise.all(updates.map((group) => putEntity('stickerGroups', group)));
    return true;
  }

  async function saveSticker(nextSticker: Sticker) {
    const fallbackGroupId = stickerGroups.value[0]?.id ?? '';
    const groupIds = nextSticker.groupIds.filter((id) => !isRecentStickerGroupId(id));
    const normalizedSticker = normalizeSticker({ ...nextSticker, groupIds, updatedAt: Date.now() }, fallbackGroupId);
    if (!normalizedSticker) return;
    const index = stickers.value.findIndex((sticker) => sticker.id === normalizedSticker.id);
    if (index >= 0) stickers.value[index] = normalizedSticker;
    else stickers.value.unshift(normalizedSticker);
    await putEntity('stickers', normalizedSticker);
  }

  async function persistImportedStickerInBackground(importedSticker: Sticker, draft: StickerImportDraft) {
    await putEntity('stickers', importedSticker);
    draft.cleanupImageUrl?.();
  }

  function queueImportedStickerCache(sticker: Sticker, draft: StickerImportDraft) {
    stickerImportCacheQueue = stickerImportCacheQueue
      .then(() => persistImportedStickerInBackground(sticker, draft))
      .catch((error) => {
        console.warn('Sticker background persistence failed.', error);
      });
  }

  async function importStickers(drafts: StickerImportDraft[], groupIds: string[]) {
    const fallbackGroupId = stickerGroups.value[0]?.id ?? '';
    const existingGroupIds = new Set(stickerGroups.value.map((group) => group.id));
    const targetGroupIds = [...new Set((groupIds.length ? groupIds : [fallbackGroupId]).filter((id) => Boolean(id) && !isRecentStickerGroupId(id) && existingGroupIds.has(id)))];
    if (!targetGroupIds.length) {
      drafts.forEach((draft) => draft.cleanupImageUrl?.());
      return [];
    }
    const existingKeys = new Set(stickers.value.map((sticker) => `${sticker.description.toLocaleLowerCase()}::${sticker.imageUrl}`));
    const createdEntries: Array<{ draft: StickerImportDraft; sticker: Sticker }> = [];
    for (const draft of drafts) {
      const sticker = createStickerFromDraft(draft, targetGroupIds);
      const key = `${sticker.description.toLocaleLowerCase()}::${sticker.imageUrl}`;
      if (existingKeys.has(key)) {
        draft.cleanupImageUrl?.();
        continue;
      }
      existingKeys.add(key);
      createdEntries.push({ draft, sticker });
    }
    const createdStickers = createdEntries.map((entry) => entry.sticker);
    if (!createdStickers.length) return [];
    stickers.value.unshift(...createdStickers);
    createdEntries.forEach((entry) => queueImportedStickerCache(entry.sticker, entry.draft));
    return createdStickers;
  }

  async function deleteSticker(stickerId: string) {
    const index = stickers.value.findIndex((sticker) => sticker.id === stickerId);
    if (index < 0) return;
    stickers.value.splice(index, 1);
    await deleteEntity('stickers', stickerId);
  }

  async function deleteStickers(stickerIds: string[]) {
    const idSet = new Set(stickerIds.map((item) => item.trim()).filter(Boolean));
    if (!idSet.size) return 0;
    const deletableIds = stickers.value.filter((sticker) => idSet.has(sticker.id)).map((sticker) => sticker.id);
    if (!deletableIds.length) return 0;
    stickers.value = stickers.value.filter((sticker) => !idSet.has(sticker.id));
    await Promise.all(deletableIds.map((stickerId) => deleteEntity('stickers', stickerId)));
    return deletableIds.length;
  }

  async function moveStickersToGroup(stickerIds: string[], groupId: string) {
    const normalizedGroupId = groupId.trim();
    if (!normalizedGroupId || isRecentStickerGroupId(normalizedGroupId)) return 0;
    const targetGroup = stickerGroups.value.find((group) => group.id === normalizedGroupId);
    if (!targetGroup) return 0;
    const idSet = new Set(stickerIds.map((item) => item.trim()).filter(Boolean));
    if (!idSet.size) return 0;
    const updates = stickers.value
      .filter((sticker) => idSet.has(sticker.id))
      .map((sticker) => normalizeSticker({
        ...sticker,
        groupIds: [normalizedGroupId],
        updatedAt: Date.now()
      }, normalizedGroupId))
      .filter((sticker): sticker is Sticker => Boolean(sticker));
    if (!updates.length) return 0;
    const updateMap = new Map(updates.map((sticker) => [sticker.id, sticker]));
    stickers.value = stickers.value.map((sticker) => updateMap.get(sticker.id) ?? sticker);
    await Promise.all(updates.map((sticker) => putEntity('stickers', sticker)));
    return updates.length;
  }

  async function addCharacter(payload: Pick<CharacterProfile, 'name' | 'nickname' | 'avatar' | 'description' | 'signature' | 'boundUserId'> & Partial<Pick<CharacterProfile, 'userNote' | 'localWorldBookIds' | 'voomFrequency'>>) {
    if (!user.value) return;
    const character = normalizeCharacterProfile({
      id: createAccountId(),
      nickname: payload.nickname,
      name: payload.name,
      avatar: payload.avatar,
      description: payload.description,
      signature: payload.signature,
      initialProfile: {
        nickname: payload.nickname,
        signature: payload.signature
      },
      userNote: payload.userNote ?? '',
      boundUserId: payload.boundUserId,
      subtitle: '刚刚成为好友',
      lastSeen: '现在',
      localWorldBookIds: payload.localWorldBookIds ?? [],
      voomFrequency: payload.voomFrequency ?? 'medium'
    }, payload.boundUserId);
    const conversation: Conversation = {
      id: `conv_${character.id}`,
      userId: payload.boundUserId,
      charId: character.id,
      title: character.nickname,
      activeMode: 'online',
      updatedAt: Date.now(),
      unreadCount: 0,
      summary: '刚成为好友，还没有太多共同经历。'
    };
    characters.value.unshift(character);
    conversations.value.unshift(conversation);
    const boundUser = userById(payload.boundUserId);
    if (boundUser) {
      await saveUserProfile({
        ...boundUser,
        boundCharacterIds: [...new Set([...boundUser.boundCharacterIds, character.id])]
      });
    }
    await Promise.all([putEntity('characters', character), putEntity('conversations', conversation)]);
  }

  async function saveAccountProfile(nextUser: UserProfile) {
    const actualBoundCharacterIds = characters.value
      .filter((character) => character.boundUserId === nextUser.id)
      .map((character) => character.id);

    await saveUserProfile({
      ...nextUser,
      boundCharacterIds: actualBoundCharacterIds
    });
  }

  async function deleteUserProfile(userId: string) {
    const index = users.value.findIndex((account) => account.id === userId);
    if (index < 0 || users.value.length <= 1) return;

    const fallbackUser = users.value[index + 1] ?? users.value[index - 1] ?? null;
    if (!fallbackUser) return;

    const affectedCharacters = characters.value.filter((character) => character.boundUserId === userId);
    if (affectedCharacters.length) {
      await Promise.all(
        affectedCharacters.map((character) => saveCharacter({
          ...character,
          boundUserId: fallbackUser.id
        }))
      );
    }

    users.value.splice(index, 1);
    await deleteEntity('user', userId);

    if (settings.value?.activeUserId === userId) {
      settings.value = normalizeAppSettings({
        ...settings.value,
        activeUserId: fallbackUser.id
      });
      await putEntity('settings', settings.value, 'main');
    }
  }

  async function deleteCharacterProfile(characterId: string) {
    const character = characterById(characterId);
    if (!character) return;

    const conversation = conversations.value.find((entry) => entry.charId === characterId);
    const relatedPosts = voomPosts.value.filter((post) => post.charId === characterId || post.conversationId === conversation?.id);
    const relatedMessages = conversation ? messages.value.filter((message) => message.conversationId === conversation.id) : [];
    const relatedLocalWorldBooks = worldBooks.value.filter((book) => book.scope === 'local' && character.localWorldBookIds.includes(book.id));
    const owner = userById(character.boundUserId);

    characters.value = characters.value.filter((entry) => entry.id !== characterId);
    if (conversation) {
      conversations.value = conversations.value.filter((entry) => entry.id !== conversation.id);
      messages.value = messages.value.filter((message) => message.conversationId !== conversation.id);
    }
    voomPosts.value = voomPosts.value.filter((post) => post.charId !== characterId && post.conversationId !== conversation?.id);
    worldBooks.value = worldBooks.value.filter((book) => !relatedLocalWorldBooks.some((relatedBook) => relatedBook.id === book.id));

    if (relatedLocalWorldBooks.length) {
      const relatedLocalWorldBookIds = new Set(relatedLocalWorldBooks.map((book) => book.id));
      const affectedCharacters = characters.value.filter((entry) => entry.localWorldBookIds.some((id) => relatedLocalWorldBookIds.has(id)));
      if (affectedCharacters.length) {
        await Promise.all(
          affectedCharacters.map((entry) => {
            const nextCharacter = {
              ...entry,
              localWorldBookIds: entry.localWorldBookIds.filter((id) => !relatedLocalWorldBookIds.has(id))
            };
            const characterIndex = characters.value.findIndex((item) => item.id === nextCharacter.id);
            if (characterIndex >= 0) characters.value[characterIndex] = nextCharacter;
            return putEntity('characters', nextCharacter);
          })
        );
      }
    }

    await deleteEntity('characters', characterId);

    if (owner) {
      await saveUserProfile({
        ...owner,
        boundCharacterIds: owner.boundCharacterIds.filter((id) => id !== characterId)
      });
    }

    await Promise.all([
      ...(conversation ? [deleteEntity('conversations', conversation.id)] : []),
      ...relatedMessages.map((message) => deleteEntity('messages', message.id)),
      ...relatedPosts.map((post) => deleteEntity('voomPosts', post.id)),
      ...relatedLocalWorldBooks.map((book) => deleteEntity('worldBooks', book.id))
    ]);
  }

  async function clearCharacterHistory(characterId: string) {
    const character = characterById(characterId);
    if (!character) return false;

    const conversation = conversations.value.find((entry) => entry.charId === characterId);
    const conversationId = conversation?.id ?? '';
    const now = Date.now();
    const relatedMessages = conversationId ? messages.value.filter((message) => message.conversationId === conversationId) : [];
    const relatedMemories = conversationId ? conversationMemories.value.filter((memory) => memory.conversationId === conversationId) : [];
    const characterNameKeys = new Set([character.id, character.nickname, character.name, character.userNote, getCharacterVoomAuthorName(character)]
      .map((name) => name.trim().toLocaleLowerCase())
      .filter(Boolean));
    const postsToDelete: VoomPost[] = [];
    const postsToUpdate: VoomPost[] = [];
    const initialProfile = getCharacterInitialProfile(character);

    for (const post of voomPosts.value) {
      const postConversationIds = post.conversationIds?.map((id) => id.trim()).filter(Boolean) ?? [];
      const isCharacterPost = post.charId === characterId || (post.authorType !== 'user' && (post.conversationId === conversationId || postConversationIds.includes(conversationId)));
      if (isCharacterPost) {
        postsToDelete.push(post);
        continue;
      }

      const removedCommentIds = new Set<string>();
      for (const comment of post.comments) {
        const authorKey = String(comment.authorId ?? comment.authorName ?? '').trim().toLocaleLowerCase();
        if (characterNameKeys.has(authorKey)) removedCommentIds.add(comment.id);
      }

      let changed = true;
      while (changed) {
        changed = false;
        for (const comment of post.comments) {
          if (comment.parentId && removedCommentIds.has(comment.parentId) && !removedCommentIds.has(comment.id)) {
            removedCommentIds.add(comment.id);
            changed = true;
          }
        }
      }

      const nextConversationIds = postConversationIds.filter((id) => id !== conversationId);
      const nextVisibleCharacterIds = post.visibleCharacterIds?.filter((id) => id !== characterId);
      const nextComments = removedCommentIds.size ? post.comments.filter((comment) => !removedCommentIds.has(comment.id)) : post.comments;
      const nextLikes = post.likes.filter((like) => !characterNameKeys.has(like.trim().toLocaleLowerCase()));
      const nextConversationId = post.conversationId === conversationId ? nextConversationIds[0] : post.conversationId;
      const removedFromPostAudience = post.conversationId === conversationId || postConversationIds.includes(conversationId) || post.visibleCharacterIds?.includes(characterId);
      const touchedPost = post.conversationId === conversationId
        || postConversationIds.includes(conversationId)
        || post.visibleCharacterIds?.includes(characterId)
        || nextComments.length !== post.comments.length
        || nextLikes.length !== post.likes.length;

      if (!touchedPost) continue;

      if (post.authorType === 'user' && removedFromPostAudience && !nextConversationIds.length && (!nextVisibleCharacterIds || !nextVisibleCharacterIds.length)) {
        postsToDelete.push(post);
        continue;
      }

      postsToUpdate.push(createPersistableVoomPost({
        ...post,
        conversationId: nextConversationId || undefined,
        conversationIds: post.conversationIds ? nextConversationIds : undefined,
        visibleCharacterIds: post.visibleCharacterIds ? nextVisibleCharacterIds : undefined,
        comments: nextComments,
        likes: nextLikes
      }));
    }

    const postDeleteIds = new Set(postsToDelete.map((post) => post.id));
    const postUpdateMap = new Map(postsToUpdate.map((post) => [post.id, post]));
    messages.value = messages.value.filter((message) => message.conversationId !== conversationId);
    conversationMemories.value = conversationMemories.value.filter((memory) => memory.conversationId !== conversationId);
    voomPosts.value = voomPosts.value
      .filter((post) => !postDeleteIds.has(post.id))
      .map((post) => postUpdateMap.get(post.id) ?? post);

    const nextCharacter = normalizeCharacterProfile({
      ...character,
      nickname: initialProfile.nickname,
      signature: initialProfile.signature,
      initialProfile,
      subtitle: '刚刚成为好友',
      lastSeen: '现在',
      voomFrequency: 'medium',
      profileHistory: [],
      mindState: undefined,
      profile: undefined
    }, character.boundUserId);
    const characterIndex = characters.value.findIndex((entry) => entry.id === characterId);
    if (characterIndex >= 0) characters.value[characterIndex] = nextCharacter;

    const nextConversation = conversation ? {
      ...conversation,
      title: nextCharacter.nickname,
      userId: nextCharacter.boundUserId,
      activeMode: 'online' as const,
      updatedAt: now,
      unreadCount: 0,
      summary: '刚成为好友，还没有太多共同经历。'
    } : undefined;
    if (nextConversation) {
      const conversationIndex = conversations.value.findIndex((entry) => entry.id === nextConversation.id);
      if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    }

    await Promise.all([
      putEntity('characters', nextCharacter),
      ...(nextConversation ? [putEntity('conversations', nextConversation)] : []),
      ...relatedMessages.map((message) => deleteEntity('messages', message.id)),
      ...relatedMemories.map((memory) => deleteEntity('conversationMemories', memory.id)),
      ...postsToDelete.map((post) => deleteEntity('voomPosts', post.id)),
      ...postsToUpdate.map((post) => putEntity('voomPosts', post))
    ]);

    return true;
  }

  async function saveWorldBook(entry: WorldBookEntry) {
    const normalizedEntry = normalizeWorldBookEntry(entry);
    const index = worldBooks.value.findIndex((book) => book.id === normalizedEntry.id);
    if (index >= 0) worldBooks.value[index] = normalizedEntry;
    else worldBooks.value.push(normalizedEntry);
    await putEntity('worldBooks', normalizedEntry);
  }

  async function deleteWorldBook(worldBookId: string) {
    const index = worldBooks.value.findIndex((book) => book.id === worldBookId);
    if (index < 0) return;

    worldBooks.value.splice(index, 1);

    const affectedCharacters = characters.value.filter((character) => character.localWorldBookIds.includes(worldBookId));
    if (affectedCharacters.length) {
      await Promise.all(
        affectedCharacters.map((character) => {
          const nextCharacter = {
            ...character,
            localWorldBookIds: character.localWorldBookIds.filter((id) => id !== worldBookId)
          };
          const characterIndex = characters.value.findIndex((item) => item.id === nextCharacter.id);
          if (characterIndex >= 0) characters.value[characterIndex] = nextCharacter;
          return putEntity('characters', nextCharacter);
        })
      );
    }

    await deleteEntity('worldBooks', worldBookId);
  }

  async function createBackupFile() {
    return createLinkBackupFile(await loadSnapshot());
  }

  async function importBackupSnapshot(snapshot: AppSnapshot) {
    const normalizedSnapshot = keepDeviceGitHubBackupSettings(normalizeSnapshotForRestore(snapshot));
    await replaceSnapshot(normalizedSnapshot);
    applySnapshotToStore(normalizedSnapshot);
    void refreshEnabledVendorModels();
  }

  async function saveGitHubBackupState(overrides: Partial<AppSettings['githubBackup']>) {
    if (!settings.value) return;
    const normalizedSettings = normalizeAppSettings({
      ...settings.value,
      githubBackup: {
        ...settings.value.githubBackup,
        ...overrides
      }
    });
    settings.value = normalizedSettings;
    await putEntity('settings', normalizedSettings, 'main');
  }

  async function saveGitHubBackupProgress(phase: AppSettings['githubBackup']['progress']['phase'], label: string, percent: number) {
    await saveGitHubBackupState({
      progress: {
        phase,
        label,
        percent: Math.min(100, Math.max(0, Math.round(percent))),
        updatedAt: Date.now()
      }
    });
  }

  async function loadGitHubBackupHistory(limit = 3) {
    if (!settings.value) throw new Error('设置尚未载入。');

    const config = settings.value.githubBackup;
    if (!config.token || !config.owner || !config.repo) throw new Error('请先连接 GitHub 并创建备份仓库。');

    const historyItems = await listGitHubBackupHistory({
      token: config.token,
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      path: config.path
    }, limit);

    return historyItems.map((item) => ({
      sha: item.sha,
      committedAt: Date.parse(item.committedAt) || 0,
      exportedAt: 0,
      message: item.message.trim()
    }));
  }

  async function syncGitHubBackupHistory(limit = 3) {
    await saveGitHubBackupProgress('checking', '正在检查 GitHub 备份记录', 15);

    try {
      const history = await loadGitHubBackupHistory(limit);
      const latest = history[0];
      await saveGitHubBackupState({
        history,
        latestRemoteBackupSha: latest?.sha ?? '',
        latestRemoteBackupAt: latest?.committedAt ?? 0,
        progress: {
          phase: history.length ? 'completed' : 'idle',
          label: history.length ? '已同步 GitHub 备份记录' : '',
          percent: history.length ? 100 : 0,
          updatedAt: Date.now()
        }
      });
      return history;
    } catch (error) {
      if (error instanceof GitHubBackupError && (error.status === 404 || error.status === 409)) {
        await saveGitHubBackupState({
          history: [],
          latestRemoteBackupSha: '',
          latestRemoteBackupAt: 0,
          pendingRestoreSha: '',
          pendingRestoreAt: 0,
          progress: {
            phase: 'idle',
            label: '',
            percent: 0,
            updatedAt: Date.now()
          }
        });
        return [];
      }
      await saveGitHubBackupProgress('failed', formatGitHubBackupError(error), 100);
      throw error;
    }
  }

  async function runGitHubBackup(reason: 'manual' | 'auto' = 'manual') {
    if (githubBackupRunning) return false;
    if (!settings.value) throw new Error('设置尚未载入。');

    const config = settings.value.githubBackup;
    if (!config.token || !config.owner || !config.repo) throw new Error('请先连接 GitHub 并创建备份仓库。');

    githubBackupRunning = true;
    await saveGitHubBackupState({ lastBackupStatus: 'running', lastBackupError: '' });
    await saveGitHubBackupProgress('checking', reason === 'auto' ? '正在准备自动备份' : '正在准备手动备份', 10);

    try {
      await saveGitHubBackupProgress('checking', reason === 'auto' ? '正在检查自动备份仓库' : '正在检查备份仓库', 25);
      const repository = await ensureGitHubBackupRepository({
        token: config.token,
        owner: config.owner,
        repo: config.repo
      });
      await saveGitHubBackupState({
        owner: repository.owner,
        repo: repository.repo,
        branch: repository.branch || config.branch || 'main'
      });
      const backup = await createBackupFile();
      const activeConfig = settings.value?.githubBackup ?? config;
      await saveGitHubBackupProgress('uploading', reason === 'auto' ? '正在上传自动备份' : '正在上传手动备份', 65);
      await uploadGitHubBackup(
        {
          token: activeConfig.token,
          owner: activeConfig.owner,
          repo: activeConfig.repo,
          branch: activeConfig.branch,
          path: activeConfig.path
        },
        stringifyLinkBackupFile(backup),
        `${reason === 'auto' ? 'Auto' : 'Manual'} LINK backup ${new Date().toISOString()}`
      );
      const history = await loadGitHubBackupHistory(3).catch(() => activeConfig.history ?? []);
      const latest = history[0];
      await saveGitHubBackupState({
        lastBackupAt: Date.now(),
        lastBackupStatus: 'success',
        lastBackupError: '',
        latestRemoteBackupSha: latest?.sha ?? '',
        latestRemoteBackupAt: latest?.committedAt ?? Date.now(),
        pendingRestoreSha: '',
        pendingRestoreAt: 0,
        history,
        progress: {
          phase: 'completed',
          label: reason === 'auto' ? '自动备份已完成' : '手动备份已完成',
          percent: 100,
          updatedAt: Date.now()
        }
      });
      return true;
    } catch (error) {
      await saveGitHubBackupState({ lastBackupStatus: 'failed', lastBackupError: formatGitHubBackupError(error) });
      await saveGitHubBackupProgress('failed', formatGitHubBackupError(error), 100);
      throw error;
    } finally {
      githubBackupRunning = false;
    }
  }

  async function importGitHubBackup(ref = '') {
    if (githubBackupRunning) return false;
    if (!settings.value) throw new Error('设置尚未载入。');

    const config = settings.value.githubBackup;
    if (!config.token || !config.owner || !config.repo) throw new Error('请先连接 GitHub 并创建备份仓库。');

    githubBackupRunning = true;
    await saveGitHubBackupState({ lastBackupStatus: 'running', lastBackupError: '' });
    await saveGitHubBackupProgress('downloading', '正在下载 GitHub 备份', 25);

    try {
      const backupText = ref
        ? await downloadGitHubBackupVersion({
            token: config.token,
            owner: config.owner,
            repo: config.repo,
            branch: config.branch,
            path: config.path
          }, ref)
        : await downloadGitHubBackup({
            token: config.token,
            owner: config.owner,
            repo: config.repo,
            branch: config.branch,
            path: config.path
          });
      const backupFile = parseLinkBackupFileText(backupText);
      const currentBackupConfig = settings.value.githubBackup;
      await saveGitHubBackupProgress('restoring', '正在恢复 GitHub 备份到本地', 75);
      await importBackupSnapshot(backupFile.snapshot);
      const history = await loadGitHubBackupHistory(3).catch(() => currentBackupConfig.history ?? []);
      const latest = history[0];
      await saveGitHubBackupState({
        lastBackupAt: Date.now(),
        lastBackupStatus: 'success',
        lastBackupError: '',
        latestRemoteBackupSha: latest?.sha ?? ref,
        latestRemoteBackupAt: latest?.committedAt ?? currentBackupConfig.latestRemoteBackupAt,
        pendingRestoreSha: '',
        pendingRestoreAt: 0,
        history,
        progress: {
          phase: 'completed',
          label: 'GitHub 备份已恢复到本地',
          percent: 100,
          updatedAt: Date.now()
        }
      });
      return true;
    } catch (error) {
      await saveGitHubBackupState({ lastBackupStatus: 'failed', lastBackupError: formatGitHubBackupError(error) });
      await saveGitHubBackupProgress('failed', formatGitHubBackupError(error), 100);
      throw error;
    } finally {
      githubBackupRunning = false;
    }
  }

  async function hasGitHubBackup() {
    const history = await syncGitHubBackupHistory(3);
    return history.length > 0;
  }

  async function saveSettings(nextSettings: AppSettings) {
    const normalizedSettings = normalizeAppSettings(nextSettings);
    settings.value = normalizedSettings;
    await putEntity('settings', normalizedSettings, 'main');
    void refreshEnabledVendorModels();
  }

  async function addGeneratedImage(record: Omit<GeneratedImageRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
    const compactImageUrl = await compactInlineDisplayImage(record.imageUrl);
    const normalizedRecord = normalizeGeneratedImages([{
      id: record.id || createId('image'),
      provider: record.provider,
      imageUrl: compactImageUrl,
      title: record.title,
      prompt: record.prompt,
      negativePrompt: record.negativePrompt,
      model: record.model,
      size: record.size,
      source: record.source,
      createdAt: record.createdAt ?? Date.now()
    }])[0];
    if (!normalizedRecord) return null;

    generatedImages.value = [normalizedRecord, ...generatedImages.value.filter((entry) => entry.id !== normalizedRecord.id)];
    await putEntity('generatedImages', normalizedRecord);
    return normalizedRecord;
  }

  async function updateGeneratedImageUrl(imageId: string, imageUrl: string) {
    const normalizedImageId = imageId.trim();
    const normalizedImageUrl = (await compactInlineDisplayImage(imageUrl)).trim();
    if (!normalizedImageId || !normalizedImageUrl) return null;
    const imageIndex = generatedImages.value.findIndex((entry) => entry.id === normalizedImageId);
    if (imageIndex < 0) return null;
    const nextRecord = normalizeGeneratedImages([{ ...generatedImages.value[imageIndex], imageUrl: normalizedImageUrl }])[0];
    if (!nextRecord) return null;
    generatedImages.value[imageIndex] = nextRecord;
    await putEntity('generatedImages', nextRecord);
    return nextRecord;
  }

  async function deleteGeneratedImage(imageId: string) {
    generatedImages.value = generatedImages.value.filter((entry) => entry.id !== imageId);
    await deleteEntity('generatedImages', imageId);
  }

  async function refreshEnabledVendorModels() {
    if (!settings.value?.apiVendors.length) return;

    let changed = false;
    const nextVendors = await Promise.all(
      settings.value.apiVendors.map(async (vendor) => {
        if (!vendor.enabled || !vendor.apiUrl.trim() || !vendor.apiKey.trim()) return vendor;

        try {
          const fetchedModelIds = await fetchVendorModels(vendor);
          const mergedVendor = mergeVendorModels(vendor, fetchedModelIds);
          if (JSON.stringify(mergedVendor.models) !== JSON.stringify(vendor.models)) {
            changed = true;
          }
          return mergedVendor;
        } catch {
          return vendor;
        }
      })
    );

    if (!changed || !settings.value) return;

    const normalizedSettings = normalizeAppSettings({
      ...settings.value,
      apiVendors: nextVendors
    });
    settings.value = normalizedSettings;
    await putEntity('settings', normalizedSettings, 'main');
  }

  async function bindWorldBook(characterId: string, worldBookId: string, enabled: boolean) {
    const character = characterById(characterId);
    if (!character) return;
    const ids = new Set(character.localWorldBookIds);
    if (enabled) ids.add(worldBookId);
    else ids.delete(worldBookId);
    await saveCharacter({ ...character, localWorldBookIds: [...ids] });
  }

  async function updateConversationMode(conversationId: string, mode: ChatMode) {
    const conversation = conversationById(conversationId);
    if (!conversation) return;
    const nextConversation = { ...conversation, activeMode: mode, updatedAt: Date.now() };
    const index = conversations.value.findIndex((item) => item.id === conversationId);
    conversations.value[index] = nextConversation;
    await putEntity('conversations', nextConversation);
  }

  async function markConversationRead(conversationId: string) {
    const conversation = conversationById(conversationId);
    if (!conversation || conversation.unreadCount === 0) return;
    const nextConversation = { ...conversation, unreadCount: 0 };
    const index = conversations.value.findIndex((item) => item.id === conversationId);
    conversations.value[index] = nextConversation;
    await putEntity('conversations', nextConversation);
  }

  async function appendUserMessage(conversationId: string, content: string, quote?: ChatMessageQuote | null) {
    const trimmedContent = content.trim();
    const conversation = conversationById(conversationId);
    if (!trimmedContent || !conversation) return;

    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'user',
      mode: conversation.activeMode,
      content: trimmedContent,
      quote: cloneMessageQuote(quote),
      createdAt: Date.now(),
      status: 'sent'
    };
    messages.value.push(userMessage);
    await putEntity('messages', userMessage);
    const nextConversation = { ...conversation, updatedAt: userMessage.createdAt, unreadCount: 0 };
    const conversationIndex = conversations.value.findIndex((item) => item.id === conversationId);
    if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    await putEntity('conversations', nextConversation);
    void maybeAutoSummarizeConversation(conversationId);
    return userMessage;
  }

  async function appendStickerMessage(conversationId: string, sticker: Sticker, quote?: ChatMessageQuote | null) {
    const conversation = conversationById(conversationId);
    if (!conversation) return;
    const sentAt = Date.now();
    const resolvedSticker = {
      ...sticker,
      imageUrl: sticker.imageUrl,
      lastUsedAt: sentAt,
      updatedAt: sticker.updatedAt
    };

    const stickerIndex = stickers.value.findIndex((item) => item.id === resolvedSticker.id);
    if (stickerIndex >= 0) stickers.value[stickerIndex] = resolvedSticker;
    await putEntity('stickers', resolvedSticker);

    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'user',
      mode: conversation.activeMode,
      content: `[Sticker] ${resolvedSticker.description}`,
      sticker: {
        stickerId: resolvedSticker.id,
        description: resolvedSticker.description,
        imageUrl: resolvedSticker.imageUrl
      },
      quote: cloneMessageQuote(quote),
      createdAt: sentAt,
      status: 'sent'
    };
    messages.value.push(userMessage);
    await putEntity('messages', userMessage);
    const nextConversation = { ...conversation, updatedAt: userMessage.createdAt, unreadCount: 0 };
    const conversationIndex = conversations.value.findIndex((item) => item.id === conversationId);
    if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    await putEntity('conversations', nextConversation);
    void maybeAutoSummarizeConversation(conversationId);
    return userMessage;
  }

  async function localizeRecentStickerMessagesForVision(conversationId: string) {
    const candidates = messagesForConversation(conversationId)
      .slice(-12)
      .filter((message) => message.sender === 'user' && message.sticker?.imageUrl && shouldLocalizeStickerImageUrl(message.sticker.imageUrl))
      .slice(-4);

    for (const message of candidates) {
      const sticker = message.sticker;
      if (!sticker) continue;
      const imageUrl = await localizeStickerImageUrl(sticker.imageUrl);
      const nextMessage: ChatMessage = {
        ...message,
        sticker: {
          ...sticker,
          imageUrl
        }
      };
      const messageIndex = messages.value.findIndex((item) => item.id === nextMessage.id);
      if (messageIndex >= 0) messages.value[messageIndex] = nextMessage;
    }
  }

  function getDataInventory() {
    const sections = [
      { id: 'users', label: '用户资料', count: users.value.length, bytes: estimateJsonBytes(users.value), protected: true },
      { id: 'characters', label: '角色资料', count: characters.value.length, bytes: estimateJsonBytes(characters.value), protected: true },
      { id: 'conversations', label: '会话索引', count: conversations.value.length, bytes: estimateJsonBytes(conversations.value), protected: true },
      { id: 'messages', label: '聊天消息', count: messages.value.length, bytes: estimateJsonBytes(messages.value), clearable: true },
      { id: 'voomPosts', label: 'VOOM 动态', count: voomPosts.value.length, bytes: estimateJsonBytes(voomPosts.value), clearable: true },
      { id: 'music', label: '音乐收藏与评论', count: musicFavoriteTracks.value.length + musicCommentThreads.value.length, bytes: estimateJsonBytes([musicFavoriteTracks.value, musicCommentThreads.value]), clearable: true },
      { id: 'worldBooks', label: '世界书', count: worldBooks.value.length, bytes: estimateJsonBytes(worldBooks.value), clearable: true },
      { id: 'stickers', label: '贴纸库', count: stickerGroups.value.length + stickers.value.length, bytes: estimateJsonBytes([stickerGroups.value, stickers.value]), clearable: true },
      { id: 'conversationSettings', label: '会话设置', count: conversationSettings.value.length, bytes: estimateJsonBytes(conversationSettings.value), clearable: true },
      { id: 'conversationMemories', label: '记忆摘要', count: conversationMemories.value.length, bytes: estimateJsonBytes(conversationMemories.value), clearable: true },
      { id: 'generatedImages', label: '生成图历史', count: generatedImages.value.length, bytes: estimateJsonBytes(generatedImages.value), clearable: true },
      { id: 'settings', label: '全局设置', count: 1, bytes: estimateJsonBytes(settings.value), protected: true }
    ];
    const totalBytes = sections.reduce((total, section) => total + section.bytes, 0);
    return { sections, totalBytes };
  }

  function estimateCleanupFreedBytes(action: DataCleanupAction) {
    if (action === 'generated-images') return estimateJsonBytes(generatedImages.value);

    if (action === 'message-media') {
      return estimateFreedBytes(messages.value, messages.value.map((message) => stripMessageMediaCache(message)));
    }

    if (action === 'sticker-local-cache') {
      const nextStickers = stickers.value.map((sticker) => isInlineMediaUrl(sticker.imageUrl) ? { ...sticker, imageUrl: stickerBackupPlaceholder, updatedAt: sticker.updatedAt } : sticker);
      return estimateFreedBytes(stickers.value, nextStickers);
    }

    if (action === 'image-candidates') {
      const messageFreedBytes = estimateFreedBytes(messages.value, messages.value.map((message) => stripImageCandidates(message)));
      const nextPosts = voomPosts.value.map((post) => post.imageCandidates?.length ? { ...post, imageCandidates: undefined } : post);
      return messageFreedBytes + estimateFreedBytes(voomPosts.value, nextPosts);
    }

    if (action === 'voice-audio') {
      return estimateFreedBytes(messages.value, messages.value.map((message) => stripVoiceAudio(message)));
    }

    const nextMemories = conversationMemories.value.map((memory) => memory.vector.length ? { ...memory, vector: [] } : memory);
    return estimateFreedBytes(conversationMemories.value, nextMemories);
  }

  async function cleanupData(action: DataCleanupAction) {
    if (action === 'generated-images') return clearDataSections(['generatedImages']);

    if (action === 'message-media') {
      const nextMessages = messages.value.map((message) => stripMessageMediaCache(message));
      const changedMessages = nextMessages.filter((message, index) => JSON.stringify(message) !== JSON.stringify(messages.value[index]));
      if (changedMessages.length) await saveMessages(changedMessages);
      return changedMessages.length;
    }

    if (action === 'sticker-local-cache') {
      const nextStickers = stickers.value.map((sticker) => isInlineMediaUrl(sticker.imageUrl) ? { ...sticker, imageUrl: stickerBackupPlaceholder, updatedAt: Date.now() } : sticker);
      const changedStickers = nextStickers.filter((sticker, index) => sticker.imageUrl !== stickers.value[index].imageUrl);
      if (changedStickers.length) {
        const changedMap = new Map(changedStickers.map((sticker) => [sticker.id, sticker]));
        stickers.value = stickers.value.map((sticker) => changedMap.get(sticker.id) ?? sticker);
        await Promise.all(changedStickers.map((sticker) => putEntity('stickers', sticker)));
      }
      return changedStickers.length;
    }

    if (action === 'image-candidates') {
      const nextMessages = messages.value.map((message) => stripImageCandidates(message));
      const changedMessages = nextMessages.filter((message, index) => message !== messages.value[index]);
      const nextPosts = voomPosts.value.map((post) => post.imageCandidates?.length ? { ...post, imageCandidates: undefined } : post);
      const changedPosts = nextPosts.filter((post, index) => post !== voomPosts.value[index]);
      if (changedMessages.length) await saveMessages(changedMessages);
      if (changedPosts.length) {
        const postMap = new Map(changedPosts.map((post) => [post.id, post]));
        voomPosts.value = voomPosts.value.map((post) => postMap.get(post.id) ?? post);
        await Promise.all(changedPosts.map((post) => putEntity('voomPosts', createPersistableVoomPost(post))));
      }
      return changedMessages.length + changedPosts.length;
    }

    if (action === 'voice-audio') {
      const nextMessages = messages.value.map((message) => stripVoiceAudio(message));
      const changedMessages = nextMessages.filter((message, index) => message !== messages.value[index]);
      if (changedMessages.length) await saveMessages(changedMessages);
      return changedMessages.length;
    }

    const nextMemories = conversationMemories.value.map((memory) => memory.vector.length ? { ...memory, vector: [] } : memory);
    const changedMemories = nextMemories.filter((memory, index) => memory !== conversationMemories.value[index]);
    if (changedMemories.length) {
      const memoryMap = new Map(changedMemories.map((memory) => [memory.id, memory]));
      conversationMemories.value = conversationMemories.value.map((memory) => memoryMap.get(memory.id) ?? memory);
      await Promise.all(changedMemories.map((memory) => putEntity('conversationMemories', memory)));
    }
    return changedMemories.length;
  }

  async function clearDataSections(sectionIds: ClearableDataSection[]) {
    const sectionSet = new Set(sectionIds);
    let changed = 0;

    if (sectionSet.has('messages')) {
      changed += await deleteMessages(messages.value.map((message) => message.id));
    }
    if (sectionSet.has('voomPosts')) {
      const posts = [...voomPosts.value];
      voomPosts.value = [];
      await Promise.all(posts.map((post) => deleteEntity('voomPosts', post.id)));
      changed += posts.length;
    }
    if (sectionSet.has('music')) {
      const tracks = [...musicFavoriteTracks.value];
      const threads = [...musicCommentThreads.value];
      musicFavoriteTracks.value = [];
      musicCommentThreads.value = [];
      await Promise.all([
        ...tracks.map((track) => deleteEntity('musicFavoriteTracks', track.id)),
        ...threads.map((thread) => deleteEntity('musicCommentThreads', thread.trackKey))
      ]);
      changed += tracks.length + threads.length;
    }
    if (sectionSet.has('worldBooks')) {
      const books = [...worldBooks.value];
      worldBooks.value = [];
      characters.value = characters.value.map((character) => ({ ...character, localWorldBookIds: [] }));
      await Promise.all([
        ...books.map((book) => deleteEntity('worldBooks', book.id)),
        ...characters.value.map((character) => putEntity('characters', character))
      ]);
      changed += books.length;
    }
    if (sectionSet.has('stickers')) {
      const groups = [...stickerGroups.value];
      const entries = [...stickers.value];
      stickerGroups.value = [];
      stickers.value = [];
      await Promise.all([
        ...groups.map((group) => deleteEntity('stickerGroups', group.id)),
        ...entries.map((sticker) => deleteEntity('stickers', sticker.id))
      ]);
      changed += groups.length + entries.length;
    }
    if (sectionSet.has('conversationSettings')) {
      const entries = [...conversationSettings.value];
      conversationSettings.value = [];
      await Promise.all(entries.map((entry) => deleteEntity('conversationSettings', entry.conversationId)));
      changed += entries.length;
    }
    if (sectionSet.has('conversationMemories')) {
      const entries = [...conversationMemories.value];
      conversationMemories.value = [];
      await Promise.all(entries.map((entry) => deleteEntity('conversationMemories', entry.id)));
      changed += entries.length;
    }
    if (sectionSet.has('generatedImages')) {
      const entries = [...generatedImages.value];
      generatedImages.value = [];
      await Promise.all(entries.map((entry) => deleteEntity('generatedImages', entry.id)));
      changed += entries.length;
    }

    return changed;
  }

  async function appendUserImageMessage(conversationId: string, content: string, image: ChatImageAttachment, quote?: ChatMessageQuote | null) {
    const trimmedContent = content.trim();
    const description = image.description.trim();
    const conversation = conversationById(conversationId);
    if (!trimmedContent || !description || !conversation) return;

    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'user',
      mode: conversation.activeMode,
      content: trimmedContent,
      image: {
        ...image,
        description,
        aiHint: image.aiHint?.trim() || undefined
      },
      quote: cloneMessageQuote(quote),
      createdAt: Date.now(),
      status: 'sent'
    };
    messages.value.push(userMessage);
    await putEntity('messages', userMessage);
    const nextConversation = { ...conversation, updatedAt: userMessage.createdAt, unreadCount: 0 };
    const conversationIndex = conversations.value.findIndex((item) => item.id === conversationId);
    if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    await putEntity('conversations', nextConversation);
    void maybeAutoSummarizeConversation(conversationId);
    return userMessage;
  }

  async function appendUserVoiceMessage(conversationId: string, voice: ChatVoiceAttachment, quote?: ChatMessageQuote | null) {
    const transcript = voice.transcript.trim();
    const conversation = conversationById(conversationId);
    if (!transcript || !conversation) return;

    const duration = estimateVoiceDuration(transcript, voice.duration);
    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'user',
      mode: conversation.activeMode,
      content: `[语音] ${transcript}`,
      voice: {
        source: voice.source,
        transcript,
        duration,
        audioUrl: voice.audioUrl,
        mimeType: voice.mimeType
      },
      quote: cloneMessageQuote(quote),
      createdAt: Date.now(),
      status: 'sent'
    };
    messages.value.push(userMessage);
    await putEntity('messages', userMessage);
    const nextConversation = { ...conversation, updatedAt: userMessage.createdAt, unreadCount: 0 };
    const conversationIndex = conversations.value.findIndex((item) => item.id === conversationId);
    if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    await putEntity('conversations', nextConversation);
    void maybeAutoSummarizeConversation(conversationId);
    return userMessage;
  }

  async function appendUserLocationMessage(conversationId: string, location: ChatLocationAttachment, quote?: ChatMessageQuote | null) {
    const normalizedLocation = normalizeLocationAttachment(location);
    const conversation = conversationById(conversationId);
    if (!normalizedLocation || !conversation) return;

    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'user',
      mode: conversation.activeMode,
      content: formatLocationContent(normalizedLocation),
      location: normalizedLocation,
      quote: cloneMessageQuote(quote),
      createdAt: Date.now(),
      status: 'sent'
    };
    messages.value.push(userMessage);
    await putEntity('messages', userMessage);
    const nextConversation = { ...conversation, updatedAt: userMessage.createdAt, unreadCount: 0 };
    const conversationIndex = conversations.value.findIndex((item) => item.id === conversationId);
    if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    await putEntity('conversations', nextConversation);
    void maybeAutoSummarizeConversation(conversationId);
    return userMessage;
  }

  async function appendUserTransferMessage(conversationId: string, transfer: Pick<ChatTransferAttachment, 'amount' | 'note'>, quote?: ChatMessageQuote | null) {
    const normalizedTransfer = normalizeTransferAttachment(transfer);
    const conversation = conversationById(conversationId);
    if (!normalizedTransfer || !conversation) return;

    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'user',
      mode: conversation.activeMode,
      content: formatTransferContent(normalizedTransfer),
      transfer: normalizedTransfer,
      quote: cloneMessageQuote(quote),
      createdAt: Date.now(),
      status: 'sent'
    };
    messages.value.push(userMessage);
    await putEntity('messages', userMessage);
    const nextConversation = { ...conversation, updatedAt: userMessage.createdAt, unreadCount: 0 };
    const conversationIndex = conversations.value.findIndex((item) => item.id === conversationId);
    if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    await putEntity('conversations', nextConversation);
    void maybeAutoSummarizeConversation(conversationId);
    return userMessage;
  }

  async function updateTransferStatus(messageId: string, status: ChatTransferStatus, actor: 'user' | 'char' = 'user') {
    if (status === 'pending') return null;
    const message = messages.value.find((item) => item.id === messageId);
    if (!message?.transfer || message.transfer.status !== 'pending') return null;
    if (actor === 'user' && message.sender !== 'char') return null;
    if (actor === 'char' && message.sender !== 'user') return null;
    const nextTransfer = { ...message.transfer, status, respondedAt: Date.now() };
    const nextMessage: ChatMessage = {
      ...message,
      content: formatTransferContent(nextTransfer),
      transfer: nextTransfer,
      editedAt: Date.now()
    };
    const messageIndex = messages.value.findIndex((item) => item.id === messageId);
    if (messageIndex >= 0) messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    void maybeAutoSummarizeConversation(message.conversationId);
    return nextMessage;
  }

  async function summarizeConversationWindow(conversationId: string, options: { forceStartFloor?: number; forceEndFloor?: number; hiddenStartFloor?: number; hiddenEndFloor?: number; allowPartial?: boolean; replaceMemoryId?: string } = {}): Promise<ConversationSummaryResult | null> {
    const conversation = conversationById(conversationId);
    if (!conversation) return null;
    const chatSettings = settingsForConversation(conversationId);
    const conversationMessages = messagesForConversation(conversationId).filter((message) => message.replyVariantState !== 'inactive');
    const conversationFloorCount = getConversationFloorCount(conversationMessages);
    const memories = memoriesForConversation(conversationId);
    const nextRange = getNextSummaryRange(conversationMessages, memories, chatSettings, conversation.activeMode);
    const completedEndFloor = memories.reduce((max, memory) => Math.max(max, memory.endFloor), 0);
    const partialStartFloor = completedEndFloor + 1;
    const partialEndFloor = conversationFloorCount;
    const partialLength = partialEndFloor - partialStartFloor + 1;
    const range = options.forceStartFloor && options.forceEndFloor
      ? {
          startFloor: options.forceStartFloor,
          endFloor: options.forceEndFloor,
          hiddenStartFloor: options.hiddenStartFloor ?? options.forceStartFloor,
          hiddenEndFloor: options.hiddenEndFloor ?? getMemoryHiddenEndFloor(options.forceStartFloor, options.forceEndFloor),
          sourceMessages: getMessagesInFloorRange(conversationMessages, options.forceStartFloor, options.forceEndFloor)
        }
      : nextRange ?? (options.allowPartial && partialLength > 0
        ? {
            startFloor: partialStartFloor,
            endFloor: partialEndFloor,
            hiddenStartFloor: partialStartFloor,
            hiddenEndFloor: getMemoryHiddenEndFloor(partialStartFloor, partialEndFloor),
            sourceMessages: getMessagesInFloorRange(conversationMessages, partialStartFloor, partialEndFloor)
          }
        : null);

    if (!range || !range.sourceMessages.length) return null;

    const rangeIdentity = {
      conversationId,
      mode: conversation.activeMode,
      startFloor: range.startFloor,
      endFloor: range.endFloor,
      isMergedSummary: false
    } satisfies Pick<ConversationMemoryRecord, 'conversationId' | 'mode' | 'startFloor' | 'endFloor' | 'isMergedSummary'>;
    const rangeKey = getMemoryRangeKey(rangeIdentity);
    const replacingMemory = options.replaceMemoryId
      ? memories.find((memory) => memory.id === options.replaceMemoryId)
      : null;
    const existingMemory = memories.find((memory) => isSameMemoryRange(memory, rangeIdentity));
    if (existingMemory && existingMemory.id !== options.replaceMemoryId) {
      return { record: existingMemory, status: 'existing' };
    }
    if (summarizingConversationRanges.has(rangeKey)) {
      const currentMemory = existingMemory ?? replacingMemory;
      return currentMemory ? { record: currentMemory, status: 'busy' } : null;
    }
    summarizingConversationRanges.add(rangeKey);

    try {
      const character = characterById(conversation.charId);
      const characterName = character?.nickname || character?.name || '角色';
      const boundUser = character ? userById(character.boundUserId) ?? user.value : user.value;
      const userSenderName = boundUser?.name || boundUser?.nickname || '我';
      const modelOverride = getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode);
      const floorMap = getMessageFloorMap(conversationMessages);
      const includeTimeline = chatSettings.timeAwareness.enabled;
      const summary = await generateConversationSummary({
        messages: range.sourceMessages.map((message) => {
          const floor = floorMap.get(message.id) ?? range.startFloor;
          const sender = message.sender === 'user' ? userSenderName : message.sender === 'char' ? character?.nickname || '角色' : '系统';
          const sentAtText = includeTimeline ? `（发送时间：${formatMemoryTimelineTime(message.createdAt)}）` : '';
          return `${floor}楼 ${sender}${sentAtText}: ${message.content}`;
        }).join('\n'),
        previousSummary: getMemoryContext(memoriesForConversation(conversationId)),
        timeAwareness: chatSettings.timeAwareness,
        timeAwarenessUserName: boundUser?.name || boundUser?.nickname || '用户',
        timelineContext: renderMessageTimelineContext(range.sourceMessages, floorMap, range.startFloor),
        settings: settings.value ?? undefined,
        modelOverride,
        promptOverride: renderCharacterMemoryPrompt(chatSettings.memory.summaryPrompt, characterName)
      });
      const hasHiddenRange = chatSettings.memory.hideSummarizedMessages && range.hiddenStartFloor > 0 && range.hiddenEndFloor >= range.hiddenStartFloor;
      const vector = chatSettings.memory.vectorMemoryEnabled
        ? await generateEmbeddingVector({
            text: summary,
            settings: settings.value ?? undefined,
            modelOverride
          })
        : [];
      const existingAfterGeneration = memoriesForConversation(conversationId).find((memory) => isSameMemoryRange(memory, rangeIdentity));
      if (existingAfterGeneration && existingAfterGeneration.id !== options.replaceMemoryId) {
        return { record: existingAfterGeneration, status: 'existing' };
      }
      const nextRecord = createMemoryRecord({
        conversationId,
        mode: conversation.activeMode,
        startFloor: range.startFloor,
        endFloor: range.endFloor,
        hiddenStartFloor: hasHiddenRange ? range.hiddenStartFloor : 0,
        hiddenEndFloor: hasHiddenRange ? range.hiddenEndFloor : 0,
        summary,
        sourceMessages: range.sourceMessages,
        model: modelOverride || settings.value?.model || '',
        vector
      });
      if (replacingMemory) {
        const record = {
          ...replacingMemory,
          mode: conversation.activeMode,
          startFloor: nextRecord.startFloor,
          endFloor: nextRecord.endFloor,
          hiddenStartFloor: nextRecord.hiddenStartFloor,
          hiddenEndFloor: nextRecord.hiddenEndFloor,
          summary: nextRecord.summary,
          tokenCount: nextRecord.tokenCount,
          vector: [...nextRecord.vector],
          sourceMessageIds: [...nextRecord.sourceMessageIds],
          model: nextRecord.model
        };
        await updateMemoryRecord(record);
        return { record, status: 'updated' };
      }
      conversationMemories.value = [...conversationMemories.value, nextRecord];
      await putEntity('conversationMemories', nextRecord);
      return { record: nextRecord, status: 'created' };
    } finally {
      summarizingConversationRanges.delete(rangeKey);
    }
  }

  async function maybeAutoSummarizeConversation(conversationId: string) {
    const chatSettings = settingsForConversation(conversationId);
    if (!chatSettings.memory.autoSummarize) return;
    try {
      await summarizeConversationWindow(conversationId);
      await compressOldMemories(conversationId);
    } catch (error) {
      console.error(error);
    }
  }

  async function updateMemoryRecord(nextMemory: ConversationMemoryRecord) {
    const normalizedMemory = {
      ...nextMemory,
      tokenCount: Math.max(0, Math.round(nextMemory.tokenCount)),
      vector: Array.isArray(nextMemory.vector) ? [...nextMemory.vector] : [],
      sourceMessageIds: Array.isArray(nextMemory.sourceMessageIds) ? [...nextMemory.sourceMessageIds] : [],
      mergedFrom: nextMemory.mergedFrom?.map((memory) => cloneMemoryRecordForMerge(memory)),
      updatedAt: Date.now()
    };
    const duplicateIds = new Set(
      conversationMemories.value
        .filter((memory) => memory.id !== normalizedMemory.id && isSameMemoryRange(memory, normalizedMemory))
        .map((memory) => memory.id)
    );
    const index = conversationMemories.value.findIndex((memory) => memory.id === normalizedMemory.id);
    if (index >= 0) {
      conversationMemories.value[index] = normalizedMemory;
      conversationMemories.value = conversationMemories.value.filter((memory) => !duplicateIds.has(memory.id));
    } else {
      conversationMemories.value = [
        ...conversationMemories.value.filter((memory) => !duplicateIds.has(memory.id)),
        normalizedMemory
      ];
    }
    if (duplicateIds.size) {
      await Promise.all([...duplicateIds].map((memoryId) => deleteEntity('conversationMemories', memoryId)));
    }
    await putEntity('conversationMemories', normalizedMemory);
  }

  async function deleteMemoryRecord(memoryId: string) {
    conversationMemories.value = conversationMemories.value.filter((memory) => memory.id !== memoryId);
    await deleteEntity('conversationMemories', memoryId);
  }

  async function resummarizeMemory(memoryId: string) {
    const memory = conversationMemories.value.find((entry) => entry.id === memoryId);
    if (!memory) return null;
    return summarizeConversationWindow(memory.conversationId, {
      forceStartFloor: memory.startFloor,
      forceEndFloor: memory.endFloor,
      hiddenStartFloor: memory.hiddenStartFloor,
      hiddenEndFloor: memory.hiddenEndFloor,
      replaceMemoryId: memory.id
    });
  }

  async function toggleMemoryHiddenRange(memoryId: string, hidden: boolean) {
    const memory = conversationMemories.value.find((entry) => entry.id === memoryId);
    if (!memory) return;
    await updateMemoryRecord({
      ...memory,
      hiddenStartFloor: hidden ? memory.startFloor : 0,
      hiddenEndFloor: hidden ? getMemoryHiddenEndFloor(memory.startFloor, memory.endFloor) : 0
    });
  }

  function cloneMemoryRecordForMerge(memory: ConversationMemoryRecord): ConversationMemoryRecord {
    return {
      ...memory,
      vector: Array.isArray(memory.vector) ? [...memory.vector] : [],
      sourceMessageIds: Array.isArray(memory.sourceMessageIds) ? [...memory.sourceMessageIds] : [],
      mergedFrom: memory.mergedFrom?.map((childMemory) => cloneMemoryRecordForMerge(childMemory))
    };
  }

  function compareMemoryRecordsByRange(leftMemory: ConversationMemoryRecord, rightMemory: ConversationMemoryRecord) {
    if (leftMemory.startFloor !== rightMemory.startFloor) return leftMemory.startFloor - rightMemory.startFloor;
    if (leftMemory.endFloor !== rightMemory.endFloor) return leftMemory.endFloor - rightMemory.endFloor;
    if (leftMemory.createdAt !== rightMemory.createdAt) return leftMemory.createdAt - rightMemory.createdAt;
    return leftMemory.id.localeCompare(rightMemory.id);
  }

  async function mergeConversationMemories(conversationId: string, memoryIds?: string[]) {
    const conversation = conversationById(conversationId);
    if (!conversation) return null;
    const selectedIds = new Set((memoryIds ?? []).map((memoryId) => memoryId.trim()).filter(Boolean));
    const memories = memoriesForConversation(conversationId)
      .filter((memory) => !selectedIds.size || selectedIds.has(memory.id))
      .sort(compareMemoryRecordsByRange);
    if (memories.length <= 1) return null;

    const chatSettings = settingsForConversation(conversationId);
    const character = characterById(conversation.charId);
    const characterName = character?.nickname || character?.name || '角色';
    const modelOverride = getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode);
    const summary = await generateConversationSummary({
      messages: memories.map((memory) => `【${memory.startFloor}-${memory.endFloor}楼】\n${memory.summary}`).join('\n\n'),
      previousSummary: '',
      timeAwareness: chatSettings.timeAwareness,
      timeAwarenessUserName: user.value?.name || user.value?.nickname || '用户',
      timelineContext: renderMemoryRangeTimelineContext(memories),
      settings: settings.value ?? undefined,
      modelOverride,
      promptOverride: renderCharacterMemoryPrompt(chatSettings.memory.mergeSummaryPrompt, characterName)
    });
    const vector = chatSettings.memory.vectorMemoryEnabled
      ? await generateEmbeddingVector({
          text: summary,
          settings: settings.value ?? undefined,
          modelOverride
        })
      : [];
    const hiddenStartFloor = memories.reduce((min, memory) => memory.hiddenStartFloor ? Math.min(min, memory.hiddenStartFloor) : min, Number.POSITIVE_INFINITY);
    const sourceMessageIds = [...new Set(memories.flatMap((memory) => memory.sourceMessageIds))];
    const now = Date.now();
    const mergedRecord: ConversationMemoryRecord = {
      id: createId('memory'),
      conversationId,
      mode: conversation.activeMode,
      kind: 'long-term',
      startFloor: memories.reduce((min, memory) => Math.min(min, memory.startFloor), Number.POSITIVE_INFINITY),
      endFloor: memories.reduce((max, memory) => Math.max(max, memory.endFloor), 0),
      hiddenStartFloor,
      hiddenEndFloor: memories.reduce((max, memory) => Math.max(max, memory.hiddenEndFloor), 0),
      summary,
      tokenCount: estimateTokenCount(summary),
      vector,
      sourceMessageIds,
      model: modelOverride || settings.value?.model || '',
      isMergedSummary: true,
      mergedFrom: memories.map((memory) => cloneMemoryRecordForMerge(memory)),
      createdAt: now,
      updatedAt: now
    };
    if (!Number.isFinite(mergedRecord.hiddenStartFloor)) mergedRecord.hiddenStartFloor = 0;
    if (!Number.isFinite(mergedRecord.startFloor)) mergedRecord.startFloor = memories[0].startFloor;

    conversationMemories.value = conversationMemories.value.filter((memory) => memory.conversationId !== conversationId || !memories.some((item) => item.id === memory.id));
    conversationMemories.value.push(mergedRecord);
    await Promise.all([
      ...memories.map((memory) => deleteEntity('conversationMemories', memory.id)),
      putEntity('conversationMemories', mergedRecord)
    ]);
    return mergedRecord;
  }

  async function unmergeConversationMemories(conversationId: string, memoryId?: string) {
    const mergedMemory = memoriesForConversation(conversationId).find((memory) => memory.isMergedSummary && memory.mergedFrom?.length && (!memoryId || memory.id === memoryId));
    if (!mergedMemory?.mergedFrom?.length) return;

    const restoredMemories = mergedMemory.mergedFrom.map((memory) => cloneMemoryRecordForMerge(memory));
    conversationMemories.value = [
      ...conversationMemories.value.filter((memory) => memory.id !== mergedMemory.id),
      ...restoredMemories
    ];
    await Promise.all([
      deleteEntity('conversationMemories', mergedMemory.id),
      ...restoredMemories.map((memory) => putEntity('conversationMemories', memory))
    ]);
  }

  async function compressOldMemories(conversationId: string) {
    const oldMemories = memoriesForConversation(conversationId).filter((memory) => shouldCompressMemory(memory));
    if (!oldMemories.length) return;
    const conversation = conversationById(conversationId);
    const character = conversation ? characterById(conversation.charId) : null;
    const characterName = character?.nickname || character?.name || '角色';
    const chatSettings = settingsForConversation(conversationId);
    await Promise.all(oldMemories.map(async (memory) => {
      const summary = await generateConversationSummary({
        messages: memory.summary,
        previousSummary: '',
        timeAwareness: chatSettings.timeAwareness,
        timeAwarenessUserName: user.value?.name || user.value?.nickname || '用户',
        timelineContext: renderMemoryRangeTimelineContext([memory]),
        settings: settings.value ?? undefined,
        modelOverride: getConversationTextModelOverride(chatSettings, 'summary', memory.mode),
        promptOverride: renderCharacterMemoryPrompt(chatSettings.memory.summaryPrompt, characterName)
      });
      await updateMemoryRecord({
        ...memory,
        kind: 'long-term',
        summary,
        compressedAt: Date.now()
      });
    }));
  }

  async function requestRoleplayReply(conversationId: string, options?: { generateMoment?: boolean; proactive?: boolean; replyInstruction?: string; replyVariantGroupId?: string; replyVariantIndex?: number }) {
    const conversation = conversationById(conversationId);
    if (!conversation || isConversationReplying(conversationId)) return;
    const character = characterById(conversation.charId);
    if (!character) return;
    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return;

    const conversationMessages = messagesForConversation(conversationId).filter((message) => message.replyVariantState !== 'inactive');
    const lastUserMessages = [...conversationMessages].reverse().filter((message, index, reversedMessages) => {
      const previousMessages = reversedMessages.slice(0, index);
      return message.sender === 'user' && !previousMessages.some((previous) => previous.sender === 'char');
    }).reverse();

    const userMessageText = lastUserMessages.map((message) => messageReadableContent(message)).join('\n');
    const chatSettings = settingsForConversation(conversationId);
    const modelOverride = getConversationTextModelOverride(chatSettings, conversation.activeMode);
    if (!hasConfiguredTextModel(modelOverride)) {
      if (!options?.proactive) {
        showConfigAlert('请先在设置或聊天菜单里配置可用的线上/线下聊天 API 模型，再让角色回复。', '需要配置 API 模型');
      }
      return;
    }

    if (!startConversationReply(conversationId)) return;
    try {
      if (chatSettings.stickerVisionEnabled) {
        await localizeRecentStickerMessagesForVision(conversationId);
      }
      const availableCharacterStickers = stickersForGroups(chatSettings.characterStickerGroupIds);
      const replyPayload = await generateRoleplayReply({
        user: boundUser,
        character,
        boundUser,
        mode: conversation.activeMode,
        messages: visibleMessagesForConversation(conversationId),
        worldBooks: worldBooks.value,
        conversationSummary: conversation.summary,
        memorySummary: memoryContextForConversation(conversationId),
        stickerVisionEnabled: chatSettings.stickerVisionEnabled,
        narrationModeEnabled: chatSettings.narrationModeEnabled,
        offlineInvitationEnabled: chatSettings.offlineInvitationEnabled,
        timeAwareness: chatSettings.timeAwareness,
        offlineSettings: chatSettings.offline,
        replyInstruction: options?.replyInstruction
          ? options.replyInstruction
          : options?.proactive
          ? `这不是用户刚发来的新消息，而是${character.nickname || character.name}在自己的生活节奏里主动联系${boundUser.nickname || boundUser.name}。请基于最近对话、关系状态、时间流逝和角色当前生活，生成一组自然的主动消息；不要假装用户刚说了什么，也不要替用户发言。`
          : undefined,
        availableStickers: availableCharacterStickers.map((sticker) => ({
          stickerId: sticker.id,
          description: sticker.description,
          imageUrl: sticker.imageUrl
        })),
        userMessage: userMessageText,
        settings: settings.value ?? undefined,
        modelOverride
      });
      const parsedReply = JSON.parse(replyPayload) as RoleplayReplyResult;
      const replyBatchId = createId('reply');
      const replyVariantFields = options?.replyVariantGroupId
        ? {
          replyVariantGroupId: options.replyVariantGroupId,
          replyVariantIndex: Math.max(0, Math.floor(Number(options.replyVariantIndex) || 0)),
          replyVariantState: 'active' as const
        }
        : {};
      const replyTexts = Array.isArray(parsedReply.replies) ? parsedReply.replies : [parsedReply.reply];
      const replyTranslations = Array.isArray(parsedReply.replyTranslations) ? parsedReply.replyTranslations : [];
      const replyMessages = replyTexts
        .map((reply, index) => ({
          content: String(reply ?? '').trim(),
          translation: conversation.activeMode === 'online' ? normalizeTranslationText(replyTranslations[index]) : ''
        }))
        .filter((reply) => Boolean(reply.content));
      const plotChoices = conversation.activeMode === 'offline'
        ? [...new Set((parsedReply.plotChoices ?? []).map((choice) => String(choice ?? '').trim()).filter(Boolean))].slice(0, 6)
        : [];
      const orderedSegments = Array.isArray(parsedReply.segments)
        ? parsedReply.segments
          .flatMap((segment): RoleplayReplySegment[] => {
            if (segment.type === 'reply') {
              const content = String(segment.content ?? '').trim();
              if (!content) return [];
              const translation = conversation.activeMode === 'online' ? normalizeTranslationText(segment.translation) : '';
              return [{ type: 'reply', content, ...(translation ? { translation } : {}) }];
            }
            if (segment.type === 'narration') {
              if (conversation.activeMode !== 'online' || !chatSettings.narrationModeEnabled) return [];
              const content = String(segment.content ?? '').trim();
              return content ? [{ type: 'narration', content }] : [];
            }
            if (segment.type === 'sticker') {
              const stickers = Array.isArray(segment.stickers) ? segment.stickers.map((sticker) => String(sticker ?? '').trim()).filter(Boolean) : [];
              return stickers.length ? [{ type: 'sticker', stickers }] : [];
            }
            if (segment.type === 'image') {
              const description = String(segment.description ?? '').trim();
              return description ? [{ type: 'image', description }] : [];
            }
            if (segment.type === 'voice') {
              const content = String(segment.content ?? '').trim();
              const translation = conversation.activeMode === 'online' ? normalizeTranslationText(segment.translation) : '';
              const duration = Number(segment.duration);
              return content ? [{ type: 'voice', content, ...(translation ? { translation } : {}), ...(Number.isFinite(duration) && duration > 0 ? { duration } : {}) }] : [];
            }
            if (segment.type === 'location') {
              const location = normalizeLocationAttachment({
                name: String(segment.name ?? '').trim(),
                address: String(segment.address ?? '').trim() || undefined,
                distance: String(segment.distance ?? '').trim()
              });
              return location ? [{ type: 'location', ...location }] : [];
            }
            if (segment.type === 'transfer') {
              const transfer = normalizeTransferAttachment({ amount: segment.amount, note: segment.note });
              return transfer ? [{ type: 'transfer', amount: transfer.amount, ...(transfer.note ? { note: transfer.note } : {}) }] : [];
            }
            return [];
          })
          .slice(0, 12)
        : [];
      const replyImages = (parsedReply.images ?? [])
        .map((image) => String(image.description ?? '').trim())
        .filter(Boolean)
        .slice(0, 3);
      const narrationMessages = conversation.activeMode === 'online' && chatSettings.narrationModeEnabled
        ? (parsedReply.narrations ?? [])
          .map((narration) => String(narration ?? '').trim())
          .filter(Boolean)
          .slice(0, 3)
        : [];
      const replyStickers = resolveCharacterStickerSelections(parsedReply.stickers, availableCharacterStickers);
      const replyStickerPlacements = (parsedReply.stickerPlacements ?? [])
        .map((placement) => {
          const rawReplyIndex = Number(placement.replyIndex);
          const replyIndex = Number.isFinite(rawReplyIndex)
            ? Math.min(Math.max(0, Math.floor(rawReplyIndex)), Math.max(0, replyMessages.length - 1))
            : 0;
          const position = placement.position === 'before' ? 'before' : 'after';
          const stickers = resolveCharacterStickerSelections(placement.stickers, availableCharacterStickers);
          return { replyIndex, position, stickers };
        })
        .filter((placement) => placement.stickers.length);
      const orderedReplyMessages = orderedSegments.filter((segment): segment is Extract<RoleplayReplySegment, { type: 'reply' }> => segment.type === 'reply');
      const effectiveReplyMessages = orderedSegments.length ? orderedReplyMessages : replyMessages;
      const hasOrderedSticker = orderedSegments.some((segment) => segment.type === 'sticker'
        && resolveCharacterStickerSelections(segment.stickers, availableCharacterStickers).length);
      const hasOrderedNarration = orderedSegments.some((segment) => segment.type === 'narration');
      const hasOrderedImage = orderedSegments.some((segment) => segment.type === 'image' && segment.description.trim());
      const hasOrderedVoice = orderedSegments.some((segment) => segment.type === 'voice' && segment.content.trim());
      const hasOrderedLocation = orderedSegments.some((segment) => segment.type === 'location' && segment.name.trim() && segment.distance.trim());
      const hasOrderedTransfer = orderedSegments.some((segment) => segment.type === 'transfer' && normalizeTransferAttachment({ amount: segment.amount, note: segment.note }));
      const recallMessageIds = parsedReply.messageActions?.recallMessageIds ?? [];
      const validRecallMessageIds = recallMessageIds.filter((messageId) => messages.value.some((message) => message.id === messageId && message.conversationId === conversationId && message.sender === 'char'));
      const validTransferDecisions = (parsedReply.messageActions?.transferDecisions ?? [])
        .map((decision) => ({
          messageId: String(decision.messageId ?? '').trim(),
          status: decision.status === 'accepted' ? 'accepted' as const : decision.status === 'rejected' ? 'rejected' as const : null
        }))
        .filter((decision): decision is { messageId: string; status: 'accepted' | 'rejected' } => Boolean(decision.messageId && decision.status && messages.value.some((message) => message.id === decision.messageId && message.conversationId === conversationId && message.sender === 'user' && message.transfer?.status === 'pending')));
      const offlineInvitation = conversation.activeMode === 'online' && chatSettings.offlineInvitationEnabled
        ? normalizeOfflineInvitationAttachment(parsedReply.messageActions?.offlineInvitation?.prompt ?? '')
        : null;
      const quoteByReplyIndex = new Map<number, ChatMessageQuote>();
      for (const quoteAction of parsedReply.messageActions?.quotes ?? []) {
        const targetMessage = messages.value.find((message) => message.id === quoteAction.messageId && message.conversationId === conversationId && message.sender === 'user');
        const quote = targetMessage ? createMessageQuoteSnapshot(targetMessage) : null;
        if (quote) quoteByReplyIndex.set(Math.max(0, Math.floor(quoteAction.replyIndex)), quote);
      }
      if (!effectiveReplyMessages.length && !replyStickers.length && !replyImages.length && !narrationMessages.length && !hasOrderedSticker && !hasOrderedNarration && !hasOrderedImage && !hasOrderedVoice && !hasOrderedLocation && !hasOrderedTransfer && !validRecallMessageIds.length && !validTransferDecisions.length && !offlineInvitation) {
        showConfigAlert('AI 返回内容中没有可显示的聊天文本，请重试或检查模型输出格式。', '回复异常');
        return;
      }
      const profileUpdate = parsedReply.profileUpdate;
      if (profileUpdate && (profileUpdate.nickname || profileUpdate.signature)) {
        const nextCharacter = normalizeCharacterProfile({
          ...character,
          nickname: profileUpdate.nickname || character.nickname,
          signature: profileUpdate.signature || character.signature,
          subtitle: profileUpdate.signature || character.subtitle
        }, character.boundUserId);
        await saveCharacter(nextCharacter);
      }
      if (conversation.activeMode === 'online' && profileUpdate?.innerMonologue?.length) {
        await updateCharacterMindState(character.id, profileUpdate.innerMonologue, conversationId, { replyBatchId });
      }
      for (const messageId of validRecallMessageIds) {
        await recallMessage(messageId, { actor: 'char', replyBatchId });
      }
      for (const decision of validTransferDecisions) {
        await updateTransferStatus(decision.messageId, decision.status, 'char');
      }
      const createdAt = Date.now();
      const charNarrationMessages = narrationMessages.map((content, index) => ({
        id: createId('msg'),
        conversationId,
        sender: 'system' as const,
        mode: conversation.activeMode,
        content,
        createdAt: createdAt + index,
        displayStyle: 'narration' as const,
        replyBatchId,
        ...replyVariantFields,
        status: 'sent' as const
      } satisfies ChatMessage));
      const charMessagesAfterNarration: ChatMessage[] = [];
      const orderedCharMessages: ChatMessage[] = [];
      let charMessageOffset = orderedSegments.length ? 0 : charNarrationMessages.length;
      let orderedReplyIndex = 0;
      const createStickerMessages = (stickersToSend: Sticker[]) => stickersToSend.map((sticker) => ({
        id: createId('msg'),
        conversationId,
        sender: 'char' as const,
        mode: conversation.activeMode,
        content: `[Sticker] ${sticker.description}`,
        sticker: {
          stickerId: sticker.id,
          description: sticker.description,
          imageUrl: sticker.imageUrl
        },
        replyBatchId,
        ...replyVariantFields,
        createdAt: createdAt + charMessageOffset++,
        status: 'sent' as const
      } satisfies ChatMessage));
      const appendStickerMessages = (stickersToSend: Sticker[]) => {
        charMessagesAfterNarration.push(...createStickerMessages(stickersToSend));
      };
      const appendOrderedStickerMessages = (stickersToSend: Sticker[]) => {
        orderedCharMessages.push(...createStickerMessages(stickersToSend));
      };
      const createImageMessage = async (description: string) => {
        const image = await createCharacterImageAttachment(description);
        if (!image) return null;
        return {
          id: createId('msg'),
          conversationId,
          sender: 'char' as const,
          mode: conversation.activeMode,
          content: `[图片] ${image.description}`,
          image,
          replyBatchId,
          ...replyVariantFields,
          createdAt: createdAt + charMessageOffset++,
          status: 'sent' as const
        } satisfies ChatMessage;
      };
      const createVoiceMessage = (content: string, duration?: number, translation?: string) => ({
        id: createId('msg'),
        conversationId,
        sender: 'char' as const,
        mode: conversation.activeMode,
        content: `[语音] ${content}`,
        translation: translation || undefined,
        voice: {
          source: 'text' as const,
          transcript: content,
          duration: estimateVoiceDuration(content, duration)
        },
        replyBatchId,
        ...replyVariantFields,
        createdAt: createdAt + charMessageOffset++,
        status: 'sent' as const
      } satisfies ChatMessage);
      const createLocationMessage = (location: ChatLocationAttachment) => ({
        id: createId('msg'),
        conversationId,
        sender: 'char' as const,
        mode: conversation.activeMode,
        content: formatLocationContent(location),
        location,
        replyBatchId,
        ...replyVariantFields,
        createdAt: createdAt + charMessageOffset++,
        status: 'sent' as const
      } satisfies ChatMessage);
      const createTransferMessage = (transfer: Pick<ChatTransferAttachment, 'amount' | 'note'>) => {
        const normalizedTransfer = normalizeTransferAttachment(transfer);
        if (!normalizedTransfer) return null;
        return {
          id: createId('msg'),
          conversationId,
          sender: 'char' as const,
          mode: conversation.activeMode,
          content: formatTransferContent(normalizedTransfer),
          transfer: normalizedTransfer,
          replyBatchId,
          ...replyVariantFields,
          createdAt: createdAt + charMessageOffset++,
          status: 'sent' as const
        } satisfies ChatMessage;
      };
      const sentImageDescriptionKeys = new Set<string>();
      const appendImageMessage = async (description: string, targetMessages: ChatMessage[]) => {
        const imageKey = normalizeDuplicateKey(description);
        if (!imageKey || sentImageDescriptionKeys.has(imageKey)) return;
        sentImageDescriptionKeys.add(imageKey);
        const imageMessage = await createImageMessage(description);
        if (imageMessage) targetMessages.push(imageMessage);
      };
      const appendPlacedStickers = (replyIndex: number, position: 'before' | 'after') => {
        for (const placement of replyStickerPlacements) {
          if (placement.replyIndex === replyIndex && placement.position === position) appendStickerMessages(placement.stickers);
        }
      };
      if (orderedSegments.length) {
        for (const segment of orderedSegments) {
          switch (segment.type) {
            case 'narration':
              orderedCharMessages.push({
                id: createId('msg'),
                conversationId,
                sender: 'system' as const,
                mode: conversation.activeMode,
                content: segment.content,
                createdAt: createdAt + charMessageOffset++,
                displayStyle: 'narration' as const,
                replyBatchId,
                ...replyVariantFields,
                status: 'sent' as const
              } satisfies ChatMessage);
              break;
            case 'reply':
              orderedCharMessages.push({
                id: createId('msg'),
                conversationId,
                sender: 'char' as const,
                mode: conversation.activeMode,
                content: segment.content,
                translation: segment.translation || undefined,
                quote: quoteByReplyIndex.get(orderedReplyIndex),
                replyBatchId,
                ...replyVariantFields,
                createdAt: createdAt + charMessageOffset++,
                status: 'sent' as const
              } satisfies ChatMessage);
              orderedReplyIndex += 1;
              break;
            case 'sticker':
              appendOrderedStickerMessages(resolveCharacterStickerSelections(segment.stickers, availableCharacterStickers));
              break;
            case 'image':
              await appendImageMessage(segment.description, orderedCharMessages);
              break;
            case 'location': {
              orderedCharMessages.push(createLocationMessage(segment));
              break;
            }
            case 'voice': {
              orderedCharMessages.push(createVoiceMessage(segment.content, segment.duration, segment.translation));
              break;
            }
            case 'transfer': {
              const transferMessage = createTransferMessage(segment);
              if (transferMessage) orderedCharMessages.push(transferMessage);
              break;
            }
          }
        }
      } else if (replyMessages.length) {
        replyMessages.forEach((reply, index) => {
          appendPlacedStickers(index, 'before');
          charMessagesAfterNarration.push({
            id: createId('msg'),
            conversationId,
            sender: 'char' as const,
            mode: conversation.activeMode,
            content: reply.content,
            translation: reply.translation || undefined,
            quote: quoteByReplyIndex.get(index),
            replyBatchId,
            ...replyVariantFields,
            createdAt: createdAt + charMessageOffset++,
            status: 'sent' as const
          } satisfies ChatMessage);
          appendPlacedStickers(index, 'after');
        });
      } else {
        replyStickerPlacements.forEach((placement) => appendStickerMessages(placement.stickers));
      }
      for (const imageDescription of replyImages) {
        await appendImageMessage(imageDescription, charMessagesAfterNarration);
      }
      appendStickerMessages(replyStickers);
      const charMessages: ChatMessage[] = orderedSegments.length ? orderedCharMessages : [...charNarrationMessages, ...charMessagesAfterNarration];
      if (offlineInvitation) {
        charMessages.push({
          id: createId('msg'),
          conversationId,
          sender: 'char' as const,
          mode: 'online' as const,
          content: formatOfflineInvitationContent(offlineInvitation),
          offlineInvitation,
          replyBatchId,
          ...replyVariantFields,
          createdAt: createdAt + charMessageOffset++,
          status: 'sent' as const
        } satisfies ChatMessage);
      }
      if (plotChoices.length) {
        const plotChoiceMessage = charMessages.find((message) => message.sender === 'char' && !message.sticker && !message.image && !message.voice && !message.location && !message.transfer);
        if (plotChoiceMessage) plotChoiceMessage.plotChoices = plotChoices;
      }
      if (charMessages.length) {
        messages.value.push(...charMessages);
        await Promise.all(charMessages.map((message) => putEntity('messages', message)));
        const incomingCharMessages = charMessages.filter((message) => message.sender === 'char');
        if (incomingCharMessages.length) notifyCharacterMessages(conversation, incomingCharMessages);
        const latestCharMessage = charMessages[charMessages.length - 1];
        const latestConversation = conversationById(conversationId) ?? conversation;
        const nextConversation = {
          ...latestConversation,
          updatedAt: latestCharMessage.createdAt,
          unreadCount: unreadCountAfterIncomingMessage(latestConversation, charMessages.length),
          activeMode: conversation.activeMode
        };
        const index = conversations.value.findIndex((item) => item.id === conversationId);
        conversations.value[index] = nextConversation;
        await putEntity('conversations', nextConversation);
      } else {
        await touchConversationAfterMessageChange(conversationId);
      }

      void maybeAutoSummarizeConversation(conversationId);

      const shouldGenerateMoment = options?.generateMoment || (chatSettings.autoGenerateVoom && shouldAutoGenerateMoment(chatSettings.voomFrequency));
      if (shouldGenerateMoment) {
        finishConversationReply(conversationId);
        if (options?.generateMoment || Math.random() < 0.5) {
          void createMomentFromConversation(conversationId).catch((error) => {
            console.error(error);
          });
        } else {
          void autoReplyToVoomComments(conversationId).then((replied) => {
            if (replied) return;
            return createMomentFromConversation(conversationId);
          }).catch((error) => {
            console.error(error);
          });
        }
      }
    } catch (error) {
      if (options?.proactive) {
        console.error(error);
      } else {
        showConfigAlert(error instanceof Error ? error.message : 'AI 回复失败，请检查 API 模型配置。', '回复异常');
      }
    } finally {
      finishConversationReply(conversationId);
    }
  }

  async function sendMessage(conversationId: string, content: string, options?: { generateMoment?: boolean; quote?: ChatMessageQuote | null }) {
    const userMessage = await appendUserMessage(conversationId, content, options?.quote);
    if (!userMessage) return;
    await requestRoleplayReply(conversationId, options);
  }

  async function sendStickerMessage(conversationId: string, sticker: Sticker, quote?: ChatMessageQuote | null) {
    return appendStickerMessage(conversationId, sticker, quote);
  }

  async function updateOfflineInvitationStatus(messageId: string, status: ChatOfflineInvitationStatus, options: { started?: boolean } = {}) {
    const message = messages.value.find((item) => item.id === messageId);
    if (!message?.offlineInvitation) return null;
    if (message.offlineInvitation.status !== 'pending' && !options.started) return null;
    const now = Date.now();
    const nextInvitation: ChatOfflineInvitationAttachment = {
      ...message.offlineInvitation,
      status,
      respondedAt: message.offlineInvitation.respondedAt ?? now,
      startedAt: options.started ? message.offlineInvitation.startedAt ?? now : message.offlineInvitation.startedAt
    };
    const nextMessage: ChatMessage = {
      ...message,
      content: formatOfflineInvitationContent(nextInvitation),
      offlineInvitation: nextInvitation,
      editedAt: now
    };
    const messageIndex = messages.value.findIndex((item) => item.id === messageId);
    if (messageIndex >= 0) messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    return nextMessage;
  }

  async function rejectOfflineInvitation(messageId: string) {
    return updateOfflineInvitationStatus(messageId, 'rejected');
  }

  async function acceptOfflineInvitation(messageId: string) {
    const message = messages.value.find((item) => item.id === messageId);
    if (!message?.offlineInvitation || message.offlineInvitation.status !== 'pending') return false;
    const conversation = conversationById(message.conversationId);
    if (!conversation) return false;
    await updateConversationMode(message.conversationId, 'offline');
    await updateOfflineInvitationStatus(messageId, 'accepted', { started: true });
    const latestConversation = conversationById(message.conversationId) ?? conversation;
    const acceptedAt = Date.now();
    const nextConversation = { ...latestConversation, activeMode: 'offline' as const, updatedAt: acceptedAt, unreadCount: 0 };
    const conversationIndex = conversations.value.findIndex((item) => item.id === message.conversationId);
    if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    await putEntity('conversations', nextConversation);
    const openingPrompt = message.offlineInvitation.prompt.trim() || '用户接受了线下邀约。请从当前关系和氛围自然开启线下模块的新章节。';
    void requestRoleplayReply(message.conversationId, {
      replyInstruction: `用户刚刚点击接受了你发出的线下邀约，现在已经进入线下模块。请立刻生成线下模式的新章节正文，承接这份邀约：${openingPrompt}。可以描写两人见面和面对面互动，但不要让角色知道用户未提供的现实位置、行程、心理或决定；不要输出线上聊天气泡。`
    });
    return true;
  }

  async function regenerateLatestReply(conversationId: string) {
    const conversation = conversationById(conversationId);
    if (!conversation || isConversationReplying(conversationId)) return false;

    const conversationMessages = messagesForConversation(conversationId).filter((message) => message.mode === conversation.activeMode && message.replyVariantState !== 'inactive');
    let latestCharIndex = -1;
    for (let messageIndex = conversationMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      if (conversationMessages[messageIndex].sender === 'char') {
        latestCharIndex = messageIndex;
        break;
      }
    }

    if (latestCharIndex < 0) {
      showConfigAlert('暂无可重新生成的 AI 回复。', '无法重新回复');
      return false;
    }

    let firstCharIndex = latestCharIndex;
    while (firstCharIndex > 0 && conversationMessages[firstCharIndex - 1].sender === 'char') {
      firstCharIndex -= 1;
    }

    const latestCharMessage = conversationMessages[latestCharIndex];
    const messagesToRemove = latestCharMessage.replyBatchId
      ? conversationMessages.filter((message) => message.replyBatchId === latestCharMessage.replyBatchId)
      : conversationMessages.slice(firstCharIndex, latestCharIndex + 1);

    if (!latestCharMessage.replyBatchId) {
      for (let messageIndex = firstCharIndex - 1; messageIndex >= 0; messageIndex -= 1) {
        const previousMessage = conversationMessages[messageIndex];
        if (!isRoleplayNarrationMessage(previousMessage)) break;
        messagesToRemove.unshift(previousMessage);
      }
    }

    if (conversation.activeMode === 'offline') {
      const replyBatchId = latestCharMessage.replyBatchId || createId('reply');
      const replyVariantGroupId = latestCharMessage.replyVariantGroupId || createId('variant');
      const existingVariantIndexes = messagesForConversation(conversationId)
        .filter((message) => message.mode === conversation.activeMode && message.replyVariantGroupId === replyVariantGroupId)
        .map((message) => Math.max(0, Math.floor(Number(message.replyVariantIndex) || 0)));
      const nextVariantIndex = Math.max(0, ...existingVariantIndexes) + 1;
      await saveMessages(messagesToRemove.map((message) => ({
        ...message,
        replyBatchId: message.replyBatchId || replyBatchId,
        replyVariantGroupId,
        replyVariantIndex: message.replyVariantIndex ?? 0,
        replyVariantState: 'inactive' as const
      })));
      await requestRoleplayReply(conversationId, { replyVariantGroupId, replyVariantIndex: nextVariantIndex });
      return true;
    }

    await rollbackCharacterMoodForOnlineRegeneration(conversation, messagesToRemove);
    await deleteMessages(messagesToRemove.map((message) => message.id));

    await requestRoleplayReply(conversationId);
    return true;
  }

  async function applyReplyVariant(conversationId: string, replyVariantGroupId: string, replyBatchId: string) {
    const normalizedGroupId = replyVariantGroupId.trim();
    const normalizedBatchId = replyBatchId.trim();
    if (!normalizedGroupId || !normalizedBatchId) return false;
    const groupMessages = messagesForConversation(conversationId).filter((message) => message.replyVariantGroupId === normalizedGroupId);
    if (!groupMessages.some((message) => message.replyBatchId === normalizedBatchId)) return false;
    await saveMessages(groupMessages.map((message) => ({
      ...message,
      replyVariantState: message.replyBatchId === normalizedBatchId ? 'active' as const : 'inactive' as const
    })));
    return true;
  }

  async function maybeRequestProactiveReply(conversationId: string) {
    const conversation = conversationById(conversationId);
    if (!conversation || isConversationReplying(conversationId)) return false;
    const chatSettings = settingsForConversation(conversationId);
    if (!chatSettings.proactiveReply.enabled) return false;

    const conversationMessages = messagesForConversation(conversationId).filter((message) => message.mode === conversation.activeMode);
    const latestMessage = conversationMessages[conversationMessages.length - 1];
    if (latestMessage?.sender === 'user') return false;

    const now = Date.now();
    const cooldown = proactiveReplyCooldownMs(chatSettings.proactiveReply.frequency);
    if (chatSettings.proactiveReply.lastTriggeredAt && now - chatSettings.proactiveReply.lastTriggeredAt < cooldown) return false;

    await touchProactiveReplyAttempt(chatSettings, now);
    if (Math.random() >= getVoomFrequencyChance(chatSettings.proactiveReply.frequency)) return false;

    await requestRoleplayReply(conversationId, { proactive: true });
    return true;
  }

  function charactersForUserVoom(userId: string, visibility: VoomPostVisibility, characterIds: string[]) {
    const boundCharacters = characters.value.filter((character) => character.boundUserId === userId);
    if (visibility === 'public') return boundCharacters;
    const selectedIds = new Set(characterIds.map((id) => id.trim()).filter(Boolean));
    return boundCharacters.filter((character) => selectedIds.has(character.id));
  }

  function conversationsForCharacters(targetCharacters: CharacterProfile[]) {
    const seen = new Set<string>();
    return targetCharacters
      .map((character) => conversations.value.find((conversation) => conversation.charId === character.id))
      .filter((conversation): conversation is Conversation => {
        if (!conversation || seen.has(conversation.id)) return false;
        seen.add(conversation.id);
        return true;
      });
  }

  function resolveUserVoomCommentModelOverride(targetConversations: Conversation[]) {
    for (const targetConversation of targetConversations) {
      const chatSettings = settingsForConversation(targetConversation.id);
      const modelOverride = getConversationTextModelOverride(chatSettings, 'voom');
      if (modelOverride && hasConfiguredTextModel(modelOverride)) return modelOverride;
    }
    for (const targetConversation of targetConversations) {
      const chatSettings = settingsForConversation(targetConversation.id);
      const modelOverride = getConversationTextModelOverride(chatSettings, targetConversation.activeMode);
      if (modelOverride && hasConfiguredTextModel(modelOverride)) return modelOverride;
    }
    return hasConfiguredTextModel('') ? '' : null;
  }

  function resolveUserVoomCommentTimeAwareness(targetConversations: Conversation[]) {
    return {
      enabled: targetConversations.some((targetConversation) => settingsForConversation(targetConversation.id).timeAwareness.enabled)
    };
  }

  async function createInitialUserVoomComments(post: VoomPost, author: UserProfile, targetCharacters: CharacterProfile[], targetConversations: Conversation[]) {
    const modelOverride = resolveUserVoomCommentModelOverride(targetConversations);
    if (modelOverride === null) return [];

    let generatedComments: Awaited<ReturnType<typeof generateUserVoomComments>> = [];
    try {
      generatedComments = await generateUserVoomComments({
        author,
        content: post.content,
        imageDescription: post.imageDescription,
        createdAt: post.createdAt,
        targetCharacters,
        timeAwareness: resolveUserVoomCommentTimeAwareness(targetConversations),
        settings: settings.value ?? undefined,
        modelOverride
      });
    } catch (error) {
      console.warn('User VOOM comments generation failed.', error);
      return [];
    }

    return generatedComments.map((comment, index) => ({
      id: createId('comment'),
      authorName: comment.authorName,
      authorId: comment.authorId,
      content: comment.content,
      contentTranslation: comment.contentTranslation,
      parentId: comment.parentId,
      createdAt: post.createdAt + index + 1
    } satisfies VoomComment));
  }

  async function createUserVoomPost(payload: CreateUserVoomPostPayload) {
    const author = userById(payload.userId);
    const content = payload.content.trim();
    if (!author) {
      showConfigAlert('请选择一个要发布 VOOM 的用户账号。', '无法发布 VOOM');
      return null;
    }
    if (!content) {
      showConfigAlert('发布 VOOM 前请先填写正文。', '无法发布 VOOM');
      return null;
    }

    const visibility: VoomPostVisibility = payload.visibility === 'selected' ? 'selected' : 'public';
    const targetCharacters = charactersForUserVoom(author.id, visibility, payload.characterIds);
    if (!targetCharacters.length) {
      showConfigAlert('请选择至少一个可见角色，或先给该账号绑定角色。', '无法发布 VOOM');
      return null;
    }

    const targetConversations = conversationsForCharacters(targetCharacters);
    if (!targetConversations.length) {
      showConfigAlert('所选角色还没有可写入的对话。', '无法发布 VOOM');
      return null;
    }

    const image = await compactInlineDisplayImage(payload.image?.trim() || '');
    const imageDescription = payload.imageDescription?.trim() || '';
    const createdAt = Date.now();
    const post: VoomPost = {
      id: createId('voom'),
      charId: '',
      conversationId: targetConversations[0]?.id,
      conversationIds: targetConversations.map((conversation) => conversation.id),
      authorType: 'user',
      userId: author.id,
      visibility,
      visibleCharacterIds: targetCharacters.map((character) => character.id),
      authorName: author.nickname || author.name || '我',
      authorAvatar: author.avatar,
      content,
      image: image || undefined,
      imageDescription: imageDescription || undefined,
      imageProvider: image ? 'local' : imageDescription ? 'mock' : undefined,
      imageCandidates: image ? [createVoomImageCandidate({ image, description: imageDescription || content, provider: 'local' })] : undefined,
      createdAt,
      comments: [],
      likes: []
    };

    post.comments = await createInitialUserVoomComments(post, author, targetCharacters, targetConversations);
    voomPosts.value.unshift(post);
    await putEntity('voomPosts', post);
    await recordVoomPostEvents(post);
    notifyVoomComments(post, post.comments, targetConversations[0]);
    return post;
  }

  async function createMomentFromConversation(conversationId: string) {
    const conversation = conversationById(conversationId);
    if (generatingMomentConversationIds.has(conversationId)) return;
    if (!conversation) return;
    const character = characterById(conversation.charId);
    if (!character) return;
    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return;
    const chatSettings = settingsForConversation(conversationId);
    const modelOverride = getConversationTextModelOverride(chatSettings, 'voom');
    if (!hasConfiguredTextModel(modelOverride)) {
      showConfigAlert('请先在聊天菜单里配置 VOOM 模型，或在设置里配置全局默认 API 模型。', '需要配置 API 模型');
      return;
    }
    generatingMomentConversationIds.add(conversationId);
    try {
      const recentVoomPosts = voomPosts.value
        .filter((post) => post.authorType !== 'user' && (post.charId === character.id || post.conversationId === conversationId || post.conversationIds?.includes(conversationId)))
        .sort((first, second) => second.createdAt - first.createdAt)
        .slice(0, 16);
      const moment = await generateVoomPost(
        {
          user: boundUser,
          character,
          boundUser,
          mode: conversation.activeMode,
          messages: visibleMessagesForConversation(conversationId),
          recentVoomPosts,
          worldBooks: worldBooks.value,
          conversationSummary: conversation.summary,
          memorySummary: memoryContextForConversation(conversationId),
          stickerVisionEnabled: chatSettings.stickerVisionEnabled,
          timeAwareness: chatSettings.timeAwareness
        },
        settings.value ?? undefined,
        modelOverride
      );
      const post: VoomPost = { ...moment, id: createId('voom'), conversationId: conversation.id, authorName: getCharacterVoomAuthorName(character), authorAvatar: character.avatar, createdAt: Date.now() };
      post.comments = post.comments.map((comment, index) => ({
        ...comment,
        createdAt: post.createdAt + post.likes.length + index + 1
      }));
      const resolvedPost = await generateVoomPostImageBeforePublish(post);
      voomPosts.value.unshift(resolvedPost);
      await putEntity('voomPosts', createPersistableVoomPost(resolvedPost));
      const latestConversation = conversationById(conversationId) ?? conversation;
      await recordVoomPostEvents(resolvedPost, latestConversation.activeMode);
      notifyVoomPost(resolvedPost, latestConversation);
      return resolvedPost;
    } finally {
      generatingMomentConversationIds.delete(conversationId);
    }
  }

  function getVoomImageSizeLabel(provider: ImageModuleId) {
    if (!settings.value) return '720x1280';
    return getImageGenerationSize(settings.value, provider).size;
  }

  async function generateChatImageCandidate(description: string) {
    const imageDescription = description.trim();
    const selectedModel = getSelectedImageModelOption(settings.value, 'onlineChat');
    if (!imageDescription || !settings.value?.imageGenerationEnabled || !settings.value || !selectedModel) return null;

    const provider = selectedModel.provider;
    const promptPreset = getImagePromptPresetForProvider(settings.value, provider);
    const positivePrompt = [promptPreset.positivePrompt, imageDescription].filter(Boolean).join(', ');
    const imageSize = getImageGenerationSize(settings.value, provider);
    let imageSettings = settings.value;
    const imageOverrides = {
      positivePrompt,
      negativePrompt: promptPreset.negativePrompt,
      size: imageSize.size,
      width: imageSize.width,
      height: imageSize.height,
      model: selectedModel.model
    };

    if (provider === 'openai') {
      const [vendorId, ...modelParts] = selectedModel.model.split('::');
      imageSettings = {
        ...settings.value,
        imageOpenAi: {
          ...settings.value.imageOpenAi,
          activeVendorId: vendorId || settings.value.imageOpenAi.activeVendorId
        }
      };
      imageOverrides.model = modelParts.join('::') || settings.value.imageModel;
    }

    const result = await generateImageByProvider(provider, imageSettings, imageOverrides);
    const imageUrl = await compactInlineDisplayImage(result.imageUrl);
    return createChatImageCandidate({
      image: imageUrl,
      description: imageDescription,
      provider: result.provider,
      model: selectedModel.label,
      size: getVoomImageSizeLabel(result.provider)
    });
  }

  function imageAttachmentFromCandidate(candidate: ChatImageCandidate): ChatImageAttachment {
    return {
      kind: 'generated',
      description: candidate.description,
      url: candidate.image,
      provider: candidate.provider,
      model: candidate.model,
      size: candidate.size,
      candidates: [candidate],
      ...imageSizeToDimensions(candidate.size)
    };
  }

  function createChatImageDescriptionAttachment(description: string): ChatImageAttachment {
    return {
      kind: 'description',
      description,
      provider: 'mock'
    };
  }

  async function createCharacterImageAttachment(description: string) {
    const imageDescription = description.trim();
    if (!imageDescription) return null;
    try {
      const candidate = await generateChatImageCandidate(imageDescription);
      return candidate ? imageAttachmentFromCandidate(candidate) : createChatImageDescriptionAttachment(imageDescription);
    } catch (error) {
      showConfigAlert(error instanceof Error ? error.message : '聊天图片生成失败，已改为文字描述卡片。', '无法生成聊天图片');
      return createChatImageDescriptionAttachment(imageDescription);
    }
  }

  async function updateChatMessageImage(messageId: string, image: ChatImageAttachment) {
    const messageIndex = messages.value.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return null;
    const existingMessage = messages.value[messageIndex];
    const nextMessage: ChatMessage = {
      ...existingMessage,
      content: `[图片] ${image.description}`,
      image
    };
    messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    return nextMessage;
  }

  async function regenerateChatMessageImage(messageId: string, description: string) {
    const normalizedMessageId = messageId.trim();
    const imageDescription = description.trim();
    if (regeneratingChatImageMessageIds.has(normalizedMessageId)) {
      showConfigAlert('正在重新生成聊天图片，请等待当前生成完成。', '正在生成');
      return null;
    }
    const existingMessage = messages.value.find((message) => message.id === normalizedMessageId);
    if (!existingMessage?.image || !imageDescription) return null;
    if (!getSelectedImageModelOption(settings.value, 'onlineChat')) {
      showConfigAlert('请先在顶部切换按钮里选择一个已配置的生图模型。', '无法生成图片');
      return null;
    }
    regeneratingChatImageMessageIds.add(normalizedMessageId);
    try {
      const candidate = await generateChatImageCandidate(imageDescription);
      if (!candidate) return null;
      const candidates = [...(existingMessage.image.candidates ?? []), candidate];
      return updateChatMessageImage(normalizedMessageId, {
        ...imageAttachmentFromCandidate(candidate),
        candidates
      });
    } catch (error) {
      showConfigAlert(error instanceof Error ? error.message : '聊天图片生成失败。', '无法生成图片');
      return null;
    } finally {
      regeneratingChatImageMessageIds.delete(normalizedMessageId);
    }
  }

  async function applyChatMessageImageCandidate(messageId: string, candidateId: string) {
    const normalizedMessageId = messageId.trim();
    if (regeneratingChatImageMessageIds.has(normalizedMessageId)) {
      showConfigAlert('正在重新生成聊天图片，请等待当前生成完成。', '正在生成');
      return null;
    }
    const existingMessage = messages.value.find((message) => message.id === normalizedMessageId);
    const candidate = existingMessage?.image?.candidates?.find((entry) => entry.id === candidateId);
    if (!existingMessage?.image || !candidate) return null;
    return updateChatMessageImage(normalizedMessageId, {
      ...imageAttachmentFromCandidate(candidate),
      candidates: existingMessage.image.candidates
    });
  }

  async function regenerateVoomPostImage(postId: string, description: string) {
    const normalizedPostId = postId.trim();
    if (regeneratingVoomImagePostIds.has(normalizedPostId)) {
      showConfigAlert('正在重新生成 VOOM 配图，请等待当前生成完成。', '正在生成');
      return null;
    }
    const post = voomPosts.value.find((entry) => entry.id === normalizedPostId);
    const selectedModel = getSelectedImageModelOption(settings.value, 'voom');
    const imageDescription = description.trim();
    if (!post || !settings.value) return null;
    if (!settings.value.imageGenerationEnabled) {
      showConfigAlert('生图开关已关闭，VOOM 配图将以文字卡片形式显示。', '生图已关闭');
      return null;
    }
    if (!imageDescription) {
      showConfigAlert('请先填写 VOOM 配图描述。', '无法生成配图');
      return null;
    }
    if (!selectedModel) {
      showConfigAlert('请先在顶部切换按钮里选择一个已配置的生图模型。', '无法生成配图');
      return null;
    }

    regeneratingVoomImagePostIds.add(normalizedPostId);
    const provider = selectedModel.provider;
    const promptPreset = getImagePromptPresetForProvider(settings.value, provider);
    const positivePrompt = [promptPreset.positivePrompt, imageDescription].filter(Boolean).join(', ');
    const imageSize = getImageGenerationSize(settings.value, provider);
    let imageSettings = settings.value;
    const imageOverrides = {
      positivePrompt,
      negativePrompt: promptPreset.negativePrompt,
      size: imageSize.size,
      width: imageSize.width,
      height: imageSize.height,
      model: selectedModel.model
    };

    if (provider === 'openai') {
      const [vendorId, ...modelParts] = selectedModel.model.split('::');
      imageSettings = {
        ...settings.value,
        imageOpenAi: {
          ...settings.value.imageOpenAi,
          activeVendorId: vendorId || settings.value.imageOpenAi.activeVendorId
        }
      };
      imageOverrides.model = modelParts.join('::') || settings.value.imageModel;
    }

    try {
      const result = await generateImageByProvider(provider, imageSettings, imageOverrides);
      const imageUrl = await compactInlineDisplayImage(result.imageUrl);
      const latestPost = voomPosts.value.find((entry) => entry.id === normalizedPostId);
      if (!latestPost) return null;
      const nextCandidate = createVoomImageCandidate({
        image: imageUrl,
        description: imageDescription,
        provider: result.provider,
        model: selectedModel.label,
        size: getVoomImageSizeLabel(result.provider)
      });
      const nextPost = {
        ...latestPost,
        image: imageUrl,
        imageDescription,
        imageProvider: result.provider,
        imageCandidates: [...(latestPost.imageCandidates ?? []), nextCandidate]
      };
      await saveVoomPost(nextPost);
      await addGeneratedImage({
        provider: result.provider,
        imageUrl,
        title: `${voomAuthorNameForPost(latestPost)} 的 VOOM 配图`,
        prompt: positivePrompt,
        negativePrompt: promptPreset.negativePrompt,
        model: selectedModel.label,
        size: nextCandidate.size || getVoomImageSizeLabel(result.provider),
        source: 'voom'
      });
      return nextPost;
    } catch (error) {
      const latestPost = voomPosts.value.find((entry) => entry.id === normalizedPostId);
      if (!latestPost) return null;
      if (!latestPost.image) {
        await saveVoomPost({
          ...latestPost,
          image: '/load.jpg',
          imageDescription,
          imageProvider: 'local'
        });
      }
      showConfigAlert(error instanceof Error ? error.message : 'VOOM 配图生成失败。', '无法生成配图');
      return null;
    } finally {
      regeneratingVoomImagePostIds.delete(normalizedPostId);
    }
  }

  async function generateVoomPostImageBeforePublish(post: VoomPost) {
    const selectedModel = getSelectedImageModelOption(settings.value, 'voom');
    const imageDescription = post.imageDescription?.trim() ?? '';
    if (!settings.value?.imageGenerationEnabled || !settings.value || !selectedModel || !imageDescription) return post;

    regeneratingVoomImagePostIds.add(post.id);
    const provider = selectedModel.provider;
    const promptPreset = getImagePromptPresetForProvider(settings.value, provider);
    const positivePrompt = [promptPreset.positivePrompt, imageDescription].filter(Boolean).join(', ');
    const imageSize = getImageGenerationSize(settings.value, provider);
    let imageSettings = settings.value;
    const imageOverrides = {
      positivePrompt,
      negativePrompt: promptPreset.negativePrompt,
      size: imageSize.size,
      width: imageSize.width,
      height: imageSize.height,
      model: selectedModel.model
    };

    if (provider === 'openai') {
      const [vendorId, ...modelParts] = selectedModel.model.split('::');
      imageSettings = {
        ...settings.value,
        imageOpenAi: {
          ...settings.value.imageOpenAi,
          activeVendorId: vendorId || settings.value.imageOpenAi.activeVendorId
        }
      };
      imageOverrides.model = modelParts.join('::') || settings.value.imageModel;
    }

    try {
      const result = await generateImageByProvider(provider, imageSettings, imageOverrides);
      const imageUrl = await compactInlineDisplayImage(result.imageUrl);
      const nextCandidate = createVoomImageCandidate({
        image: imageUrl,
        description: imageDescription,
        provider: result.provider,
        model: selectedModel.label,
        size: getVoomImageSizeLabel(result.provider)
      });
      const nextPost: VoomPost = {
        ...post,
        image: imageUrl,
        imageDescription,
        imageProvider: result.provider,
        imageCandidates: [...(post.imageCandidates ?? []), nextCandidate]
      };
      await addGeneratedImage({
        provider: result.provider,
        imageUrl,
        title: `${voomAuthorNameForPost(post)} 的 VOOM 配图`,
        prompt: positivePrompt,
        negativePrompt: promptPreset.negativePrompt,
        model: selectedModel.label,
        size: nextCandidate.size || getVoomImageSizeLabel(result.provider),
        source: 'voom'
      });
      return nextPost;
    } catch (error) {
      showConfigAlert(error instanceof Error ? error.message : 'VOOM 配图生成失败。', '无法生成配图');
      if (post.image) return post;
      return {
        ...post,
        image: '/load.jpg',
        imageDescription,
        imageProvider: 'local'
      } satisfies VoomPost;
    } finally {
      regeneratingVoomImagePostIds.delete(post.id);
    }
  }

  async function applyVoomPostImageCandidate(postId: string, candidateId: string) {
    const normalizedPostId = postId.trim();
    if (regeneratingVoomImagePostIds.has(normalizedPostId)) {
      showConfigAlert('正在重新生成 VOOM 配图，请等待当前生成完成。', '正在生成');
      return null;
    }
    const post = voomPosts.value.find((entry) => entry.id === normalizedPostId);
    const candidate = post?.imageCandidates?.find((entry) => entry.id === candidateId);
    if (!post || !candidate?.image) return null;
    const nextPost: VoomPost = {
      ...post,
      image: candidate.image,
      imageDescription: candidate.description || post.imageDescription,
      imageProvider: candidate.provider || post.imageProvider,
      imageCandidates: post.imageCandidates
    };
    await saveVoomPost(nextPost);
    return nextPost;
  }

  function hasVoomPost(postId: string) {
    return voomPosts.value.some((entry) => entry.id === postId);
  }

  async function saveVoomPost(nextPost: VoomPost) {
    const persistablePost = createPersistableVoomPost(nextPost);
    const index = voomPosts.value.findIndex((post) => post.id === nextPost.id);
    if (index >= 0) voomPosts.value[index] = persistablePost;
    else voomPosts.value.unshift(persistablePost);
    await putEntity('voomPosts', persistablePost);
  }

  async function deleteVoomPost(postId: string) {
    const normalizedPostId = postId.trim();
    const post = voomPosts.value.find((entry) => entry.id === normalizedPostId);
    if (!post) return false;

    const relatedMessageIds = messages.value
      .filter((message) => message.voomPostId === normalizedPostId)
      .map((message) => message.id);

    voomPosts.value = voomPosts.value.filter((entry) => entry.id !== normalizedPostId);
    replyingVoomCommentPostIds.value = replyingVoomCommentPostIds.value.filter((id) => id !== normalizedPostId);

    await Promise.all([
      deleteEntity('voomPosts', normalizedPostId),
      relatedMessageIds.length ? deleteMessages(relatedMessageIds) : Promise.resolve(0)
    ]);
    return true;
  }

  async function addVoomComment(postId: string, content: string, parentId = '') {
    const post = voomPosts.value.find((entry) => entry.id === postId);
    const parentName = parentId ? post?.comments.find((entry) => entry.id === parentId)?.authorName ?? '' : '';
    const trimmedContent = stripVoomCommentReplyPrefix(content, parentName);
    if (!post || !trimmedContent) return;

    const currentUser = user.value;
    const comment: VoomComment = {
      id: createId('comment'),
      authorName: currentUser?.nickname || currentUser?.name || '我',
      authorId: currentUser?.id,
      content: trimmedContent,
      parentId: parentId || undefined,
      createdAt: Date.now()
    };

    const targetConversations = conversationsForVoomPost(post);
    const nextPost = {
      ...post,
      conversationId: post.conversationId || targetConversations[0]?.id,
      conversationIds: targetConversations.length ? targetConversations.map((conversation) => conversation.id) : post.conversationIds,
      comments: [...post.comments, comment]
    };
    await saveVoomPost(nextPost);
    for (const conversation of targetConversations) {
      await appendConversationEvent(
        conversation.id,
        formatVoomCommentEvent(comment, nextPost.comments),
        { mode: conversation.activeMode, voomPostId: post.id, voomCommentId: comment.id, voomEventType: 'comment', createdAt: comment.createdAt }
      );
    }
  }

  async function toggleVoomLike(postId: string) {
    const post = voomPosts.value.find((entry) => entry.id === postId);
    const currentUserName = user.value?.nickname || user.value?.name || '我';
    if (!post) return;

    const likes = post.likes.includes(currentUserName)
      ? post.likes.filter((name) => name !== currentUserName)
      : [...post.likes, currentUserName];

    const targetConversations = conversationsForVoomPost(post);
    const authorName = voomAuthorNameForPost(post);
    const wasLiked = post.likes.includes(currentUserName);
    await saveVoomPost({
      ...post,
      conversationId: post.conversationId || targetConversations[0]?.id,
      conversationIds: targetConversations.length ? targetConversations.map((conversation) => conversation.id) : post.conversationIds,
      likes
    });
    for (const conversation of targetConversations) {
      await appendConversationEvent(
        conversation.id,
        wasLiked
          ? `【VOOM】${currentUserName} 取消赞了 ${authorName} 的动态。`
          : formatVoomLikeEvent([currentUserName], authorName),
        { mode: conversation.activeMode, voomPostId: post.id, voomEventType: wasLiked ? 'unlike' : 'like' }
      );
    }
  }

  function voomPostCanBeRepliedByConversation(post: VoomPost, conversation: Conversation, character: CharacterProfile) {
    if (isReplyingVoomComments(post.id)) return false;
    if (post.conversationId === conversation.id || post.conversationIds?.includes(conversation.id)) return true;
    if (post.authorType === 'user') return post.visibleCharacterIds?.includes(character.id) ?? false;
    const postAuthor = post.charId ? characterById(post.charId) : null;
    if (postAuthor?.boundUserId === character.boundUserId) return true;
    return post.charId === character.id;
  }

  function voomPostCanBeAutoRepliedByConversation(post: VoomPost, conversation: Conversation, character: CharacterProfile) {
    if (isReplyingVoomComments(post.id)) return false;
    if (post.authorType === 'user') return post.visibleCharacterIds?.includes(character.id) ?? false;
    return post.charId === character.id || post.conversationId === conversation.id || post.conversationIds?.includes(conversation.id) === true;
  }

  function pickAutoVoomCommentPost(conversationId: string) {
    const conversation = conversationById(conversationId);
    const character = conversation ? characterById(conversation.charId) : null;
    if (!conversation || !character) return null;

    const candidates = sortedVoomPosts.value
      .filter((post) => voomPostCanBeAutoRepliedByConversation(post, conversation, character))
      .filter((post) => post.comments.length < 80)
      .slice(0, 12);
    if (!candidates.length) return null;

    const userCommentPosts = candidates.filter((post) => post.comments.some((comment) => comment.authorId === character.boundUserId));
    const pool = userCommentPosts.length ? userCommentPosts : candidates;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }

  async function autoReplyToVoomComments(conversationId: string) {
    const post = pickAutoVoomCommentPost(conversationId);
    if (!post) return false;
    return replyToVoomComments(post.id, { actorConversationId: conversationId, silent: true });
  }

  async function replyToVoomComments(postId: string, options: { actorConversationId?: string; silent?: boolean } = {}) {
    if (isReplyingVoomComments(postId)) return;

    const post = voomPosts.value.find((entry) => entry.id === postId);
    if (!post) return;

    const targetConversations = conversationsForVoomPost(post);
    const actorConversation = options.actorConversationId
      ? targetConversations.find((entry) => entry.id === options.actorConversationId) ?? conversationById(options.actorConversationId)
      : null;
    const conversation = actorConversation && actorConversation.charId ? actorConversation : targetConversations[0];
    if (!conversation) return;

    const character = characterById(conversation.charId);
    if (!character) return;

    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return;
    const chatSettings = settingsForConversation(conversation.id);
    const modelOverride = getConversationTextModelOverride(chatSettings, 'voom', conversation.activeMode);
    if (!hasConfiguredTextModel(modelOverride)) {
      if (!options.silent) showConfigAlert('请先配置 VOOM 或当前聊天模式的 API 模型，再让角色回复评论区。', '需要配置 API 模型');
      return false;
    }

    replyingVoomCommentPostIds.value = [...replyingVoomCommentPostIds.value, postId];
    try {
      const userComments = post.comments
        .filter((comment) => comment.authorId === boundUser.id || comment.authorName === boundUser.nickname || comment.authorName === boundUser.name)
        .slice(-4);
      const replies = await generateVoomCommentReplies({
        context: {
          user: boundUser,
          character,
          boundUser,
          mode: conversation.activeMode,
          messages: visibleMessagesForConversation(conversation.id),
          worldBooks: worldBooks.value,
          conversationSummary: conversation.summary,
          memorySummary: memoryContextForConversation(conversation.id),
          stickerVisionEnabled: chatSettings.stickerVisionEnabled,
          timeAwareness: chatSettings.timeAwareness
        },
        post,
        userComments,
        settings: settings.value ?? undefined,
        modelOverride
      });

      const createdAt = Date.now();
  const latestPost = voomPosts.value.find((entry) => entry.id === postId);
  if (!latestPost) return false;
  const existingCommentIds = new Set(latestPost.comments.map((comment) => comment.id));
      const generatedIds = replies.map(() => createId('comment'));
      const generatedIdByDraftId = new Map(replies.flatMap((reply, index) => reply.draftId ? [[reply.draftId, generatedIds[index]]] : []));
      const characterVoomAuthorName = getCharacterVoomAuthorName(character);
      const characterAuthorAliases = new Set([character.nickname, character.name, post.authorName, characterVoomAuthorName]
        .map((name) => name.trim().toLocaleLowerCase())
        .filter(Boolean));
      const replyAuthorNameForIndex = (index: number) => {
        const authorName = replies[index]?.authorName.trim() ?? '';
        return characterAuthorAliases.has(authorName.toLocaleLowerCase()) ? characterVoomAuthorName : authorName;
      };
      const replyParentName = (parentId: string) => {
        const existingComment = latestPost.comments.find((comment) => comment.id === parentId);
        if (existingComment) return existingComment.authorName;
        const generatedIndex = generatedIds.indexOf(parentId);
        return generatedIndex >= 0 ? replyAuthorNameForIndex(generatedIndex) : '';
      };
      const nextComments: VoomComment[] = replies.map((reply, index) => {
        const resolvedParentId = reply.parentId && existingCommentIds.has(reply.parentId)
          ? reply.parentId
          : reply.parentId
            ? generatedIdByDraftId.get(reply.parentId)
            : '';
        const parentName = resolvedParentId ? replyParentName(resolvedParentId) : '';
        return {
          id: generatedIds[index],
          authorName: replyAuthorNameForIndex(index),
          content: stripVoomCommentReplyPrefix(reply.content, parentName),
          contentTranslation: reply.contentTranslation ? stripVoomCommentReplyPrefix(reply.contentTranslation, parentName) : undefined,
          parentId: resolvedParentId && resolvedParentId !== generatedIds[index] ? resolvedParentId : undefined,
          createdAt: createdAt + index
        };
      });
      if (!nextComments.length) return false;

      const nextPost = {
        ...latestPost,
        conversationId: latestPost.conversationId || conversation.id,
        conversationIds: targetConversations.map((targetConversation) => targetConversation.id),
        comments: [...latestPost.comments, ...nextComments]
      };
      await saveVoomPost(nextPost);
      await Promise.all(targetConversations.flatMap((targetConversation) => nextComments.map((comment) => appendConversationEvent(
        targetConversation.id,
        formatVoomCommentEvent(comment, nextPost.comments),
        { mode: targetConversation.activeMode, voomPostId: post.id, voomCommentId: comment.id, voomEventType: 'reply', createdAt: comment.createdAt }
      ))));
      notifyVoomComments(nextPost, nextComments, conversation);
      return true;
    } catch (error) {
      if (options.silent) console.warn('Auto VOOM comment reply failed.', error);
      else showConfigAlert(error instanceof Error ? error.message : '评论区回复生成失败。', '无法回复评论');
      return false;
    } finally {
      replyingVoomCommentPostIds.value = replyingVoomCommentPostIds.value.filter((id) => id !== postId);
    }
  }

  return {
    ready,
    loadingReply,
    replyingVoomCommentPostIds,
    configAlert,
    users,
    user,
    accounts,
    characters,
    charactersForActiveUser,
    conversations,
    conversationsForActiveUser,
    sortedConversations,
    unreadConversationCount,
    messages,
    voomPosts,
    musicFavoriteTracks,
    musicCommentThreads,
    sortedVoomPosts,
    favorites,
    sortedFavorites,
    worldBooks,
    stickerGroups,
    stickers,
    sortedStickerGroups,
    sortedStickers,
    recentStickers,
    conversationSettings,
    conversationMemories,
    generatedImages,
    settings,
    hydrate,
    userById,
    characterById,
    conversationById,
    setActiveConversation,
    messagesForConversation,
    generatedImagesForProvider,
    settingsForConversation,
    modelOverridesForConversation,
    memoriesForConversation,
    stickersForGroup,
    visibleMessagesForConversation,
    hiddenMessageIdsForConversation,
    memoryContextForConversation,
    nextReplyTokenCountForConversation,
    lastMessageForConversation,
    createMessageQuoteSnapshot,
    isMessageFavorited,
    addFavoriteMessage,
    deleteFavorite,
    showConfigAlert,
    isReplyingVoomComments,
    isConversationReplying,
    saveUserProfile,
    saveUsers,
    saveAccountProfile,
    deleteUserProfile,
    deleteCharacterProfile,
    clearCharacterHistory,
    setActiveUser,
    markVoomCharactersRead,
    saveVisualProfile,
    saveCharacter,
    markCharacterMindStateRead,
    addCharacter,
    saveConversationSettings,
    saveCharacterModelOverridesForConversation,
    saveStickerGroup,
    addStickerGroup,
    deleteStickerGroup,
    moveStickerGroup,
    saveSticker,
    importStickers,
    deleteSticker,
    deleteStickers,
    moveStickersToGroup,
    saveWorldBook,
    deleteWorldBook,
    createBackupFile,
    importBackupSnapshot,
    runGitHubBackup,
    importGitHubBackup,
    hasGitHubBackup,
    syncGitHubBackupHistory,
    saveSettings,
    addGeneratedImage,
    updateGeneratedImageUrl,
    deleteGeneratedImage,
    getDataInventory,
    estimateCleanupFreedBytes,
    cleanupData,
    clearDataSections,
    refreshEnabledVendorModels,
    bindWorldBook,
    updateConversationMode,
    markConversationRead,
    appendConversationEvent,
    appendUserMessage,
    appendStickerMessage,
    appendUserImageMessage,
    appendUserVoiceMessage,
    appendUserLocationMessage,
    appendUserTransferMessage,
    updateTransferStatus,
    deleteMessages,
    updateMessageContent,
    updateMessageLocation,
    updateMessageTransfer,
    generateMessageVoiceAudio,
    recallMessage,
    summarizeConversationWindow,
    updateMemoryRecord,
    deleteMemoryRecord,
    resummarizeMemory,
    toggleMemoryHiddenRange,
    mergeConversationMemories,
    unmergeConversationMemories,
    requestRoleplayReply,
    regenerateLatestReply,
    applyReplyVariant,
    maybeRequestProactiveReply,
    sendMessage,
    sendStickerMessage,
    acceptOfflineInvitation,
    rejectOfflineInvitation,
    regenerateChatMessageImage,
    applyChatMessageImageCandidate,
    createUserVoomPost,
    createMomentFromConversation,
    regenerateVoomPostImage,
    applyVoomPostImageCandidate,
    addVoomComment,
    toggleVoomLike,
    replyToVoomComments,
    deleteVoomPost,
  };
});