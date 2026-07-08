import { computed, ref, toRaw } from 'vue';
import { defineStore } from 'pinia';
import { deleteEntity, loadSnapshot, putEntity, replaceSnapshot, scheduleStartupStorageMaintenance } from '@/data/db';
import { defaultSettings } from '@/data/seed';
import type { AppSettings, AppSnapshot, CharacterProfile, CharacterProfileHistoryEntry, CharacterProfileHistoryField, ChatImageAttachment, ChatImageCandidate, ChatLocationAttachment, ChatMessage, ChatMessageQuote, ChatMode, ChatModelOverrides, ChatModelScope, ChatMusicListenInviteAttachment, ChatMusicListenInviteStatus, ChatOfflineInvitationAttachment, ChatOfflineInvitationStatus, ChatSmallTheaterLinkAttachment, ChatTransferAttachment, ChatTransferStatus, ChatVoiceAttachment, Conversation, ConversationMemoryAtom, ConversationMemoryRecord, ConversationSettings, FavoriteMessageKind, FavoriteMessageRecord, GenerateReplyInput, GeneratedImageRecord, ImageModuleId, MusicCommentThread, MusicListeningContext, MusicTrack, ProfileHomepageRecord, ProfileTheme, SmallTheater, SmallTheaterTopic, Sticker, StickerGroup, UserProfile, VisualProfile, VoomComment, VoomFrequency, VoomImageCandidate, VoomPost, VoomPostVisibility, WorldBookEntry } from '@/types/domain';
import { createAccountId, createId } from '@/utils/id';
import { getCharacterAiName, getCharacterInitialProfile, getCharacterVoomAuthorName, getCharacterVoomDisplayName, normalizeCharacterMindStateLines, normalizeCharacterProfile } from '@/utils/character';
import { getUserAiName, getUserDisplayName, getUserVoomAuthorName, normalizeUserProfile, normalizeVisualProfile } from '@/utils/profile';
import { getImageGenerationSize, getImagePromptPresetForProvider, getSelectedImageModelOption, isImageModelSelectionDisabled, mergeVendorModels, normalizeAppSettings, normalizeChatModelOverrides } from '@/utils/settings';
import { normalizeWorldBookEntry, normalizeWorldBooks } from '@/utils/worldBook';
import { createDefaultSmallTheaterTopics, defaultSmallTheaterTopicDrafts, normalizeSmallTheaterTopic } from '@/utils/smallTheater';
import { createDefaultProfileTheme, extractProfileThemeContent, isDefaultProfileTheme, normalizeProfileTheme, normalizeProfileThemesForCharacter, normalizeProfileThemeContentLines, renderProfileThemeHtml, selectRandomEnabledProfileTheme } from '@/utils/profileThemes';
import { getSmallTheaterVisibleText } from '@/utils/smallTheaterHtml';
import { RECENT_STICKER_GROUP_NAME, cacheStickerImageUrl, createStickerFromDraft, createStickerGroup, getStickerDisplayImageUrl, isLegacyGanadiSticker, isLegacyGanadiStickerGroup, isRecentStickerGroupId, normalizeSticker, normalizeStickerGroup, shouldLocalizeStickerImageUrl, sortRecentStickers, type StickerImportDraft } from '@/utils/stickers';
import { ageMemoryKind, collectIncrementalGrandSummaries, createMemoryRecord, estimateTokenCount, filterHighestMemoryLayers, getConversationActiveMessages, getConversationFloorCount, getGrandSummaryHiddenRange, getHiddenMessageIds, getMemoryContext, getMemoryMergeDepth, getMessageFloorMap, getMessagesInFloorRange, getNextSummaryRange, getNextSummaryStartFloor, getVisibleMessages, isIncrementalGrandSummary, normalizeConversationSettings, normalizeMemoryRecordEntries, renderCharacterMemoryPrompt, shouldCompressMemory } from '@/utils/memory';
import { formatContentWithChineseTranslation, normalizeTranslationText } from '@/utils/translation';
import { estimateRoleplayReplyInputTokens, fetchVendorModels, generateConversationSummary, generateImageByProvider, generateRoleplayReply, generateSmallTheater, generateUserVoomComments, generateVoomCommentReplies, generateVoomPost, hasTextGenerationConfig, shouldAutoGenerateMoment, type ConversationSummaryIdentityRule, type RoleplayReplyResult, type RoleplayReplySegment } from '@/services/ai';
import { fetchMusicAudioUrl, fetchMusicCoverUrl, mergeMusicTrack, searchMusicTracks } from '@/services/music';
import { useMusicPlayerStore } from '@/stores/musicPlayerStore';
import { GitHubBackupError, downloadGitHubBackup, downloadGitHubBackupVersion, ensureGitHubBackupRepository, formatGitHubBackupError, listGitHubBackupHistory, uploadGitHubBackup } from '@/services/githubBackup';
import { showLinkNotification } from '@/services/keepAlive';
import { playRingtone } from '@/services/ringtone';
import { synthesizeSpeech } from '@/services/tts';
import { createLinkBackupFile, parseLinkBackupFileText, parseLinkBackupText, stickerBackupPlaceholder, stringifyLinkBackupFile } from '@/utils/backup';
import { markRestoredGlobalNoticesSeen } from '@/utils/globalNotices';
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

interface RoleplayReplyInputBundle {
  conversation: Conversation;
  character: CharacterProfile;
  boundUser: UserProfile;
  chatSettings: ConversationSettings;
  modelOverride: string;
  input: GenerateReplyInput;
  activeProfileTheme: ProfileTheme | null;
}

interface BuildRoleplayReplyInputOptions {
  proactive?: boolean;
  replyInstruction?: string;
  excludeSourceMessageIds?: string[];
  timeAwarenessNow?: number;
}

interface IncrementalGrandSummaryOptions {
  segmentStartFloor: number;
  endFloor: number;
  sourceStartFloor?: number;
  hiddenStartFloor?: number;
  visibleTailFloors?: number;
}

type GrandSummaryPromptMode = 'incremental' | 'full';

type BackupProgressCallback = (label: string, percent: number) => void | Promise<void>;

interface ImportBackupOptions {
  sourceByteSize?: number;
  onProgress?: BackupProgressCallback;
}

interface ImportBackupResult {
  slimmedForMobile: boolean;
  persistentStorageGranted: boolean;
}

type ConversationSummaryResultStatus = 'created' | 'updated' | 'existing' | 'busy';

export type DataCleanupAction = 'generated-images' | 'message-media' | 'user-sent-images' | 'sticker-local-cache' | 'image-candidates' | 'voice-audio' | 'memory-vectors';
export type ClearableDataSection = 'messages' | 'voomPosts' | 'smallTheaters' | 'music' | 'worldBooks' | 'stickers' | 'conversationSettings' | 'conversationMemories' | 'conversationMemoryAtoms' | 'generatedImages';

type ConversationSummaryResult =
  | { record: ConversationMemoryRecord; status: Exclude<ConversationSummaryResultStatus, 'busy'> }
  | { record?: ConversationMemoryRecord; status: 'busy' };

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
const oversizedImportSourceBytes = 48 * 1024 * 1024;
const oneDayMs = 24 * 60 * 60 * 1000;

function formatMemoryTimelineTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '未知时间';
  return memoryTimelineTimeFormatter.format(timestamp);
}

function formatMemoryTimelineTimeRange(timestamps: number[]) {
  const sortedTimestamps = timestamps
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
    .sort((left, right) => left - right);
  if (!sortedTimestamps.length) return '未知时间';
  const startText = formatMemoryTimelineTime(sortedTimestamps[0]);
  const endText = formatMemoryTimelineTime(sortedTimestamps[sortedTimestamps.length - 1]);
  return startText === endText ? startText : `${startText} 至 ${endText}`;
}

function compactMemoryTimelineText(text: string, maxLength = 90) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '无文本内容';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function getTimelineMessagePreview(message: ChatMessage) {
  if (message.sticker) return `[Sticker] ${message.sticker.description}`.trim();
  if (message.image) return `[图片] ${message.image.description}`.trim();
  if (message.voice) return `[语音] ${message.voice.transcript}`.trim();
  if (message.location) return `[位置] ${message.location.name || message.location.address || message.location.distance || ''}`.trim();
  if (message.transfer) return `${message.transfer.responseToMessageId ? '[转账回执]' : '[转账]'} ${message.transfer.amount || ''} ${message.transfer.note || ''}`.trim();
  if (message.musicListenInvite) return `[一起听] ${message.musicListenInvite.track?.name || message.musicListenInvite.note || message.musicListenInvite.status || ''}`.trim();
  if (message.theaterLink) return `[网站链接] ${message.theaterLink.title} ${message.theaterLink.summary}`.trim();
  if (message.offlineInvitation) return `[离线邀请] ${message.offlineInvitation.prompt || message.offlineInvitation.status || ''}`.trim();
  return message.content.trim();
}

function getTimelineSenderLabel(message: ChatMessage) {
  if (message.sender === 'user') return '用户';
  if (message.sender === 'char') return '角色';
  return '系统';
}

function renderMessageTimelineContext(messages: ChatMessage[], floorMap: Map<string, number>, fallbackFloor: number) {
  return messages
    .map((message) => `${floorMap.get(message.id) ?? fallbackFloor}楼｜${formatMemoryTimelineTime(message.createdAt)}｜${getTimelineSenderLabel(message)}｜${compactMemoryTimelineText(getTimelineMessagePreview(message))}`)
    .join('\n');
}

function renderMemoryRangeTimelineContext(memories: ConversationMemoryRecord[]) {
  return memories
    .map((memory) => `【${memory.startFloor}-${memory.endFloor}楼】记忆创建：${formatMemoryTimelineTime(memory.createdAt)}；最近更新：${formatMemoryTimelineTime(memory.updatedAt)}`)
    .join('\n');
}

function normalizeSummaryIdentityName(name: string | null | undefined) {
  return String(name ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueSummaryIdentityAliases(canonicalName: string, names: Array<string | null | undefined>) {
  const canonicalKey = normalizeSummaryIdentityName(canonicalName).toLocaleLowerCase();
  const seen = new Set<string>();
  return names
    .map(normalizeSummaryIdentityName)
    .filter((name) => {
      const key = name.toLocaleLowerCase();
      if (!name || key === canonicalKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function createConversationSummaryIdentityRules(boundUser: UserProfile | null | undefined, character: CharacterProfile | null | undefined): ConversationSummaryIdentityRule[] {
  const userCanonicalName = getUserAiName(boundUser);
  const rules: ConversationSummaryIdentityRule[] = [
    {
      role: 'user',
      canonicalName: userCanonicalName,
      aliases: uniqueSummaryIdentityAliases(userCanonicalName, [
        boundUser?.nickname,
        getUserDisplayName(boundUser),
        getUserVoomAuthorName(boundUser),
        boundUser?.profile?.nickname,
        boundUser?.profile?.handle
      ])
    }
  ];

  if (character) {
    const characterCanonicalName = getCharacterAiName(character);
    rules.push({
      role: 'character',
      canonicalName: characterCanonicalName,
      aliases: uniqueSummaryIdentityAliases(characterCanonicalName, [
        character.nickname,
        character.userNote,
        getCharacterVoomDisplayName(character),
        getCharacterVoomAuthorName(character),
        character.profile?.nickname,
        character.profile?.handle
      ])
    });
  }

  return rules;
}

const fullConversationMergeSummaryPrompt = `停止剧情，停止输出其他所有内容，开始执行全文大总结。

执行规则

1. 将过往所有分段总结整合为一份完整连贯的剧情文档，不再拆分段落记录。
2. 统一梳理整条故事时间线，理顺前后逻辑，合并重复内容，久远的细碎情节可以适当精简压缩。
3. 区分时间节点，把所有事件按先后顺序串联起来；每个“时间”必须写成“日期 + 时段 + 具体小时”。
4. 留存全部主线转折点、人物约定、道具信息、情感走向与伏笔内容。
5. 客观平铺事实，不用文学修辞，不做情绪点评，全程流水账叙事。
6. 内容完整还原全部剧情，无遗漏、无篡改。

固定输出格式

plaintext

- 时间：日期 + 时段 + 具体小时
  - 关键事件：完整叙述事件经过与出场人物
  - 重要细节：
  - 关键对话与内心戏：标注对应角色
  - 角色关键行为：标注对应角色
  - 角色与用户之间的情感变化（选填）
  - 事件收尾与后续小互动（选填）

- 时间：日期 + 时段 + 具体小时
  - 关键事件：完整叙述事件经过与出场人物
  - 重要细节：
  - 关键对话与内心戏：标注对应角色
  - 角色关键行为：标注对应角色
  - 角色与用户之间的情感变化（选填）
  - 事件收尾与后续小互动（选填）

（可无限顺延时间条目，完整写完整条剧情）

角色表

汇总全程所有主线人物，剔除一次性路人，生成 Markdown 人物档案表格+mermaid 人际关系变化流程图，严格遵循角色表格式要求。

| 名字 | 身份 | 重要伏笔 |
| --- | --- | --- |
|  |  |  |

用 mermaid 记录角色之间的互动和变化。仅基础结构，不含任何样式和配色。
\`\`\`mermaid
graph TD
A[角色A]-->|关系变化|B[角色B]
\`\`\``;

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
  const autoMergingConversationIds = new Set<string>();
  const generatingMomentConversationIds = new Set<string>();
  const generatingSmallTheaterConversationIds = new Set<string>();
  const regeneratingChatImageMessageIds = new Set<string>();
  const regeneratingVoomImagePostIds = new Set<string>();
  const replyingConversationIds = ref<string[]>([]);
  const loadingReply = computed(() => replyingConversationIds.value.length > 0);
  const replyingVoomCommentPostIds = ref<string[]>([]);
  const suppressedVoomNoticeKeys = ref<string[]>([]);
  const configAlert = ref({ open: false, title: '提示', message: '' });
  const users = ref<UserProfile[]>([]);
  const characters = ref<CharacterProfile[]>([]);
  const conversations = ref<Conversation[]>([]);
  const activeConversationId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const voomPosts = ref<VoomPost[]>([]);
  const profileThemes = ref<ProfileTheme[]>([]);
  const profileHomepages = ref<ProfileHomepageRecord[]>([]);
  const smallTheaterTopics = ref<SmallTheaterTopic[]>([]);
  const smallTheaters = ref<SmallTheater[]>([]);
  const musicFavoriteTracks = ref<MusicTrack[]>([]);
  const musicCommentThreads = ref<MusicCommentThread[]>([]);
  const worldBooks = ref<WorldBookEntry[]>([]);
  const stickerGroups = ref<StickerGroup[]>([]);
  const stickers = ref<Sticker[]>([]);
  const conversationSettings = ref<ConversationSettings[]>([]);
  const conversationMemories = ref<ConversationMemoryRecord[]>([]);
  const conversationMemoryAtoms = ref<ConversationMemoryAtom[]>([]);
  const generatedImages = ref<GeneratedImageRecord[]>([]);
  const musicPlayer = useMusicPlayerStore();
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
  const displayAllFriends = computed(() => settings.value?.friendsDisplayScope === 'all-users');
  const charactersForFriendsDisplay = computed(() => displayAllFriends.value ? characters.value : charactersForActiveUser.value);
  const conversationsForFriendsDisplay = computed(() => displayAllFriends.value ? conversations.value : conversationsForActiveUser.value);
  const sortedConversations = computed(() => [...conversationsForActiveUser.value].sort((a, b) => b.updatedAt - a.updatedAt));
  const sortedVoomPosts = computed(() => [...voomPosts.value].sort((a, b) => b.createdAt - a.createdAt));
  const sortedProfileHomepages = computed(() => [...profileHomepages.value].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)));
  const sortedSmallTheaters = computed(() => [...smallTheaters.value].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)));
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

  const usersById = computed(() => new Map(users.value.map((account) => [account.id, account])));
  const charactersById = computed(() => new Map(characters.value.map((character) => [character.id, character])));
  const conversationsById = computed(() => new Map(conversations.value.map((conversation) => [conversation.id, conversation])));
  const messagesByConversationId = computed(() => {
    const groupedMessages = new Map<string, ChatMessage[]>();
    for (const message of messages.value) {
      const conversationMessages = groupedMessages.get(message.conversationId) ?? [];
      conversationMessages.push(message);
      groupedMessages.set(message.conversationId, conversationMessages);
    }
    for (const conversationMessages of groupedMessages.values()) {
      conversationMessages.sort((leftMessage, rightMessage) => leftMessage.createdAt - rightMessage.createdAt);
    }
    return groupedMessages;
  });
  const messageMapsByConversationId = computed(() => {
    const groupedMessageMaps = new Map<string, Map<string, ChatMessage>>();
    for (const [conversationId, conversationMessages] of messagesByConversationId.value) {
      groupedMessageMaps.set(conversationId, new Map(conversationMessages.map((message) => [message.id, message])));
    }
    return groupedMessageMaps;
  });
  const conversationSettingsById = computed(() => new Map(conversationSettings.value.map((entry) => [entry.conversationId, entry])));
  const normalizedConversationSettingsById = computed(() => {
    const normalizedSettings = new Map<string, ConversationSettings>();
    for (const entry of conversationSettings.value) {
      const conversation = conversationsById.value.get(entry.conversationId);
      normalizedSettings.set(entry.conversationId, normalizeConversationSettings(entry, entry.conversationId, conversation?.activeMode));
    }
    for (const conversation of conversations.value) {
      if (normalizedSettings.has(conversation.id)) continue;
      const character = charactersById.value.get(conversation.charId);
      normalizedSettings.set(conversation.id, normalizeConversationSettings({ voomFrequency: character?.voomFrequency }, conversation.id, conversation.activeMode));
    }
    return normalizedSettings;
  });
  const memoriesByConversationId = computed(() => {
    const groupedMemories = new Map<string, ConversationMemoryRecord[]>();
    for (const memory of conversationMemories.value) {
      const conversationRecords = groupedMemories.get(memory.conversationId) ?? [];
      conversationRecords.push(memory);
      groupedMemories.set(memory.conversationId, conversationRecords);
    }
    for (const conversationRecords of groupedMemories.values()) {
      conversationRecords.sort((leftMemory, rightMemory) => leftMemory.startFloor - rightMemory.startFloor);
    }
    return groupedMemories;
  });
  const memoryAtomsByConversationId = computed(() => {
    const groupedAtoms = new Map<string, ConversationMemoryAtom[]>();
    for (const atom of conversationMemoryAtoms.value) {
      const conversationAtoms = groupedAtoms.get(atom.conversationId) ?? [];
      conversationAtoms.push(atom);
      groupedAtoms.set(atom.conversationId, conversationAtoms);
    }
    for (const conversationAtoms of groupedAtoms.values()) {
      conversationAtoms.sort((leftAtom, rightAtom) => rightAtom.updatedAt - leftAtom.updatedAt);
    }
    return groupedAtoms;
  });
  const stickersByPrimaryGroupId = computed(() => {
    const groupedStickers = new Map<string, Sticker[]>();
    for (const sticker of sortedStickers.value) {
      const groupId = sticker.groupIds[0] ?? '';
      if (!groupId) continue;
      const groupStickers = groupedStickers.get(groupId) ?? [];
      groupStickers.push(sticker);
      groupedStickers.set(groupId, groupStickers);
    }
    return groupedStickers;
  });

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

    const normalizedConversationMemories = dedupeConversationMemories(snapshot.conversationMemories.map((memory) => ({
      ...memory,
      kind: ageMemoryKind(memory.createdAt),
      vector: Array.isArray(memory.vector) ? memory.vector : [],
      entries: normalizeMemoryRecordEntries(memory)
    }))).memories;
    const normalizedMemoryAtoms = normalizeConversationMemoryAtoms(snapshot.conversationMemoryAtoms ?? [], normalizedConversationMemories);

    return {
      users: normalizedUsers,
      characters: snapshot.characters.map((entry) => normalizeCharacterProfile(entry, fallbackUserId)),
      conversations: snapshot.conversations,
      messages: snapshot.messages,
      voomPosts: snapshot.voomPosts,
      profileThemes: normalizeStoredProfileThemes(snapshot.profileThemes ?? []),
      profileHomepages: normalizeStoredProfileHomepages(snapshot.profileHomepages ?? []),
      smallTheaterTopics: snapshot.smallTheaterTopics ?? [],
      smallTheaters: snapshot.smallTheaters ?? [],
      musicFavoriteTracks: snapshot.musicFavoriteTracks ?? [],
      musicCommentThreads: snapshot.musicCommentThreads ?? [],
      worldBooks: normalizeWorldBooks(snapshot.worldBooks),
      stickerGroups: stickerLibrary.groups,
      stickers: stickerLibrary.stickers,
      conversationSettings: snapshot.conversationSettings.map((entry) => normalizeConversationSettings({
        ...entry,
        characterStickerGroupIds: entry.characterStickerGroupIds.filter((id) => !isRecentStickerGroupId(id) && !stickerLibrary.removedGroupIds.includes(id))
      }, entry.conversationId, snapshot.conversations.find((conversation) => conversation.id === entry.conversationId)?.activeMode)),
      conversationMemories: normalizedConversationMemories,
      conversationMemoryAtoms: normalizedMemoryAtoms,
      generatedImages: normalizeGeneratedImages(snapshot.generatedImages ?? []),
      favorites: normalizeFavorites(snapshot.favorites ?? []),
      settings: normalizeAppSettings({
        ...defaultSettings,
        ...snapshot.settings,
        activeUserId: snapshot.settings.activeUserId || normalizedUsers[0].id
      })
    };
  }

  function normalizeConversationMemoryAtoms(rawAtoms: ConversationMemoryAtom[], memories: ConversationMemoryRecord[]) {
    void rawAtoms;
    void memories;
    return [];
  }

  function getMemoryRangeKey(memory: Pick<ConversationMemoryRecord, 'conversationId' | 'startFloor' | 'endFloor' | 'isMergedSummary'>) {
    return `${memory.conversationId}:${memory.isMergedSummary ? 'merged' : 'single'}:${memory.startFloor}-${memory.endFloor}`;
  }

  function isSameMemoryRange(
    memory: Pick<ConversationMemoryRecord, 'conversationId' | 'startFloor' | 'endFloor' | 'isMergedSummary'>,
    target: Pick<ConversationMemoryRecord, 'conversationId' | 'startFloor' | 'endFloor' | 'isMergedSummary'>
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

  async function persistMissingMemoryAtoms(atoms: ConversationMemoryAtom[]) {
    if (!atoms.length) return;
    await Promise.all(atoms.map((atom) => putEntity('conversationMemoryAtoms', atom)));
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
    messages.value = snapshot.messages.map((message) => normalizeStoredMessageIdentityReferences(message));
    voomPosts.value = snapshot.voomPosts.map((post) => normalizeStoredVoomPostIdentityReferences(post));
    profileThemes.value = normalizeStoredProfileThemes(snapshot.profileThemes ?? []);
    profileHomepages.value = normalizeStoredProfileHomepages(snapshot.profileHomepages ?? []);
    smallTheaterTopics.value = snapshot.smallTheaterTopics ?? [];
    smallTheaters.value = normalizeStoredSmallTheaters(snapshot.smallTheaters ?? []);
    musicFavoriteTracks.value = snapshot.musicFavoriteTracks ?? [];
    musicCommentThreads.value = normalizeStoredMusicCommentThreads(snapshot.musicCommentThreads ?? []);
    worldBooks.value = snapshot.worldBooks;
    stickerGroups.value = snapshot.stickerGroups;
    stickers.value = snapshot.stickers;
    conversationSettings.value = snapshot.conversationSettings;
    conversationMemories.value = dedupeConversationMemories(snapshot.conversationMemories).memories;
    conversationMemoryAtoms.value = normalizeConversationMemoryAtoms(snapshot.conversationMemoryAtoms ?? [], conversationMemories.value);
    generatedImages.value = snapshot.generatedImages;
    favorites.value = normalizeFavorites(snapshot.favorites ?? []);
    settings.value = snapshot.settings;
    activeConversationId.value = null;
    ready.value = true;
  }

  function prepareSnapshotForStore(snapshot: AppSnapshot): AppSnapshot {
    const normalizedMemories = dedupeConversationMemories(snapshot.conversationMemories).memories;
    return {
      ...snapshot,
      messages: snapshot.messages.map((message) => normalizeStoredMessageIdentityReferences(message)),
      voomPosts: snapshot.voomPosts.map((post) => normalizeStoredVoomPostIdentityReferences(post)),
      profileHomepages: normalizeStoredProfileHomepages(snapshot.profileHomepages ?? []),
      smallTheaters: normalizeStoredSmallTheaters(snapshot.smallTheaters ?? []),
      musicCommentThreads: normalizeStoredMusicCommentThreads(snapshot.musicCommentThreads ?? []),
      conversationMemories: normalizedMemories,
      conversationMemoryAtoms: normalizeConversationMemoryAtoms(snapshot.conversationMemoryAtoms ?? [], normalizedMemories),
      favorites: normalizeFavorites(snapshot.favorites ?? [])
    };
  }

  function shouldUseMobileSafeRestore(sourceByteSize = 0) {
    return Number.isFinite(sourceByteSize) && sourceByteSize >= oversizedImportSourceBytes;
  }

  function stripMemoryVectorCache(memory: ConversationMemoryRecord): ConversationMemoryRecord {
    const hasMemoryVector = Array.isArray(memory.vector) && memory.vector.length > 0;
    const entries = memory.entries?.map((entry) => entry.vector?.length ? { ...entry, vector: [] } : entry);
    const entriesChanged = Boolean(entries?.some((entry, index) => entry !== memory.entries?.[index]));
    if (!hasMemoryVector && !entriesChanged) return memory;
    return {
      ...memory,
      vector: [],
      entries: entries ?? memory.entries
    };
  }

  function memoryHasVectorCache(memory: ConversationMemoryRecord) {
    return (Array.isArray(memory.vector) && memory.vector.length > 0) || Boolean(memory.entries?.some((entry) => entry.vector?.length));
  }

  async function purgeLegacyMemoryVectorData(legacyAtomIds: string[], shouldPersistMemories: boolean) {
    const tasks: Array<Promise<unknown>> = legacyAtomIds.map((atomId) => deleteEntity('conversationMemoryAtoms', atomId));
    if (shouldPersistMemories) {
      tasks.push(...conversationMemories.value.map((memory) => putEntity('conversationMemories', stripMemoryVectorCache(memory))));
    }
    if (!tasks.length) return;
    await Promise.all(tasks);
  }

  function stripRestoreVectorCaches(snapshot: AppSnapshot): AppSnapshot {
    return {
      ...snapshot,
      conversationMemories: snapshot.conversationMemories.map((memory) => stripMemoryVectorCache(memory)),
      conversationMemoryAtoms: []
    };
  }

  function stripVoomPostMediaCache(post: VoomPost): VoomPost {
    return {
      ...post,
      authorAvatar: stripInlineMediaUrl(post.authorAvatar),
      image: stripInlineMediaUrl(post.image),
      imageCandidates: undefined
    };
  }

  function stripFavoriteMediaCache(record: FavoriteMessageRecord): FavoriteMessageRecord {
    return {
      ...record,
      authorAvatar: stripInlineMediaUrl(record.authorAvatar),
      characterAvatar: stripInlineMediaUrl(record.characterAvatar),
      userAvatar: stripInlineMediaUrl(record.userAvatar),
      message: stripMessageMediaCache(record.message)
    };
  }

  function stripSettingsMediaCache(entry: AppSettings): AppSettings {
    return normalizeAppSettings({
      ...entry,
      imageOpenAi: {
        ...entry.imageOpenAi,
        lastImageUrl: ''
      },
      imageNovelAi: {
        ...entry.imageNovelAi,
        lastImageUrl: ''
      },
      imagePollinations: {
        ...entry.imagePollinations,
        lastImageUrl: '',
        referenceImage: stripInlineMediaUrl(entry.imagePollinations.referenceImage)
      }
    });
  }

  function slimOversizedRestoreSnapshot(snapshot: AppSnapshot): AppSnapshot {
    const vectorSlimmedSnapshot = stripRestoreVectorCaches(snapshot);
    return {
      ...vectorSlimmedSnapshot,
      messages: vectorSlimmedSnapshot.messages.map((message) => stripMessageMediaCache(message)),
      voomPosts: vectorSlimmedSnapshot.voomPosts.map((post) => stripVoomPostMediaCache(post)),
      stickers: vectorSlimmedSnapshot.stickers.map((sticker) => stripStickerLocalCache(sticker)),
      generatedImages: [],
      favorites: vectorSlimmedSnapshot.favorites.map((record) => stripFavoriteMediaCache(record)),
      settings: stripSettingsMediaCache(vectorSlimmedSnapshot.settings)
    };
  }

  async function requestPersistentStorage() {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return false;
    try {
      if (storage.persisted && await storage.persisted()) return true;
      return await storage.persist();
    } catch {
      return false;
    }
  }

  function normalizeImportPersistenceError(error: unknown) {
    const errorName = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : '';
    if (/quota|storage|disk|space|abort/i.test(`${errorName} ${message}`)) {
      return new Error('本机存储空间不足，导入没有写入。请先到“设置 > 数据管理”清理生成图历史、消息媒体缓存、语音音频缓存后再试，或改用安装后的 PWA/空间更大的浏览器。');
    }
    return error instanceof Error ? error : new Error('导入失败，当前本地数据未被替换。');
  }

  async function hydrate() {
    if (ready.value) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
    const snapshot = await loadSnapshot();
    const legacyMemoryAtomIds = (snapshot.conversationMemoryAtoms ?? []).map((atom) => atom.id);
    const shouldPersistMemoryVectorCleanup = snapshot.conversationMemories.some((memory) => memoryHasVectorCache(memory));
    users.value = snapshot.users.map((entry) => normalizeUserProfile(entry));
    const fallbackUserId = snapshot.settings.activeUserId || snapshot.users[0]?.id || '';
    characters.value = snapshot.characters.map((entry) => normalizeCharacterProfile(entry, fallbackUserId));
    conversations.value = snapshot.conversations;
    messages.value = snapshot.messages.map((message) => normalizeStoredMessageIdentityReferences(message));
    voomPosts.value = snapshot.voomPosts.map((post) => normalizeStoredVoomPostIdentityReferences(post));
    profileThemes.value = normalizeStoredProfileThemes(snapshot.profileThemes ?? []);
    profileHomepages.value = normalizeStoredProfileHomepages(snapshot.profileHomepages ?? []);
    smallTheaterTopics.value = snapshot.smallTheaterTopics ?? [];
    smallTheaters.value = normalizeStoredSmallTheaters(snapshot.smallTheaters ?? []);
    musicFavoriteTracks.value = snapshot.musicFavoriteTracks ?? [];
    musicCommentThreads.value = normalizeStoredMusicCommentThreads(snapshot.musicCommentThreads ?? []);
    worldBooks.value = snapshot.worldBooks;
    const stickerLibrary = normalizeStickerLibrary(snapshot.stickerGroups, snapshot.stickers);
    stickerGroups.value = stickerLibrary.groups;
    stickers.value = stickerLibrary.stickers;
    favorites.value = normalizeFavorites(snapshot.favorites ?? []);
    if (stickerLibrary.removedGroupIds.length || stickerLibrary.removedStickerIds.length) {
      await Promise.all([
        ...stickerLibrary.removedGroupIds.map((groupId) => deleteEntity('stickerGroups', groupId)),
        ...stickerLibrary.removedStickerIds.map((stickerId) => deleteEntity('stickers', stickerId)),
        ...stickerLibrary.stickers.map((sticker) => putEntity('stickers', sticker))
      ]);
    }
    const changedIdentityMessages = messages.value.filter((message, index) => message !== snapshot.messages[index]);
    const changedIdentityPosts = voomPosts.value.filter((post, index) => post !== snapshot.voomPosts[index]);
    const rawSmallTheaters = snapshot.smallTheaters ?? [];
    const changedIdentityTheaters = smallTheaters.value.filter((theater, index) => theater !== rawSmallTheaters[index]);
    const rawMusicThreads = snapshot.musicCommentThreads ?? [];
    const changedIdentityMusicThreads = musicCommentThreads.value.filter((thread, index) => thread !== rawMusicThreads[index]);
    const rawFavorites = snapshot.favorites ?? [];
    const keptFavoriteIds = new Set(favorites.value.map((favorite) => favorite.id));
    const removedFavoriteIds = rawFavorites
      .filter((favorite) => favorite?.id && !keptFavoriteIds.has(favorite.id))
      .map((favorite) => favorite.id);
    const changedIdentityFavorites = favorites.value.filter((favorite, index) => JSON.stringify(favorite) !== JSON.stringify(rawFavorites[index]));
    if (changedIdentityMessages.length || changedIdentityPosts.length || changedIdentityTheaters.length || changedIdentityMusicThreads.length || changedIdentityFavorites.length || removedFavoriteIds.length) {
      await Promise.all([
        ...changedIdentityMessages.map((message) => putEntity('messages', message)),
        ...changedIdentityPosts.map((post) => putEntity('voomPosts', createPersistableVoomPost(post))),
        ...changedIdentityTheaters.map((theater) => putEntity('smallTheaters', theater)),
        ...changedIdentityMusicThreads.map((thread) => putEntity('musicCommentThreads', thread)),
        ...changedIdentityFavorites.map((favorite) => putEntity('favorites', favorite)),
        ...removedFavoriteIds.map((favoriteId) => deleteEntity('favorites', favoriteId))
      ]);
    }
    conversationSettings.value = snapshot.conversationSettings.map((entry) => normalizeConversationSettings({
      ...entry,
      characterStickerGroupIds: entry.characterStickerGroupIds.filter((id) => !isRecentStickerGroupId(id) && !stickerLibrary.removedGroupIds.includes(id))
    }, entry.conversationId, snapshot.conversations.find((conversation) => conversation.id === entry.conversationId)?.activeMode));
    conversationMemories.value = await removeDuplicateConversationMemories(snapshot.conversationMemories.map((memory) => stripMemoryVectorCache({
      ...memory,
      kind: ageMemoryKind(memory.createdAt),
      vector: [],
      entries: normalizeMemoryRecordEntries(memory).map((entry) => ({ ...entry, vector: [] }))
    })));
    conversationMemoryAtoms.value = [];
    generatedImages.value = normalizeGeneratedImages(snapshot.generatedImages ?? []);
    favorites.value = normalizeFavorites(favorites.value);
    settings.value = normalizeAppSettings({
      ...snapshot.settings,
      activeUserId: snapshot.settings.activeUserId || snapshot.users[0]?.id || ''
    });
    ready.value = true;
    if (legacyMemoryAtomIds.length || shouldPersistMemoryVectorCleanup) {
      void purgeLegacyMemoryVectorData(legacyMemoryAtomIds, shouldPersistMemoryVectorCleanup).catch(() => undefined);
    }
    scheduleStartupStorageMaintenance();
    void refreshEnabledVendorModels();
    })().finally(() => {
      hydratePromise = null;
    });
    return hydratePromise;
  }

  function userById(id: string) {
    return usersById.value.get(id);
  }

  function characterById(id: string) {
    return charactersById.value.get(id);
  }

  function conversationById(id: string) {
    return conversationsById.value.get(id);
  }

  function setActiveConversation(conversationId: string | null) {
    activeConversationId.value = conversationId;
  }

  function unreadCountAfterIncomingMessage(conversation: Conversation, messageCount: number) {
    return activeConversationId.value === conversation.id ? 0 : conversation.unreadCount + messageCount;
  }

  function messagesForConversation(id: string) {
    return messagesByConversationId.value.get(id) ?? [];
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
    const cachedSettings = normalizedConversationSettingsById.value.get(id);
    if (cachedSettings) return cachedSettings;
    const existing = conversationSettingsById.value.get(id);
    const conversation = conversationById(id);
    if (existing) return normalizeConversationSettings(existing, id, conversation?.activeMode);
    const character = conversation ? characterById(conversation.charId) : null;
    return normalizeConversationSettings({ voomFrequency: character?.voomFrequency }, id, conversation?.activeMode);
  }

  function memoriesForConversation(id: string) {
    return memoriesByConversationId.value.get(id) ?? [];
  }

  function messageMapForConversation(id: string) {
    return messageMapsByConversationId.value.get(id) ?? new Map<string, ChatMessage>();
  }

  function sourceMessageIdsAreRecallable(sourceMessageIds: string[], sourceMessagesById: Map<string, ChatMessage>) {
    if (!sourceMessageIds.length) return true;
    return sourceMessageIds.every((messageId) => {
      const sourceMessage = sourceMessagesById.get(messageId);
      return Boolean(sourceMessage && sourceMessage.replyVariantState !== 'inactive');
    });
  }

  function filterRecallableMemories(conversationId: string, memories: ConversationMemoryRecord[], excludeSourceMessageIds: string[] = []) {
    const excludedIds = new Set(excludeSourceMessageIds.map((id) => id.trim()).filter(Boolean));
    const sourceMessagesById = messageMapForConversation(conversationId);
    return memories.filter((memory) => sourceMessageIdsAreRecallable(memory.sourceMessageIds, sourceMessagesById)
      && !memory.sourceMessageIds.some((messageId) => excludedIds.has(messageId)));
  }

  function appendMemoryTimelineForTimeAwareness(conversationId: string, memoryText: string, memories: ConversationMemoryRecord[]) {
    if (!settingsForConversation(conversationId).timeAwareness.enabled) return memoryText;
    const timeline = renderMemoryRangeTimelineContext(memories);
    if (!timeline.trim()) return memoryText;
    return [memoryText.trim(), `【记忆时间线】\n${timeline}`].filter(Boolean).join('\n\n');
  }

  function memoryAtomsForConversation(id: string) {
    void id;
    return [];
  }

  function stickersForGroup(groupId: string) {
    if (isRecentStickerGroupId(groupId)) return recentStickers.value;
    if (!groupId || groupId === 'all') return sortedStickers.value;
    return stickersByPrimaryGroupId.value.get(groupId) ?? [];
  }

  function stickersForGroups(groupIds: string[]) {
    const groupIdSet = new Set(groupIds.map((id) => id.trim()).filter((id) => Boolean(id) && !isRecentStickerGroupId(id)));
    if (!groupIdSet.size) return [];
    const resolvedStickers: Sticker[] = [];
    const seenStickerIds = new Set<string>();
    for (const groupId of groupIdSet) {
      const groupStickers = stickersByPrimaryGroupId.value.get(groupId) ?? [];
      for (const sticker of groupStickers) {
        if (seenStickerIds.has(sticker.id)) continue;
        seenStickerIds.add(sticker.id);
        resolvedStickers.push(sticker);
      }
    }
    return resolvedStickers;
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

  function memoryContextForConversation(id: string, queryText = '', options: { includeResolved?: boolean; maxTokens?: number; maxEntries?: number; storeDebug?: boolean; excludeSourceMessageIds?: string[] } = {}) {
    const recallableMemories = filterRecallableMemories(id, memoriesForConversation(id), options.excludeSourceMessageIds);
    const readableMemories = filterHighestMemoryLayers(recallableMemories);
    const fallbackText = getMemoryContext(recallableMemories, {
      queryText,
      maxEntries: options.maxEntries ?? (queryText.trim() ? 18 : 28),
      includeResolved: options.includeResolved,
      excludeSourceMessageIds: options.excludeSourceMessageIds
    });
    void options.storeDebug;
    return appendMemoryTimelineForTimeAwareness(id, fallbackText, readableMemories);
  }

  async function memoryQueryVectorForConversation(id: string, queryText: string, modelOverride = '') {
    void id;
    void queryText;
    void modelOverride;
    return [];
  }

  async function memoryContextForConversationAsync(id: string, queryText = '', options: { includeResolved?: boolean; maxTokens?: number; maxEntries?: number; storeDebug?: boolean; modelOverride?: string; queryVector?: number[]; excludeSourceMessageIds?: string[] } = {}) {
    void options.modelOverride;
    void options.queryVector;
    return memoryContextForConversation(id, queryText, options);
  }

  function getLastUserTurnText(conversationMessages: ChatMessage[]) {
    const lastUserMessages = [...conversationMessages].reverse().filter((message, index, reversedMessages) => {
      const previousMessages = reversedMessages.slice(0, index);
      return message.sender === 'user' && !previousMessages.some((previous) => previous.sender === 'char');
    }).reverse();
    return lastUserMessages.map((message) => messageReadableContent(message)).join('\n');
  }

  async function buildRoleplayReplyInputForConversation(conversationId: string, options: BuildRoleplayReplyInputOptions = {}): Promise<RoleplayReplyInputBundle | null> {
    const conversation = conversationById(conversationId);
    if (!conversation) return null;
    const character = characterById(conversation.charId);
    if (!character) return null;
    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return null;

    const conversationMessages = messagesForConversation(conversationId).filter((message) => message.replyVariantState !== 'inactive');
    const userMessageText = getLastUserTurnText(conversationMessages);
    const chatSettings = settingsForConversation(conversationId);
    const modelOverride = getConversationTextModelOverride(chatSettings, conversation.activeMode);
    const availableCharacterStickers = stickersForGroups(chatSettings.characterStickerGroupIds);
    const activeProfileTheme = conversation.activeMode === 'online'
      ? selectRandomEnabledProfileTheme(await ensureProfileThemesForCharacter(character.id))
      : null;
    const memorySummary = await memoryContextForConversationAsync(conversationId, userMessageText, {
      storeDebug: false,
      modelOverride: getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode),
      excludeSourceMessageIds: options.excludeSourceMessageIds
    });

    return {
      conversation,
      character,
      boundUser,
      chatSettings,
      modelOverride,
      activeProfileTheme,
      input: {
        user: boundUser,
        character,
        boundUser,
        mode: conversation.activeMode,
        messages: visibleMessagesForConversation(conversationId),
        worldBooks: worldBooks.value,
        conversationSummary: conversation.summary,
        memorySummary,
        stickerVisionEnabled: chatSettings.stickerVisionEnabled,
        narrationModeEnabled: chatSettings.narrationModeEnabled,
        offlineInvitationEnabled: chatSettings.offlineInvitationEnabled,
        timeAwareness: chatSettings.timeAwareness,
        timeAwarenessNow: options.timeAwarenessNow,
        offlineSettings: chatSettings.offline,
        musicListening: musicListeningContextForConversation(conversationId),
        replyInstruction: options.replyInstruction
          ? options.replyInstruction
          : options.proactive
          ? `这不是用户刚发来的新消息，而是${getCharacterAiName(character)}在自己的生活节奏里主动联系${getUserAiName(boundUser)}。请基于最近对话、关系状态、时间流逝和角色当前生活，生成一组自然的主动消息；不要假装用户刚说了什么，也不要替用户发言。`
          : undefined,
        activeProfileTheme: activeProfileTheme
          ? {
              id: activeProfileTheme.id,
              name: activeProfileTheme.name,
              prompt: activeProfileTheme.prompt,
              regex: activeProfileTheme.regex,
              css: activeProfileTheme.css,
              template: activeProfileTheme.template,
              source: activeProfileTheme.source,
              builtIn: activeProfileTheme.builtIn
            }
          : undefined,
        availableStickers: availableCharacterStickers.map((sticker) => ({
          stickerId: sticker.id,
          description: sticker.description,
          imageUrl: getStickerDisplayImageUrl(sticker)
        })),
        userMessage: userMessageText,
        settings: settings.value ?? undefined,
        modelOverride
      }
    };
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
      memorySummary: memoryContextForConversation(id, userMessageText, { storeDebug: false }),
      stickerVisionEnabled: chatSettings.stickerVisionEnabled,
      narrationModeEnabled: chatSettings.narrationModeEnabled,
      offlineInvitationEnabled: chatSettings.offlineInvitationEnabled,
      timeAwareness: chatSettings.timeAwareness,
      offlineSettings: chatSettings.offline,
      musicListening: musicListeningContextForConversation(id),
      availableStickers: availableCharacterStickers.map((sticker) => ({
        stickerId: sticker.id,
        description: sticker.description,
        imageUrl: getStickerDisplayImageUrl(sticker)
      })),
      userMessage: userMessageText,
      settings: settings.value ?? undefined,
      modelOverride: getConversationTextModelOverride(chatSettings, conversation.activeMode)
    });
  }

  async function nextReplyTokenCountForConversationAsync(id: string) {
    const bundle = await buildRoleplayReplyInputForConversation(id, { timeAwarenessNow: Date.now() });
    return bundle ? estimateRoleplayReplyInputTokens(bundle.input) : 0;
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
      voom: characterOverrides.voom || legacyConversationOverrides.voom,
      theater: characterOverrides.theater || legacyConversationOverrides.theater
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
      }, entry.conversationId, conversationById(entry.conversationId)?.activeMode));

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

  function suppressVoomNoticeKeys(keys: string[]) {
    const nextKeys = keys.map((key) => key.trim()).filter(Boolean);
    if (!nextKeys.length) return;
    suppressedVoomNoticeKeys.value = [...new Set([...suppressedVoomNoticeKeys.value, ...nextKeys])];
  }

  function consumeSuppressedVoomNoticeKey(key: string) {
    const normalizedKey = key.trim();
    if (!normalizedKey || !suppressedVoomNoticeKeys.value.includes(normalizedKey)) return false;
    suppressedVoomNoticeKeys.value = suppressedVoomNoticeKeys.value.filter((entry) => entry !== normalizedKey);
    return true;
  }

  function voomPostGlobalNoticeKey(postId: string) {
    return `post:${postId}`;
  }

  function voomCommentGlobalNoticeKey(postId: string, commentId: string) {
    return `comment:${postId}:${commentId}`;
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

  function userForVoomComment(comment: VoomComment) {
    const authorId = String(comment.authorId ?? '').trim();
    const authorName = comment.authorName.trim().toLocaleLowerCase();
    return users.value.find((entry) => {
      if (authorId && entry.id === authorId) return true;
      return [getUserVoomAuthorName(entry), getUserAiName(entry)]
        .map((name) => name.trim().toLocaleLowerCase())
        .includes(authorName);
    }) ?? null;
  }

  function voomAiNameForIdentity(authorName = '', authorId = '') {
    const normalizedAuthorId = authorId.trim();
    const normalizedAuthorName = authorName.trim().toLocaleLowerCase();
    const character = characters.value.find((entry) => {
      if (normalizedAuthorId && entry.id === normalizedAuthorId) return true;
      return [entry.id, entry.nickname, entry.name, getCharacterAiName(entry), getCharacterVoomAuthorName(entry)]
        .map((name) => name.trim().toLocaleLowerCase())
        .includes(normalizedAuthorName);
    });
    if (character) return getCharacterAiName(character);
    const matchedUser = users.value.find((entry) => {
      if (normalizedAuthorId && entry.id === normalizedAuthorId) return true;
      return [entry.id, getUserDisplayName(entry), getUserVoomAuthorName(entry), getUserAiName(entry)]
        .map((name) => name.trim().toLocaleLowerCase())
        .includes(normalizedAuthorName);
    });
    return matchedUser ? getUserAiName(matchedUser) : authorName;
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function canonicalizeKnownIdentityTextForConversation(content: string, conversationId: string) {
    const conversation = conversationById(conversationId);
    const character = conversation ? characterById(conversation.charId) : null;
    const boundUser = conversation ? userById(conversation.userId) : null;
    const rules = createConversationSummaryIdentityRules(boundUser ?? user.value, character);
    return rules.reduce((text, rule) => rule.aliases.reduce((nextText, alias) => {
      if (alias.length < 2) return nextText;
      return nextText.replace(new RegExp(escapeRegExp(alias), 'g'), rule.canonicalName);
    }, text), content);
  }

  function normalizeStoredMessageIdentityReferences(message: ChatMessage) {
    const quoteAuthorName = message.quote?.sender === 'user'
      ? voomAiNameForIdentity(message.quote.authorName, conversationById(message.conversationId)?.userId)
      : message.quote?.sender === 'char'
        ? voomAiNameForIdentity(message.quote.authorName, conversationById(message.conversationId)?.charId)
        : message.quote?.authorName;
    const nextQuote = message.quote && quoteAuthorName && quoteAuthorName !== message.quote.authorName
      ? { ...message.quote, authorName: quoteAuthorName }
      : message.quote;
    const nextContent = message.sender === 'system'
      ? canonicalizeKnownIdentityTextForConversation(message.content, message.conversationId)
      : message.content;
    return nextQuote !== message.quote || nextContent !== message.content
      ? { ...message, content: nextContent, quote: nextQuote }
      : message;
  }

  function normalizeStoredVoomPostIdentityReferences(post: VoomPost) {
    const postConversation = conversationForVoomPost(post);
    const postCharacter = characterById(post.charId) ?? (postConversation ? characterById(postConversation.charId) : null);
    const postUser = post.userId ? userById(post.userId) : null;
    const authorName = postCharacter
      ? getCharacterAiName(postCharacter)
      : postUser
        ? getUserAiName(postUser)
        : voomAiNameForIdentity(post.authorName, post.userId || post.charId);
    const likes = post.likes.map((like) => voomAiNameForIdentity(like)).filter(Boolean);
    const comments = post.comments.map((comment) => {
      const nextAuthorName = voomAiNameForIdentity(comment.authorName, comment.authorId);
      return nextAuthorName === comment.authorName ? comment : { ...comment, authorName: nextAuthorName };
    });
    return authorName !== post.authorName
      || likes.length !== post.likes.length
      || likes.some((like, index) => like !== post.likes[index])
      || comments.some((comment, index) => comment !== post.comments[index])
      ? { ...post, authorName, likes, comments }
      : post;
  }

  function normalizeStoredMusicCommentThreads(threads: MusicCommentThread[]) {
    return threads.map((thread) => {
      let changed = false;
      const comments = thread.comments.map((comment) => {
        const nextAuthorName = voomAiNameForIdentity(comment.authorName, comment.authorId);
        if (nextAuthorName === comment.authorName) return comment;
        changed = true;
        return { ...comment, authorName: nextAuthorName };
      });
      return changed ? { ...thread, comments } : thread;
    });
  }

  function normalizeStoredSmallTheaters(theaters: SmallTheater[]) {
    return theaters.map((theater) => {
      const character = characterById(theater.charId) ?? (theater.conversationId ? characterById(conversationById(theater.conversationId)?.charId ?? '') : null);
      const authorName = character ? getCharacterAiName(character) : voomAiNameForIdentity(theater.authorName, theater.charId);
      const updatedAt = theater.updatedAt ?? theater.createdAt;
      return authorName !== theater.authorName || updatedAt !== theater.updatedAt ? { ...theater, authorName, updatedAt } : theater;
    });
  }

  function normalizeStoredProfileThemes(themes: ProfileTheme[]) {
    return themes
      .map((theme) => normalizeProfileTheme(theme, theme.charId))
      .filter((theme): theme is ProfileTheme => Boolean(theme));
  }

  function normalizeStoredProfileHomepages(homepages: ProfileHomepageRecord[]) {
    const normalizedHomepages: ProfileHomepageRecord[] = [];
    for (const entry of homepages ?? []) {
      const id = String(entry?.id ?? '').trim() || createId('profile-homepage');
      const charId = String(entry?.charId ?? '').trim();
      const conversationId = String(entry?.conversationId ?? '').trim();
      const themeId = String(entry?.themeId ?? '').trim();
      const themeName = String(entry?.themeName ?? '').trim() || '主页主题';
      const content = String(entry?.content ?? '').trim();
      const html = String(entry?.html ?? '').trim();
      const css = String(entry?.css ?? '').trim();
      const createdAt = Math.max(0, Number(entry?.createdAt) || Date.now());
      const updatedAt = Math.max(0, Number(entry?.updatedAt) || createdAt);
      const replyBatchId = String(entry?.replyBatchId ?? '').trim();
      if (!charId || !conversationId || !themeId || (!content && !html)) continue;
      normalizedHomepages.push({
        id,
        charId,
        conversationId,
        ...(replyBatchId ? { replyBatchId } : {}),
        themeId,
        themeName,
        content,
        html,
        css,
        createdAt,
        updatedAt
      });
    }
    return normalizedHomepages;
  }

  function voomCommentAiAuthorName(comment: VoomComment) {
    const character = characterForVoomComment(comment);
    if (character) return getCharacterAiName(character);
    const commentUser = userForVoomComment(comment);
    return commentUser ? getUserAiName(commentUser) : comment.authorName;
  }

  function formatVoomCommentEvent(comment: VoomComment, comments: VoomComment[]) {
    const parentComment = comment.parentId ? comments.find((entry) => entry.id === comment.parentId) : undefined;
    const parentName = parentComment ? voomCommentAiAuthorName(parentComment) : '';
    const authorName = voomCommentAiAuthorName(comment);
    const content = formatContentWithChineseTranslation(comment.content, comment.contentTranslation);
    return parentName
      ? `【VOOM 评论】${authorName} 回复 ${parentName}: ${content}`
      : `【VOOM 评论】${authorName}: ${content}`;
  }

  function voomAuthorNameForPost(post: VoomPost) {
    const character = characterById(post.charId);
    if (character) return getCharacterVoomDisplayName(character);
    const postUser = post.userId ? userById(post.userId) : null;
    return postUser ? getUserDisplayName(postUser) : post.authorName;
  }

  function voomAiAuthorNameForPost(post: VoomPost) {
    const postConversation = conversationForVoomPost(post);
    const character = characterById(post.charId) ?? (postConversation ? characterById(postConversation.charId) : null);
    if (character) return getCharacterAiName(character);
    const postUser = post.userId ? userById(post.userId) : null;
    return postUser ? getUserAiName(postUser) : post.authorName;
  }

  function notificationPreview(content: string, fallback: string) {
    const normalizedContent = content.replace(/\s+/g, ' ').trim() || fallback;
    return normalizedContent.length > 120 ? `${normalizedContent.slice(0, 117)}...` : normalizedContent;
  }

  function notifyCharacterMessages(conversation: Conversation, charMessages: ChatMessage[]) {
    const character = characterById(conversation.charId);
    const displayName = character ? getCharacterVoomDisplayName(character) : conversation.title || '角色';
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

  function formatVoomLikeEvent(likes: string[], authorName: string) {
    const likeNames = likes.map((like) => voomAiNameForIdentity(like)).filter(Boolean);
    return `【VOOM】${likeNames.join('、')} 赞了 ${voomAiNameForIdentity(authorName)} 的动态。`;
  }

  function createPersistableVoomPost(post: VoomPost): VoomPost {
    const rawPost = toRaw(post);
    return {
      ...rawPost,
      conversationIds: rawPost.conversationIds ? [...rawPost.conversationIds] : undefined,
      proactiveCommentExpansionCharacterIds: rawPost.proactiveCommentExpansionCharacterIds ? [...new Set(rawPost.proactiveCommentExpansionCharacterIds.map((id) => id.trim()).filter(Boolean))] : undefined,
      visibleCharacterIds: rawPost.visibleCharacterIds ? [...rawPost.visibleCharacterIds] : undefined,
      imageCandidates: rawPost.imageCandidates?.map((candidate) => ({ ...toRaw(candidate) })),
      comments: rawPost.comments.map((comment) => ({ ...toRaw(comment) })),
      likes: [...rawPost.likes]
    };
  }

  async function syncCharacterAvatarReferences(character: CharacterProfile) {
    const characterId = character.id;
    const avatar = character.avatar;
    const changedPosts: VoomPost[] = [];
    const changedFavorites: FavoriteMessageRecord[] = [];
    const changedTheaters: SmallTheater[] = [];

    voomPosts.value = voomPosts.value.map((post) => {
      if (post.authorType === 'user' || post.charId !== characterId || post.authorAvatar === avatar) return post;
      const nextPost = { ...post, authorAvatar: avatar };
      changedPosts.push(nextPost);
      return nextPost;
    });

    favorites.value = favorites.value.map((favorite) => {
      const favoriteConversation = conversationById(favorite.conversationId);
      const belongsToCharacter = favorite.characterId === characterId || favoriteConversation?.charId === characterId;
      if (!belongsToCharacter) return favorite;

      const nextAuthorAvatar = favorite.sender === 'char' ? avatar : favorite.authorAvatar;
      if (favorite.characterAvatar === avatar && favorite.authorAvatar === nextAuthorAvatar) return favorite;

      const nextFavorite = {
        ...favorite,
        authorAvatar: nextAuthorAvatar,
        characterAvatar: avatar
      };
      changedFavorites.push(nextFavorite);
      return nextFavorite;
    });

    smallTheaters.value = smallTheaters.value.map((theater) => {
      if (theater.charId !== characterId || theater.authorAvatar === avatar) return theater;
      const nextTheater = { ...theater, authorAvatar: avatar };
      changedTheaters.push(nextTheater);
      return nextTheater;
    });

    if (!changedPosts.length && !changedFavorites.length && !changedTheaters.length) return;

    await Promise.all([
      ...changedPosts.map((post) => putEntity('voomPosts', createPersistableVoomPost(post))),
      ...changedFavorites.map((favorite) => putEntity('favorites', toRaw(favorite))),
      ...changedTheaters.map((theater) => putEntity('smallTheaters', toRaw(theater)))
    ]);
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

  function sampleArrayEntries<T>(entries: T[], maxSamples = 6) {
    if (entries.length <= maxSamples) return entries;
    const sampledEntries: T[] = [];
    const step = Math.max(1, Math.floor(entries.length / maxSamples));
    for (let index = 0; index < entries.length && sampledEntries.length < maxSamples; index += step) {
      sampledEntries.push(entries[index]);
    }
    const lastEntry = entries.at(-1);
    if (lastEntry && sampledEntries[sampledEntries.length - 1] !== lastEntry) sampledEntries[sampledEntries.length - 1] = lastEntry;
    return sampledEntries;
  }

  function estimateArrayJsonBytes(entries: unknown[]) {
    if (!entries.length) return 0;
    if (entries.length <= 20) return estimateJsonBytes(entries);
    const sampledEntries = sampleArrayEntries(entries);
    const sampledBytes = sampledEntries.reduce<number>((total, entry) => total + estimateJsonBytes(entry), 0);
    return Math.round(sampledBytes / Math.max(1, sampledEntries.length) * entries.length);
  }

  function estimateGroupedArrayJsonBytes(groups: unknown[][]) {
    return groups.reduce((total, group) => total + estimateArrayJsonBytes(group), 0);
  }

  function estimateTransformedFreedBytes<T>(entries: T[], transform: (entry: T) => unknown) {
    if (!entries.length) return 0;
    const sampledEntries = entries.length <= 20 ? entries : sampleArrayEntries(entries);
    const sampledFreedBytes = sampledEntries.reduce<number>((total, entry) => total + estimateFreedBytes(entry, transform(entry)), 0);
    return Math.round(sampledFreedBytes / Math.max(1, sampledEntries.length) * entries.length);
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

  function stripMessageStickerCache(sticker: NonNullable<ChatMessage['sticker']>) {
    const { cachedImageUrl: _cachedImageUrl, ...restSticker } = sticker;
    return {
      ...restSticker,
      imageUrl: stripInlineMediaUrl(sticker.imageUrl, stickerBackupPlaceholder)
    };
  }

  function stripStickerLocalCache(sticker: Sticker): Sticker {
    const { cachedImageUrl: _cachedImageUrl, cachedImageUpdatedAt: _cachedImageUpdatedAt, ...restSticker } = sticker;
    return {
      ...restSticker,
      imageUrl: stripInlineMediaUrl(sticker.imageUrl, stickerBackupPlaceholder)
    };
  }

  function stripChatImageCache(image: ChatImageAttachment): ChatImageAttachment {
    return {
      ...image,
      url: stripInlineMediaUrl(image.url),
      candidates: image.candidates?.map((candidate) => ({ ...candidate, image: stripInlineMediaUrl(candidate.image) })).filter((candidate) => candidate.image)
    };
  }

  function isUserSentInlineImage(image: ChatImageAttachment | undefined) {
    return Boolean(image && (image.kind === 'photo' || image.kind === 'local') && isInlineMediaUrl(image.url));
  }

  function stripUserSentImageAttachment(image: ChatImageAttachment): ChatImageAttachment {
    return {
      ...image,
      kind: 'description',
      url: '',
      candidates: undefined
    };
  }

  function stripUserSentImageData(message: ChatMessage): ChatMessage {
    let changed = false;
    const nextImage = message.sender === 'user' && isUserSentInlineImage(message.image)
      ? stripUserSentImageAttachment(message.image!)
      : message.image;
    if (nextImage !== message.image) changed = true;

    const nextQuoteImage = message.quote?.sender === 'user' && isUserSentInlineImage(message.quote.image)
      ? stripUserSentImageAttachment(message.quote.image!)
      : message.quote?.image;
    if (nextQuoteImage !== message.quote?.image) changed = true;

    return changed
      ? {
        ...message,
        image: nextImage,
        quote: message.quote ? { ...message.quote, image: nextQuoteImage } : message.quote
      }
      : message;
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
      sticker: message.sticker ? stripMessageStickerCache(message.sticker) : undefined,
      image: message.image ? stripChatImageCache(message.image) : undefined,
      voice: message.voice ? stripVoiceAudioCache(message.voice) : undefined,
      quote: message.quote ? {
        ...message.quote,
        sticker: message.quote.sticker ? stripMessageStickerCache(message.quote.sticker) : undefined,
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

  function formatTransferReceiptContent(transfer: Pick<ChatTransferAttachment, 'amount' | 'note' | 'status'>) {
    const statusText = transfer.status === 'accepted'
      ? '已接收'
      : transfer.status === 'rejected'
        ? '已拒绝'
        : '待处理';
    return `[转账回执] ${statusText} ¥${transfer.amount}${transfer.note ? ` · ${transfer.note}` : ''}`;
  }

  function formatTransferMessageContent(transfer: ChatTransferAttachment) {
    return transfer.responseToMessageId
      ? formatTransferReceiptContent(transfer)
      : formatTransferContent(transfer);
  }

  function musicTrackArtists(track?: MusicTrack | null) {
    return track?.artists?.filter(Boolean).join(' / ') || '未知歌手';
  }

  function musicTrackTitle(track?: MusicTrack | null) {
    if (!track) return '一起听';
    const artists = musicTrackArtists(track);
    return artists ? `${track.name} - ${artists}` : track.name;
  }

  function normalizeMusicListenInviteAttachment(payload: Partial<Pick<ChatMusicListenInviteAttachment, 'note' | 'track'>> = {}): ChatMusicListenInviteAttachment {
    return {
      status: 'pending',
      note: payload.note?.trim() || undefined,
      track: payload.track
    };
  }

  function formatMusicListenInviteContent(invitation: Pick<ChatMusicListenInviteAttachment, 'status' | 'note' | 'track'>) {
    const statusText = {
      pending: '等待选择',
      accepted: '正在一起听',
      rejected: '已拒绝'
    }[invitation.status];
    return `[一起听] ${musicTrackTitle(invitation.track)}${invitation.note ? ` · ${invitation.note}` : ''} · ${statusText}`;
  }

  function musicListeningContextForConversation(conversationId: string): MusicListeningContext | undefined {
    const partner = musicPlayer.listeningPartner;
    if (!partner || partner.conversationId !== conversationId) return undefined;
    const conversation = conversationById(conversationId);
    const character = characterById(partner.characterId || conversation?.charId || '');
    const boundUser = userById(partner.userId || conversation?.userId || '') ?? user.value;
    return {
      active: true,
      conversationId,
      characterId: partner.characterId,
      characterName: character ? getCharacterAiName(character) : '角色',
      userId: partner.userId,
      inviter: partner.inviter,
      joinedAt: partner.joinedAt,
      currentTrack: musicPlayer.currentTrack ?? undefined,
      currentTime: musicPlayer.currentTime,
      duration: musicPlayer.duration,
      lyricLine: musicPlayer.currentLyricLine || undefined
    };
  }

  function syncMusicFavoriteTracks(tracks: MusicTrack[]) {
    musicFavoriteTracks.value = [...tracks].sort((left, right) => (right.addedAt ?? 0) - (left.addedAt ?? 0));
  }

  async function saveMusicFavoriteTrack(track: MusicTrack) {
    const now = Date.now();
    const existing = musicFavoriteTracks.value.find((entry) => entry.id === track.id);
    const nextTrack = mergeMusicTrack(track, {
      addedAt: existing?.addedAt ?? track.addedAt ?? now,
      updatedAt: now
    });
    const nextTracks = musicFavoriteTracks.value.filter((entry) => entry.id !== nextTrack.id);
    syncMusicFavoriteTracks([nextTrack, ...nextTracks]);
    await putEntity('musicFavoriteTracks', nextTrack);
    return nextTrack;
  }

  function musicSourceForSearch(source?: string) {
    const normalizedSource = source?.trim().toLocaleLowerCase();
    return normalizedSource === 'kuwo' || normalizedSource === 'joox' ? normalizedSource : 'netease';
  }

  async function withMusicCover(track: MusicTrack) {
    if (track.coverUrl || !track.picId) return track;
    const coverUrl = await fetchMusicCoverUrl(track);
    return coverUrl ? mergeMusicTrack(track, { coverUrl }) : track;
  }

  async function ensurePlayableMusicTrack(track: MusicTrack) {
    const coveredTrack = await withMusicCover(track);
    if (coveredTrack.audioUrl) return coveredTrack;
    const audioUrl = await fetchMusicAudioUrl(coveredTrack);
    return mergeMusicTrack(coveredTrack, { audioUrl });
  }

  async function resolveMusicTrackFromAction(action: { query?: string; source?: string; track?: Partial<MusicTrack> } | null | undefined) {
    if (!action) return null;
    const draft = action.track;
    if (draft?.id && draft.platformId && draft.source && draft.name) {
      return withMusicCover({
        id: draft.id,
        platformId: draft.platformId,
        urlId: draft.urlId,
        source: draft.source,
        name: draft.name,
        artists: draft.artists ?? [],
        album: draft.album ?? '',
        picId: draft.picId ?? '',
        lyricId: draft.lyricId ?? '',
        coverUrl: draft.coverUrl,
        audioUrl: draft.audioUrl,
        duration: draft.duration,
        addedAt: draft.addedAt,
        updatedAt: draft.updatedAt
      });
    }
    const query = action.query?.trim() || draft?.name?.trim() || '';
    if (!query) return null;
    const tracks = await searchMusicTracks(query, musicSourceForSearch(action.source), 1, 8);
    return tracks[0] ? withMusicCover(tracks[0]) : null;
  }

  async function playMusicTrackForConversation(conversationId: string, track: MusicTrack) {
    const playableTrack = await ensurePlayableMusicTrack(track);
    musicPlayer.setCurrentTrack(playableTrack);
    await musicPlayer.playTrack(playableTrack);
    if (musicFavoriteTracks.value.some((entry) => entry.id === playableTrack.id)) await saveMusicFavoriteTrack(playableTrack);
    return playableTrack;
  }

  function startMusicListenTogether(conversationId: string, inviter: 'user' | 'char') {
    const conversation = conversationById(conversationId);
    if (!conversation) return false;
    const character = characterById(conversation.charId);
    const boundUser = userById(conversation.userId || character?.boundUserId || '') ?? user.value;
    if (!character || !boundUser) return false;
    musicPlayer.startListenTogether({
      conversationId,
      characterId: character.id,
      userId: boundUser.id,
      inviter
    });
    return true;
  }

  async function applyCharacterMusicActions(conversationId: string, actions: Array<{ type: string; query?: string; source?: string; track?: Partial<MusicTrack> }>) {
    if (!musicPlayer.isListeningWithConversation(conversationId)) return [];
    const conversation = conversationById(conversationId);
    const character = conversation ? characterById(conversation.charId) : null;
    const characterName = character ? getCharacterAiName(character) : '角色';
    const notices: string[] = [];
    for (const action of actions.slice(0, 4)) {
      try {
        if (action.type === 'favorite_current') {
          const track = musicPlayer.currentTrack;
          if (track) {
            await saveMusicFavoriteTrack(track);
            notices.push(`${characterName}把《${track.name}》加入了我的喜欢音乐。`);
          }
          continue;
        }
        const track = await resolveMusicTrackFromAction(action);
        if (!track) continue;
        if (action.type === 'favorite_track') {
          await saveMusicFavoriteTrack(track);
          notices.push(`${characterName}把《${track.name}》加入了我的喜欢音乐。`);
          continue;
        }
        if (action.type === 'play') {
          const playableTrack = await playMusicTrackForConversation(conversationId, track);
          notices.push(`${characterName}切到了《${playableTrack.name}》。`);
        }
      } catch (error) {
        console.warn('Music action failed.', error);
      }
    }
    return notices;
  }

  function createSmallTheaterUrl(theaterId: string) {
    return `/theaters/${encodeURIComponent(theaterId)}`;
  }

  function normalizeSmallTheaterLinkAttachment(theater: SmallTheater): ChatSmallTheaterLinkAttachment {
    const visibleContent = getSmallTheaterVisibleText(theater.html).slice(0, 20000);
    return {
      theaterId: theater.id,
      title: theater.title.trim() || '小剧场',
      summary: theater.summary.trim() || '互动番外页面',
      url: createSmallTheaterUrl(theater.id),
      content: visibleContent || theater.summary.trim() || theater.title.trim() || '这个小剧场暂时没有可提取的正文。'
    };
  }

  function formatSmallTheaterLinkContent(link: Pick<ChatSmallTheaterLinkAttachment, 'title' | 'summary' | 'url'>) {
    return `[网站链接] ${link.title}${link.summary ? ` · ${link.summary}` : ''} · ${link.url}`;
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
      musicListenInvite: quote.musicListenInvite ? { ...quote.musicListenInvite } : undefined,
      theaterLink: quote.theaterLink ? { ...quote.theaterLink } : undefined,
      offlineInvitation: quote.offlineInvitation ? { ...quote.offlineInvitation } : undefined
    };
  }

  function messageReadableContent(message: ChatMessage) {
    if (message.sticker) return `[Sticker] ${message.sticker.description}`.trim();
    if (message.image) return `[图片] ${message.image.description}`.trim();
    if (message.voice) return `[语音] ${message.voice.transcript}`.trim();
    if (message.location) return formatLocationContent(message.location).trim();
    if (message.transfer) return formatTransferMessageContent(message.transfer).trim();
    if (message.musicListenInvite) return formatMusicListenInviteContent(message.musicListenInvite).trim();
    if (message.theaterLink) return formatSmallTheaterLinkContent(message.theaterLink).trim();
    if (message.offlineInvitation) return formatOfflineInvitationContent(message.offlineInvitation).trim();
    return message.content.trim();
  }

  function favoriteKindForMessage(message: ChatMessage): FavoriteMessageKind {
    if (message.sticker) return 'sticker';
    if (message.image) return 'image';
    if (message.voice) return 'voice';
    if (message.location) return 'location';
    if (message.transfer) return 'transfer';
    if (message.musicListenInvite) return 'musicListenInvite';
    if (message.theaterLink) return 'theaterLink';
    if (message.offlineInvitation) return 'offlineInvitation';
    if (message.displayStyle === 'narration') return 'narration';
    return 'text';
  }

  function canFavoriteMessage(message: ChatMessage) {
    if (message.voice) return true;
    if (message.image) return Boolean(message.image.url);
    if (message.sticker || message.location || message.transfer || message.musicListenInvite || message.theaterLink || message.offlineInvitation) return false;
    return Boolean(message.content.trim() || message.displayStyle === 'narration');
  }

  function normalizeFavorites(entries: FavoriteMessageRecord[]) {
    return entries
      .filter((entry) => entry?.id && entry.sourceMessageId && entry.message)
      .map((entry) => {
        const conversation = conversationById(entry.conversationId);
        const character = entry.characterId ? characterById(entry.characterId) : conversation ? characterById(conversation.charId) : null;
        const boundUser = entry.userId ? userById(entry.userId) : conversation ? userById(conversation.userId) : null;
        const message = normalizeStoredMessageIdentityReferences(entry.message);
        const authorName = entry.sender === 'char'
          ? character ? getCharacterAiName(character) : voomAiNameForIdentity(entry.authorName, entry.characterId)
          : entry.sender === 'user'
            ? boundUser ? getUserAiName(boundUser) : voomAiNameForIdentity(entry.authorName, entry.userId)
            : '系统';
        return {
          ...entry,
          authorName,
          characterName: character ? getCharacterAiName(character) : entry.characterName ? voomAiNameForIdentity(entry.characterName, entry.characterId) : undefined,
          userName: boundUser ? getUserAiName(boundUser) : entry.userName ? voomAiNameForIdentity(entry.userName, entry.userId) : undefined,
          message,
          kind: favoriteKindForMessage(message),
          messageCreatedAt: Number.isFinite(entry.messageCreatedAt) ? entry.messageCreatedAt : message.createdAt,
          favoritedAt: Number.isFinite(entry.favoritedAt) ? entry.favoritedAt : Date.now()
        };
      })
      .filter((entry) => canFavoriteMessage(entry.message))
      .sort((left, right) => right.favoritedAt - left.favoritedAt);
  }

  const sortedFavorites = computed(() => [...favorites.value].sort((left, right) => right.favoritedAt - left.favoritedAt));

  function messageAuthorName(message: ChatMessage) {
    const conversation = conversationById(message.conversationId);
    if (message.sender === 'char') {
      const character = conversation ? characterById(conversation.charId) : null;
      return character ? getCharacterAiName(character) : '角色';
    }
    if (message.sender === 'user') {
      const character = conversation ? characterById(conversation.charId) : null;
      const boundUser = character ? userById(character.boundUserId) : null;
      return getUserAiName(boundUser ?? user.value);
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
      musicListenInvite: message.musicListenInvite ? { ...message.musicListenInvite } : undefined,
      theaterLink: message.theaterLink ? { ...message.theaterLink } : undefined,
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
      characterName: character ? getCharacterAiName(character) : undefined,
      characterAvatar: character?.avatar,
      userId: boundUser?.id,
      userName: boundUser ? getUserAiName(boundUser) : undefined,
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
    if (!canFavoriteMessage(message)) return null;
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
    await touchConversationAfterMessageChange(nextMessage.conversationId, editedAt);
    return nextMessage;
  }

  async function updateMessageTransfer(messageId: string, transfer: Pick<ChatTransferAttachment, 'amount' | 'note' | 'status'>) {
    const amount = String(transfer.amount ?? '').replace(/[￥¥,\s]/g, '').trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return null;
    const messageIndex = messages.value.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return null;
    const existingMessage = messages.value[messageIndex];
    if (!existingMessage.transfer) return null;
    const isReceipt = Boolean(existingMessage.transfer.responseToMessageId);
    const requestedStatus: ChatTransferStatus = ['accepted', 'rejected'].includes(transfer.status) ? transfer.status : 'pending';
    const status: ChatTransferStatus = isReceipt && requestedStatus === 'pending'
      ? existingMessage.transfer.status === 'rejected' ? 'rejected' : 'accepted'
      : requestedStatus;
    const relatedReceiptMessages = messages.value.filter((message) => message.transfer?.responseToMessageId === existingMessage.id);
    const editedAt = Date.now();
    const note = transfer.note?.trim() || undefined;

    if (isReceipt) {
      const respondedAt = existingMessage.transfer.respondedAt ?? editedAt;
      const nextTransfer: ChatTransferAttachment = {
        ...existingMessage.transfer,
        amount,
        currency: existingMessage.transfer.currency ?? 'CNY',
        note,
        status,
        respondedAt,
        responseToMessageId: existingMessage.transfer.responseToMessageId
      };
      const nextMessage: ChatMessage = {
        ...existingMessage,
        content: formatTransferReceiptContent(nextTransfer),
        transfer: nextTransfer,
        editedAt
      };
      messages.value[messageIndex] = nextMessage;

      const originalMessageIndex = messages.value.findIndex((message) => message.id === nextTransfer.responseToMessageId);
      const originalMessage = originalMessageIndex >= 0 ? messages.value[originalMessageIndex] : null;
      const nextMessages: ChatMessage[] = [nextMessage];
      if (originalMessage?.transfer) {
        const { responseToMessageId, ...originalTransferBase } = originalMessage.transfer;
        void responseToMessageId;
        const originalTransfer: ChatTransferAttachment = {
          ...originalTransferBase,
          amount,
          currency: originalTransferBase.currency ?? 'CNY',
          note,
          status,
          respondedAt
        };
        const nextOriginalMessage: ChatMessage = {
          ...originalMessage,
          content: formatTransferContent(originalTransfer),
          transfer: originalTransfer,
          editedAt
        };
        messages.value[originalMessageIndex] = nextOriginalMessage;
        nextMessages.push(nextOriginalMessage);
      }

      await Promise.all(nextMessages.map((message) => putEntity('messages', message)));
      await touchConversationAfterMessageChange(nextMessage.conversationId, editedAt);
      return nextMessage;
    }

    const receiptRespondedAt = relatedReceiptMessages.find((message) => message.transfer?.respondedAt)?.transfer?.respondedAt;
    const respondedAt = status === 'pending' ? undefined : existingMessage.transfer.respondedAt ?? receiptRespondedAt ?? editedAt;
    const nextTransfer: ChatTransferAttachment = {
      ...existingMessage.transfer,
      amount,
      currency: existingMessage.transfer.currency ?? 'CNY',
      note,
      status,
      ...(respondedAt ? { respondedAt } : {})
    };
    if (status === 'pending') delete nextTransfer.respondedAt;
    delete nextTransfer.responseToMessageId;
    const nextMessage: ChatMessage = {
      ...existingMessage,
      content: formatTransferContent(nextTransfer),
      transfer: nextTransfer,
      editedAt
    };
    messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    if (status === 'pending') {
      if (relatedReceiptMessages.length) await deleteMessages(relatedReceiptMessages.map((message) => message.id));
      await touchConversationAfterMessageChange(nextMessage.conversationId, editedAt);
      return nextMessage;
    }

    const receiptMessages = relatedReceiptMessages.length
      ? relatedReceiptMessages.map((receiptMessage) => {
          const receiptTransfer: ChatTransferAttachment = {
            ...receiptMessage.transfer,
            amount: nextTransfer.amount,
            currency: nextTransfer.currency,
            note: nextTransfer.note,
            status,
            respondedAt,
            responseToMessageId: nextMessage.id
          };
          const nextReceiptMessage: ChatMessage = {
            ...receiptMessage,
            content: formatTransferReceiptContent(receiptTransfer),
            transfer: receiptTransfer,
            editedAt
          };
          const receiptIndex = messages.value.findIndex((message) => message.id === receiptMessage.id);
          if (receiptIndex >= 0) messages.value[receiptIndex] = nextReceiptMessage;
          return nextReceiptMessage;
        })
      : (() => {
          const receiptTransfer: ChatTransferAttachment = {
            amount: nextTransfer.amount,
            currency: nextTransfer.currency,
            note: nextTransfer.note,
            status,
            respondedAt,
            responseToMessageId: nextMessage.id
          };
          return [{
            id: createId('msg'),
            conversationId: nextMessage.conversationId,
            sender: nextMessage.sender === 'char' ? 'user' : 'char',
            mode: nextMessage.mode,
            content: formatTransferReceiptContent(receiptTransfer),
            transfer: receiptTransfer,
            createdAt: editedAt + 1,
            status: 'sent' as const
          } satisfies ChatMessage];
        })();

    if (!relatedReceiptMessages.length) messages.value.push(...receiptMessages);
    await Promise.all(receiptMessages.map((message) => putEntity('messages', message)));
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
    const authorName = voomAiAuthorNameForPost(post);
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
    await saveUserProfile({
      ...user.value,
      profile: normalizeVisualProfile({
        ...nextProfile,
        nickname: user.value.nickname,
        bio: user.value.signature
      }, user.value)
    });
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
    await syncCharacterAvatarReferences(normalizedCharacter);

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
    await syncCharacterAvatarReferences(normalizedCharacter);
  }

  async function deleteCharacterProfileHistoryEntry(characterId: string, entryId: string) {
    const character = characterById(characterId);
    if (!character?.profileHistory?.length) return;
    const nextProfileHistory = character.profileHistory.filter((entry) => entry.id !== entryId);
    if (nextProfileHistory.length === character.profileHistory.length) return;
    await saveCharacterSnapshot({
      ...character,
      profileHistory: nextProfileHistory
    });
  }

  async function clearCharacterProfileHistory(characterId: string) {
    const character = characterById(characterId);
    if (!character?.profileHistory?.length) return;
    await saveCharacterSnapshot({
      ...character,
      profileHistory: []
    });
  }

  async function updateCharacterMindState(characterId: string, lines: unknown, conversationId: string, options: { replyBatchId?: string; profileTheme?: ProfileTheme | null; profileThemeContent?: string } = {}) {
    const character = characterById(characterId);
    const mindStateLines = normalizeCharacterMindStateLines(lines);
    if (!character) return;
    const sourceReplyBatchId = String(options.replyBatchId ?? '').trim();
    const profileTheme = options.profileTheme ?? null;
    const isDefaultTheme = isDefaultProfileTheme(profileTheme);
    const profileThemeContent = extractProfileThemeContent(options.profileThemeContent ?? '', profileTheme?.regex ?? '');
    const profileThemeLines = normalizeProfileThemeContentLines(profileThemeContent);
    const profileThemeHtml = profileTheme && !isDefaultTheme ? renderProfileThemeHtml(profileThemeContent, profileTheme.template) : '';
    const nextMindStateLines = isDefaultTheme
      ? (mindStateLines.length ? mindStateLines : profileThemeLines).slice(0, 5)
      : normalizeCharacterMindStateLines(character.mindState?.lines);
    if (!nextMindStateLines.length && !profileThemeLines.length) return;

    await saveCharacter({
      ...character,
      mindState: {
        lines: nextMindStateLines,
        profileThemeId: profileTheme?.id,
        profileThemeName: profileTheme?.name,
        profileThemeContent: profileThemeLines.join('\n') || (isDefaultTheme ? nextMindStateLines.join('\n') : undefined),
        profileThemeHtml: profileThemeHtml || undefined,
        profileThemeCss: profileTheme?.css || undefined,
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

    if (profileTheme && !isDefaultTheme && (profileThemeHtml || profileThemeContent)) {
      await createProfileHomepageRecord({
        charId: character.id,
        conversationId,
        replyBatchId: sourceReplyBatchId || undefined,
        themeId: profileTheme.id,
        themeName: profileTheme.name,
        content: profileThemeContent,
        html: profileThemeHtml,
        css: profileTheme.css || ''
      });
    }
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
    const conversation = conversationById(nextSettings.conversationId);
    const normalizedSettings = normalizeConversationSettings(nextSettings, nextSettings.conversationId, conversation?.activeMode);
    const index = conversationSettings.value.findIndex((entry) => entry.conversationId === normalizedSettings.conversationId);
    if (index >= 0) conversationSettings.value[index] = normalizedSettings;
    else conversationSettings.value.push(normalizedSettings);

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
    const previousSticker = stickers.value.find((sticker) => sticker.id === nextSticker.id);
    const normalizedSticker = normalizeSticker({
      ...nextSticker,
      cachedImageUrl: previousSticker && previousSticker.imageUrl === nextSticker.imageUrl ? nextSticker.cachedImageUrl : undefined,
      cachedImageUpdatedAt: previousSticker && previousSticker.imageUrl === nextSticker.imageUrl ? nextSticker.cachedImageUpdatedAt : undefined,
      groupIds,
      updatedAt: Date.now()
    }, fallbackGroupId);
    if (!normalizedSticker) return;
    const index = stickers.value.findIndex((sticker) => sticker.id === normalizedSticker.id);
    if (index >= 0) stickers.value[index] = normalizedSticker;
    else stickers.value.unshift(normalizedSticker);
    await putEntity('stickers', normalizedSticker);
    if (!normalizedSticker.cachedImageUrl) queueStickerCache(normalizedSticker);
  }

  function isPersistableStickerSourceUrl(imageUrl: string) {
    return /^https?:\/\//i.test(imageUrl.trim());
  }

  async function persistStickerCacheInBackground(sticker: Sticker, options: { readImageUrl?: () => Promise<string>; cleanupImageUrl?: () => void } = {}) {
    try {
      const cachedImageUrl = await cacheStickerImageUrl(sticker.imageUrl, options.readImageUrl);
      const currentSticker = stickers.value.find((item) => item.id === sticker.id);
      if (!currentSticker) return;
      if (currentSticker.imageUrl !== sticker.imageUrl) return;
      let nextSticker = currentSticker;
      if (cachedImageUrl) {
        nextSticker = {
          ...currentSticker,
          imageUrl: isPersistableStickerSourceUrl(currentSticker.imageUrl) ? currentSticker.imageUrl : stickerBackupPlaceholder,
          cachedImageUrl,
          cachedImageUpdatedAt: Date.now()
        };
      } else if (!isPersistableStickerSourceUrl(currentSticker.imageUrl)) {
        nextSticker = { ...currentSticker, imageUrl: stickerBackupPlaceholder };
      }
      const index = stickers.value.findIndex((item) => item.id === nextSticker.id);
      if (index >= 0) stickers.value[index] = nextSticker;
      await putEntity('stickers', nextSticker);
    } finally {
      options.cleanupImageUrl?.();
    }
  }

  function queueStickerCache(sticker: Sticker, options: { readImageUrl?: () => Promise<string>; cleanupImageUrl?: () => void } = {}) {
    stickerImportCacheQueue = stickerImportCacheQueue
      .then(() => persistStickerCacheInBackground(sticker, options))
      .catch((error) => {
        console.warn('Sticker background persistence failed.', error);
        options.cleanupImageUrl?.();
      });
  }

  function queueImportedStickerCache(sticker: Sticker, draft: StickerImportDraft) {
    queueStickerCache(sticker, {
      readImageUrl: draft.cacheImageUrl,
      cleanupImageUrl: draft.cleanupImageUrl
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
    await Promise.all(createdStickers.map((sticker) => putEntity('stickers', sticker)));
    createdEntries.forEach((entry) => queueImportedStickerCache(entry.sticker, entry.draft));
    return createdStickers;
  }

  function queueMissingStickerImageCaches(targetStickers = stickers.value) {
    targetStickers
      .filter((sticker) => !sticker.cachedImageUrl && shouldLocalizeStickerImageUrl(sticker.imageUrl))
      .forEach((sticker) => queueStickerCache(sticker));
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
      title: getCharacterVoomDisplayName(character),
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
    const relatedTheaterTopics = smallTheaterTopics.value.filter((topic) => topic.charId === characterId);
    const relatedTheaters = smallTheaters.value.filter((theater) => theater.charId === characterId || theater.conversationId === conversation?.id);
    const relatedMessages = conversation ? messages.value.filter((message) => message.conversationId === conversation.id) : [];
    const relatedLocalWorldBooks = worldBooks.value.filter((book) => book.scope === 'local' && character.localWorldBookIds.includes(book.id));
    const owner = userById(character.boundUserId);

    characters.value = characters.value.filter((entry) => entry.id !== characterId);
    if (conversation) {
      conversations.value = conversations.value.filter((entry) => entry.id !== conversation.id);
      messages.value = messages.value.filter((message) => message.conversationId !== conversation.id);
    }
    voomPosts.value = voomPosts.value.filter((post) => post.charId !== characterId && post.conversationId !== conversation?.id);
    smallTheaterTopics.value = smallTheaterTopics.value.filter((topic) => topic.charId !== characterId);
    smallTheaters.value = smallTheaters.value.filter((theater) => theater.charId !== characterId && theater.conversationId !== conversation?.id);
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
      ...relatedTheaterTopics.map((topic) => deleteEntity('smallTheaterTopics', topic.id)),
      ...relatedTheaters.map((theater) => deleteEntity('smallTheaters', theater.id)),
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
    const relatedMemoryAtoms = conversationId ? conversationMemoryAtoms.value.filter((atom) => atom.conversationId === conversationId) : [];
    const characterNameKeys = new Set([character.id, character.nickname, character.name, getCharacterVoomAuthorName(character)]
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
    conversationMemoryAtoms.value = conversationMemoryAtoms.value.filter((atom) => atom.conversationId !== conversationId);
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
      ...relatedMemoryAtoms.map((atom) => deleteEntity('conversationMemoryAtoms', atom.id)),
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

  async function compactChatImageForBackup(image: ChatImageAttachment): Promise<ChatImageAttachment> {
    const sourceUrl = image.url?.trim() ?? '';
    const nextUrl = sourceUrl ? await compactInlineDisplayImage(sourceUrl) : image.url;
    const nextCandidates = sourceUrl && nextUrl
      ? image.candidates
        ?.filter((candidate) => candidate.image.trim() === sourceUrl)
        .map((candidate) => ({ ...candidate, image: nextUrl }))
      : undefined;
    return {
      ...image,
      url: nextUrl,
      candidates: nextCandidates?.length ? nextCandidates : undefined
    };
  }

  async function compactMessageForBackup(message: ChatMessage): Promise<ChatMessage> {
    const nextImage = message.image ? await compactChatImageForBackup(message.image) : message.image;
    const nextQuoteImage = message.quote?.image ? await compactChatImageForBackup(message.quote.image) : message.quote?.image;
    return {
      ...message,
      image: nextImage,
      quote: message.quote ? { ...message.quote, image: nextQuoteImage } : message.quote
    };
  }

  async function compactVoomPostForBackup(post: VoomPost): Promise<VoomPost> {
    const sourceImage = post.image?.trim() ?? '';
    const nextImage = sourceImage ? await compactInlineDisplayImage(sourceImage) : post.image;
    const nextCandidates = sourceImage && nextImage
      ? post.imageCandidates
        ?.filter((candidate) => candidate.image.trim() === sourceImage)
        .map((candidate) => ({ ...candidate, image: nextImage }))
      : undefined;
    return {
      ...post,
      image: nextImage,
      imageCandidates: nextCandidates?.length ? nextCandidates : undefined
    };
  }

  async function compactGeneratedImageForBackup(record: GeneratedImageRecord): Promise<GeneratedImageRecord> {
    return {
      ...record,
      imageUrl: await compactInlineDisplayImage(record.imageUrl)
    };
  }

  async function compactSnapshotMediaForBackup(snapshot: AppSnapshot): Promise<AppSnapshot> {
    const messages: ChatMessage[] = [];
    for (const message of snapshot.messages) messages.push(await compactMessageForBackup(message));

    const voomPostsForBackup: VoomPost[] = [];
    for (const post of snapshot.voomPosts) voomPostsForBackup.push(await compactVoomPostForBackup(post));

    const generatedImagesForBackup: GeneratedImageRecord[] = [];
    for (const record of snapshot.generatedImages ?? []) generatedImagesForBackup.push(await compactGeneratedImageForBackup(record));

    const favoritesForBackup: FavoriteMessageRecord[] = [];
    for (const favorite of snapshot.favorites ?? []) {
      favoritesForBackup.push({
        ...favorite,
        message: await compactMessageForBackup(favorite.message)
      });
    }

    return {
      ...snapshot,
      messages,
      voomPosts: voomPostsForBackup,
      generatedImages: generatedImagesForBackup,
      favorites: favoritesForBackup
    };
  }

  async function createBackupFile(onProgress?: BackupProgressCallback) {
    if (!ready.value) await hydrate();
    await onProgress?.('正在读取本地数据', 20);
    const snapshot = await loadSnapshot();
    await onProgress?.('正在整理备份内容', 65);
    const backupSnapshot = await compactSnapshotMediaForBackup({
      ...snapshot,
      messages: snapshot.messages.map((message) => normalizeStoredMessageIdentityReferences(message)),
      voomPosts: snapshot.voomPosts.map((post) => normalizeStoredVoomPostIdentityReferences(post)),
      smallTheaters: normalizeStoredSmallTheaters(snapshot.smallTheaters ?? []),
      musicCommentThreads: normalizeStoredMusicCommentThreads(snapshot.musicCommentThreads ?? []),
      favorites: normalizeFavorites(snapshot.favorites ?? [])
    });
    return createLinkBackupFile(backupSnapshot);
  }

  async function importBackupSnapshot(snapshot: AppSnapshot, options: ImportBackupOptions = {}): Promise<ImportBackupResult> {
    await options.onProgress?.('正在整理导入数据', 45);
    const normalizedSnapshot = keepDeviceGitHubBackupSettings(normalizeSnapshotForRestore(snapshot));
    const slimmedForMobile = shouldUseMobileSafeRestore(options.sourceByteSize);
    const restorableSnapshot = slimmedForMobile
      ? slimOversizedRestoreSnapshot(normalizedSnapshot)
      : stripRestoreVectorCaches(normalizedSnapshot);
    const preparedSnapshot = prepareSnapshotForStore(restorableSnapshot);
    const persistentStorageGranted = await requestPersistentStorage();
    await options.onProgress?.(slimmedForMobile ? '备份较大，正在写入轻量数据' : '正在写入本地数据库', 75);

    try {
      await replaceSnapshot(preparedSnapshot);
    } catch (error) {
      throw normalizeImportPersistenceError(error);
    }

    await options.onProgress?.('正在刷新本地数据', 92);
    markRestoredGlobalNoticesSeen(preparedSnapshot);
    applySnapshotToStore(preparedSnapshot);
    queueMissingStickerImageCaches(preparedSnapshot.stickers);
    void refreshEnabledVendorModels();
    return { slimmedForMobile, persistentStorageGranted };
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
      let downloadProgressPercent = 25;
      const onDownloadProgress = async ({ label, percent }: { label: string; percent: number }) => {
        downloadProgressPercent = Math.max(downloadProgressPercent, percent);
        await saveGitHubBackupProgress('downloading', label, downloadProgressPercent);
      };
      const backupText = ref
        ? await downloadGitHubBackupVersion({
            token: config.token,
            owner: config.owner,
            repo: config.repo,
            branch: config.branch,
            path: config.path
          }, ref, { onProgress: onDownloadProgress })
        : await downloadGitHubBackup({
            token: config.token,
            owner: config.owner,
            repo: config.repo,
            branch: config.branch,
            path: config.path
          }, { onProgress: onDownloadProgress });
      await saveGitHubBackupProgress('restoring', '正在解析 GitHub 备份', 76);
      const backupFile = parseLinkBackupFileText(backupText);
      const currentBackupConfig = settings.value.githubBackup;
      await saveGitHubBackupProgress('restoring', '正在恢复 GitHub 备份到本地', 77);
      let restoreProgressPercent = 76;
      await importBackupSnapshot(backupFile.snapshot, {
        sourceByteSize: new Blob([backupText]).size,
        onProgress: async (label, percent) => {
          const mappedPercent = 76 + Math.round(Math.min(100, Math.max(0, percent)) * 0.18);
          restoreProgressPercent = Math.max(restoreProgressPercent, mappedPercent);
          await saveGitHubBackupProgress('restoring', label, restoreProgressPercent);
        }
      });
      await saveGitHubBackupProgress('checking', '正在刷新 GitHub 备份记录', 96);
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
    await putEntity('settings', normalizedSettings, 'main');
    settings.value = normalizedSettings;
    void refreshEnabledVendorModels();
  }

  async function addGeneratedImage(record: Omit<GeneratedImageRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
    const normalizedRecord = normalizeGeneratedImages([{
      id: record.id || createId('image'),
      provider: record.provider,
      imageUrl: record.imageUrl,
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
    const normalizedImageUrl = imageUrl.trim();
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
      cachedImageUrl: sticker.cachedImageUrl,
      cachedImageUpdatedAt: sticker.cachedImageUpdatedAt,
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
        imageUrl: resolvedSticker.imageUrl,
        cachedImageUrl: resolvedSticker.cachedImageUrl
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
      const cachedImageUrl = sticker.cachedImageUrl || await cacheStickerImageUrl(sticker.imageUrl);
      const nextMessage: ChatMessage = {
        ...message,
        sticker: {
          ...sticker,
          cachedImageUrl
        }
      };
      const messageIndex = messages.value.findIndex((item) => item.id === nextMessage.id);
      if (messageIndex >= 0) messages.value[messageIndex] = nextMessage;
    }
  }

  function getDataInventory() {
    const sections = [
      {
        id: 'profiles',
        label: '账号与角色',
        description: '用户资料、角色资料、头像与绑定关系',
        count: users.value.length + characters.value.length,
        bytes: estimateGroupedArrayJsonBytes([users.value, characters.value]),
        protected: true
      },
      {
        id: 'chatData',
        label: '聊天与会话',
        description: '会话列表、聊天消息、单聊设置',
        count: conversations.value.length + messages.value.length + conversationSettings.value.length,
        bytes: estimateGroupedArrayJsonBytes([conversations.value, messages.value, conversationSettings.value]),
        clearable: true
      },
      {
        id: 'favorites',
        label: '收藏夹',
        description: '收藏消息与收藏时保存的快照',
        count: favorites.value.length,
        bytes: estimateArrayJsonBytes(favorites.value),
        clearable: true
      },
      {
        id: 'conversationMemories',
        label: '记忆摘要',
        description: '长期记忆摘要与回忆线索',
        count: conversationMemories.value.length + conversationMemoryAtoms.value.length,
        bytes: estimateGroupedArrayJsonBytes([conversationMemories.value, conversationMemoryAtoms.value]),
        clearable: true
      },
      {
        id: 'worldBooks',
        label: '世界书',
        description: '全局与角色绑定的世界书条目',
        count: worldBooks.value.length,
        bytes: estimateArrayJsonBytes(worldBooks.value),
        clearable: true
      },
      {
        id: 'voomPosts',
        label: 'VOOM 动态',
        description: '动态、评论、点赞与配图信息',
        count: voomPosts.value.length,
        bytes: estimateArrayJsonBytes(voomPosts.value),
        clearable: true
      },
      {
        id: 'smallTheaters',
        label: '小剧场',
        description: '小剧场主题与生成内容',
        count: smallTheaterTopics.value.length + smallTheaters.value.length,
        bytes: estimateGroupedArrayJsonBytes([smallTheaterTopics.value, smallTheaters.value]),
        clearable: true
      },
      {
        id: 'music',
        label: '音乐',
        description: '音乐收藏与评论线程',
        count: musicFavoriteTracks.value.length + musicCommentThreads.value.length,
        bytes: estimateGroupedArrayJsonBytes([musicFavoriteTracks.value, musicCommentThreads.value]),
        clearable: true
      },
      {
        id: 'stickers',
        label: '贴纸',
        description: '贴纸分组、贴纸条目与本地缓存',
        count: stickerGroups.value.length + stickers.value.length,
        bytes: estimateGroupedArrayJsonBytes([stickerGroups.value, stickers.value]),
        clearable: true
      },
      {
        id: 'generatedImages',
        label: '生成图',
        description: '聊天与 VOOM 生成图历史',
        count: generatedImages.value.length,
        bytes: estimateArrayJsonBytes(generatedImages.value),
        clearable: true
      },
      {
        id: 'settings',
        label: '应用配置',
        description: 'API、TTS、生图、备份与全局偏好',
        count: 1,
        bytes: estimateJsonBytes(settings.value),
        protected: true
      }
    ];
    const totalBytes = sections.reduce((total, section) => total + section.bytes, 0);
    return { sections, totalBytes };
  }

  function estimateCleanupFreedBytes(action: DataCleanupAction) {
    if (action === 'generated-images') return estimateArrayJsonBytes(generatedImages.value);

    if (action === 'message-media') {
      return estimateTransformedFreedBytes(messages.value, (message) => stripMessageMediaCache(message));
    }

    if (action === 'user-sent-images') {
      const messageFreedBytes = estimateTransformedFreedBytes(messages.value, (message) => stripUserSentImageData(message));
      const favoriteFreedBytes = estimateTransformedFreedBytes(favorites.value, (favorite) => ({ ...favorite, message: stripUserSentImageData(favorite.message) }));
      return messageFreedBytes + favoriteFreedBytes;
    }

    if (action === 'sticker-local-cache') {
      return estimateTransformedFreedBytes(stickers.value, (sticker) => stripStickerLocalCache(sticker));
    }

    if (action === 'image-candidates') {
      const messageFreedBytes = estimateTransformedFreedBytes(messages.value, (message) => stripImageCandidates(message));
      const postFreedBytes = estimateTransformedFreedBytes(voomPosts.value, (post) => post.imageCandidates?.length ? { ...post, imageCandidates: undefined } : post);
      return messageFreedBytes + postFreedBytes;
    }

    if (action === 'voice-audio') {
      return estimateTransformedFreedBytes(messages.value, (message) => stripVoiceAudio(message));
    }

    return estimateTransformedFreedBytes(conversationMemories.value, (memory) => stripMemoryVectorCache(memory))
      + estimateArrayJsonBytes(conversationMemoryAtoms.value);
  }

  async function cleanupData(action: DataCleanupAction) {
    if (action === 'generated-images') return clearDataSections(['generatedImages']);

    if (action === 'message-media') {
      const nextMessages = messages.value.map((message) => stripMessageMediaCache(message));
      const changedMessages = nextMessages.filter((message, index) => JSON.stringify(message) !== JSON.stringify(messages.value[index]));
      if (changedMessages.length) await saveMessages(changedMessages);
      return changedMessages.length;
    }

    if (action === 'user-sent-images') {
      const nextMessages = messages.value.map((message) => stripUserSentImageData(message));
      const changedMessages = nextMessages.filter((message, index) => message !== messages.value[index]);
      const nextFavorites = favorites.value.map((favorite) => {
        const nextMessage = stripUserSentImageData(favorite.message);
        return nextMessage === favorite.message ? favorite : { ...favorite, message: nextMessage, kind: favoriteKindForMessage(nextMessage), summary: messageReadableContent(nextMessage) };
      });
      const changedFavorites = nextFavorites.filter((favorite, index) => favorite !== favorites.value[index]);
      if (changedMessages.length) await saveMessages(changedMessages);
      if (changedFavorites.length) {
        const favoriteMap = new Map(changedFavorites.map((favorite) => [favorite.id, favorite]));
        favorites.value = normalizeFavorites(favorites.value.map((favorite) => favoriteMap.get(favorite.id) ?? favorite));
        await Promise.all(changedFavorites.map((favorite) => putEntity('favorites', toRaw(favorite))));
      }
      return changedMessages.length + changedFavorites.length;
    }

    if (action === 'sticker-local-cache') {
      const now = Date.now();
      const nextStickers = stickers.value.map((sticker) => ({ ...stripStickerLocalCache(sticker), updatedAt: sticker.cachedImageUrl || isInlineMediaUrl(sticker.imageUrl) ? now : sticker.updatedAt }));
      const changedStickers = nextStickers.filter((sticker, index) => JSON.stringify(sticker) !== JSON.stringify(stickers.value[index]));
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

    const nextMemories = conversationMemories.value.map((memory) => stripMemoryVectorCache(memory));
    const changedMemories = nextMemories.filter((memory, index) => memory !== conversationMemories.value[index]);
    const removedAtoms = [...conversationMemoryAtoms.value];
    if (changedMemories.length) {
      const memoryMap = new Map(changedMemories.map((memory) => [memory.id, memory]));
      conversationMemories.value = conversationMemories.value.map((memory) => memoryMap.get(memory.id) ?? memory);
      await Promise.all(changedMemories.map((memory) => putEntity('conversationMemories', memory)));
    }
    if (removedAtoms.length) {
      conversationMemoryAtoms.value = [];
      await Promise.all(removedAtoms.map((atom) => deleteEntity('conversationMemoryAtoms', atom.id)));
    }
    return changedMemories.length + removedAtoms.length;
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
    if (sectionSet.has('smallTheaters')) {
      const topics = [...smallTheaterTopics.value];
      const theaters = [...smallTheaters.value];
      smallTheaterTopics.value = [];
      smallTheaters.value = [];
      await Promise.all([
        ...topics.map((topic) => deleteEntity('smallTheaterTopics', topic.id)),
        ...theaters.map((theater) => deleteEntity('smallTheaters', theater.id))
      ]);
      changed += topics.length + theaters.length;
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
      const atoms = [...conversationMemoryAtoms.value];
      conversationMemories.value = [];
      conversationMemoryAtoms.value = [];
      await Promise.all([
        ...entries.map((entry) => deleteEntity('conversationMemories', entry.id)),
        ...atoms.map((atom) => deleteEntity('conversationMemoryAtoms', atom.id))
      ]);
      changed += entries.length + atoms.length;
    }
    if (sectionSet.has('conversationMemoryAtoms') && !sectionSet.has('conversationMemories')) {
      const atoms = [...conversationMemoryAtoms.value];
      conversationMemoryAtoms.value = [];
      await Promise.all(atoms.map((atom) => deleteEntity('conversationMemoryAtoms', atom.id)));
      changed += atoms.length;
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

  async function appendUserMusicListenInviteMessage(conversationId: string, payload: Partial<Pick<ChatMusicListenInviteAttachment, 'note' | 'track'>> = {}, quote?: ChatMessageQuote | null) {
    const conversation = conversationById(conversationId);
    if (!conversation) return;
    const invitation = normalizeMusicListenInviteAttachment({
      note: payload.note,
      track: payload.track ?? musicPlayer.currentTrack ?? undefined
    });
    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'user',
      mode: 'online',
      content: formatMusicListenInviteContent(invitation),
      musicListenInvite: invitation,
      quote: cloneMessageQuote(quote),
      createdAt: Date.now(),
      status: 'sent'
    };
    messages.value.push(userMessage);
    await putEntity('messages', userMessage);
    const nextConversation = { ...conversation, activeMode: 'online' as const, updatedAt: userMessage.createdAt, unreadCount: 0 };
    const conversationIndex = conversations.value.findIndex((item) => item.id === conversationId);
    if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
    await putEntity('conversations', nextConversation);
    void maybeAutoSummarizeConversation(conversationId);
    return userMessage;
  }

  async function appendUserSmallTheaterLinkMessage(conversationId: string, theater: SmallTheater, quote?: ChatMessageQuote | null) {
    const conversation = conversationById(conversationId);
    if (!conversation) return;
    const theaterLink = normalizeSmallTheaterLinkAttachment(theater);
    const sentAt = Date.now();
    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'user',
      mode: 'online',
      content: formatSmallTheaterLinkContent(theaterLink),
      theaterLink,
      quote: cloneMessageQuote(quote),
      createdAt: sentAt,
      status: 'sent'
    };
    messages.value.push(userMessage);
    await putEntity('messages', userMessage);
    const nextConversation = { ...conversation, activeMode: 'online' as const, updatedAt: sentAt, unreadCount: 0 };
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
    const respondedAt = Date.now();
    const nextTransfer = { ...message.transfer, status, respondedAt };
    const nextMessage: ChatMessage = {
      ...message,
      content: formatTransferContent(nextTransfer),
      transfer: nextTransfer,
      editedAt: respondedAt
    };
    const messageIndex = messages.value.findIndex((item) => item.id === messageId);
    if (messageIndex >= 0) messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    const receiptTransfer: ChatTransferAttachment = {
      amount: nextTransfer.amount,
      currency: nextTransfer.currency,
      note: nextTransfer.note,
      status,
      respondedAt,
      responseToMessageId: message.id
    };
    const existingReceiptIndex = messages.value.findIndex((item) => item.transfer?.responseToMessageId === message.id);
    const existingReceiptMessage = existingReceiptIndex >= 0 ? messages.value[existingReceiptIndex] : null;
    const receiptMessage: ChatMessage = existingReceiptMessage
      ? {
          ...existingReceiptMessage,
          sender: actor,
          content: formatTransferReceiptContent(receiptTransfer),
          transfer: receiptTransfer,
          editedAt: respondedAt
        }
      : {
          id: createId('msg'),
          conversationId: message.conversationId,
          sender: actor,
          mode: message.mode,
          content: formatTransferReceiptContent(receiptTransfer),
          transfer: receiptTransfer,
          createdAt: respondedAt + 1,
          status: 'sent'
        };
    if (existingReceiptIndex >= 0) messages.value[existingReceiptIndex] = receiptMessage;
    else messages.value.push(receiptMessage);
    await putEntity('messages', receiptMessage);
    const conversation = conversationById(message.conversationId);
    if (conversation) {
      if (actor === 'char') notifyCharacterMessages(conversation, [receiptMessage]);
      const nextConversation = {
        ...conversation,
        updatedAt: receiptMessage.createdAt,
        unreadCount: actor === 'char' ? unreadCountAfterIncomingMessage(conversation, 1) : 0
      };
      const conversationIndex = conversations.value.findIndex((item) => item.id === message.conversationId);
      if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
      await putEntity('conversations', nextConversation);
    }
    void maybeAutoSummarizeConversation(message.conversationId);
    return nextMessage;
  }

  async function updateMusicListenInviteStatus(messageId: string, status: ChatMusicListenInviteStatus, actor: 'user' | 'char' = 'user') {
    if (status === 'pending') return null;
    const message = messages.value.find((item) => item.id === messageId);
    if (!message?.musicListenInvite || message.musicListenInvite.status !== 'pending') return null;
    if (actor === 'user' && message.sender !== 'char') return null;
    if (actor === 'char' && message.sender !== 'user') return null;
    const respondedAt = Date.now();
    const nextInvitation: ChatMusicListenInviteAttachment = {
      ...message.musicListenInvite,
      status,
      respondedAt,
      startedAt: status === 'accepted' ? respondedAt : message.musicListenInvite.startedAt
    };
    const nextMessage: ChatMessage = {
      ...message,
      content: formatMusicListenInviteContent(nextInvitation),
      musicListenInvite: nextInvitation,
      editedAt: respondedAt
    };
    const messageIndex = messages.value.findIndex((item) => item.id === messageId);
    if (messageIndex >= 0) messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    if (status === 'accepted') {
      startMusicListenTogether(message.conversationId, message.sender === 'user' ? 'user' : 'char');
      if (nextInvitation.track) {
        void playMusicTrackForConversation(message.conversationId, nextInvitation.track).catch((error) => console.warn('Listen invite playback failed.', error));
      }
    }
    const conversation = conversationById(message.conversationId);
    if (conversation) {
      const nextConversation = {
        ...conversation,
        updatedAt: respondedAt,
        unreadCount: actor === 'char' ? unreadCountAfterIncomingMessage(conversation, 1) : 0
      };
      const conversationIndex = conversations.value.findIndex((item) => item.id === message.conversationId);
      if (conversationIndex >= 0) conversations.value[conversationIndex] = nextConversation;
      await putEntity('conversations', nextConversation);
    }
    void maybeAutoSummarizeConversation(message.conversationId);
    return nextMessage;
  }

  async function acceptMusicListenInvite(messageId: string) {
    return updateMusicListenInviteStatus(messageId, 'accepted', 'user');
  }

  async function rejectMusicListenInvite(messageId: string) {
    return updateMusicListenInviteStatus(messageId, 'rejected', 'user');
  }

  async function summarizeConversationWindow(conversationId: string, options: { forceStartFloor?: number; forceEndFloor?: number; hiddenStartFloor?: number; hiddenEndFloor?: number; allowPartial?: boolean; replaceMemoryId?: string } = {}): Promise<ConversationSummaryResult | null> {
    const conversation = conversationById(conversationId);
    if (!conversation) return null;
    const chatSettings = settingsForConversation(conversationId);
    const conversationMessages = getConversationActiveMessages(messagesForConversation(conversationId));
    const conversationFloorCount = getConversationFloorCount(conversationMessages);
    const memories = memoriesForConversation(conversationId);
    const nextRange = getNextSummaryRange(conversationMessages, memories, chatSettings);
    const partialStartFloor = getNextSummaryStartFloor(conversationMessages, memories);
    const partialEndFloor = conversationFloorCount;
    const partialLength = partialEndFloor - partialStartFloor + 1;
    const range = options.forceStartFloor && options.forceEndFloor
      ? {
          startFloor: options.forceStartFloor,
          endFloor: options.forceEndFloor,
          hiddenStartFloor: 0,
          hiddenEndFloor: 0,
          sourceMessages: getMessagesInFloorRange(conversationMessages, options.forceStartFloor, options.forceEndFloor)
        }
      : nextRange ?? (options.allowPartial && partialLength > 0
        ? {
            startFloor: partialStartFloor,
            endFloor: partialEndFloor,
            hiddenStartFloor: 0,
            hiddenEndFloor: 0,
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
      return currentMemory ? { record: currentMemory, status: 'busy' } : { status: 'busy' };
    }
    summarizingConversationRanges.add(rangeKey);

    try {
      const character = characterById(conversation.charId);
      const characterName = character ? getCharacterAiName(character) : '角色';
      const boundUser = character ? userById(character.boundUserId) ?? user.value : user.value;
      const userSenderName = getUserAiName(boundUser);
      const modelOverride = getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode);
      const floorMap = getMessageFloorMap(conversationMessages);
      const includeTimeline = chatSettings.timeAwareness.enabled;
      const summary = await generateConversationSummary({
        messages: range.sourceMessages.map((message) => {
          const floor = floorMap.get(message.id) ?? range.startFloor;
          const sender = message.sender === 'user' ? userSenderName : message.sender === 'char' ? characterName : '系统';
          const sentAtText = includeTimeline ? `（发送时间：${formatMemoryTimelineTime(message.createdAt)}）` : '';
          return `${floor}楼 ${sender}${sentAtText}: ${message.content}`;
        }).join('\n'),
        previousSummary: getMemoryContext(memoriesForConversation(conversationId), { includeResolved: true, maxEntries: 42 }),
        identityRules: createConversationSummaryIdentityRules(boundUser, character),
        timeAwareness: chatSettings.timeAwareness,
        timeAwarenessUserName: getUserAiName(boundUser),
        timelineContext: renderMessageTimelineContext(range.sourceMessages, floorMap, range.startFloor),
        settings: settings.value ?? undefined,
        modelOverride,
        promptOverride: renderCharacterMemoryPrompt(chatSettings.memory.summaryPrompt, characterName)
      });
      const existingAfterGeneration = memoriesForConversation(conversationId).find((memory) => isSameMemoryRange(memory, rangeIdentity));
      if (existingAfterGeneration && existingAfterGeneration.id !== options.replaceMemoryId) {
        return { record: existingAfterGeneration, status: 'existing' };
      }
      const nextRecord = createMemoryRecord({
        conversationId,
        mode: conversation.activeMode,
        startFloor: range.startFloor,
        endFloor: range.endFloor,
        hiddenStartFloor: 0,
        hiddenEndFloor: 0,
        summary,
        sourceMessages: range.sourceMessages,
        model: modelOverride || settings.value?.model || '',
        vector: []
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
          vector: [],
          entries: normalizeMemoryRecordEntries(nextRecord),
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
      await maybeAutoMergeConversationMemories(conversationId);
    } catch (error) {
      console.error(error);
    }
  }

  async function maybeAutoMergeConversationMemories(conversationId: string) {
    const chatSettings = settingsForConversation(conversationId);
    if ((!chatSettings.memory.autoGrandSummaryEnabled && !chatSettings.memory.autoMergeEnabled) || autoMergingConversationIds.has(conversationId)) return null;
    const grandSummaryThreshold = Math.max(3, chatSettings.memory.autoMergeThreshold);
    const grandSummaryBatchSize = Math.min(Math.max(2, chatSettings.memory.autoMergeBatchSize), grandSummaryThreshold);
    const getCandidatesByDepth = () => {
      const candidates = filterHighestMemoryLayers([...memoriesForConversation(conversationId)]).sort(compareMemoryRecordsByRange);
      const byDepth = new Map<number, ConversationMemoryRecord[]>();
      candidates.forEach((memory) => {
        const depth = memoryMergeDepthForStore(memory);
        byDepth.set(depth, [...(byDepth.get(depth) ?? []), memory]);
      });
      return byDepth;
    };
    const findGrandSummaryBatch = (byDepth: Map<number, ConversationMemoryRecord[]>) => [...byDepth.entries()]
      .filter(([depth, memories]) => depth >= 1 && memories.length >= grandSummaryThreshold)
      .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth)[0]?.[1].slice(0, grandSummaryBatchSize) ?? [];

    autoMergingConversationIds.add(conversationId);
    try {
      const newGrandSummary = chatSettings.memory.autoGrandSummaryEnabled ? await createNextIncrementalGrandSummary(conversationId) : null;
      const nextGrandSummaryBatch = chatSettings.memory.autoMergeEnabled ? findGrandSummaryBatch(getCandidatesByDepth()) : [];
      if (nextGrandSummaryBatch.length >= 2) return await mergeConversationMemories(conversationId, nextGrandSummaryBatch.map((memory) => memory.id), { fullSummary: true });
      if (newGrandSummary) return newGrandSummary;
      return null;
    } finally {
      autoMergingConversationIds.delete(conversationId);
    }
  }

  async function createNextIncrementalGrandSummary(conversationId: string) {
    const conversation = conversationById(conversationId);
    if (!conversation) return null;
    const chatSettings = settingsForConversation(conversationId);
    const conversationMessages = getConversationActiveMessages(messagesForConversation(conversationId));
    const floorCount = getConversationFloorCount(conversationMessages);
    const summaryEvery = Math.max(20, chatSettings.memory.grandSummaryEvery);
    const existingGrandSummaries = memoriesForConversation(conversationId)
      .flatMap((memory) => collectIncrementalGrandSummaries(memory))
      .filter((memory) => memory.startFloor === 1)
      .sort(compareMemoryRecordsByRange);
    const previousEndFloor = existingGrandSummaries.reduce((max, memory) => Math.max(max, memory.endFloor), 0);
    const nextEndFloor = Math.max(summaryEvery, (Math.floor(previousEndFloor / summaryEvery) + 1) * summaryEvery);
    if (floorCount < nextEndFloor) return null;
    const result = await createIncrementalGrandSummary(conversationId, {
      segmentStartFloor: previousEndFloor + 1,
      endFloor: nextEndFloor,
      hiddenStartFloor: chatSettings.memory.grandSummaryHiddenStartFloor,
      visibleTailFloors: chatSettings.memory.grandSummaryVisibleTailFloors
    });
    return result?.record ?? null;
  }

  async function createManualIncrementalGrandSummary(conversationId: string, options: { segmentStartFloor: number; endFloor: number; hiddenStartFloor?: number; visibleTailFloors?: number }): Promise<ConversationSummaryResult | null> {
    return createIncrementalGrandSummary(conversationId, {
      ...options,
      sourceStartFloor: options.segmentStartFloor
    });
  }

  async function createIncrementalGrandSummary(conversationId: string, options: IncrementalGrandSummaryOptions): Promise<ConversationSummaryResult | null> {
    const conversation = conversationById(conversationId);
    if (!conversation) return null;
    const chatSettings = settingsForConversation(conversationId);
    const conversationMessages = getConversationActiveMessages(messagesForConversation(conversationId));
    const memories = memoriesForConversation(conversationId);
    const floorCount = getConversationFloorCount(conversationMessages);
    const segmentStartFloor = Math.max(1, Math.floor(Number(options.segmentStartFloor) || 1));
    const nextEndFloor = Math.max(segmentStartFloor, Math.floor(Number(options.endFloor) || segmentStartFloor));
    if (floorCount < nextEndFloor) return null;
    const sourceStartFloor = Math.min(nextEndFloor, Math.max(1, Math.floor(Number(options.sourceStartFloor ?? 1) || 1)));
    const sourceMessages = getMessagesInFloorRange(conversationMessages, sourceStartFloor, nextEndFloor);
    if (!sourceMessages.length) return null;

    const rangeIdentity = {
      conversationId,
      mode: conversation.activeMode,
      startFloor: sourceStartFloor,
      endFloor: nextEndFloor,
      isMergedSummary: true
    } satisfies Pick<ConversationMemoryRecord, 'conversationId' | 'mode' | 'startFloor' | 'endFloor' | 'isMergedSummary'>;
    const rangeKey = getMemoryRangeKey(rangeIdentity);
    const existingSameRange = memories
      .flatMap((memory) => collectIncrementalGrandSummaries(memory))
      .find((memory) => isSameMemoryRange(memory, rangeIdentity));
    if (existingSameRange) return { record: existingSameRange, status: 'existing' };
    if (summarizingConversationRanges.has(rangeKey)) return { status: 'busy' };
    summarizingConversationRanges.add(rangeKey);

    try {
      const memoirsForSegment = memories
        .filter((memory) => !memory.isMergedSummary && memory.startFloor >= segmentStartFloor && memory.endFloor <= nextEndFloor)
        .sort(compareMemoryRecordsByRange);
      const character = characterById(conversation.charId);
      const characterName = character ? getCharacterAiName(character) : '角色';
      const boundUser = character ? userById(character.boundUserId) ?? user.value : user.value;
      const userSenderName = getUserAiName(boundUser);
      const modelOverride = getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode);
      const floorMap = getMessageFloorMap(conversationMessages);
      const includeTimeline = chatSettings.timeAwareness.enabled;
      const floorMessageText = sourceMessages.map((message) => {
        const floor = floorMap.get(message.id) ?? sourceStartFloor;
        const sender = message.sender === 'user' ? userSenderName : message.sender === 'char' ? characterName : '系统';
        const sentAtText = includeTimeline ? `（发送时间：${formatMemoryTimelineTime(message.createdAt)}）` : '';
        return `${floor}楼 ${sender}${sentAtText}: ${message.content}`;
      }).join('\n');
      const memoirText = memoirsForSegment.length
        ? memoirsForSegment.map((memory) => `【回忆录 ${memory.startFloor}-${memory.endFloor}楼】\n${memory.summary}`).join('\n\n')
        : '本轮暂无可读取回忆录，仅依据楼层正文总结。';
      const summary = await generateConversationSummary({
        messages: [
          `【${sourceStartFloor}-${nextEndFloor}楼楼层正文】`,
          floorMessageText,
          `【${segmentStartFloor}-${nextEndFloor}楼回忆录】`,
          memoirText
        ].join('\n\n'),
        previousSummary: '',
        identityRules: createConversationSummaryIdentityRules(boundUser, character),
        timeAwareness: chatSettings.timeAwareness,
        timeAwarenessUserName: getUserAiName(boundUser),
        timelineContext: [
          renderMessageTimelineContext(sourceMessages, floorMap, sourceStartFloor),
          renderMemoryRangeTimelineContext(memoirsForSegment)
        ].filter(Boolean).join('\n'),
        settings: settings.value ?? undefined,
        modelOverride,
        promptOverride: renderCharacterMemoryPrompt(chatSettings.memory.mergeSummaryPrompt, characterName)
      });
      const existingAfterGeneration = memoriesForConversation(conversationId)
        .flatMap((memory) => collectIncrementalGrandSummaries(memory))
        .find((memory) => isSameMemoryRange(memory, rangeIdentity));
      if (existingAfterGeneration) return { record: existingAfterGeneration, status: 'existing' };
      const hiddenStartFloor = Math.max(0, Math.floor(Number(options.hiddenStartFloor ?? chatSettings.memory.grandSummaryHiddenStartFloor) || 0));
      const effectiveHiddenStartFloor = hiddenStartFloor > 0 ? Math.max(sourceStartFloor, hiddenStartFloor) : 0;
      const hiddenRange = chatSettings.memory.hideSummarizedMessages
        ? getGrandSummaryHiddenRange(
            nextEndFloor,
        effectiveHiddenStartFloor,
            options.visibleTailFloors ?? chatSettings.memory.grandSummaryVisibleTailFloors
          )
        : { hiddenStartFloor: 0, hiddenEndFloor: 0 };
      const now = Date.now();
      const nextRecord: ConversationMemoryRecord = {
        id: createId('memory'),
        conversationId,
        mode: conversation.activeMode,
        kind: 'long-term',
        startFloor: sourceStartFloor,
        endFloor: nextEndFloor,
        hiddenStartFloor: hiddenRange.hiddenStartFloor,
        hiddenEndFloor: hiddenRange.hiddenEndFloor,
        summary,
        tokenCount: estimateTokenCount(summary),
        vector: [],
        entries: [],
        sourceMessageIds: sourceMessages.map((message) => message.id),
        model: modelOverride || settings.value?.model || '',
        summaryRole: 'incremental-grand',
        isMergedSummary: true,
        mergedFrom: memoirsForSegment.map((memory) => cloneMemoryRecordForMerge(memory)),
        createdAt: now,
        updatedAt: now
      };
      nextRecord.entries = normalizeMemoryRecordEntries(nextRecord);

      conversationMemories.value = [
        ...conversationMemories.value.filter((memory) => memory.conversationId !== conversationId || !memoirsForSegment.some((item) => item.id === memory.id)),
        nextRecord
      ];
      await Promise.all([
        ...memoirsForSegment.map((memory) => deleteEntity('conversationMemories', memory.id)),
        putEntity('conversationMemories', nextRecord)
      ]);
      return { record: nextRecord, status: 'created' };
    } finally {
      summarizingConversationRanges.delete(rangeKey);
    }
  }

  async function updateMemoryRecord(nextMemory: ConversationMemoryRecord) {
    const existingMemory = conversationMemories.value.find((memory) => memory.id === nextMemory.id);
    const summaryChanged = Boolean(existingMemory && existingMemory.summary !== nextMemory.summary);
    const normalizedEntries = normalizeMemoryRecordEntries({
      ...nextMemory,
      entries: summaryChanged ? [] : nextMemory.entries
    });
    const normalizedMemory = {
      ...nextMemory,
      tokenCount: Math.max(0, Math.round(nextMemory.tokenCount)),
      vector: Array.isArray(nextMemory.vector) ? [...nextMemory.vector] : [],
      entries: normalizedEntries,
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

  function messagesForMemorySource(conversationId: string, memory: ConversationMemoryRecord) {
    const conversationMessages = getConversationActiveMessages(messagesForConversation(conversationId));
    const sourceIds = new Set(memory.sourceMessageIds ?? []);
    const messagesBySourceIds = sourceIds.size
      ? conversationMessages.filter((message) => sourceIds.has(message.id))
      : [];
    return messagesBySourceIds.length ? messagesBySourceIds : getMessagesInFloorRange(conversationMessages, memory.startFloor, memory.endFloor);
  }

  function grandSummaryPromptMode(memory: ConversationMemoryRecord): GrandSummaryPromptMode {
    return memory.summaryRole === 'full-grand' || getMemoryMergeDepth(memory) > 1 ? 'full' : 'incremental';
  }

  async function resummarizeIncrementalGrandMemory(memory: ConversationMemoryRecord): Promise<ConversationSummaryResult | null> {
    const conversation = conversationById(memory.conversationId);
    if (!conversation) return null;
    const sourceMessages = messagesForMemorySource(memory.conversationId, memory);
    if (!sourceMessages.length) return null;
    const rangeIdentity = {
      conversationId: memory.conversationId,
      mode: memory.mode,
      startFloor: memory.startFloor,
      endFloor: memory.endFloor,
      isMergedSummary: true
    } satisfies Pick<ConversationMemoryRecord, 'conversationId' | 'mode' | 'startFloor' | 'endFloor' | 'isMergedSummary'>;
    const rangeKey = getMemoryRangeKey(rangeIdentity);
    if (summarizingConversationRanges.has(rangeKey)) return { record: memory, status: 'busy' };
    summarizingConversationRanges.add(rangeKey);

    try {
      const chatSettings = settingsForConversation(memory.conversationId);
      const character = characterById(conversation.charId);
      const characterName = character ? getCharacterAiName(character) : '角色';
      const boundUser = character ? userById(character.boundUserId) ?? user.value : user.value;
      const userSenderName = getUserAiName(boundUser);
      const modelOverride = getConversationTextModelOverride(chatSettings, 'summary', memory.mode);
      const conversationMessages = getConversationActiveMessages(messagesForConversation(memory.conversationId));
      const floorMap = getMessageFloorMap(conversationMessages);
      const includeTimeline = chatSettings.timeAwareness.enabled;
      const floorMessageText = sourceMessages.map((message) => {
        const floor = floorMap.get(message.id) ?? memory.startFloor;
        const sender = message.sender === 'user' ? userSenderName : message.sender === 'char' ? characterName : '系统';
        const sentAtText = includeTimeline ? `（发送时间：${formatMemoryTimelineTime(message.createdAt)}）` : '';
        return `${floor}楼 ${sender}${sentAtText}: ${message.content}`;
      }).join('\n');
      const sourceMemoirs = (memory.mergedFrom ?? []).filter((sourceMemory) => !sourceMemory.isMergedSummary).sort(compareMemoryRecordsByRange);
      const memoirStartFloor = sourceMemoirs.length
        ? sourceMemoirs.reduce((min, sourceMemory) => Math.min(min, sourceMemory.startFloor), Number.POSITIVE_INFINITY)
        : memory.startFloor;
      const memoirText = sourceMemoirs.length
        ? sourceMemoirs.map((sourceMemory) => `【回忆录 ${sourceMemory.startFloor}-${sourceMemory.endFloor}楼】\n${sourceMemory.summary}`).join('\n\n')
        : '本轮暂无可读取回忆录，仅依据楼层正文总结。';
      const summary = await generateConversationSummary({
        messages: [
          `【${memory.startFloor}-${memory.endFloor}楼楼层正文】`,
          floorMessageText,
          `【${memoirStartFloor}-${memory.endFloor}楼回忆录】`,
          memoirText
        ].join('\n\n'),
        previousSummary: '',
        identityRules: createConversationSummaryIdentityRules(boundUser, character),
        timeAwareness: chatSettings.timeAwareness,
        timeAwarenessUserName: getUserAiName(boundUser),
        timelineContext: [
          renderMessageTimelineContext(sourceMessages, floorMap, memory.startFloor),
          renderMemoryRangeTimelineContext(sourceMemoirs)
        ].filter(Boolean).join('\n'),
        settings: settings.value ?? undefined,
        modelOverride,
        promptOverride: renderCharacterMemoryPrompt(chatSettings.memory.mergeSummaryPrompt, characterName)
      });
      const record = {
        ...memory,
        summary,
        tokenCount: estimateTokenCount(summary),
        vector: [],
        entries: [],
        sourceMessageIds: sourceMessages.map((message) => message.id),
        model: modelOverride || settings.value?.model || '',
        summaryRole: 'incremental-grand' as const,
        isMergedSummary: true,
        mergedFrom: sourceMemoirs.map((sourceMemory) => cloneMemoryRecordForMerge(sourceMemory))
      };
      await updateMemoryRecord(record);
      return { record, status: 'updated' };
    } finally {
      summarizingConversationRanges.delete(rangeKey);
    }
  }

  async function resummarizeMergedGrandMemory(memory: ConversationMemoryRecord): Promise<ConversationSummaryResult | null> {
    const conversation = conversationById(memory.conversationId);
    if (!conversation || !memory.mergedFrom?.length) return null;
    const rangeIdentity = {
      conversationId: memory.conversationId,
      mode: memory.mode,
      startFloor: memory.startFloor,
      endFloor: memory.endFloor,
      isMergedSummary: true
    } satisfies Pick<ConversationMemoryRecord, 'conversationId' | 'mode' | 'startFloor' | 'endFloor' | 'isMergedSummary'>;
    const rangeKey = getMemoryRangeKey(rangeIdentity);
    if (summarizingConversationRanges.has(rangeKey)) return { record: memory, status: 'busy' };
    summarizingConversationRanges.add(rangeKey);

    try {
      const chatSettings = settingsForConversation(memory.conversationId);
      const sourceMemories = memory.mergedFrom.map((sourceMemory) => cloneMemoryRecordForMerge(sourceMemory)).sort(compareMemoryRecordsByRange);
      const character = characterById(conversation.charId);
      const characterName = character ? getCharacterAiName(character) : '角色';
      const boundUser = character ? userById(character.boundUserId) ?? user.value : user.value;
      const modelOverride = getConversationTextModelOverride(chatSettings, 'summary', memory.mode);
      const promptTemplate = grandSummaryPromptMode(memory) === 'full' ? fullConversationMergeSummaryPrompt : chatSettings.memory.mergeSummaryPrompt;
      const summary = await generateConversationSummary({
        messages: sourceMemories.map((sourceMemory) => `【${sourceMemory.startFloor}-${sourceMemory.endFloor}楼】\n${sourceMemory.summary}`).join('\n\n'),
        previousSummary: '',
        identityRules: createConversationSummaryIdentityRules(boundUser, character),
        timeAwareness: chatSettings.timeAwareness,
        timeAwarenessUserName: getUserAiName(boundUser),
        timelineContext: renderMemoryRangeTimelineContext(sourceMemories),
        settings: settings.value ?? undefined,
        modelOverride,
        promptOverride: renderCharacterMemoryPrompt(promptTemplate, characterName)
      });
      const sourceMessageIds = [...new Set(sourceMemories.flatMap((sourceMemory) => sourceMemory.sourceMessageIds))];
      const record = {
        ...memory,
        summary,
        tokenCount: estimateTokenCount(summary),
        vector: [],
        entries: [],
        sourceMessageIds,
        model: modelOverride || settings.value?.model || '',
        isMergedSummary: true,
        mergedFrom: sourceMemories
      };
      await updateMemoryRecord(record);
      return { record, status: 'updated' };
    } finally {
      summarizingConversationRanges.delete(rangeKey);
    }
  }

  async function resummarizeMemory(memoryId: string) {
    const memory = conversationMemories.value.find((entry) => entry.id === memoryId);
    if (!memory) return null;
    if (memory.isMergedSummary) {
      return grandSummaryPromptMode(memory) === 'incremental'
        ? resummarizeIncrementalGrandMemory(memory)
        : resummarizeMergedGrandMemory(memory);
    }
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
    if (!isIncrementalGrandSummary(memory)) return;
    const chatSettings = settingsForConversation(memory.conversationId);
    const hiddenRange = getGrandSummaryHiddenRange(memory.endFloor, chatSettings.memory.grandSummaryHiddenStartFloor, chatSettings.memory.grandSummaryVisibleTailFloors);
    await updateMemoryRecord({
      ...memory,
      hiddenStartFloor: hidden ? hiddenRange.hiddenStartFloor : 0,
      hiddenEndFloor: hidden ? hiddenRange.hiddenEndFloor : 0
    });
  }

  async function updateMemoryHiddenRange(memoryId: string, hiddenStartFloor: number, hiddenEndFloor: number) {
    const memory = conversationMemories.value.find((entry) => entry.id === memoryId);
    if (!memory) return;
    if (!isIncrementalGrandSummary(memory)) return;
    const startFloor = Math.max(0, Math.floor(Number(hiddenStartFloor) || 0));
    const endFloor = Math.max(0, Math.floor(Number(hiddenEndFloor) || 0));
    const hasHiddenRange = startFloor > 0 && endFloor >= startFloor && endFloor >= memory.startFloor && startFloor <= memory.endFloor;
    const clampedStartFloor = Math.max(memory.startFloor, Math.min(startFloor, memory.endFloor));
    const clampedEndFloor = Math.max(clampedStartFloor, Math.min(endFloor, memory.endFloor));
    await updateMemoryRecord({
      ...memory,
      hiddenStartFloor: hasHiddenRange ? clampedStartFloor : 0,
      hiddenEndFloor: hasHiddenRange ? clampedEndFloor : 0
    });
  }

  function cloneMemoryRecordForMerge(memory: ConversationMemoryRecord): ConversationMemoryRecord {
    return {
      ...memory,
      vector: Array.isArray(memory.vector) ? [...memory.vector] : [],
      entries: normalizeMemoryRecordEntries(memory),
      sourceMessageIds: Array.isArray(memory.sourceMessageIds) ? [...memory.sourceMessageIds] : [],
      mergedFrom: memory.mergedFrom?.map((childMemory) => cloneMemoryRecordForMerge(childMemory))
    };
  }

  function memoryMergeDepthForStore(memory: ConversationMemoryRecord): number {
    return getMemoryMergeDepth(memory);
  }

  function compareMemoryRecordsByRange(leftMemory: ConversationMemoryRecord, rightMemory: ConversationMemoryRecord) {
    if (leftMemory.startFloor !== rightMemory.startFloor) return leftMemory.startFloor - rightMemory.startFloor;
    if (leftMemory.endFloor !== rightMemory.endFloor) return leftMemory.endFloor - rightMemory.endFloor;
    if (leftMemory.createdAt !== rightMemory.createdAt) return leftMemory.createdAt - rightMemory.createdAt;
    return leftMemory.id.localeCompare(rightMemory.id);
  }

  async function mergeConversationMemories(conversationId: string, memoryIds?: string[], options: { fullSummary?: boolean } = {}) {
    const conversation = conversationById(conversationId);
    if (!conversation) return null;
    const selectedIds = new Set((memoryIds ?? []).map((memoryId) => memoryId.trim()).filter(Boolean));
    const memories = memoriesForConversation(conversationId)
      .filter((memory) => !selectedIds.size || selectedIds.has(memory.id))
      .sort(compareMemoryRecordsByRange);
    if (memories.length <= 1) return null;

    const chatSettings = settingsForConversation(conversationId);
    const character = characterById(conversation.charId);
    const characterName = character ? getCharacterAiName(character) : '角色';
    const boundUser = character ? userById(character.boundUserId) ?? user.value : user.value;
    const modelOverride = getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode);
    const promptOverride = renderCharacterMemoryPrompt(options.fullSummary ? fullConversationMergeSummaryPrompt : chatSettings.memory.mergeSummaryPrompt, characterName);
    const summary = await generateConversationSummary({
      messages: memories.map((memory) => `【${memory.startFloor}-${memory.endFloor}楼】\n${memory.summary}`).join('\n\n'),
      previousSummary: '',
      identityRules: createConversationSummaryIdentityRules(boundUser, character),
      timeAwareness: chatSettings.timeAwareness,
      timeAwarenessUserName: getUserAiName(boundUser),
      timelineContext: renderMemoryRangeTimelineContext(memories),
      settings: settings.value ?? undefined,
      modelOverride,
      promptOverride
    });
    const hiddenStartFloor = options.fullSummary ? 0 : memories.reduce((min, memory) => memory.hiddenStartFloor ? Math.min(min, memory.hiddenStartFloor) : min, Number.POSITIVE_INFINITY);
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
      hiddenEndFloor: options.fullSummary ? 0 : memories.reduce((max, memory) => Math.max(max, memory.hiddenEndFloor), 0),
      summary,
      tokenCount: estimateTokenCount(summary),
      vector: [],
      entries: [],
      sourceMessageIds,
      model: modelOverride || settings.value?.model || '',
      summaryRole: options.fullSummary ? 'full-grand' : 'incremental-grand',
      isMergedSummary: true,
      mergedFrom: memories.map((memory) => cloneMemoryRecordForMerge(memory)),
      createdAt: now,
      updatedAt: now
    };
    if (!Number.isFinite(mergedRecord.hiddenStartFloor)) mergedRecord.hiddenStartFloor = 0;
    if (!Number.isFinite(mergedRecord.startFloor)) mergedRecord.startFloor = memories[0].startFloor;
    mergedRecord.entries = normalizeMemoryRecordEntries(mergedRecord);

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
    const characterName = character ? getCharacterAiName(character) : '角色';
    const boundUser = character ? userById(character.boundUserId) ?? user.value : user.value;
    const chatSettings = settingsForConversation(conversationId);
    await Promise.all(oldMemories.map(async (memory) => {
      const modelOverride = getConversationTextModelOverride(chatSettings, 'summary', memory.mode);
      const promptTemplate = memory.isMergedSummary
        ? grandSummaryPromptMode(memory) === 'full' ? fullConversationMergeSummaryPrompt : chatSettings.memory.mergeSummaryPrompt
        : chatSettings.memory.summaryPrompt;
      const summary = await generateConversationSummary({
        messages: memory.summary,
        previousSummary: '',
        identityRules: createConversationSummaryIdentityRules(boundUser, character),
        timeAwareness: chatSettings.timeAwareness,
        timeAwarenessUserName: getUserAiName(boundUser),
        timelineContext: renderMemoryRangeTimelineContext([memory]),
        settings: settings.value ?? undefined,
        modelOverride,
        promptOverride: renderCharacterMemoryPrompt(promptTemplate, characterName)
      });
      await updateMemoryRecord({
        ...memory,
        kind: 'long-term',
        summary,
        tokenCount: estimateTokenCount(summary),
        vector: [],
        entries: [],
        compressedAt: Date.now()
      });
    }));
  }

  async function requestRoleplayReply(conversationId: string, options?: { generateMoment?: boolean; proactive?: boolean; replyInstruction?: string; replyVariantGroupId?: string; replyVariantIndex?: number; excludeSourceMessageIds?: string[] }) {
    const conversation = conversationById(conversationId);
    if (!conversation || isConversationReplying(conversationId)) return;
    const character = characterById(conversation.charId);
    if (!character) return;
    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return;

    const chatSettings = settingsForConversation(conversationId);
    const modelOverride = getConversationTextModelOverride(chatSettings, conversation.activeMode);
    if (!hasConfiguredTextModel(modelOverride)) {
      if (!options?.proactive) {
        showConfigAlert('请先在设置或聊天菜单里配置可用的线上/线下聊天 API 模型，再让角色回复。', '需要配置 API 模型');
      }
      return;
    }

    if (!startConversationReply(conversationId)) return;
    const generationStartedAt = Date.now();
    try {
      if (chatSettings.stickerVisionEnabled) {
        await localizeRecentStickerMessagesForVision(conversationId);
      }
      const availableCharacterStickers = stickersForGroups(chatSettings.characterStickerGroupIds);
      const replyInputBundle = await buildRoleplayReplyInputForConversation(conversationId, {
        timeAwarenessNow: generationStartedAt,
        proactive: options?.proactive,
        replyInstruction: options?.replyInstruction,
        excludeSourceMessageIds: options?.excludeSourceMessageIds
      });
      if (!replyInputBundle) return;
      const replyPayload = await generateRoleplayReply(replyInputBundle.input);
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
          .slice(0, 5)
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
      const validMusicListenInviteDecisions = (parsedReply.messageActions?.musicListenInviteDecisions ?? [])
        .map((decision) => ({
          messageId: String(decision.messageId ?? '').trim(),
          status: decision.status === 'accepted' ? 'accepted' as const : decision.status === 'rejected' ? 'rejected' as const : null
        }))
        .filter((decision): decision is { messageId: string; status: 'accepted' | 'rejected' } => Boolean(decision.messageId && decision.status && messages.value.some((message) => message.id === decision.messageId && message.conversationId === conversationId && message.sender === 'user' && message.musicListenInvite?.status === 'pending')));
      const musicListenInvite = conversation.activeMode === 'online'
        ? normalizeMusicListenInviteAttachment({
          note: parsedReply.messageActions?.musicListenInvite?.note,
          track: await resolveMusicTrackFromAction(parsedReply.messageActions?.musicListenInvite) ?? undefined
        })
        : null;
      const canSendMusicListenInvite = Boolean(musicListenInvite && (musicListenInvite.note || musicListenInvite.track));
      const offlineInvitation = conversation.activeMode === 'online' && chatSettings.offlineInvitationEnabled
        ? normalizeOfflineInvitationAttachment(parsedReply.messageActions?.offlineInvitation?.prompt ?? '')
        : null;
      const quoteByReplyIndex = new Map<number, ChatMessageQuote>();
      for (const quoteAction of parsedReply.messageActions?.quotes ?? []) {
        const targetMessage = messages.value.find((message) => message.id === quoteAction.messageId && message.conversationId === conversationId && message.sender === 'user');
        const quote = targetMessage ? createMessageQuoteSnapshot(targetMessage) : null;
        if (quote) quoteByReplyIndex.set(Math.max(0, Math.floor(quoteAction.replyIndex)), quote);
      }
      if (!effectiveReplyMessages.length && !replyStickers.length && !replyImages.length && !narrationMessages.length && !hasOrderedSticker && !hasOrderedNarration && !hasOrderedImage && !hasOrderedVoice && !hasOrderedLocation && !hasOrderedTransfer && !validRecallMessageIds.length && !validTransferDecisions.length && !validMusicListenInviteDecisions.length && !canSendMusicListenInvite && !(parsedReply.messageActions?.musicActions ?? []).length && !offlineInvitation) {
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
      if (conversation.activeMode === 'online' && profileUpdate) {
        const activeProfileTheme = replyInputBundle.activeProfileTheme;
        const returnedThemeId = String(profileUpdate.profileThemeId ?? '').trim();
        const profileTheme = activeProfileTheme && (!returnedThemeId || returnedThemeId === activeProfileTheme.id)
          ? activeProfileTheme
          : null;
        if (profileTheme) await updateCharacterMindState(character.id, profileUpdate.innerMonologue ?? [], conversationId, {
          replyBatchId,
          profileTheme,
          profileThemeContent: profileUpdate.profileThemeContent
        });
      }
      for (const messageId of validRecallMessageIds) {
        await recallMessage(messageId, { actor: 'char', replyBatchId });
      }
      for (const decision of validTransferDecisions) {
        await updateTransferStatus(decision.messageId, decision.status, 'char');
      }
      for (const decision of validMusicListenInviteDecisions) {
        await updateMusicListenInviteStatus(decision.messageId, decision.status, 'char');
      }
      const musicActionNotices = await applyCharacterMusicActions(conversationId, parsedReply.messageActions?.musicActions ?? []);
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
          imageUrl: sticker.imageUrl,
          cachedImageUrl: sticker.cachedImageUrl
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
      if (canSendMusicListenInvite && musicListenInvite) {
        charMessages.push({
          id: createId('msg'),
          conversationId,
          sender: 'char' as const,
          mode: 'online' as const,
          content: formatMusicListenInviteContent(musicListenInvite),
          musicListenInvite,
          replyBatchId,
          ...replyVariantFields,
          createdAt: createdAt + charMessageOffset++,
          status: 'sent' as const
        } satisfies ChatMessage);
      }
      for (const notice of musicActionNotices) {
        charMessages.push({
          id: createId('msg'),
          conversationId,
          sender: 'system' as const,
          mode: conversation.activeMode,
          content: notice,
          createdAt: createdAt + charMessageOffset++,
          displayStyle: 'narration' as const,
          replyBatchId,
          ...replyVariantFields,
          status: 'sent' as const
        } satisfies ChatMessage);
      }
      if (plotChoices.length) {
        const plotChoiceMessage = charMessages.find((message) => message.sender === 'char' && !message.sticker && !message.image && !message.voice && !message.location && !message.transfer && !message.musicListenInvite);
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

      if (chatSettings.autoGenerateTheater && shouldAutoGenerateMoment(chatSettings.theaterFrequency)) {
        void createSmallTheaterFromConversation(conversationId, undefined, { silent: true }).catch((error) => {
          console.error(error);
        });
      }

      const shouldGenerateMoment = options?.generateMoment || (chatSettings.autoGenerateVoom && shouldAutoGenerateMoment(chatSettings.voomFrequency));
      if (shouldGenerateMoment) {
        finishConversationReply(conversationId);
        void createMomentFromConversation(conversationId).catch((error) => {
          console.error(error);
        });
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

  async function regenerateLatestReply(conversationId: string, options: { replyInstruction?: string } = {}) {
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
      await requestRoleplayReply(conversationId, { replyVariantGroupId, replyVariantIndex: nextVariantIndex, replyInstruction: options.replyInstruction });
      return true;
    }

    await rollbackCharacterMoodForOnlineRegeneration(conversation, messagesToRemove);
    const removedMessageIds = messagesToRemove.map((message) => message.id);
    await deleteMessages(messagesToRemove.map((message) => message.id));

    await requestRoleplayReply(conversationId, { excludeSourceMessageIds: removedMessageIds, replyInstruction: options.replyInstruction });
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

    const generatedIds = generatedComments.map(() => createId('comment'));
    const generatedIdByDraftId = new Map(generatedComments.flatMap((comment, index) => comment.draftId ? [[comment.draftId, generatedIds[index]]] : []));
    return generatedComments.map((comment, index) => {
      const resolvedParentId = comment.parentId ? generatedIdByDraftId.get(comment.parentId) : '';
      return {
        id: generatedIds[index],
        authorName: comment.authorName,
        authorId: comment.authorId,
        content: comment.content,
        contentTranslation: comment.contentTranslation,
        parentId: resolvedParentId && resolvedParentId !== generatedIds[index] ? resolvedParentId : undefined,
        createdAt: post.createdAt + index + 1
      } satisfies VoomComment;
    });
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
      authorName: getUserAiName(author),
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
          memorySummary: await memoryContextForConversationAsync(conversationId, visibleMessagesForConversation(conversationId).slice(-8).map((message) => messageReadableContent(message)).join('\n'), {
            modelOverride: getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode)
          }),
          stickerVisionEnabled: chatSettings.stickerVisionEnabled,
          timeAwareness: chatSettings.timeAwareness,
          musicListening: musicListeningContextForConversation(conversationId)
        },
        settings.value ?? undefined,
        modelOverride
      );
      const characterAiName = getCharacterAiName(character);
      const characterVoomAuthorName = getCharacterVoomAuthorName(character);
      const characterAuthorAliases = new Set([character.id, character.name, character.nickname, characterAiName, characterVoomAuthorName]
        .map((name) => name.trim().toLocaleLowerCase())
        .filter(Boolean));
      const post: VoomPost = { ...moment, id: createId('voom'), conversationId: conversation.id, authorName: characterAiName, authorAvatar: character.avatar, createdAt: Date.now() };
      post.comments = post.comments.map((comment, index) => ({
        ...comment,
        authorName: characterAuthorAliases.has(comment.authorName.trim().toLocaleLowerCase()) ? characterAiName : comment.authorName,
        authorId: characterAuthorAliases.has(comment.authorName.trim().toLocaleLowerCase()) ? character.id : comment.authorId,
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

  function smallTheaterTopicsForCharacter(characterId: string) {
    return smallTheaterTopics.value
      .filter((topic) => topic.charId === characterId)
      .sort((first, second) => first.createdAt - second.createdAt);
  }

  function profileThemesForCharacter(characterId: string) {
    return profileThemes.value
      .filter((theme) => theme.charId === characterId)
      .sort((first, second) => first.createdAt - second.createdAt);
  }

  function enabledProfileThemesForCharacter(characterId: string) {
    return profileThemesForCharacter(characterId).filter((theme) => theme.enabled);
  }
  function profileHomepagesForCharacter(characterId: string) {
    return profileHomepages.value
      .filter((homepage) => homepage.charId === characterId)
      .sort((first, second) => (second.updatedAt ?? second.createdAt) - (first.updatedAt ?? first.createdAt));
  }

  function smallTheatersForCharacter(characterId: string) {
    return smallTheaters.value
      .filter((theater) => theater.charId === characterId)
      .sort((first, second) => (second.updatedAt ?? second.createdAt) - (first.updatedAt ?? first.createdAt));
  }

  function smallTheaterById(theaterId: string) {
    return smallTheaters.value.find((theater) => theater.id === theaterId) ?? null;
  }

  async function markSmallTheaterDefaultsInitialized(characterId: string, timestamp: number) {
    if (!settings.value) return;
    const initialized = settings.value.smallTheaterTopicDefaultsInitialized ?? {};
    if (initialized[characterId]) return;
    settings.value = normalizeAppSettings({
      ...settings.value,
      smallTheaterTopicDefaultsInitialized: {
        ...initialized,
        [characterId]: timestamp
      }
    });
    await putEntity('settings', settings.value, 'main');
  }

  function shouldRefreshBuiltInSmallTheaterTopics(existingTopics: SmallTheaterTopic[]) {
    const builtInTopics = existingTopics.filter((topic) => topic.builtIn);
    if (!builtInTopics.length) return false;
    if (builtInTopics.length !== defaultSmallTheaterTopicDrafts.length) return true;
    return defaultSmallTheaterTopicDrafts.some((draft, index) => {
      const topic = builtInTopics[index];
      return !topic || topic.title !== draft.title || topic.prompt !== draft.prompt;
    });
  }

  async function refreshBuiltInSmallTheaterTopics(characterId: string, existingTopics: SmallTheaterTopic[]) {
    const builtInTopics = existingTopics.filter((topic) => topic.builtIn);
    const enabledByTitle = new Map(builtInTopics.map((topic) => [topic.title, topic.enabled]));
    const timestamp = Math.min(...builtInTopics.map((topic) => topic.createdAt), Date.now());
    const defaultTopics = createDefaultSmallTheaterTopics(characterId, timestamp).map((topic) => ({
      ...topic,
      enabled: enabledByTitle.get(topic.title) ?? topic.enabled,
      updatedAt: Date.now()
    }));

    smallTheaterTopics.value = [
      ...smallTheaterTopics.value.filter((topic) => topic.charId !== characterId || !topic.builtIn),
      ...defaultTopics
    ];
    await Promise.all([
      ...builtInTopics.map((topic) => deleteEntity('smallTheaterTopics', topic.id)),
      ...defaultTopics.map((topic) => putEntity('smallTheaterTopics', topic))
    ]);
    return smallTheaterTopicsForCharacter(characterId);
  }

  async function ensureSmallTheaterTopicsForCharacter(characterId: string) {
    const normalizedCharacterId = characterId.trim();
    if (!normalizedCharacterId) return [];
    const existingTopics = smallTheaterTopicsForCharacter(normalizedCharacterId);
    if (shouldRefreshBuiltInSmallTheaterTopics(existingTopics)) {
      return refreshBuiltInSmallTheaterTopics(normalizedCharacterId, existingTopics);
    }
    if (existingTopics.length || settings.value?.smallTheaterTopicDefaultsInitialized?.[normalizedCharacterId]) return existingTopics;

    const timestamp = Date.now();
    const defaultTopics = createDefaultSmallTheaterTopics(normalizedCharacterId, timestamp);
    smallTheaterTopics.value.push(...defaultTopics);
    await Promise.all(defaultTopics.map((topic) => putEntity('smallTheaterTopics', topic)));
    await markSmallTheaterDefaultsInitialized(normalizedCharacterId, timestamp);
    return smallTheaterTopicsForCharacter(normalizedCharacterId);
  }

  async function ensureProfileThemesForCharacter(characterId: string) {
    const normalizedCharacterId = characterId.trim();
    if (!normalizedCharacterId) return [];
    const existingThemes = profileThemesForCharacter(normalizedCharacterId);
    if (existingThemes.length) return existingThemes;

    const defaultTheme = createDefaultProfileTheme(normalizedCharacterId, Date.now());
    profileThemes.value.push(defaultTheme);
    await putEntity('profileThemes', defaultTheme);
    return profileThemesForCharacter(normalizedCharacterId);
  }

  async function createProfileTheme(payload: Pick<ProfileTheme, 'charId' | 'name' | 'prompt'> & Partial<Pick<ProfileTheme, 'regex' | 'template' | 'css' | 'enabled'>>) {
    const now = Date.now();
    const theme = normalizeProfileTheme({
      ...payload,
      enabled: payload.enabled !== false,
      source: 'custom',
      createdAt: now,
      updatedAt: now
    }, payload.charId);
    if (!theme) {
      showConfigAlert('请填写主页主题名称和提示词。', '无法保存主页主题');
      return null;
    }

    profileThemes.value.push(theme);
    await putEntity('profileThemes', theme);
    return theme;
  }

  async function refreshActiveProfileThemeSnapshot(theme: ProfileTheme) {
    if (isDefaultProfileTheme(theme)) return;
    const character = characterById(theme.charId);
    if (!character?.mindState || character.mindState.profileThemeId !== theme.id) return;
    const profileThemeContent = character.mindState.profileThemeContent ?? '';
    await saveCharacter({
      ...character,
      mindState: {
        ...character.mindState,
        profileThemeName: theme.name,
        profileThemeHtml: renderProfileThemeHtml(profileThemeContent, theme.template) || undefined,
        profileThemeCss: theme.css || undefined
      }
    });
  }

  async function createProfileHomepageRecord(payload: Omit<ProfileHomepageRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = Date.now();
    const record = normalizeStoredProfileHomepages([{
      ...payload,
      id: createId('profile-homepage'),
      createdAt: now,
      updatedAt: now
    }])[0] ?? null;
    if (!record) return null;
    profileHomepages.value.unshift(record);
    await putEntity('profileHomepages', record);
    return record;
  }

  async function deleteProfileHomepage(recordId: string) {
    const record = profileHomepages.value.find((entry) => entry.id === recordId);
    if (!record) return false;
    profileHomepages.value = profileHomepages.value.filter((entry) => entry.id !== recordId);
    await deleteEntity('profileHomepages', recordId);
    return true;
  }

  function profileHomepagesForCleanup(characterIds: string[], olderThanDays: number) {
    const characterIdSet = new Set(characterIds.map((id) => id.trim()).filter(Boolean));
    const days = Math.max(1, Math.round(Number(olderThanDays) || 0));
    if (!characterIdSet.size || !days) return [];
    const cutoff = Date.now() - days * oneDayMs;
    return profileHomepages.value.filter((homepage) => characterIdSet.has(homepage.charId) && (homepage.updatedAt ?? homepage.createdAt) < cutoff);
  }

  async function cleanupProfileHomepagesForCharacters(characterIds: string[], olderThanDays: number) {
    const recordsToDelete = profileHomepagesForCleanup(characterIds, olderThanDays);
    for (const record of recordsToDelete) {
      await deleteProfileHomepage(record.id);
    }
    return recordsToDelete.length;
  }

  async function runProfileHomepageAutoCleanupForCharacters(characterIds: string[]) {
    if (!settings.value) return 0;
    const now = Date.now();
    const cleanupSettings = { ...settings.value.profileHomepageAutoCleanup };
    let removedCount = 0;
    let settingsChanged = false;

    for (const characterId of characterIds.map((id) => id.trim()).filter(Boolean)) {
      const entry = cleanupSettings[characterId];
      if (!entry?.enabled) continue;
      const days = Math.max(1, Math.round(Number(entry.days) || 0));
      if (entry.lastCleanupAt && now - entry.lastCleanupAt < days * oneDayMs) continue;
      removedCount += await cleanupProfileHomepagesForCharacters([characterId], days);
      cleanupSettings[characterId] = { ...entry, days, lastCleanupAt: now };
      settingsChanged = true;
    }

    if (settingsChanged) {
      await saveSettings({ ...settings.value, profileHomepageAutoCleanup: cleanupSettings });
    }
    return removedCount;
  }

  async function saveProfileTheme(theme: ProfileTheme) {
    const normalizedTheme = normalizeProfileTheme({
      ...theme,
      updatedAt: Date.now()
    }, theme.charId);
    if (!normalizedTheme) {
      showConfigAlert('请填写主页主题名称和提示词。', '无法保存主页主题');
      return null;
    }

    const index = profileThemes.value.findIndex((entry) => entry.id === normalizedTheme.id);
    if (index >= 0) profileThemes.value[index] = normalizedTheme;
    else profileThemes.value.push(normalizedTheme);
    await putEntity('profileThemes', normalizedTheme);
    await refreshActiveProfileThemeSnapshot(normalizedTheme);
    return normalizedTheme;
  }

  async function importProfileThemes(characterId: string, themes: ProfileTheme[]) {
    const normalizedThemes = normalizeProfileThemesForCharacter(themes, characterId).map((theme) => ({
      ...theme,
      id: createId('profile-theme'),
      charId: characterId,
      source: 'imported' as const,
      builtIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));
    if (!normalizedThemes.length) return [];
    profileThemes.value.push(...normalizedThemes);
    await Promise.all(normalizedThemes.map((theme) => putEntity('profileThemes', theme)));
    return normalizedThemes;
  }

  async function deleteProfileTheme(themeId: string) {
    const theme = profileThemes.value.find((entry) => entry.id === themeId);
    if (!theme || theme.builtIn) return false;
    profileThemes.value = profileThemes.value.filter((entry) => entry.id !== themeId);
    await deleteEntity('profileThemes', themeId);
    return true;
  }

  async function createSmallTheaterTopic(payload: Pick<SmallTheaterTopic, 'charId' | 'title' | 'prompt'> & Partial<Pick<SmallTheaterTopic, 'enabled'>>) {
    const now = Date.now();
    const topic = normalizeSmallTheaterTopic({
      ...payload,
      enabled: payload.enabled !== false,
      builtIn: false,
      createdAt: now,
      updatedAt: now
    }, payload.charId);
    if (!topic) {
      showConfigAlert('请填写小剧场题材标题。', '无法保存题材');
      return null;
    }

    smallTheaterTopics.value.push(topic);
    await putEntity('smallTheaterTopics', topic);
    return topic;
  }

  async function saveSmallTheaterTopic(topic: SmallTheaterTopic) {
    const normalizedTopic = normalizeSmallTheaterTopic({
      ...topic,
      updatedAt: Date.now()
    }, topic.charId);
    if (!normalizedTopic) {
      showConfigAlert('请填写小剧场题材标题。', '无法保存题材');
      return null;
    }

    const index = smallTheaterTopics.value.findIndex((entry) => entry.id === normalizedTopic.id);
    if (index >= 0) smallTheaterTopics.value[index] = normalizedTopic;
    else smallTheaterTopics.value.push(normalizedTopic);
    await putEntity('smallTheaterTopics', normalizedTopic);
    return normalizedTopic;
  }

  async function deleteSmallTheaterTopic(topicId: string) {
    const topic = smallTheaterTopics.value.find((entry) => entry.id === topicId);
    if (!topic) return false;
    smallTheaterTopics.value = smallTheaterTopics.value.filter((entry) => entry.id !== topicId);
    await deleteEntity('smallTheaterTopics', topicId);
    return true;
  }

  async function deleteSmallTheater(theaterId: string) {
    const theater = smallTheaters.value.find((entry) => entry.id === theaterId);
    if (!theater) return false;
    smallTheaters.value = smallTheaters.value.filter((entry) => entry.id !== theaterId);
    await deleteEntity('smallTheaters', theaterId);
    return true;
  }

  function smallTheatersForCleanup(characterIds: string[], olderThanDays: number) {
    const characterIdSet = new Set(characterIds.map((id) => id.trim()).filter(Boolean));
    const days = Math.max(1, Math.round(Number(olderThanDays) || 0));
    if (!characterIdSet.size || !days) return [];
    const cutoff = Date.now() - days * oneDayMs;
    return smallTheaters.value.filter((theater) => characterIdSet.has(theater.charId) && (theater.updatedAt ?? theater.createdAt) < cutoff);
  }

  async function cleanupSmallTheatersForCharacters(characterIds: string[], olderThanDays: number) {
    const theatersToDelete = smallTheatersForCleanup(characterIds, olderThanDays);
    for (const theater of theatersToDelete) {
      await deleteSmallTheater(theater.id);
    }
    return theatersToDelete.length;
  }

  async function runSmallTheaterAutoCleanupForCharacters(characterIds: string[]) {
    if (!settings.value) return 0;
    const now = Date.now();
    const cleanupSettings = { ...settings.value.smallTheaterAutoCleanup };
    let removedCount = 0;
    let settingsChanged = false;

    for (const characterId of characterIds.map((id) => id.trim()).filter(Boolean)) {
      const entry = cleanupSettings[characterId];
      if (!entry?.enabled) continue;
      const days = Math.max(1, Math.round(Number(entry.days) || 0));
      if (entry.lastCleanupAt && now - entry.lastCleanupAt < days * oneDayMs) continue;
      removedCount += await cleanupSmallTheatersForCharacters([characterId], days);
      cleanupSettings[characterId] = { ...entry, days, lastCleanupAt: now };
      settingsChanged = true;
    }

    if (settingsChanged) {
      await saveSettings({ ...settings.value, smallTheaterAutoCleanup: cleanupSettings });
    }
    return removedCount;
  }

  async function createSmallTheaterFromConversation(conversationId: string, topicId?: string, options?: { silent?: boolean }) {
    const conversation = conversationById(conversationId);
    if (generatingSmallTheaterConversationIds.has(conversationId)) return null;
    if (!conversation) return null;
    const character = characterById(conversation.charId);
    if (!character) return null;
    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return null;
    const chatSettings = settingsForConversation(conversationId);
    const modelOverride = getConversationTextModelOverride(chatSettings, 'theater');
    if (!hasConfiguredTextModel(modelOverride)) {
      if (!options?.silent) showConfigAlert('请先在聊天菜单里配置小剧场模型，或在设置里配置全局默认 API 模型。', '需要配置 API 模型');
      return null;
    }

    const topics = await ensureSmallTheaterTopicsForCharacter(character.id);
    const selectedTopic = topicId
      ? topics.find((topic) => topic.id === topicId)
      : (() => {
          const enabledTopics = topics.filter((topic) => topic.enabled);
          return enabledTopics[Math.floor(Math.random() * enabledTopics.length)] ?? null;
        })();
    if (!selectedTopic) {
      if (!options?.silent) showConfigAlert('请先开启或新增一个小剧场题材。', '无法生成小剧场');
      return null;
    }

    generatingSmallTheaterConversationIds.add(conversationId);
    try {
      const visibleMessages = visibleMessagesForConversation(conversationId);
      const recentVoomPosts = voomPosts.value
        .filter((post) => post.authorType !== 'user' && (post.charId === character.id || post.conversationId === conversationId || post.conversationIds?.includes(conversationId)))
        .sort((first, second) => second.createdAt - first.createdAt)
        .slice(0, 16);
      const result = await generateSmallTheater({
        context: {
          user: boundUser,
          character,
          boundUser,
          mode: conversation.activeMode,
          messages: visibleMessages,
          recentVoomPosts,
          worldBooks: worldBooks.value,
          conversationSummary: conversation.summary,
          memorySummary: await memoryContextForConversationAsync(conversationId, visibleMessages.slice(-8).map((message) => messageReadableContent(message)).join('\n'), {
            modelOverride: getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode)
          }),
          stickerVisionEnabled: chatSettings.stickerVisionEnabled,
          timeAwareness: chatSettings.timeAwareness,
          musicListening: musicListeningContextForConversation(conversationId)
        },
        topic: selectedTopic,
        settings: settings.value ?? undefined,
        modelOverride
      });
      const theater: SmallTheater = {
        id: createId('theater'),
        charId: character.id,
        conversationId: conversation.id,
        topicId: selectedTopic.id,
        topicTitle: selectedTopic.title,
        authorName: getCharacterAiName(character),
        authorAvatar: character.avatar,
        title: result.title,
        summary: result.summary,
        html: result.html,
        model: result.model,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      smallTheaters.value.unshift(theater);
      await putEntity('smallTheaters', theater);
      return theater;
    } finally {
      generatingSmallTheaterConversationIds.delete(conversationId);
    }
  }

  async function continueSmallTheater(theaterId: string, updateGuidance?: string) {
    const theater = smallTheaterById(theaterId);
    if (!theater) return null;
    const lockKey = `theater:${theater.id}`;
    if (generatingSmallTheaterConversationIds.has(lockKey)) return null;
    const conversation = theater.conversationId ? conversationById(theater.conversationId) : conversations.value.find((entry) => entry.charId === theater.charId);
    if (!conversation) return null;
    const character = characterById(theater.charId) ?? characterById(conversation.charId);
    if (!character) return null;
    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return null;
    const chatSettings = settingsForConversation(conversation.id);
    const modelOverride = getConversationTextModelOverride(chatSettings, 'theater');
    if (!hasConfiguredTextModel(modelOverride)) {
      showConfigAlert('请先在聊天菜单里配置小剧场模型，或在设置里配置全局默认 API 模型。', '需要配置 API 模型');
      return null;
    }

    const topics = await ensureSmallTheaterTopicsForCharacter(character.id);
    const now = Date.now();
    const selectedTopic = topics.find((topic) => topic.id === theater.topicId)
      ?? topics.find((topic) => topic.title === theater.topicTitle)
      ?? {
        id: theater.topicId || createId('topic'),
        charId: character.id,
        title: theater.topicTitle || '根据剧情随机发挥',
        prompt: theater.topicTitle || '根据原小剧场继续更新后续内容。',
        enabled: true,
        createdAt: theater.createdAt,
        updatedAt: now
      } satisfies SmallTheaterTopic;

    generatingSmallTheaterConversationIds.add(lockKey);
    try {
      const visibleMessages = visibleMessagesForConversation(conversation.id);
      const recentVoomPosts = voomPosts.value
        .filter((post) => post.authorType !== 'user' && (post.charId === character.id || post.conversationId === conversation.id || post.conversationIds?.includes(conversation.id)))
        .sort((first, second) => second.createdAt - first.createdAt)
        .slice(0, 16);
      const result = await generateSmallTheater({
        context: {
          user: boundUser,
          character,
          boundUser,
          mode: conversation.activeMode,
          messages: visibleMessages,
          recentVoomPosts,
          worldBooks: worldBooks.value,
          conversationSummary: conversation.summary,
          memorySummary: await memoryContextForConversationAsync(conversation.id, visibleMessages.slice(-8).map((message) => messageReadableContent(message)).join('\n'), {
            modelOverride: getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode)
          }),
          stickerVisionEnabled: chatSettings.stickerVisionEnabled,
          timeAwareness: chatSettings.timeAwareness,
          musicListening: musicListeningContextForConversation(conversation.id)
        },
        topic: selectedTopic,
        sourceTheater: theater,
        continuationGuidance: updateGuidance?.trim() || undefined,
        recentTheaters: smallTheatersForCharacter(character.id).filter((entry) => entry.id !== theater.id).slice(0, 8),
        settings: settings.value ?? undefined,
        modelOverride
      });
      const createdAt = Date.now();
      const nextTheater: SmallTheater = {
        id: createId('theater'),
        charId: character.id,
        conversationId: conversation.id,
        topicId: selectedTopic.id,
        topicTitle: selectedTopic.title,
        authorName: getCharacterAiName(character),
        authorAvatar: character.avatar,
        title: result.title,
        summary: result.summary,
        html: result.html,
        model: result.model,
        createdAt,
        updatedAt: createdAt
      };
      smallTheaters.value.unshift(nextTheater);
      await putEntity('smallTheaters', nextTheater);
      return nextTheater;
    } finally {
      generatingSmallTheaterConversationIds.delete(lockKey);
    }
  }

  async function forwardSmallTheaterToCharacter(theaterId: string, targetCharacterId: string) {
    const theater = smallTheaterById(theaterId);
    const targetCharacter = characterById(targetCharacterId);
    if (!theater || !targetCharacter) return null;
    const boundUser = userById(targetCharacter.boundUserId) ?? user.value;
    if (!boundUser) return null;
    const targetConversation = conversations.value.find((conversation) => conversation.charId === targetCharacter.id && conversation.userId === boundUser.id)
      ?? conversations.value.find((conversation) => conversation.charId === targetCharacter.id);
    if (!targetConversation) {
      showConfigAlert('没有找到这个角色的线上会话，暂时无法转发。', '无法转发小剧场');
      return null;
    }
    return appendUserSmallTheaterLinkMessage(targetConversation.id, theater);
  }

  function getVoomImageSizeLabel(provider: ImageModuleId) {
    if (!settings.value) return '720x1280';
    return getImageGenerationSize(settings.value, provider).size;
  }

  function isVoomPortraitPromptRequired() {
    return settings.value?.voomImageRequirePortrait !== false;
  }

  function buildVoomPortraitPrompt(post: VoomPost) {
    if (!isVoomPortraitPromptRequired()) return '';
    const authorName = voomAuthorNameForPost(post).trim();
    const subject = authorName ? `发布角色「${authorName}」本人` : '发布角色本人';
    return [
      `VOOM 人像模式开启：图片必须以${subject}为明确主体`,
      '必须生成清晰可见的人像、半身像或全身像，人物占据画面主要视觉焦点',
      '即使描述包含环境、物品或氛围，也要把人物放在前景主体位置，不能生成纯风景、纯物品、抽象图、空镜或无人物画面'
    ].join(', ');
  }

  function buildVoomImagePositivePrompt(basePrompt: string, imageDescription: string, post: VoomPost) {
    return [basePrompt, buildVoomPortraitPrompt(post), imageDescription].filter(Boolean).join(', ');
  }

  function buildVoomImageNegativePrompt(basePrompt: string) {
    if (!isVoomPortraitPromptRequired()) return basePrompt;
    return [
      basePrompt,
      '无人物, 空镜, 纯风景, 纯物品, 抽象背景, 看不到人物, no person, empty scene, scenery only, object only, abstract image, background only, missing person'
    ].filter(Boolean).join(', ');
  }

  async function generateChatImageCandidate(description: string) {
    const imageDescription = description.trim();
    const selectedModel = getSelectedImageModelOption(settings.value, 'onlineChat');
    if (!imageDescription || !settings.value || !selectedModel) return null;

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
    const imageUrl = result.imageUrl;
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
      showConfigAlert('请先在生图模型切换里选择一个已配置的生图模型。', '无法生成图片');
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
    if (!imageDescription) {
      showConfigAlert('请先填写 VOOM 配图描述。', '无法生成配图');
      return null;
    }
    if (!selectedModel) {
      showConfigAlert(isImageModelSelectionDisabled(settings.value.imageModelOverrides.voom)
        ? 'VOOM 生图已关闭，请先在生图模型切换里改回可用模型。'
        : '请先在生图模型切换里选择一个已配置的生图模型。', '无法生成配图');
      return null;
    }

    regeneratingVoomImagePostIds.add(normalizedPostId);
    const provider = selectedModel.provider;
    const promptPreset = getImagePromptPresetForProvider(settings.value, provider);
    const positivePrompt = buildVoomImagePositivePrompt(promptPreset.positivePrompt, imageDescription, post);
    const negativePrompt = buildVoomImageNegativePrompt(promptPreset.negativePrompt);
    const imageSize = getImageGenerationSize(settings.value, provider);
    let imageSettings = settings.value;
    const imageOverrides = {
      positivePrompt,
      negativePrompt,
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
      const imageUrl = result.imageUrl;
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
        negativePrompt,
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
    if (!settings.value || !selectedModel || !imageDescription) return post;

    regeneratingVoomImagePostIds.add(post.id);
    const provider = selectedModel.provider;
    const promptPreset = getImagePromptPresetForProvider(settings.value, provider);
    const positivePrompt = buildVoomImagePositivePrompt(promptPreset.positivePrompt, imageDescription, post);
    const negativePrompt = buildVoomImageNegativePrompt(promptPreset.negativePrompt);
    const imageSize = getImageGenerationSize(settings.value, provider);
    let imageSettings = settings.value;
    const imageOverrides = {
      positivePrompt,
      negativePrompt,
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
      const imageUrl = result.imageUrl;
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
        negativePrompt,
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

  function voomPostsForCleanup(characterIds: string[], olderThanDays: number) {
    const characterIdSet = new Set(characterIds.map((id) => id.trim()).filter(Boolean));
    const days = Math.max(1, Math.round(Number(olderThanDays) || 0));
    if (!characterIdSet.size || !days) return [];
    const cutoff = Date.now() - days * oneDayMs;
    return voomPosts.value.filter((post) => post.authorType !== 'user' && characterIdSet.has(post.charId) && post.createdAt < cutoff);
  }

  async function cleanupVoomPostsForCharacters(characterIds: string[], olderThanDays: number) {
    const postsToDelete = voomPostsForCleanup(characterIds, olderThanDays);
    for (const post of postsToDelete) {
      await deleteVoomPost(post.id);
    }
    return postsToDelete.length;
  }

  async function runVoomAutoCleanupForCharacters(characterIds: string[]) {
    if (!settings.value) return 0;
    const now = Date.now();
    const cleanupSettings = { ...settings.value.voomAutoCleanup };
    let removedCount = 0;
    let settingsChanged = false;

    for (const characterId of characterIds.map((id) => id.trim()).filter(Boolean)) {
      const entry = cleanupSettings[characterId];
      if (!entry?.enabled) continue;
      const days = Math.max(1, Math.round(Number(entry.days) || 0));
      if (entry.lastCleanupAt && now - entry.lastCleanupAt < days * oneDayMs) continue;
      removedCount += await cleanupVoomPostsForCharacters([characterId], days);
      cleanupSettings[characterId] = { ...entry, days, lastCleanupAt: now };
      settingsChanged = true;
    }

    if (settingsChanged) {
      await saveSettings({ ...settings.value, voomAutoCleanup: cleanupSettings });
    }
    return removedCount;
  }

  async function addVoomComment(postId: string, content: string, parentId = '') {
    const post = voomPosts.value.find((entry) => entry.id === postId);
    const parentName = parentId ? post?.comments.find((entry) => entry.id === parentId)?.authorName ?? '' : '';
    const trimmedContent = stripVoomCommentReplyPrefix(content, parentName);
    if (!post || !trimmedContent) return;

    const currentUser = user.value;
    const comment: VoomComment = {
      id: createId('comment'),
      authorName: getUserAiName(currentUser),
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
    const currentUserName = getUserAiName(user.value);
    if (!post) return;
    const currentUserLikeKeys = new Set([getUserAiName(user.value), getUserVoomAuthorName(user.value), getUserDisplayName(user.value)]
      .map((name) => name.trim().toLocaleLowerCase())
      .filter(Boolean));
    const wasLiked = post.likes.some((name) => currentUserLikeKeys.has(name.trim().toLocaleLowerCase()));

    const likes = wasLiked
      ? post.likes.filter((name) => !currentUserLikeKeys.has(name.trim().toLocaleLowerCase()))
      : [...post.likes, currentUserName];

    const targetConversations = conversationsForVoomPost(post);
    const authorName = voomAiAuthorNameForPost(post);
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

  async function replyToVoomComments(postId: string, options: { actorConversationId?: string; silent?: boolean; suppressGlobalNotice?: boolean } = {}) {
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
      const boundUserAuthorKeys = [getUserVoomAuthorName(boundUser), getUserAiName(boundUser)]
        .map((name) => name.trim().toLocaleLowerCase())
        .filter(Boolean);
      const userComments = post.comments
        .filter((comment) => comment.authorId === boundUser.id || boundUserAuthorKeys.includes(comment.authorName.trim().toLocaleLowerCase()))
        .slice(-4)
        .map((comment) => ({ ...comment, authorName: getUserAiName(boundUser), authorId: boundUser.id }));
      const aiPost: VoomPost = {
        ...post,
        authorName: voomAiAuthorNameForPost(post),
        comments: post.comments.map((comment) => ({ ...comment, authorName: voomCommentAiAuthorName(comment) }))
      };
      const replies = await generateVoomCommentReplies({
        context: {
          user: boundUser,
          character,
          boundUser,
          mode: conversation.activeMode,
          messages: visibleMessagesForConversation(conversation.id),
          worldBooks: worldBooks.value,
          conversationSummary: conversation.summary,
          memorySummary: await memoryContextForConversationAsync(conversation.id, [post.content, post.imageDescription ?? '', ...userComments.map((comment) => comment.content)].join('\n'), {
            modelOverride: getConversationTextModelOverride(chatSettings, 'summary', conversation.activeMode)
          }),
          stickerVisionEnabled: chatSettings.stickerVisionEnabled,
          timeAwareness: chatSettings.timeAwareness
        },
        post: aiPost,
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
      const characterAiName = getCharacterAiName(character);
      const characterVoomAuthorName = getCharacterVoomAuthorName(character);
      const characterAuthorAliases = new Set([character.id, character.nickname, character.name, characterAiName, post.authorName, characterVoomAuthorName]
        .map((name) => name.trim().toLocaleLowerCase())
        .filter(Boolean));
      const replyAuthorNameForIndex = (index: number) => {
        const authorName = replies[index]?.authorName.trim() ?? '';
        return characterAuthorAliases.has(authorName.toLocaleLowerCase()) ? characterAiName : authorName;
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
          authorId: characterAuthorAliases.has((replies[index]?.authorName.trim() ?? '').toLocaleLowerCase()) ? character.id : undefined,
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
      if (options.suppressGlobalNotice) {
        suppressVoomNoticeKeys([
          voomPostGlobalNoticeKey(nextPost.id),
          ...nextComments.map((comment) => voomCommentGlobalNoticeKey(nextPost.id, comment.id))
        ]);
      }
      await saveVoomPost(nextPost);
      await Promise.all(targetConversations.flatMap((targetConversation) => nextComments.map((comment) => appendConversationEvent(
        targetConversation.id,
        formatVoomCommentEvent(comment, nextPost.comments),
        { mode: targetConversation.activeMode, voomPostId: post.id, voomCommentId: comment.id, voomEventType: 'reply', createdAt: comment.createdAt }
      ))));
      return true;
    } catch (error) {
      if (options.silent) console.warn('VOOM comment reply failed.', error);
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
    charactersForFriendsDisplay,
    conversations,
    conversationsForActiveUser,
    conversationsForFriendsDisplay,
    sortedConversations,
    unreadConversationCount,
    messages,
    voomPosts,
    profileHomepages,
    smallTheaterTopics,
    smallTheaters,
    musicFavoriteTracks,
    musicCommentThreads,
    sortedVoomPosts,
    sortedProfileHomepages,
    sortedSmallTheaters,
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
    conversationMemoryAtoms,
    generatedImages,
    settings,
    hydrate,
    userById,
    characterById,
    conversationById,
    setActiveConversation,
    messagesForConversation,
    profileThemesForCharacter,
    enabledProfileThemesForCharacter,
    profileHomepagesForCharacter,
    smallTheaterTopicsForCharacter,
    smallTheatersForCharacter,
    smallTheaterById,
    generatedImagesForProvider,
    settingsForConversation,
    modelOverridesForConversation,
    memoriesForConversation,
    memoryAtomsForConversation,
    stickersForGroup,
    visibleMessagesForConversation,
    hiddenMessageIdsForConversation,
    memoryContextForConversation,
    nextReplyTokenCountForConversation,
    nextReplyTokenCountForConversationAsync,
    lastMessageForConversation,
    createMessageQuoteSnapshot,
    canFavoriteMessage,
    isMessageFavorited,
    addFavoriteMessage,
    deleteFavorite,
    showConfigAlert,
    isReplyingVoomComments,
    consumeSuppressedVoomNoticeKey,
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
    deleteCharacterProfileHistoryEntry,
    clearCharacterProfileHistory,
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
    appendUserMusicListenInviteMessage,
    appendUserSmallTheaterLinkMessage,
    updateTransferStatus,
    updateMusicListenInviteStatus,
    acceptMusicListenInvite,
    rejectMusicListenInvite,
    musicListeningContextForConversation,
    syncMusicFavoriteTracks,
    saveMusicFavoriteTrack,
    deleteMessages,
    updateMessageContent,
    updateMessageLocation,
    updateMessageTransfer,
    generateMessageVoiceAudio,
    recallMessage,
    summarizeConversationWindow,
    createManualIncrementalGrandSummary,
    updateMemoryRecord,
    deleteMemoryRecord,
    resummarizeMemory,
    toggleMemoryHiddenRange,
    updateMemoryHiddenRange,
    mergeConversationMemories,
    unmergeConversationMemories,
    maybeAutoMergeConversationMemories,
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
    ensureProfileThemesForCharacter,
    createProfileTheme,
    saveProfileTheme,
    importProfileThemes,
    deleteProfileTheme,
    deleteProfileHomepage,
    cleanupProfileHomepagesForCharacters,
    runProfileHomepageAutoCleanupForCharacters,
    ensureSmallTheaterTopicsForCharacter,
    createSmallTheaterTopic,
    saveSmallTheaterTopic,
    deleteSmallTheaterTopic,
    createSmallTheaterFromConversation,
    continueSmallTheater,
    forwardSmallTheaterToCharacter,
    deleteSmallTheater,
    cleanupSmallTheatersForCharacters,
    runSmallTheaterAutoCleanupForCharacters,
    regenerateVoomPostImage,
    applyVoomPostImageCandidate,
    cleanupVoomPostsForCharacters,
    runVoomAutoCleanupForCharacters,
    addVoomComment,
    toggleVoomLike,
    replyToVoomComments,
    deleteVoomPost,
  };
});