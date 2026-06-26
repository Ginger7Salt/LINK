import type { ChatMemorySettings, ChatMessage, ChatMode, ConversationMemoryRecord, ConversationOfflineSettings, ConversationSettings, OfflineInterruptionMode, OfflineParagraphMode, OfflinePerspective, OfflinePromptPreset, OfflineTonePreset } from '@/types/domain';
import { createId } from './id';
import { normalizeChatModelOverrides } from './settings';
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

export const defaultOfflineWritingStylePresets: OfflinePromptPreset[] = [
  {
    id: 'baimiao',
    name: '白描',
    content: '采用白描式叙事。只照亮此刻正在发生的人、物、动作和对话；少写背景和解释。语言朴素透明，不用华丽辞藻、夸张比喻或情绪宣告。用具体物件、动作、停顿和空间距离承载情绪，让读者自己读出未说出口的东西。'
  },
  {
    id: 'dialogue-driven',
    name: '对话推进',
    content: '让对白承担主要推进力。叙述只保留必要动作、停顿和空间变化，每句对白都要符合人物身份、情绪和关系距离。允许欲言又止、岔开话题、沉默和答非所问。'
  },
  {
    id: 'sensory-slow',
    name: '慢镜头感官',
    content: '放慢关键瞬间。用声音、温度、气味、触感和细小动作呈现场景，不急着解释情绪。每一段都围绕当下可感知的细节展开，避免跳场和总结式叙述。'
  }
];

export const defaultOfflineTonePresets: OfflinePromptPreset[] = [
  {
    id: 'daily',
    name: '日常',
    content: '基调是平实的日常。重点写生活正在继续：消息、饭点、天气、工作或学习的残留、房间里的物件、临时被打断的琐事。情绪轻轻落在动作里，不要突然拔高。'
  },
  {
    id: 'push-pull',
    name: '拉扯',
    content: '基调是克制的拉扯。人物会靠近又收回，说出口的话比真实想法少半寸。用停顿、改口、避开视线、重复小动作和空间距离表现试探，不要让关系进展过快。'
  },
  {
    id: 'ambiguous',
    name: '暧昧',
    content: '基调是低温暧昧。亲近感来自细节和误差：一句普通话被听出别的意思，一次短暂停留，一件被顺手整理的小事。不要直白告白，保留不确定和余温。'
  },
  {
    id: 'romance',
    name: '热恋',
    content: '基调是明亮而具体的热恋。互动可以更直接、更柔软，但仍要有真实生活的边界和琐碎感。用对话、触碰前后的停顿、分享日常和自然照顾呈现热度，不写油腻情话。'
  },
  {
    id: 'bittersweet',
    name: '酸涩',
    content: '基调是酸涩和留白。人物不是彻底崩溃，而是在正常行动里露出细小裂缝：收好的东西、没说完的话、过期的票据、冷掉的水。情绪要克制，结尾保留余味。'
  }
];

const defaultWritingStylePresetId = defaultOfflineWritingStylePresets[0].id;
const defaultTonePresetId = defaultOfflineTonePresets[0].id;

export const defaultOfflineSettings: ConversationOfflineSettings = {
  enhanceAppearance: true,
  enhanceOutfit: true,
  expandLength: false,
  characterPsychology: true,
  paragraphMode: 'mixed',
  perspective: 'omniscient-third',
  interruptionMode: 'strict',
  wordCount: '1200-1800字',
  writingStylePresetId: defaultWritingStylePresetId,
  writingStylePresets: defaultOfflineWritingStylePresets,
  writingStyle: defaultOfflineWritingStylePresets[0].content,
  tonePresetId: defaultTonePresetId,
  tonePresets: defaultOfflineTonePresets,
  tone: 'daily',
  customTone: defaultOfflineTonePresets[0].content
};

const offlineParagraphModes: OfflineParagraphMode[] = ['long', 'short', 'mixed'];
const offlinePerspectives: OfflinePerspective[] = ['omniscient-third', 'character-third', 'character-second', 'user-first', 'user-second'];
const offlineInterruptionModes: OfflineInterruptionMode[] = ['advance', 'strict'];
const offlineTonePresets: OfflineTonePreset[] = ['daily', 'push-pull', 'ambiguous', 'romance', 'bittersweet', 'custom'];

function normalizeStringOption<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  const normalizedValue = String(value ?? '').trim() as T;
  return allowed.includes(normalizedValue) ? normalizedValue : fallback;
}

function normalizePromptPreset(preset: Partial<OfflinePromptPreset> | null | undefined, fallback: OfflinePromptPreset, index: number): OfflinePromptPreset {
  const id = String(preset?.id ?? '').trim() || `${fallback.id}_${index}`;
  const name = String(preset?.name ?? '').trim() || fallback.name;
  const content = String(preset?.content ?? '').trim() || fallback.content;
  return { id, name, content };
}

function mergePromptPresets(defaults: OfflinePromptPreset[], presets: unknown): OfflinePromptPreset[] {
  const sourcePresets = Array.isArray(presets) && presets.length ? presets : defaults;
  const customPresets = sourcePresets
    .map((preset, index) => normalizePromptPreset(preset as Partial<OfflinePromptPreset>, defaults[index % defaults.length], index))
    .filter((preset) => preset.id && preset.name && preset.content);
  const byId = new Map<string, OfflinePromptPreset>();
  customPresets.forEach((preset) => {
    byId.set(preset.id, preset);
  });
  const normalized = [...byId.values()];
  return normalized.length ? normalized : defaults.map((preset) => ({ ...preset }));
}

function normalizeActivePresetId(presetId: unknown, presets: OfflinePromptPreset[], fallbackId: string) {
  const normalizedId = String(presetId ?? '').trim();
  if (presets.some((preset) => preset.id === normalizedId)) return normalizedId;
  if (presets.some((preset) => preset.id === fallbackId)) return fallbackId;
  return presets[0]?.id ?? fallbackId;
}

function legacyTonePresetId(settings: Partial<ConversationOfflineSettings> | null | undefined) {
  const tone = normalizeStringOption(settings?.tone, offlineTonePresets, defaultOfflineSettings.tone);
  return tone === 'custom' ? '' : tone;
}

export function activeOfflineWritingStylePreset(settings: ConversationOfflineSettings) {
  return settings.writingStylePresets.find((preset) => preset.id === settings.writingStylePresetId) ?? settings.writingStylePresets[0] ?? defaultOfflineWritingStylePresets[0];
}

export function activeOfflineTonePreset(settings: ConversationOfflineSettings) {
  return settings.tonePresets.find((preset) => preset.id === settings.tonePresetId) ?? settings.tonePresets[0] ?? defaultOfflineTonePresets[0];
}

export function normalizeOfflineSettings(settings: Partial<ConversationOfflineSettings> | null | undefined): ConversationOfflineSettings {
  const legacyWritingStyle = String(settings?.writingStyle ?? '').trim();
  const writingStylePresets = mergePromptPresets(defaultOfflineWritingStylePresets, settings?.writingStylePresets);
  if (legacyWritingStyle && !['白描', defaultOfflineWritingStylePresets[0].content].includes(legacyWritingStyle) && !writingStylePresets.some((preset) => preset.content === legacyWritingStyle)) {
    writingStylePresets.push({ id: 'legacy-writing-style', name: '旧文风', content: legacyWritingStyle });
  }
  const writingStylePresetId = normalizeActivePresetId(settings?.writingStylePresetId || (legacyWritingStyle && !['白描', defaultOfflineWritingStylePresets[0].content].includes(legacyWritingStyle) ? 'legacy-writing-style' : defaultWritingStylePresetId), writingStylePresets, defaultWritingStylePresetId);

  const legacyCustomTone = String(settings?.customTone ?? '').trim();
  const tonePresets = mergePromptPresets(defaultOfflineTonePresets, settings?.tonePresets);
  if (legacyCustomTone && !tonePresets.some((preset) => preset.content === legacyCustomTone)) {
    tonePresets.push({ id: 'legacy-tone', name: '旧基调', content: legacyCustomTone });
  }
  const tonePresetId = normalizeActivePresetId(settings?.tonePresetId || legacyTonePresetId(settings) || (legacyCustomTone ? 'legacy-tone' : defaultTonePresetId), tonePresets, defaultTonePresetId);
  const activeWritingStyle = writingStylePresets.find((preset) => preset.id === writingStylePresetId) ?? defaultOfflineWritingStylePresets[0];
  const activeTone = tonePresets.find((preset) => preset.id === tonePresetId) ?? defaultOfflineTonePresets[0];

  return {
    enhanceAppearance: settings?.enhanceAppearance ?? defaultOfflineSettings.enhanceAppearance,
    enhanceOutfit: settings?.enhanceOutfit ?? defaultOfflineSettings.enhanceOutfit,
    expandLength: settings?.expandLength ?? defaultOfflineSettings.expandLength,
    characterPsychology: settings?.characterPsychology ?? defaultOfflineSettings.characterPsychology,
    paragraphMode: normalizeStringOption(settings?.paragraphMode, offlineParagraphModes, defaultOfflineSettings.paragraphMode),
    perspective: normalizeStringOption(settings?.perspective, offlinePerspectives, defaultOfflineSettings.perspective),
    interruptionMode: normalizeStringOption(settings?.interruptionMode, offlineInterruptionModes, defaultOfflineSettings.interruptionMode),
    wordCount: String(settings?.wordCount ?? defaultOfflineSettings.wordCount).trim() || defaultOfflineSettings.wordCount,
    writingStylePresetId,
    writingStylePresets,
    writingStyle: activeWritingStyle.content,
    tonePresetId,
    tonePresets,
    tone: normalizeStringOption(settings?.tone, offlineTonePresets, defaultOfflineSettings.tone),
    customTone: activeTone.content
  };
}

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
  modelOverrides: normalizeChatModelOverrides(null),
  appearance: {
    backgroundImage: '',
    backgroundImages: [],
    backgroundColor: defaultBackgroundColor,
    userBubbleColor: defaultUserBubbleColor,
    userTextColor: '#111111',
    characterBubbleColor: '#ffffff',
    characterTextColor: '#111111',
    narrationBubbleColor: '#f2f3f5',
    narrationTextColor: '#5f6872',
    showMessageTime: true,
    showReadStatus: true,
    showUserAvatar: false,
    showOnlyFirstAvatarInReply: true,
    hideVoomNarration: true
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
  },
  offline: defaultOfflineSettings
};

export function normalizeConversationSettings(settings: Partial<ConversationSettings> | null | undefined, conversationId: string): ConversationSettings {
  const memory = settings?.memory ?? defaultChatMemorySettings;
  const appearance = settings?.appearance ?? defaultConversationSettings.appearance;
  const modelOverrides = normalizeChatModelOverrides(settings?.modelOverrides ?? defaultConversationSettings.modelOverrides);
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
    modelOverrides: normalizeChatModelOverrides({
      ...modelOverrides,
      summary: summaryModel
    }),
    appearance: {
      backgroundImage: activeBackgroundImage,
      backgroundImages: [...new Set(backgroundImages)],
      backgroundColor,
      userBubbleColor,
      userTextColor: String(appearance.userTextColor ?? defaultConversationSettings.appearance.userTextColor).trim() || defaultConversationSettings.appearance.userTextColor,
      characterBubbleColor: String(appearance.characterBubbleColor ?? defaultConversationSettings.appearance.characterBubbleColor).trim() || defaultConversationSettings.appearance.characterBubbleColor,
      characterTextColor: String(appearance.characterTextColor ?? defaultConversationSettings.appearance.characterTextColor).trim() || defaultConversationSettings.appearance.characterTextColor,
      narrationBubbleColor: String(appearance.narrationBubbleColor ?? defaultConversationSettings.appearance.narrationBubbleColor).trim() || defaultConversationSettings.appearance.narrationBubbleColor,
      narrationTextColor: String(appearance.narrationTextColor ?? defaultConversationSettings.appearance.narrationTextColor).trim() || defaultConversationSettings.appearance.narrationTextColor,
      showMessageTime: appearance.showMessageTime ?? defaultConversationSettings.appearance.showMessageTime,
      showReadStatus: appearance.showReadStatus ?? defaultConversationSettings.appearance.showReadStatus,
      showUserAvatar: appearance.showUserAvatar ?? defaultConversationSettings.appearance.showUserAvatar,
      showOnlyFirstAvatarInReply: appearance.showOnlyFirstAvatarInReply ?? defaultConversationSettings.appearance.showOnlyFirstAvatarInReply,
      hideVoomNarration: true
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
    },
    offline: normalizeOfflineSettings(settings?.offline)
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
    if (message.replyVariantState === 'inactive') continue;
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
  return messages.filter((message) => !hiddenIds.has(message.id) && message.replyVariantState !== 'inactive');
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
