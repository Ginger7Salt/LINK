import type { ChatMemorySettings, ChatMessage, ChatMode, ConversationMemoryRecord, ConversationSettings } from '@/types/domain';
import { createId } from './id';
import { defaultTimeAwarenessSettings, normalizeTimeAwarenessSettings } from './timeAwareness';
import { normalizeVoomFrequency } from './voom';

export const defaultChatMemorySettings: ChatMemorySettings = {
  enabled: true,
  autoSummarize: true,
  summarizeEvery: 50,
  summaryModel: '',
  summaryPrompt: '请把下面聊天楼层总结成可供角色扮演继续读取的记忆手册，以{{char}}的第三人称视角。保留人物关系变化、承诺、偏好、冲突和未解决事项；不要评价用户；用中文输出，直接开始输出内容。',
  mergeSummaryPrompt: '请把下面多段已总结记忆合并成一份更高层级的大总结，以{{char}}的第三人称视角。保留稳定事实、长期关系变化、重要承诺、偏好、冲突和未解决事项；去除重复内容；用中文输出，直接开始输出内容。',
  vectorMemoryEnabled: true,
  hideSummarizedMessages: true
};

export function renderCharacterMemoryPrompt(prompt: string, characterName: string) {
  const resolvedCharacterName = characterName.trim() || '角色';
  return prompt
    .split('{{char}}').join(resolvedCharacterName)
    .replace(/以角色的第三人称视角/g, `以${resolvedCharacterName}的第三人称视角`);
}

export const defaultCharacterStickerGroupIds: string[] = [];
const legacyDefaultBackgroundColor = '#8fa2af';
const defaultBackgroundColor = '#ffffff';
const legacyDefaultUserBubbleColor = '#5ce46f';
const defaultUserBubbleColor = '#eeeeee';

export const defaultConversationSettings: Omit<ConversationSettings, 'conversationId'> = {
  memory: defaultChatMemorySettings,
  modelOverrides: {
    online: '',
    offline: '',
    summary: '',
    voom: ''
  },
  appearance: {
    backgroundImage: '',
    backgroundImages: [],
    backgroundColor: defaultBackgroundColor,
    userBubbleColor: defaultUserBubbleColor,
    userTextColor: '#111111',
    characterBubbleColor: '#ffffff',
    characterTextColor: '#111111',
    showMessageTime: true,
    showReadStatus: true,
    showOnlyFirstAvatarInReply: true,
    hideVoomNarration: false
  },
  narrationModeEnabled: true,
  autoGenerateVoom: true,
  voomFrequency: 'medium',
  stickerVisionEnabled: true,
  stickerSuggestionsEnabled: true,
  characterStickerGroupIds: defaultCharacterStickerGroupIds,
  timeAwareness: defaultTimeAwarenessSettings,
  proactiveReply: {
    enabled: true,
    frequency: 'medium',
    lastTriggeredAt: 0
  }
};

export function normalizeConversationSettings(settings: Partial<ConversationSettings> | null | undefined, conversationId: string): ConversationSettings {
  const memory = settings?.memory ?? defaultChatMemorySettings;
  const appearance = settings?.appearance ?? defaultConversationSettings.appearance;
  const modelOverrides = settings?.modelOverrides ?? defaultConversationSettings.modelOverrides;
  const isLegacySettings = Boolean(settings && !Object.prototype.hasOwnProperty.call(settings, 'stickerSuggestionsEnabled'));
  const summaryModel = String(modelOverrides.summary ?? memory.summaryModel ?? '').trim();
  const rawBackgroundColor = String(appearance.backgroundColor ?? defaultConversationSettings.appearance.backgroundColor).trim();
  const backgroundColor = !rawBackgroundColor || rawBackgroundColor.toLowerCase() === legacyDefaultBackgroundColor
    ? defaultBackgroundColor
    : rawBackgroundColor;
  const rawUserBubbleColor = String(appearance.userBubbleColor ?? defaultConversationSettings.appearance.userBubbleColor).trim();
  const userBubbleColor = !rawUserBubbleColor || rawUserBubbleColor.toLowerCase() === legacyDefaultUserBubbleColor
    ? defaultUserBubbleColor
    : rawUserBubbleColor;
  const activeBackgroundImage = String(appearance.backgroundImage ?? '').trim();
  const backgroundImages = [
    activeBackgroundImage,
    ...(Array.isArray(appearance.backgroundImages) ? appearance.backgroundImages : [])
  ].map((image) => String(image ?? '').trim()).filter(Boolean);
  const voomFrequency = normalizeVoomFrequency(settings?.voomFrequency, defaultConversationSettings.voomFrequency);
  const proactiveReply = settings?.proactiveReply ?? defaultConversationSettings.proactiveReply;
  const rawSummarizeEvery = Math.max(10, Math.round(Number(memory.summarizeEvery) || defaultChatMemorySettings.summarizeEvery));
  const summarizeEvery = rawSummarizeEvery === 100 && String(memory.summaryPrompt ?? defaultChatMemorySettings.summaryPrompt).trim() === defaultChatMemorySettings.summaryPrompt
    ? defaultChatMemorySettings.summarizeEvery
    : rawSummarizeEvery;

  return {
    conversationId,
    memory: {
      enabled: true,
      autoSummarize: memory.autoSummarize ?? defaultChatMemorySettings.autoSummarize,
      summarizeEvery,
      summaryModel,
      summaryPrompt: String(memory.summaryPrompt ?? defaultChatMemorySettings.summaryPrompt).trim() || defaultChatMemorySettings.summaryPrompt,
      mergeSummaryPrompt: String(memory.mergeSummaryPrompt ?? defaultChatMemorySettings.mergeSummaryPrompt).trim() || defaultChatMemorySettings.mergeSummaryPrompt,
      vectorMemoryEnabled: memory.vectorMemoryEnabled ?? defaultChatMemorySettings.vectorMemoryEnabled,
      hideSummarizedMessages: memory.hideSummarizedMessages ?? defaultChatMemorySettings.hideSummarizedMessages
    },
    modelOverrides: {
      online: String(modelOverrides.online ?? '').trim(),
      offline: String(modelOverrides.offline ?? '').trim(),
      summary: summaryModel,
      voom: String(modelOverrides.voom ?? '').trim()
    },
    appearance: {
      backgroundImage: activeBackgroundImage,
      backgroundImages: [...new Set(backgroundImages)],
      backgroundColor,
      userBubbleColor,
      userTextColor: String(appearance.userTextColor ?? defaultConversationSettings.appearance.userTextColor).trim() || defaultConversationSettings.appearance.userTextColor,
      characterBubbleColor: String(appearance.characterBubbleColor ?? defaultConversationSettings.appearance.characterBubbleColor).trim() || defaultConversationSettings.appearance.characterBubbleColor,
      characterTextColor: String(appearance.characterTextColor ?? defaultConversationSettings.appearance.characterTextColor).trim() || defaultConversationSettings.appearance.characterTextColor,
      showMessageTime: appearance.showMessageTime ?? defaultConversationSettings.appearance.showMessageTime,
      showReadStatus: appearance.showReadStatus ?? defaultConversationSettings.appearance.showReadStatus,
      showOnlyFirstAvatarInReply: appearance.showOnlyFirstAvatarInReply ?? defaultConversationSettings.appearance.showOnlyFirstAvatarInReply,
      hideVoomNarration: appearance.hideVoomNarration ?? defaultConversationSettings.appearance.hideVoomNarration
    },
    narrationModeEnabled: isLegacySettings ? defaultConversationSettings.narrationModeEnabled : settings?.narrationModeEnabled ?? defaultConversationSettings.narrationModeEnabled,
    autoGenerateVoom: settings?.autoGenerateVoom ?? defaultConversationSettings.autoGenerateVoom,
    voomFrequency,
    stickerVisionEnabled: settings?.stickerVisionEnabled ?? defaultConversationSettings.stickerVisionEnabled,
    stickerSuggestionsEnabled: settings?.stickerSuggestionsEnabled ?? defaultConversationSettings.stickerSuggestionsEnabled,
    characterStickerGroupIds: Array.isArray(settings?.characterStickerGroupIds)
      ? [...new Set(settings.characterStickerGroupIds.map((item) => String(item).trim()).filter(Boolean))]
      : [...defaultConversationSettings.characterStickerGroupIds],
    timeAwareness: normalizeTimeAwarenessSettings(settings?.timeAwareness),
    proactiveReply: {
      enabled: proactiveReply.enabled ?? defaultConversationSettings.proactiveReply.enabled,
      frequency: normalizeVoomFrequency(proactiveReply.frequency, defaultConversationSettings.proactiveReply.frequency),
      lastTriggeredAt: Math.max(0, Math.floor(Number(proactiveReply.lastTriggeredAt) || 0))
    }
  };
}

export function estimateTokenCount(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  const cjkCount = (normalized.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = normalized.replace(/[\u3400-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(cjkCount * 1.1 + latinWords * 1.35));
}

export function vectorizeText(text: string, dimensions = 16) {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const char of text.toLowerCase()) {
    const code = char.codePointAt(0) ?? 0;
    vector[code % dimensions] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function getMessageFloorMap(messages: ChatMessage[]) {
  const floorMap = new Map<string, number>();
  getConversationFloors(messages).forEach((floorMessages, index) => {
    floorMessages.forEach((message) => floorMap.set(message.id, index + 1));
  });
  return floorMap;
}

function getMessageFloorGroupKey(message: ChatMessage) {
  if (message.sender === 'user') return 'user';
  if (message.replyBatchId) return `reply:${message.replyBatchId}`;
  return 'assistant';
}

export function getConversationFloors(messages: ChatMessage[]) {
  const floors: ChatMessage[][] = [];
  let currentKey = '';
  let currentMessages: ChatMessage[] = [];

  for (const message of messages) {
    const nextKey = getMessageFloorGroupKey(message);
    if (currentMessages.length && nextKey !== currentKey) {
      floors.push(currentMessages);
      currentMessages = [];
    }
    currentKey = nextKey;
    currentMessages.push(message);
  }

  if (currentMessages.length) floors.push(currentMessages);
  return floors;
}

export function getConversationFloorCount(messages: ChatMessage[]) {
  return getConversationFloors(messages).length;
}

export function getMessagesInFloorRange(messages: ChatMessage[], startFloor: number, endFloor: number) {
  return getConversationFloors(messages)
    .slice(Math.max(0, startFloor - 1), Math.max(0, endFloor))
    .flat();
}

export function getHiddenMessageIds(messages: ChatMessage[], memories: ConversationMemoryRecord[], settings: ConversationSettings) {
  if (!settings.memory.hideSummarizedMessages) return new Set<string>();
  const hiddenRanges = memories
    .filter((memory) => memory.hiddenStartFloor > 0 && memory.hiddenEndFloor >= memory.hiddenStartFloor)
    .map((memory) => ({ start: memory.hiddenStartFloor, end: memory.hiddenEndFloor }));

  const floorMap = getMessageFloorMap(messages);
  return new Set(messages
    .filter((message) => {
      const floor = floorMap.get(message.id) ?? 0;
      return hiddenRanges.some((range) => floor >= range.start && floor <= range.end);
    })
    .map((message) => message.id));
}

export function getVisibleMessages(messages: ChatMessage[], memories: ConversationMemoryRecord[], settings: ConversationSettings) {
  const hiddenIds = getHiddenMessageIds(messages, memories, settings);
  return messages.filter((message) => !hiddenIds.has(message.id));
}

export function getMemoryContext(memories: ConversationMemoryRecord[]) {
  const sorted = [...memories].sort((a, b) => a.startFloor - b.startFloor);
  if (!sorted.length) return '';
  return sorted.map((memory) => {
    const stage = memory.kind === 'short-term' ? '短期记忆' : '长期记忆';
    return `【${stage} ${memory.startFloor}-${memory.endFloor}楼，隐藏${memory.hiddenStartFloor || '-'}-${memory.hiddenEndFloor || '-'}楼】\n${memory.summary}`;
  }).join('\n\n');
}

export function getNextSummaryRange(messages: ChatMessage[], memories: ConversationMemoryRecord[], settings: ConversationSettings, mode: ChatMode) {
  if (!settings.memory.autoSummarize) return null;
  const step = settings.memory.summarizeEvery;
  const floorCount = getConversationFloorCount(messages);
  const completedEndFloor = memories
    .reduce((max, memory) => Math.max(max, memory.endFloor), 0);
  const startFloor = completedEndFloor + 1;
  const endFloor = completedEndFloor + step;
  if (floorCount < endFloor) return null;
  const sourceMessages = getMessagesInFloorRange(messages, startFloor, endFloor);
  const keepTail = Math.min(10, Math.max(1, Math.ceil(step * 0.1)));
  return {
    startFloor,
    endFloor,
    hiddenStartFloor: startFloor,
    hiddenEndFloor: Math.max(startFloor - 1, endFloor - keepTail),
    sourceMessages
  };
}

export function createMemoryRecord(input: {
  conversationId: string;
  mode: ChatMode;
  startFloor: number;
  endFloor: number;
  hiddenStartFloor: number;
  hiddenEndFloor: number;
  summary: string;
  sourceMessages: ChatMessage[];
  model: string;
  vector?: number[];
  now?: number;
}): ConversationMemoryRecord {
  const now = input.now ?? Date.now();
  return {
    id: createId('memory'),
    conversationId: input.conversationId,
    mode: input.mode,
    kind: 'short-term',
    startFloor: input.startFloor,
    endFloor: input.endFloor,
    hiddenStartFloor: input.hiddenStartFloor,
    hiddenEndFloor: input.hiddenEndFloor,
    summary: input.summary,
    tokenCount: estimateTokenCount(input.summary),
    vector: [...(input.vector ?? [])],
    sourceMessageIds: input.sourceMessages.map((message) => message.id),
    model: input.model,
    createdAt: now,
    updatedAt: now
  };
}

export function ageMemoryKind(createdAt: number, now = Date.now()): ConversationMemoryRecord['kind'] {
  return now - createdAt > 24 * 60 * 60 * 1000 ? 'long-term' : 'short-term';
}

export function shouldCompressMemory(memory: ConversationMemoryRecord, now = Date.now()) {
  return !memory.compressedAt && now - memory.createdAt > 7 * 24 * 60 * 60 * 1000;
}
