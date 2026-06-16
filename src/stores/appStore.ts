import { computed, ref, toRaw } from 'vue';
import { defineStore } from 'pinia';
import { deleteEntity, loadSnapshot, putEntity } from '@/data/db';
import { defaultStickerGroups } from '@/data/seed';
import type { AppSettings, CharacterProfile, ChatMessage, ChatMessageQuote, ChatMode, Conversation, ConversationMemoryRecord, ConversationSettings, Sticker, StickerGroup, UserProfile, VisualProfile, VoomComment, VoomPost, VoomPostVisibility, WorldBookEntry } from '@/types/domain';
import { createAccountId, createId } from '@/utils/id';
import { getCharacterVoomAuthorName, normalizeCharacterMindStateLines, normalizeCharacterProfile } from '@/utils/character';
import { normalizeUserProfile, normalizeVisualProfile } from '@/utils/profile';
import { mergeVendorModels, normalizeAppSettings } from '@/utils/settings';
import { normalizeWorldBookEntry } from '@/utils/worldBook';
import { createStickerFromDraft, createStickerGroup, normalizeSticker, normalizeStickerGroup, type StickerImportDraft } from '@/utils/stickers';
import { ageMemoryKind, createMemoryRecord, defaultChatMemorySettings, getHiddenMessageIds, getMemoryContext, getNextSummaryRange, getVisibleMessages, normalizeConversationSettings, renderSummaryPerspectiveInstruction, shouldCompressMemory } from '@/utils/memory';
import { formatContentWithChineseTranslation, normalizeTranslationText } from '@/utils/translation';
import { fetchVendorModels, generateConversationSummary, generateEmbeddingVector, generateRoleplayReply, generateUserVoomComments, generateVoomCommentReplies, generateVoomPost, hasTextGenerationConfig, shouldAutoGenerateMoment, type RoleplayReplyResult } from '@/services/ai';

interface CreateUserVoomPostPayload {
  userId: string;
  content: string;
  image?: string;
  imageDescription?: string;
  visibility: VoomPostVisibility;
  characterIds: string[];
}

export const useAppStore = defineStore('app', () => {
  const ready = ref(false);
  let hydratePromise: Promise<void> | null = null;
  const loadingReply = ref(false);
  const replyingVoomCommentPostIds = ref<string[]>([]);
  const configAlert = ref({ open: false, title: '提示', message: '' });
  const users = ref<UserProfile[]>([]);
  const characters = ref<CharacterProfile[]>([]);
  const conversations = ref<Conversation[]>([]);
  const activeConversationId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const voomPosts = ref<VoomPost[]>([]);
  const worldBooks = ref<WorldBookEntry[]>([]);
  const stickerGroups = ref<StickerGroup[]>([]);
  const stickers = ref<Sticker[]>([]);
  const conversationSettings = ref<ConversationSettings[]>([]);
  const conversationMemories = ref<ConversationMemoryRecord[]>([]);
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
  const sortedStickerGroups = computed(() => [...stickerGroups.value].sort((a, b) => a.createdAt - b.createdAt));
  const sortedStickers = computed(() => [...stickers.value].sort((a, b) => b.updatedAt - a.updatedAt));
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
    worldBooks.value = snapshot.worldBooks;
    const normalizedGroups = snapshot.stickerGroups
      .map((entry) => normalizeStickerGroup(entry))
      .filter((entry): entry is StickerGroup => Boolean(entry));
    if (!normalizedGroups.length) {
      const fallbackGroup = { ...defaultStickerGroups[0], createdAt: Date.now(), updatedAt: Date.now() };
      normalizedGroups.push(fallbackGroup);
      await putEntity('stickerGroups', fallbackGroup);
    }
    const defaultGroup = normalizedGroups.find((group) => group.id === defaultStickerGroups[0].id);
    if (defaultGroup && defaultGroup.name !== defaultStickerGroups[0].name) {
      defaultGroup.name = defaultStickerGroups[0].name;
      defaultGroup.updatedAt = Date.now();
      await putEntity('stickerGroups', defaultGroup);
    }
    const fallbackGroupId = normalizedGroups[0]?.id ?? '';
    const normalizedStickers = snapshot.stickers
      .map((entry) => normalizeSticker(entry, fallbackGroupId))
      .filter((entry): entry is Sticker => Boolean(entry));
    const { dedupedGroups, dedupedStickers, removedGroupIds } = dedupeStickerGroups(normalizedGroups, normalizedStickers);
    stickerGroups.value = dedupedGroups;
    stickers.value = dedupedStickers;
    if (removedGroupIds.length) {
      await Promise.all([
        ...removedGroupIds.map((groupId) => deleteEntity('stickerGroups', groupId)),
        ...dedupedStickers.map((sticker) => putEntity('stickers', sticker))
      ]);
    }
    conversationSettings.value = snapshot.conversationSettings.map((entry) => normalizeConversationSettings(entry, entry.conversationId));
    conversationMemories.value = snapshot.conversationMemories.map((memory) => ({
      ...memory,
      kind: ageMemoryKind(memory.createdAt),
      vector: Array.isArray(memory.vector) ? memory.vector : []
    }));
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
    if (!groupId || groupId === 'all') return sortedStickers.value;
    return sortedStickers.value.filter((sticker) => sticker.groupIds[0] === groupId);
  }

  function stickersForGroups(groupIds: string[]) {
    const groupIdSet = new Set(groupIds.map((id) => id.trim()).filter(Boolean));
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

  function isReplyingVoomComments(postId: string) {
    return replyingVoomCommentPostIds.value.includes(postId);
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

  function formatVoomLikeEvent(likes: string[], authorName: string) {
    return `【VOOM】${likes.join('、')} 赞了 ${authorName} 的动态。`;
  }

  function createPersistableVoomPost(post: VoomPost): VoomPost {
    const rawPost = toRaw(post);
    return {
      ...rawPost,
      conversationIds: rawPost.conversationIds ? [...rawPost.conversationIds] : undefined,
      visibleCharacterIds: rawPost.visibleCharacterIds ? [...rawPost.visibleCharacterIds] : undefined,
      comments: rawPost.comments.map((comment) => ({ ...toRaw(comment) })),
      likes: [...rawPost.likes]
    };
  }

  async function appendConversationEvent(conversationId: string, content: string, options: Partial<Pick<ChatMessage, 'mode' | 'voomPostId' | 'voomCommentId' | 'voomEventType' | 'createdAt'>> = {}) {
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
      voomEventType: options.voomEventType
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

  function cloneMessageQuote(quote?: ChatMessageQuote | null): ChatMessageQuote | undefined {
    if (!quote?.messageId || !quote.content.trim()) return undefined;
    return {
      messageId: quote.messageId,
      sender: quote.sender,
      authorName: quote.authorName.trim() || '未知',
      content: quote.content.trim(),
      sticker: quote.sticker ? { ...quote.sticker } : undefined
    };
  }

  function messageReadableContent(message: ChatMessage) {
    return (message.sticker ? `[Sticker] ${message.sticker.description}` : message.content).trim();
  }

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

  function summaryPerspectiveInstructionFor(conversation: Conversation, chatSettings: ConversationSettings) {
    const character = characterById(conversation.charId);
    const boundUser = character ? userById(character.boundUserId) ?? user.value : user.value;
    return renderSummaryPerspectiveInstruction(chatSettings.memory.summaryPerspective, {
      userName: boundUser?.name || boundUser?.nickname || '{{user}}',
      characterName: character?.name || character?.nickname || '{{char}}'
    });
  }

  function createMessageQuoteSnapshot(message: ChatMessage): ChatMessageQuote | null {
    const content = messageReadableContent(message);
    if (!content) return null;
    return {
      messageId: message.id,
      sender: message.sender,
      authorName: messageAuthorName(message),
      content,
      sticker: message.sticker ? { ...message.sticker } : undefined
    };
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

  async function updateMessageContent(messageId: string, content: string) {
    const trimmedContent = content.trim();
    if (!trimmedContent) return null;
    const messageIndex = messages.value.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return null;
    const existingMessage = messages.value[messageIndex];
    const nextMessage: ChatMessage = {
      ...existingMessage,
      content: existingMessage.sticker ? `[Sticker] ${trimmedContent}` : trimmedContent,
      sticker: existingMessage.sticker ? { ...existingMessage.sticker, description: trimmedContent } : existingMessage.sticker,
      editedAt: Date.now()
    };
    messages.value[messageIndex] = nextMessage;
    await putEntity('messages', nextMessage);
    await pruneMemoriesForMessageIds([nextMessage.id]);
    await touchConversationAfterMessageChange(nextMessage.conversationId, nextMessage.editedAt);
    return nextMessage;
  }

  async function recallMessage(messageId: string, options: { actor?: 'user' | 'char' } = {}) {
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
      { mode: targetMessage.mode }
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
    settings.value = normalizeAppSettings({ ...settings.value, activeUserId: userId });
    await putEntity('settings', settings.value, 'main');
  }

  async function saveVisualProfile(nextProfile: VisualProfile) {
    if (!user.value) return;
    await saveUserProfile({ ...user.value, profile: normalizeVisualProfile(nextProfile, user.value) });
  }

  async function saveCharacter(nextCharacter: CharacterProfile) {
    const normalizedCharacter = normalizeCharacterProfile(nextCharacter, user.value?.id || users.value[0]?.id || '');
    const existingCharacter = characters.value.find((character) => character.id === normalizedCharacter.id);
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

  async function updateCharacterMindState(characterId: string, lines: unknown, conversationId: string) {
    const character = characterById(characterId);
    const mindStateLines = normalizeCharacterMindStateLines(lines);
    if (!character || !mindStateLines.length) return;

    await saveCharacter({
      ...character,
      mindState: {
        lines: mindStateLines,
        updatedAt: Date.now(),
        readAt: character.mindState?.readAt ?? 0,
        sourceConversationId: conversationId
      }
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
    const normalizedGroup = normalizeStickerGroup({ ...nextGroup, updatedAt: Date.now() });
    if (!normalizedGroup) return;
    const index = stickerGroups.value.findIndex((group) => group.id === normalizedGroup.id);
    if (index >= 0) stickerGroups.value[index] = normalizedGroup;
    else stickerGroups.value.push(normalizedGroup);
    await putEntity('stickerGroups', normalizedGroup);
  }

  async function addStickerGroup(name: string) {
    const group = createStickerGroup(name);
    stickerGroups.value.push(group);
    await putEntity('stickerGroups', group);
    return group;
  }

  async function deleteStickerGroup(groupId: string) {
    if (stickerGroups.value.length <= 1) {
      showConfigAlert('至少需要保留一个 Stickers 分组。', '无法删除分组');
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

  async function saveSticker(nextSticker: Sticker) {
    const fallbackGroupId = stickerGroups.value[0]?.id ?? '';
    const normalizedSticker = normalizeSticker({ ...nextSticker, updatedAt: Date.now() }, fallbackGroupId);
    if (!normalizedSticker) return;
    const index = stickers.value.findIndex((sticker) => sticker.id === normalizedSticker.id);
    if (index >= 0) stickers.value[index] = normalizedSticker;
    else stickers.value.unshift(normalizedSticker);
    await putEntity('stickers', normalizedSticker);
  }

  async function importStickers(drafts: StickerImportDraft[], groupIds: string[]) {
    const fallbackGroupId = stickerGroups.value[0]?.id ?? '';
    const targetGroupIds = [...new Set((groupIds.length ? groupIds : [fallbackGroupId]).filter(Boolean))];
    const existingKeys = new Set(stickers.value.map((sticker) => `${sticker.description.toLocaleLowerCase()}::${sticker.imageUrl}`));
    const createdStickers = drafts
      .map((draft) => createStickerFromDraft(draft, targetGroupIds))
      .filter((sticker) => {
        const key = `${sticker.description.toLocaleLowerCase()}::${sticker.imageUrl}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
    if (!createdStickers.length) return [];
    stickers.value.unshift(...createdStickers);
    await Promise.all(createdStickers.map((sticker) => putEntity('stickers', sticker)));
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
    if (!normalizedGroupId) return 0;
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
    const relatedSettings = conversationId ? conversationSettings.value.find((entry) => entry.conversationId === conversationId) : undefined;
    const relatedLocalWorldBooks = worldBooks.value.filter((book) => book.scope === 'local' && character.localWorldBookIds.includes(book.id));
    const relatedLocalWorldBookIds = new Set(relatedLocalWorldBooks.map((book) => book.id));
    const characterNameKeys = new Set([character.id, character.nickname, character.name, character.userNote, getCharacterVoomAuthorName(character)]
      .map((name) => name.trim().toLocaleLowerCase())
      .filter(Boolean));
    const postsToDelete: VoomPost[] = [];
    const postsToUpdate: VoomPost[] = [];

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
      const touchedPost = post.conversationId === conversationId
        || postConversationIds.includes(conversationId)
        || post.visibleCharacterIds?.includes(characterId)
        || nextComments.length !== post.comments.length
        || nextLikes.length !== post.likes.length;

      if (!touchedPost) continue;

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
    if (relatedSettings) conversationSettings.value = conversationSettings.value.filter((entry) => entry.conversationId !== conversationId);
    voomPosts.value = voomPosts.value
      .filter((post) => !postDeleteIds.has(post.id))
      .map((post) => postUpdateMap.get(post.id) ?? post);
    worldBooks.value = worldBooks.value.filter((book) => !relatedLocalWorldBookIds.has(book.id));

    if (relatedLocalWorldBookIds.size) {
      const affectedCharacters = characters.value.filter((entry) => entry.id !== characterId && entry.localWorldBookIds.some((id) => relatedLocalWorldBookIds.has(id)));
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

    const nextCharacter = normalizeCharacterProfile({
      ...character,
      subtitle: '刚刚成为好友',
      lastSeen: '现在',
      localWorldBookIds: [],
      voomFrequency: 'medium',
      mindState: undefined,
      profile: undefined
    }, character.boundUserId);
    const characterIndex = characters.value.findIndex((entry) => entry.id === characterId);
    if (characterIndex >= 0) characters.value[characterIndex] = nextCharacter;

    const nextConversation = conversation ? {
      ...conversation,
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
      ...(relatedSettings ? [deleteEntity('conversationSettings', relatedSettings.conversationId)] : []),
      ...postsToDelete.map((post) => deleteEntity('voomPosts', post.id)),
      ...postsToUpdate.map((post) => putEntity('voomPosts', post)),
      ...relatedLocalWorldBooks.map((book) => deleteEntity('worldBooks', book.id))
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

  async function saveSettings(nextSettings: AppSettings) {
    const normalizedSettings = normalizeAppSettings(nextSettings);
    settings.value = normalizedSettings;
    await putEntity('settings', normalizedSettings, 'main');
    void refreshEnabledVendorModels();
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

    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId,
      sender: 'user',
      mode: conversation.activeMode,
      content: `[Sticker] ${sticker.description}`,
      sticker: {
        stickerId: sticker.id,
        description: sticker.description,
        imageUrl: sticker.imageUrl
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

  async function summarizeConversationWindow(conversationId: string, options: { forceStartFloor?: number; forceEndFloor?: number; hiddenStartFloor?: number; hiddenEndFloor?: number; allowPartial?: boolean } = {}) {
    const conversation = conversationById(conversationId);
    if (!conversation) return null;
    const chatSettings = settingsForConversation(conversationId);
    const conversationMessages = messagesForConversation(conversationId);
    const memories = memoriesForConversation(conversationId);
    const nextRange = getNextSummaryRange(conversationMessages, memories, chatSettings, conversation.activeMode);
    const completedEndFloor = memories.reduce((max, memory) => Math.max(max, memory.endFloor), 0);
    const partialStartFloor = completedEndFloor + 1;
    const partialEndFloor = conversationMessages.length;
    const partialLength = partialEndFloor - partialStartFloor + 1;
    const partialKeepTail = Math.min(10, Math.max(1, Math.ceil(partialLength * 0.1)));
    const range = options.forceStartFloor && options.forceEndFloor
      ? {
          startFloor: options.forceStartFloor,
          endFloor: options.forceEndFloor,
          hiddenStartFloor: options.hiddenStartFloor ?? options.forceStartFloor,
          hiddenEndFloor: options.hiddenEndFloor ?? Math.max(options.forceStartFloor - 1, options.forceEndFloor - Math.min(10, Math.max(1, Math.ceil((options.forceEndFloor - options.forceStartFloor + 1) * 0.1)))),
          sourceMessages: conversationMessages.slice(options.forceStartFloor - 1, options.forceEndFloor)
        }
      : nextRange ?? (options.allowPartial && partialLength > 0
        ? {
            startFloor: partialStartFloor,
            endFloor: partialEndFloor,
            hiddenStartFloor: partialStartFloor,
            hiddenEndFloor: Math.max(partialStartFloor - 1, partialEndFloor - partialKeepTail),
            sourceMessages: conversationMessages.slice(partialStartFloor - 1, partialEndFloor)
          }
        : null);

    if (!range || !range.sourceMessages.length) return null;

    const character = characterById(conversation.charId);
    const modelOverride = chatSettings.memory.summaryModel || chatSettings.modelOverrides[conversation.activeMode];
    const perspectiveInstruction = summaryPerspectiveInstructionFor(conversation, chatSettings);
    const summary = await generateConversationSummary({
      messages: range.sourceMessages.map((message, index) => {
        const floor = range.startFloor + index;
        const sender = message.sender === 'user' ? '用户' : message.sender === 'char' ? character?.nickname || '角色' : '系统';
        return `${floor}楼 ${sender}: ${message.content}`;
      }).join('\n'),
      previousSummary: getMemoryContext(memories),
      settings: settings.value ?? undefined,
      modelOverride,
      promptOverride: defaultChatMemorySettings.summaryPrompt,
      perspectiveInstruction
    });
    const hasHiddenRange = chatSettings.memory.hideSummarizedMessages && range.hiddenStartFloor > 0 && range.hiddenEndFloor >= range.hiddenStartFloor;
    const vector = chatSettings.memory.vectorMemoryEnabled
      ? await generateEmbeddingVector({
          text: summary,
          settings: settings.value ?? undefined,
          modelOverride
        })
      : [];
    const record = createMemoryRecord({
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
    conversationMemories.value.push(record);
    await putEntity('conversationMemories', record);
    return record;
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
      mergedFrom: nextMemory.mergedFrom?.map((memory) => ({
        ...memory,
        vector: Array.isArray(memory.vector) ? [...memory.vector] : [],
        sourceMessageIds: Array.isArray(memory.sourceMessageIds) ? [...memory.sourceMessageIds] : [],
        mergedFrom: undefined
      })),
      updatedAt: Date.now()
    };
    const index = conversationMemories.value.findIndex((memory) => memory.id === normalizedMemory.id);
    if (index >= 0) conversationMemories.value[index] = normalizedMemory;
    else conversationMemories.value.push(normalizedMemory);
    await putEntity('conversationMemories', normalizedMemory);
  }

  async function deleteMemoryRecord(memoryId: string) {
    conversationMemories.value = conversationMemories.value.filter((memory) => memory.id !== memoryId);
    await deleteEntity('conversationMemories', memoryId);
  }

  async function resummarizeMemory(memoryId: string) {
    const memory = conversationMemories.value.find((entry) => entry.id === memoryId);
    if (!memory) return null;
    await deleteMemoryRecord(memory.id);
    return summarizeConversationWindow(memory.conversationId, {
      forceStartFloor: memory.startFloor,
      forceEndFloor: memory.endFloor
    });
  }

  async function toggleMemoryHiddenRange(memoryId: string, hidden: boolean) {
    const memory = conversationMemories.value.find((entry) => entry.id === memoryId);
    if (!memory) return;
    const keepTail = Math.min(10, Math.max(1, Math.ceil((memory.endFloor - memory.startFloor + 1) * 0.1)));
    await updateMemoryRecord({
      ...memory,
      hiddenStartFloor: hidden ? memory.startFloor : 0,
      hiddenEndFloor: hidden ? Math.max(memory.startFloor - 1, memory.endFloor - keepTail) : 0
    });
  }

  async function mergeConversationMemories(conversationId: string, memoryIds?: string[]) {
    const conversation = conversationById(conversationId);
    if (!conversation) return null;
    const selectedIds = new Set(memoryIds ?? []);
    const memories = memoriesForConversation(conversationId).filter((memory) => !memory.isMergedSummary && (!selectedIds.size || selectedIds.has(memory.id)));
    if (memories.length <= 1) return null;

    const chatSettings = settingsForConversation(conversationId);
    const modelOverride = chatSettings.memory.summaryModel || chatSettings.modelOverrides[conversation.activeMode];
    const perspectiveInstruction = summaryPerspectiveInstructionFor(conversation, chatSettings);
    const summary = await generateConversationSummary({
      messages: memories.map((memory) => `【${memory.startFloor}-${memory.endFloor}楼】\n${memory.summary}`).join('\n\n'),
      previousSummary: '',
      settings: settings.value ?? undefined,
      modelOverride,
      promptOverride: defaultChatMemorySettings.mergeSummaryPrompt,
      perspectiveInstruction
    });
    const vector = chatSettings.memory.vectorMemoryEnabled
      ? await generateEmbeddingVector({
          text: summary,
          settings: settings.value ?? undefined,
          modelOverride
        })
      : [];
    const mergedRecord: ConversationMemoryRecord = {
      id: createId('memory'),
      conversationId,
      mode: conversation.activeMode,
      kind: 'long-term',
      startFloor: memories[0].startFloor,
      endFloor: memories[memories.length - 1].endFloor,
      hiddenStartFloor: memories.reduce((min, memory) => memory.hiddenStartFloor ? Math.min(min, memory.hiddenStartFloor) : min, Number.POSITIVE_INFINITY),
      hiddenEndFloor: memories.reduce((max, memory) => Math.max(max, memory.hiddenEndFloor), 0),
      summary,
      tokenCount: Math.max(0, Math.round(summary.length / 2)),
      vector,
      sourceMessageIds: memories.flatMap((memory) => memory.sourceMessageIds),
      model: modelOverride || settings.value?.model || '',
      isMergedSummary: true,
      mergedFrom: memories.map((memory) => ({
        ...memory,
        vector: Array.isArray(memory.vector) ? [...memory.vector] : [],
        sourceMessageIds: Array.isArray(memory.sourceMessageIds) ? [...memory.sourceMessageIds] : [],
        mergedFrom: undefined
      })),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (!Number.isFinite(mergedRecord.hiddenStartFloor)) mergedRecord.hiddenStartFloor = 0;

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

    const restoredMemories = mergedMemory.mergedFrom.map((memory) => ({
      ...memory,
      vector: Array.isArray(memory.vector) ? [...memory.vector] : [],
      sourceMessageIds: Array.isArray(memory.sourceMessageIds) ? [...memory.sourceMessageIds] : []
    }));
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
    const chatSettings = settingsForConversation(conversationId);
    await Promise.all(oldMemories.map(async (memory) => {
      const conversation = conversationById(memory.conversationId);
      const summary = await generateConversationSummary({
        messages: memory.summary,
        previousSummary: '',
        settings: settings.value ?? undefined,
        modelOverride: chatSettings.memory.summaryModel || chatSettings.modelOverrides[memory.mode],
        promptOverride: defaultChatMemorySettings.summaryPrompt,
        perspectiveInstruction: conversation ? summaryPerspectiveInstructionFor(conversation, chatSettings) : undefined
      });
      await updateMemoryRecord({
        ...memory,
        kind: 'long-term',
        summary,
        compressedAt: Date.now()
      });
    }));
  }

  async function requestRoleplayReply(conversationId: string, options?: { generateMoment?: boolean }) {
    const conversation = conversationById(conversationId);
    if (!conversation || loadingReply.value) return;
    const character = characterById(conversation.charId);
    if (!character) return;
    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return;

    const conversationMessages = messagesForConversation(conversationId);
    const lastUserMessages = [...conversationMessages].reverse().filter((message, index, reversedMessages) => {
      const previousMessages = reversedMessages.slice(0, index);
      return message.sender === 'user' && !previousMessages.some((previous) => previous.sender === 'char');
    }).reverse();

    if (!lastUserMessages.length) return;
    const userMessageText = lastUserMessages.map((message) => message.sticker ? `[Sticker] ${message.sticker.description}` : message.content).join('\n');
    const chatSettings = settingsForConversation(conversationId);
    if (!hasConfiguredTextModel(chatSettings.modelOverrides[conversation.activeMode])) {
      showConfigAlert('请先在设置或聊天菜单里配置可用的线上/线下聊天 API 模型，再让角色回复。', '需要配置 API 模型');
      return;
    }

    loadingReply.value = true;
    try {
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
        timeAwareness: chatSettings.timeAwareness,
        availableStickers: availableCharacterStickers.map((sticker) => ({
          stickerId: sticker.id,
          description: sticker.description,
          imageUrl: sticker.imageUrl
        })),
        userMessage: userMessageText,
        settings: settings.value ?? undefined,
        modelOverride: chatSettings.modelOverrides[conversation.activeMode]
      });
      const parsedReply = JSON.parse(replyPayload) as RoleplayReplyResult;
      const replyTexts = Array.isArray(parsedReply.replies) ? parsedReply.replies : [parsedReply.reply];
      const replyTranslations = Array.isArray(parsedReply.replyTranslations) ? parsedReply.replyTranslations : [];
      const replyMessages = replyTexts
        .map((reply, index) => ({
          content: String(reply ?? '').trim(),
          translation: conversation.activeMode === 'online' ? normalizeTranslationText(replyTranslations[index]) : ''
        }))
        .filter((reply) => Boolean(reply.content));
      const narrationMessages = conversation.activeMode === 'online' && chatSettings.narrationModeEnabled
        ? (parsedReply.narrations ?? [])
          .map((narration) => String(narration ?? '').trim())
          .filter(Boolean)
          .slice(0, 3)
        : [];
      const replyStickers = resolveCharacterStickerSelections(parsedReply.stickers, availableCharacterStickers);
      const recallMessageIds = parsedReply.messageActions?.recallMessageIds ?? [];
      const validRecallMessageIds = recallMessageIds.filter((messageId) => messages.value.some((message) => message.id === messageId && message.conversationId === conversationId && message.sender === 'char'));
      const quoteByReplyIndex = new Map<number, ChatMessageQuote>();
      for (const quoteAction of parsedReply.messageActions?.quotes ?? []) {
        const targetMessage = messages.value.find((message) => message.id === quoteAction.messageId && message.conversationId === conversationId && message.sender === 'user');
        const quote = targetMessage ? createMessageQuoteSnapshot(targetMessage) : null;
        if (quote) quoteByReplyIndex.set(Math.max(0, Math.floor(quoteAction.replyIndex)), quote);
      }
      if (!replyMessages.length && !replyStickers.length && !narrationMessages.length && !validRecallMessageIds.length) {
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
        if (profileUpdate.narration.trim()) {
          const narrationMessage: ChatMessage = {
            id: createId('msg'),
            conversationId,
            sender: 'system',
            mode: conversation.activeMode,
            content: profileUpdate.narration.trim(),
            createdAt: Date.now(),
            displayStyle: 'narration',
            status: 'sent'
          };
          messages.value.push(narrationMessage);
          await putEntity('messages', narrationMessage);
        }
      }
      if (conversation.activeMode === 'online' && profileUpdate?.innerMonologue?.length) {
        await updateCharacterMindState(character.id, profileUpdate.innerMonologue, conversationId);
      }
      for (const messageId of validRecallMessageIds) {
        await recallMessage(messageId, { actor: 'char' });
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
        status: 'sent' as const
      } satisfies ChatMessage));
      const charTextMessages = replyMessages.map((reply, index) => ({
        id: createId('msg'),
        conversationId,
        sender: 'char' as const,
        mode: conversation.activeMode,
        content: reply.content,
        translation: reply.translation || undefined,
        quote: quoteByReplyIndex.get(index),
        createdAt: createdAt + charNarrationMessages.length + index,
        status: 'sent' as const
      } satisfies ChatMessage));
      const charStickerMessages = replyStickers.map((sticker, index) => ({
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
        createdAt: createdAt + charNarrationMessages.length + charTextMessages.length + index,
        status: 'sent' as const
      } satisfies ChatMessage));
      const charMessages = [...charNarrationMessages, ...charTextMessages, ...charStickerMessages];
      if (charMessages.length) {
        messages.value.push(...charMessages);
        await Promise.all(charMessages.map((message) => putEntity('messages', message)));
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

      const shouldGenerate = options?.generateMoment || (chatSettings.autoGenerateVoom && shouldAutoGenerateMoment(chatSettings.voomFrequency));
      if (shouldGenerate) {
        await createMomentFromConversation(conversationId);
      }
    } catch (error) {
      showConfigAlert(error instanceof Error ? error.message : 'AI 回复失败，请检查 API 模型配置。', '回复异常');
    } finally {
      loadingReply.value = false;
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

  async function regenerateLatestReply(conversationId: string) {
    const conversation = conversationById(conversationId);
    if (!conversation || loadingReply.value) return false;

    const conversationMessages = messagesForConversation(conversationId).filter((message) => message.mode === conversation.activeMode);
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

    const messagesToRemove = conversationMessages.slice(firstCharIndex, latestCharIndex + 1);
    await deleteMessages(messagesToRemove.map((message) => message.id));

    await requestRoleplayReply(conversationId);
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
      if (chatSettings.modelOverrides.voom && hasConfiguredTextModel(chatSettings.modelOverrides.voom)) return chatSettings.modelOverrides.voom;
    }
    for (const targetConversation of targetConversations) {
      const chatSettings = settingsForConversation(targetConversation.id);
      const modelOverride = chatSettings.modelOverrides[targetConversation.activeMode];
      if (modelOverride && hasConfiguredTextModel(modelOverride)) return modelOverride;
    }
    return hasConfiguredTextModel('') ? '' : null;
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
        targetCharacters,
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

    const image = payload.image?.trim() || '';
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
    if (!conversation) return;
    const character = characterById(conversation.charId);
    if (!character) return;
    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return;
    const chatSettings = settingsForConversation(conversationId);
    if (!hasConfiguredTextModel(chatSettings.modelOverrides.voom)) {
      showConfigAlert('请先在聊天菜单里配置 VOOM 模型，或在设置里配置全局默认 API 模型。', '需要配置 API 模型');
      return;
    }
    const moment = await generateVoomPost(
      {
        user: boundUser,
        character,
        boundUser,
        mode: conversation.activeMode,
        messages: visibleMessagesForConversation(conversationId),
        worldBooks: worldBooks.value,
        conversationSummary: conversation.summary,
        memorySummary: memoryContextForConversation(conversationId),
        stickerVisionEnabled: chatSettings.stickerVisionEnabled,
        timeAwareness: chatSettings.timeAwareness
      },
      settings.value ?? undefined,
      chatSettings.modelOverrides.voom
    );
    const post: VoomPost = { ...moment, id: createId('voom'), conversationId: conversation.id, authorName: getCharacterVoomAuthorName(character), authorAvatar: character.avatar, createdAt: Date.now() };
    post.comments = post.comments.map((comment, index) => ({
      ...comment,
      createdAt: post.createdAt + post.likes.length + index + 1
    }));
    voomPosts.value.unshift(post);
    await putEntity('voomPosts', post);
    await recordVoomPostEvents(post, conversation.activeMode);
    return post;
  }

  async function saveVoomPost(nextPost: VoomPost) {
    const persistablePost = createPersistableVoomPost(nextPost);
    const index = voomPosts.value.findIndex((post) => post.id === nextPost.id);
    if (index >= 0) voomPosts.value[index] = persistablePost;
    else voomPosts.value.unshift(persistablePost);
    await putEntity('voomPosts', persistablePost);
  }

  async function addVoomComment(postId: string, content: string, parentId = '') {
    const trimmedContent = content.trim();
    const post = voomPosts.value.find((entry) => entry.id === postId);
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

  async function replyToVoomComments(postId: string) {
    if (isReplyingVoomComments(postId)) return;

    const post = voomPosts.value.find((entry) => entry.id === postId);
    if (!post) return;

    const targetConversations = conversationsForVoomPost(post);
    const conversation = targetConversations[0];
    if (!conversation) return;

    const character = characterById(conversation.charId);
    if (!character) return;

    const boundUser = userById(character.boundUserId) ?? user.value;
    if (!boundUser) return;
    const chatSettings = settingsForConversation(conversation.id);
    const modelOverride = chatSettings.modelOverrides.voom || chatSettings.modelOverrides[conversation.activeMode];
    if (!hasConfiguredTextModel(modelOverride)) {
      showConfigAlert('请先配置 VOOM 或当前聊天模式的 API 模型，再让角色回复评论区。', '需要配置 API 模型');
      return;
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
      const existingCommentIds = new Set(post.comments.map((comment) => comment.id));
      const generatedIds = replies.map(() => createId('comment'));
      const generatedIdByDraftId = new Map(replies.flatMap((reply, index) => reply.draftId ? [[reply.draftId, generatedIds[index]]] : []));
      const characterVoomAuthorName = getCharacterVoomAuthorName(character);
      const characterAuthorAliases = new Set([character.nickname, character.name, post.authorName, characterVoomAuthorName]
        .map((name) => name.trim().toLocaleLowerCase())
        .filter(Boolean));
      const nextComments: VoomComment[] = replies.map((reply, index) => {
        const resolvedParentId = reply.parentId && existingCommentIds.has(reply.parentId)
          ? reply.parentId
          : reply.parentId
            ? generatedIdByDraftId.get(reply.parentId)
            : '';
        const replyAuthorName = reply.authorName.trim();
        return {
          id: generatedIds[index],
          authorName: characterAuthorAliases.has(replyAuthorName.toLocaleLowerCase()) ? characterVoomAuthorName : replyAuthorName,
          content: reply.content,
          contentTranslation: reply.contentTranslation,
          parentId: resolvedParentId && resolvedParentId !== generatedIds[index] ? resolvedParentId : undefined,
          createdAt: createdAt + index
        };
      });

      const nextPost = {
        ...post,
        conversationId: post.conversationId || conversation.id,
        conversationIds: targetConversations.map((targetConversation) => targetConversation.id),
        comments: [...post.comments, ...nextComments]
      };
      await saveVoomPost(nextPost);
      await Promise.all(targetConversations.flatMap((targetConversation) => nextComments.map((comment) => appendConversationEvent(
        targetConversation.id,
        formatVoomCommentEvent(comment, nextPost.comments),
        { mode: targetConversation.activeMode, voomPostId: post.id, voomCommentId: comment.id, voomEventType: 'reply', createdAt: comment.createdAt }
      ))));
    } catch (error) {
      showConfigAlert(error instanceof Error ? error.message : '评论区回复生成失败。', '无法回复评论');
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
    sortedVoomPosts,
    worldBooks,
    stickerGroups,
    stickers,
    sortedStickerGroups,
    sortedStickers,
    conversationSettings,
    conversationMemories,
    settings,
    hydrate,
    userById,
    characterById,
    conversationById,
    setActiveConversation,
    messagesForConversation,
    settingsForConversation,
    memoriesForConversation,
    stickersForGroup,
    visibleMessagesForConversation,
    hiddenMessageIdsForConversation,
    memoryContextForConversation,
    lastMessageForConversation,
    createMessageQuoteSnapshot,
    showConfigAlert,
    isReplyingVoomComments,
    saveUserProfile,
    saveUsers,
    saveAccountProfile,
    deleteUserProfile,
    deleteCharacterProfile,
    clearCharacterHistory,
    setActiveUser,
    saveVisualProfile,
    saveCharacter,
    markCharacterMindStateRead,
    addCharacter,
    saveConversationSettings,
    saveStickerGroup,
    addStickerGroup,
    deleteStickerGroup,
    saveSticker,
    importStickers,
    deleteSticker,
    deleteStickers,
    moveStickersToGroup,
    saveWorldBook,
    deleteWorldBook,
    saveSettings,
    refreshEnabledVendorModels,
    bindWorldBook,
    updateConversationMode,
    markConversationRead,
    appendUserMessage,
    appendStickerMessage,
    deleteMessages,
    updateMessageContent,
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
    sendMessage,
    sendStickerMessage,
    createUserVoomPost,
    createMomentFromConversation,
    addVoomComment,
    toggleVoomLike,
    replyToVoomComments,
  };
});