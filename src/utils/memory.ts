import type { ChatMemorySettings, ChatMessage, ChatMode, ConversationMemoryAtom, ConversationMemoryDebugTrace, ConversationMemoryEntry, ConversationMemoryEntryStatus, ConversationMemoryEntryType, ConversationMemoryRecord, ConversationOfflineSettings, ConversationSettings, OfflineInterruptionMode, OfflineParagraphMode, OfflinePerspective, OfflinePromptPreset, OfflineRetellMode, OfflineTonePreset } from '@/types/domain';
import { createId } from './id';
import { normalizeChatModelOverrides } from './settings';
import { defaultTimeAwarenessSettings, normalizeTimeAwarenessSettings } from './timeAwareness';
import { normalizeVoomFrequency } from './voom';

export const defaultChatMemorySettings: ChatMemorySettings = {
  enabled: true,
  autoSummarize: true,
  summarizeEvery: 50,
  summaryModel: '',
  summaryPrompt: '请把下面聊天楼层整理成可长期读取的结构化记忆，以{{char}}的第三人称视角。必须先校验旧记忆：后文已经解决、撤销、推翻或过期的事项，不要继续写成未解决。按固定格式输出，每条一行：- [类型|状态|重要度1-5|主体|证据楼层] 内容。类型只能用 fact/preference/promise/conflict/plot/relationship/boundary/emotion/world；状态只能用 active/open/resolved/superseded/cancelled。只把仍会影响后续扮演的内容写入；resolved 只保留会影响情绪或关系余波的事项；去重、合并同义项，不要评价用户；用中文输出。',
  mergeSummaryPrompt: '请把下面多段结构化记忆合并成更高层级的长期记忆，以{{char}}的第三人称视角。必须去重并执行生命周期更新：已解决的 promise/conflict 标为 resolved，后文推翻旧事实时旧事实标为 superseded 或直接移除；只保留稳定事实、长期关系变化、重要偏好、仍开放承诺、仍开放冲突和关键剧情节点。按固定格式输出，每条一行：- [类型|状态|重要度1-5|主体|证据楼层] 内容。类型只能用 fact/preference/promise/conflict/plot/relationship/boundary/emotion/world；状态只能用 active/open/resolved/superseded/cancelled。用中文输出。',
  vectorMemoryEnabled: true,
  hideSummarizedMessages: true,
  atomWriterEnabled: true,
  atomWriterEvery: 1,
  autoMergeEnabled: true,
  autoMergeThreshold: 8,
  autoMergeBatchSize: 6
};

function normalizeMemoryPrompt(value: unknown, fallback: string) {
  const prompt = String(value ?? '').trim();
  if (!prompt) return fallback;
  const isLegacyDefaultPrompt = prompt.includes('保留人物关系变化、承诺、偏好、冲突和未解决事项')
    || prompt.includes('保留稳定事实、长期关系变化、重要承诺、偏好、冲突和未解决事项');
  return isLegacyDefaultPrompt ? fallback : prompt;
}

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
  expandLength: true,
  characterPsychology: true,
  paragraphMode: 'mixed',
  perspective: 'omniscient-third',
  interruptionMode: 'strict',
  retellMode: 'retell',
  wordCount: '800-1200字',
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
const offlineRetellModes: OfflineRetellMode[] = ['retell', 'direct'];
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
  const isLegacyOfflineSettings = Boolean(settings && !('retellMode' in settings));
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
    expandLength: isLegacyOfflineSettings ? defaultOfflineSettings.expandLength : settings?.expandLength ?? defaultOfflineSettings.expandLength,
    characterPsychology: settings?.characterPsychology ?? defaultOfflineSettings.characterPsychology,
    paragraphMode: normalizeStringOption(settings?.paragraphMode, offlineParagraphModes, defaultOfflineSettings.paragraphMode),
    perspective: normalizeStringOption(settings?.perspective, offlinePerspectives, defaultOfflineSettings.perspective),
    interruptionMode: normalizeStringOption(settings?.interruptionMode, offlineInterruptionModes, defaultOfflineSettings.interruptionMode),
    retellMode: normalizeStringOption(settings?.retellMode, offlineRetellModes, defaultOfflineSettings.retellMode),
    wordCount: isLegacyOfflineSettings && String(settings?.wordCount ?? '').trim() === '1200-1800字'
      ? defaultOfflineSettings.wordCount
      : String(settings?.wordCount ?? defaultOfflineSettings.wordCount).trim() || defaultOfflineSettings.wordCount,
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
  offlineInvitationEnabled: true,
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
      summaryPrompt: normalizeMemoryPrompt(memory.summaryPrompt, defaultChatMemorySettings.summaryPrompt),
      mergeSummaryPrompt: normalizeMemoryPrompt(memory.mergeSummaryPrompt, defaultChatMemorySettings.mergeSummaryPrompt),
      vectorMemoryEnabled: memory.vectorMemoryEnabled ?? defaultChatMemorySettings.vectorMemoryEnabled,
      hideSummarizedMessages: memory.hideSummarizedMessages ?? defaultChatMemorySettings.hideSummarizedMessages,
      atomWriterEnabled: memory.atomWriterEnabled ?? defaultChatMemorySettings.atomWriterEnabled,
      atomWriterEvery: Math.min(10, Math.max(1, Math.round(Number(memory.atomWriterEvery) || defaultChatMemorySettings.atomWriterEvery))),
      autoMergeEnabled: memory.autoMergeEnabled ?? defaultChatMemorySettings.autoMergeEnabled,
      autoMergeThreshold: Math.min(30, Math.max(3, Math.round(Number(memory.autoMergeThreshold) || defaultChatMemorySettings.autoMergeThreshold))),
      autoMergeBatchSize: Math.min(20, Math.max(2, Math.round(Number(memory.autoMergeBatchSize) || defaultChatMemorySettings.autoMergeBatchSize)))
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
    offlineInvitationEnabled: settings?.offlineInvitationEnabled ?? defaultConversationSettings.offlineInvitationEnabled,
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

const memoryEntryTypes: ConversationMemoryEntryType[] = ['fact', 'preference', 'promise', 'conflict', 'plot', 'relationship', 'boundary', 'emotion', 'world'];
const memoryEntryStatuses: ConversationMemoryEntryStatus[] = ['active', 'open', 'resolved', 'superseded', 'cancelled'];

const sectionTypeHints: Array<[RegExp, ConversationMemoryEntryType]> = [
  [/偏好|喜好|雷点|习惯/, 'preference'],
  [/承诺|约定|待办|计划/, 'promise'],
  [/冲突|矛盾|争执|问题/, 'conflict'],
  [/关系|称呼|亲密|边界/, 'relationship'],
  [/边界|禁忌|底线/, 'boundary'],
  [/情绪|心境|余波/, 'emotion'],
  [/世界|设定|背景/, 'world'],
  [/剧情|事件|时间线|经历/, 'plot']
];

const sectionStatusHints: Array<[RegExp, ConversationMemoryEntryStatus]> = [
  [/未解决|开放|待处理|仍需|承诺|约定/, 'open'],
  [/已解决|完成|兑现|和解/, 'resolved'],
  [/作废|推翻|覆盖|旧版/, 'superseded'],
  [/取消|撤销|不再/, 'cancelled']
];

function clampMemoryImportance(value: unknown) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(5, Math.max(1, parsed));
}

function normalizeMemoryEntryType(value: unknown, fallback: ConversationMemoryEntryType = 'fact') {
  const normalized = String(value ?? '').trim().toLocaleLowerCase() as ConversationMemoryEntryType;
  return memoryEntryTypes.includes(normalized) ? normalized : fallback;
}

function normalizeMemoryEntryStatus(value: unknown, fallback: ConversationMemoryEntryStatus = 'active') {
  const normalized = String(value ?? '').trim().toLocaleLowerCase() as ConversationMemoryEntryStatus;
  return memoryEntryStatuses.includes(normalized) ? normalized : fallback;
}

function inferEntryTypeFromSection(sectionTitle: string): ConversationMemoryEntryType {
  return sectionTypeHints.find(([pattern]) => pattern.test(sectionTitle))?.[1] ?? 'fact';
}

function inferEntryStatusFromSection(sectionTitle: string): ConversationMemoryEntryStatus {
  return sectionStatusHints.find(([pattern]) => pattern.test(sectionTitle))?.[1] ?? 'active';
}

function parseEvidenceFloors(value: unknown, fallbackStartFloor: number, fallbackEndFloor: number) {
  const floors = String(value ?? '')
    .match(/\d+/g)
    ?.map((item) => Math.max(1, Math.floor(Number(item))))
    .filter((item) => Number.isFinite(item)) ?? [];
  const uniqueFloors = [...new Set(floors)];
  if (uniqueFloors.length) return uniqueFloors.slice(0, 8);
  if (fallbackStartFloor === fallbackEndFloor) return [fallbackStartFloor];
  return [fallbackStartFloor, fallbackEndFloor];
}

function normalizeMemoryContent(content: string) {
  return content
    .replace(/^[:：\-\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFallbackSubject(type: ConversationMemoryEntryType) {
  return {
    fact: '事实',
    preference: '偏好',
    promise: '承诺',
    conflict: '冲突',
    plot: '剧情',
    relationship: '关系',
    boundary: '边界',
    emotion: '情绪',
    world: '世界'
  }[type];
}

function parseBracketMemoryEntry(line: string, fallbackType: ConversationMemoryEntryType, fallbackStatus: ConversationMemoryEntryStatus, fallbackStartFloor: number, fallbackEndFloor: number, now: number): ConversationMemoryEntry | null {
  const match = line.match(/^[-*]\s*\[([^\]]+)]\s*(.+)$/);
  if (!match) return null;
  const parts = match[1].split('|').map((part) => part.trim());
  const type = normalizeMemoryEntryType(parts[0], fallbackType);
  const status = normalizeMemoryEntryStatus(parts[1], fallbackStatus);
  const importance = clampMemoryImportance(parts[2]);
  const subject = parts[3]?.trim() || buildFallbackSubject(type);
  const evidenceFloors = parseEvidenceFloors(parts[4], fallbackStartFloor, fallbackEndFloor);
  const content = normalizeMemoryContent(match[2]);
  if (!content) return null;
  return {
    id: createId('memitem'),
    type,
    status,
    subject,
    content,
    evidenceFloors,
    lastTouchedFloor: Math.max(...evidenceFloors, fallbackEndFloor),
    importance,
    vector: vectorizeText(`${subject} ${content}`),
    createdAt: now,
    updatedAt: now
  };
}

function parseLooseMemoryEntry(line: string, fallbackType: ConversationMemoryEntryType, fallbackStatus: ConversationMemoryEntryStatus, fallbackStartFloor: number, fallbackEndFloor: number, now: number): ConversationMemoryEntry | null {
  const match = line.match(/^[-*]\s+(.+)$/);
  if (!match) return null;
  const content = normalizeMemoryContent(match[1]);
  if (!content) return null;
  const status = /已解决|完成|兑现|和解/.test(content)
    ? 'resolved'
    : /未解决|仍需|还要|待|承诺|约定/.test(content)
      ? 'open'
      : fallbackStatus;
  const type = /承诺|约定|答应/.test(content)
    ? 'promise'
    : /冲突|争执|矛盾|误会/.test(content)
      ? 'conflict'
      : fallbackType;
  const evidenceFloors = parseEvidenceFloors(content, fallbackStartFloor, fallbackEndFloor);
  return {
    id: createId('memitem'),
    type,
    status,
    subject: buildFallbackSubject(type),
    content,
    evidenceFloors,
    lastTouchedFloor: Math.max(...evidenceFloors, fallbackEndFloor),
    importance: status === 'open' || type === 'relationship' ? 4 : 3,
    vector: vectorizeText(`${buildFallbackSubject(type)} ${content}`),
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeMemoryRecordEntries(memory: Pick<ConversationMemoryRecord, 'summary' | 'startFloor' | 'endFloor' | 'entries' | 'createdAt' | 'updatedAt'>, now = Date.now()): ConversationMemoryEntry[] {
  const startFloor = Math.max(1, Math.floor(Number(memory.startFloor) || 1));
  const endFloor = Math.max(startFloor, Math.floor(Number(memory.endFloor) || startFloor));
  if (Array.isArray(memory.entries) && memory.entries.length) {
    return memory.entries
      .map((entry): ConversationMemoryEntry | null => {
        const type = normalizeMemoryEntryType(entry.type);
        const status = normalizeMemoryEntryStatus(entry.status, type === 'promise' || type === 'conflict' ? 'open' : 'active');
        const evidenceFloors = parseEvidenceFloors(entry.evidenceFloors?.join(','), startFloor, endFloor);
        const content = normalizeMemoryContent(entry.content);
        if (!content) return null;
        const normalizedEntry: ConversationMemoryEntry = {
          ...entry,
          id: String(entry.id ?? '').trim() || createId('memitem'),
          type,
          status,
          subject: String(entry.subject ?? '').trim() || buildFallbackSubject(type),
          content,
          evidenceFloors,
          lastTouchedFloor: Math.max(1, Math.floor(Number(entry.lastTouchedFloor) || Math.max(...evidenceFloors, endFloor))),
          importance: clampMemoryImportance(entry.importance),
          vector: Array.isArray(entry.vector) && entry.vector.length ? entry.vector.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : vectorizeText(`${entry.subject} ${content}`),
          createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : memory.createdAt || now,
          updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : memory.updatedAt || now
        };
        if (Number.isFinite(entry.expiresAt)) normalizedEntry.expiresAt = entry.expiresAt;
        return normalizedEntry;
      })
      .filter((entry): entry is ConversationMemoryEntry => Boolean(entry));
  }

  const entries: ConversationMemoryEntry[] = [];
  let currentType: ConversationMemoryEntryType = 'fact';
  let currentStatus: ConversationMemoryEntryStatus = 'active';
  const createdAt = memory.createdAt || now;
  const updatedAt = memory.updatedAt || now;
  String(memory.summary ?? '').split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const heading = line.match(/^#{1,4}\s*(.+)$|^【(.+)】$|^(.+)[：:]$/);
    if (heading) {
      const sectionTitle = heading[1] || heading[2] || heading[3] || '';
      currentType = inferEntryTypeFromSection(sectionTitle);
      currentStatus = inferEntryStatusFromSection(sectionTitle);
      return;
    }
    const parsed = parseBracketMemoryEntry(line, currentType, currentStatus, startFloor, endFloor, updatedAt)
      ?? parseLooseMemoryEntry(line, currentType, currentStatus, startFloor, endFloor, updatedAt);
    if (parsed) entries.push({ ...parsed, createdAt, updatedAt });
  });

  if (entries.length) return dedupeMemoryEntries(entries);
  const content = normalizeMemoryContent(String(memory.summary ?? ''));
  if (!content) return [];
  return [{
    id: createId('memitem'),
    type: 'plot',
    status: 'active',
    subject: '摘要',
    content: content.slice(0, 600),
    evidenceFloors: startFloor === endFloor ? [startFloor] : [startFloor, endFloor],
    lastTouchedFloor: endFloor,
    importance: 3,
    vector: vectorizeText(content),
    createdAt,
    updatedAt
  }];
}

export function dedupeMemoryEntries(entries: ConversationMemoryEntry[]) {
  const byKey = new Map<string, ConversationMemoryEntry>();
  entries.forEach((entry) => {
    const key = `${entry.type}:${entry.subject.trim().toLocaleLowerCase()}:${entry.content.trim().toLocaleLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || entry.updatedAt > existing.updatedAt || entry.importance > existing.importance) {
      byKey.set(key, {
        ...entry,
        evidenceFloors: [...new Set(entry.evidenceFloors)].sort((a, b) => a - b)
      });
    }
  });
  return [...byKey.values()];
}

function memoryAtomKey(atom: Pick<ConversationMemoryAtom, 'conversationId' | 'type' | 'subject' | 'content'>) {
  return `${atom.conversationId}:${atom.type}:${atom.subject.trim().toLocaleLowerCase()}:${atom.content.trim().toLocaleLowerCase()}`;
}

export function normalizeMemoryAtom(atom: Partial<ConversationMemoryAtom>, fallback: { conversationId: string; mode: ChatMode; now?: number }): ConversationMemoryAtom | null {
  const now = fallback.now ?? Date.now();
  const type = normalizeMemoryEntryType(atom.type);
  const status = normalizeMemoryEntryStatus(atom.status, type === 'promise' || type === 'conflict' ? 'open' : 'active');
  const content = normalizeMemoryContent(String(atom.content ?? ''));
  if (!content) return null;
  const subject = String(atom.subject ?? '').trim() || buildFallbackSubject(type);
  const evidenceFloors = parseEvidenceFloors(atom.evidenceFloors?.join(','), 1, Math.max(1, Math.floor(Number(atom.lastTouchedFloor) || 1)));
  const sourceMessageIds = Array.isArray(atom.sourceMessageIds) ? atom.sourceMessageIds.map((id) => String(id).trim()).filter(Boolean) : [];
  const normalizedAtom: ConversationMemoryAtom = {
    id: String(atom.id ?? '').trim() || createId('atom'),
    conversationId: String(atom.conversationId ?? fallback.conversationId).trim() || fallback.conversationId,
    mode: atom.mode ?? fallback.mode,
    type,
    status,
    subject,
    content,
    evidenceFloors,
    lastTouchedFloor: Math.max(1, Math.floor(Number(atom.lastTouchedFloor) || Math.max(...evidenceFloors, 1))),
    importance: clampMemoryImportance(atom.importance),
    vector: Array.isArray(atom.vector) && atom.vector.length ? atom.vector.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : vectorizeText(`${subject} ${content}`),
    sourceMemoryId: String(atom.sourceMemoryId ?? '').trim() || undefined,
    sourceMessageIds,
    confidence: Math.min(1, Math.max(0, Number(atom.confidence) || 0.75)),
    pinned: Boolean(atom.pinned),
    createdAt: Number.isFinite(atom.createdAt) ? Number(atom.createdAt) : now,
    updatedAt: Number.isFinite(atom.updatedAt) ? Number(atom.updatedAt) : now
  };
  if (Number.isFinite(atom.expiresAt)) normalizedAtom.expiresAt = atom.expiresAt;
  if (Number.isFinite(atom.archivedAt)) normalizedAtom.archivedAt = atom.archivedAt;
  return normalizedAtom;
}

export function createMemoryAtomsFromRecord(memory: ConversationMemoryRecord, now = Date.now()): ConversationMemoryAtom[] {
  return normalizeMemoryRecordEntries(memory, now)
    .map((entry) => normalizeMemoryAtom({
      ...entry,
      id: `${memory.id}_${entry.id}`,
      conversationId: memory.conversationId,
      mode: memory.mode,
      sourceMemoryId: memory.id,
      sourceMessageIds: memory.sourceMessageIds,
      confidence: memory.isMergedSummary ? 0.82 : 0.88,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt
    }, { conversationId: memory.conversationId, mode: memory.mode, now }))
    .filter((atom): atom is ConversationMemoryAtom => Boolean(atom));
}

export function mergeMemoryAtoms(atoms: ConversationMemoryAtom[]) {
  const byKey = new Map<string, ConversationMemoryAtom>();
  atoms.forEach((atom) => {
    const normalizedAtom = normalizeMemoryAtom(atom, { conversationId: atom.conversationId, mode: atom.mode });
    if (!normalizedAtom) return;
    const key = memoryAtomKey(normalizedAtom);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalizedAtom);
      return;
    }
    const keep = normalizedAtom.updatedAt >= existing.updatedAt || normalizedAtom.importance > existing.importance ? normalizedAtom : existing;
    const other = keep === normalizedAtom ? existing : normalizedAtom;
    byKey.set(key, {
      ...keep,
      evidenceFloors: [...new Set([...keep.evidenceFloors, ...other.evidenceFloors])].sort((a, b) => a - b).slice(0, 12),
      sourceMessageIds: [...new Set([...keep.sourceMessageIds, ...other.sourceMessageIds])],
      confidence: Math.max(keep.confidence, other.confidence),
      pinned: keep.pinned || other.pinned
    });
  });
  return [...byKey.values()];
}

function tokenizeMemoryText(text: string) {
  const normalized = text.toLocaleLowerCase();
  const latinTokens = normalized.match(/[a-z0-9_]{2,}/g) ?? [];
  const cjkTokens = normalized.match(/[\u3400-\u9fff]{1,2}/g) ?? [];
  return new Set([...latinTokens, ...cjkTokens]);
}

function getEntryText(entry: ConversationMemoryEntry) {
  return `${entry.subject} ${entry.content}`;
}

function cosineSimilarity(first: number[], second: number[]) {
  if (!first.length || first.length !== second.length) return 0;
  let dot = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;
  first.forEach((value, index) => {
    dot += value * second[index];
    firstMagnitude += value * value;
    secondMagnitude += second[index] * second[index];
  });
  const magnitude = Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude);
  return magnitude ? dot / magnitude : 0;
}

function scoreMemoryEntry(entry: ConversationMemoryEntry, queryTokens: Set<string>, queryVector: number[], latestFloor: number, now: number) {
  const entryTokens = tokenizeMemoryText(getEntryText(entry));
  const overlap = [...queryTokens].filter((token) => entryTokens.has(token)).length;
  const vectorScore = queryVector.length ? cosineSimilarity(queryVector, entry.vector ?? vectorizeText(getEntryText(entry))) : 0;
  const statusWeight = {
    open: 18,
    active: 12,
    resolved: -2,
    superseded: -12,
    cancelled: -16
  }[entry.status];
  const typeWeight = entry.type === 'relationship' ? 5 : entry.type === 'preference' ? 4 : entry.type === 'promise' || entry.type === 'conflict' ? 6 : 0;
  const floorDistance = Math.max(0, latestFloor - entry.lastTouchedFloor);
  const recencyWeight = Math.max(0, 8 - Math.floor(floorDistance / 20));
  const agePenalty = entry.expiresAt && entry.expiresAt < now ? 30 : 0;
  return overlap * 7 + vectorScore * 12 + entry.importance * 4 + statusWeight + typeWeight + recencyWeight - agePenalty;
}

function scoreMemoryAtom(atom: ConversationMemoryAtom, queryTokens: Set<string>, queryVector: number[], latestFloor: number, now: number) {
  const baseScore = scoreMemoryEntry(atom, queryTokens, queryVector, latestFloor, now);
  const pinWeight = atom.pinned ? 20 : 0;
  const archivePenalty = atom.archivedAt ? 24 : 0;
  const confidenceWeight = atom.confidence * 6;
  return baseScore + pinWeight + confidenceWeight - archivePenalty;
}

function formatMemoryEntry(entry: ConversationMemoryEntry) {
  const statusLabel = {
    active: '有效',
    open: '开放',
    resolved: '已解决',
    superseded: '已被覆盖',
    cancelled: '已取消'
  }[entry.status];
  const floorText = entry.evidenceFloors.length ? `；证据楼层 ${entry.evidenceFloors.join('/')}` : '';
  return `- ${entry.subject}：${entry.content}（${statusLabel}；重要度 ${entry.importance}${floorText}）`;
}

function memoryContextSection(title: string, entries: ConversationMemoryEntry[]) {
  if (!entries.length) return '';
  return `【${title}】\n${entries.map(formatMemoryEntry).join('\n')}`;
}

export function getMemoryContext(memories: ConversationMemoryRecord[], options: { queryText?: string; maxEntries?: number; includeResolved?: boolean } = {}) {
  const sorted = [...memories].sort((a, b) => a.startFloor - b.startFloor);
  if (!sorted.length) return '';
  const latestFloor = sorted.reduce((max, memory) => Math.max(max, memory.endFloor), 0);
  const queryTokens = tokenizeMemoryText(options.queryText ?? '');
  const queryVector = options.queryText?.trim() ? vectorizeText(options.queryText) : [];
  const now = Date.now();
  const entries = dedupeMemoryEntries(sorted.flatMap((memory) => normalizeMemoryRecordEntries(memory)));
  if (!entries.length) {
    return sorted.map((memory) => {
      const stage = memory.kind === 'short-term' ? '短期记忆' : '长期记忆';
      return `【${stage} ${memory.startFloor}-${memory.endFloor}楼，隐藏${memory.hiddenStartFloor || '-'}-${memory.hiddenEndFloor || '-'}楼】\n${memory.summary}`;
    }).join('\n\n');
  }

  const maxEntries = Math.max(6, Math.floor(options.maxEntries ?? 24));
  const rankedEntries = entries
    .map((entry) => ({ entry, score: scoreMemoryEntry(entry, queryTokens, queryVector, latestFloor, now) }))
    .filter(({ entry }) => options.includeResolved || !['superseded', 'cancelled'].includes(entry.status))
    .sort((left, right) => right.score - left.score || right.entry.updatedAt - left.entry.updatedAt)
    .map(({ entry }) => entry)
    .slice(0, maxEntries);

  const openEntries = rankedEntries.filter((entry) => entry.status === 'open');
  const activeEntries = rankedEntries.filter((entry) => entry.status === 'active');
  const resolvedEntries = rankedEntries.filter((entry) => entry.status === 'resolved').slice(0, Math.min(4, Math.ceil(maxEntries / 5)));
  const archivedEntries = options.includeResolved
    ? rankedEntries.filter((entry) => entry.status === 'superseded' || entry.status === 'cancelled').slice(0, 4)
    : [];

  return [
    memoryContextSection('当前开放事项，必须延续或自然处理', openEntries),
    memoryContextSection('高相关长期事实与关系状态', activeEntries),
    memoryContextSection('已解决但可能留下情绪余波', resolvedEntries),
    memoryContextSection('已作废旧记忆，仅用于避免重复误用', archivedEntries)
  ].filter(Boolean).join('\n\n');
}

export function buildMemoryAtomContext(atoms: ConversationMemoryAtom[], options: { conversationId: string; queryText?: string; maxEntries?: number; maxTokens?: number; includeResolved?: boolean } ): { text: string; debug: ConversationMemoryDebugTrace } {
  const conversationAtoms = mergeMemoryAtoms(atoms)
    .filter((atom) => atom.conversationId === options.conversationId)
    .filter((atom) => options.includeResolved || (!['superseded', 'cancelled'].includes(atom.status) && !atom.archivedAt));
  const latestFloor = conversationAtoms.reduce((max, atom) => Math.max(max, atom.lastTouchedFloor), 0);
  const queryText = options.queryText ?? '';
  const queryTokens = tokenizeMemoryText(queryText);
  const queryVector = queryText.trim() ? vectorizeText(queryText) : [];
  const now = Date.now();
  const maxEntries = Math.max(4, Math.floor(options.maxEntries ?? 18));
  const maxTokens = Math.max(120, Math.floor(options.maxTokens ?? 1200));
  const rankedAtoms = conversationAtoms
    .map((atom) => ({ atom, score: scoreMemoryAtom(atom, queryTokens, queryVector, latestFloor, now) }))
    .sort((left, right) => right.score - left.score || right.atom.updatedAt - left.atom.updatedAt);

  const selected: Array<{ atom: ConversationMemoryAtom; score: number; tokenCount: number }> = [];
  let selectedTokenCount = 0;
  for (const candidate of rankedAtoms) {
    if (selected.length >= maxEntries) break;
    const tokenCount = estimateTokenCount(formatMemoryEntry(candidate.atom));
    if (selected.length && selectedTokenCount + tokenCount > maxTokens) continue;
    selected.push({ ...candidate, tokenCount });
    selectedTokenCount += tokenCount;
  }

  const selectedAtoms = selected.map((item) => item.atom);
  const openAtoms = selectedAtoms.filter((atom) => atom.status === 'open');
  const activeAtoms = selectedAtoms.filter((atom) => atom.status === 'active');
  const resolvedAtoms = selectedAtoms.filter((atom) => atom.status === 'resolved').slice(0, 4);
  const archivedAtoms = options.includeResolved ? selectedAtoms.filter((atom) => atom.status === 'superseded' || atom.status === 'cancelled' || atom.archivedAt).slice(0, 4) : [];
  const text = [
    memoryContextSection('当前开放事项，必须延续或自然处理', openAtoms),
    memoryContextSection('高相关长期事实与关系状态', activeAtoms),
    memoryContextSection('已解决但可能留下情绪余波', resolvedAtoms),
    memoryContextSection('已作废旧记忆，仅用于避免重复误用', archivedAtoms)
  ].filter(Boolean).join('\n\n');

  return {
    text,
    debug: {
      conversationId: options.conversationId,
      queryText,
      generatedAt: now,
      tokenBudget: maxTokens,
      selectedTokenCount,
      selectedAtoms: selected.map((item) => ({
        id: item.atom.id,
        type: item.atom.type,
        status: item.atom.status,
        subject: item.atom.subject,
        content: item.atom.content,
        score: Number(item.score.toFixed(2)),
        tokenCount: item.tokenCount
      }))
    }
  };
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

export const memoryVisibleTailFloors = 5;

export interface HiddenFloorRange {
  start: number;
  end: number;
}

export function getMemoryHiddenEndFloor(startFloor: number, endFloor: number) {
  const normalizedStartFloor = Math.max(1, Math.floor(startFloor));
  const normalizedEndFloor = Math.max(normalizedStartFloor, Math.floor(endFloor));
  return Math.max(normalizedStartFloor - 1, normalizedEndFloor - memoryVisibleTailFloors);
}

export function getEffectiveHiddenFloorRanges(memories: ConversationMemoryRecord[]): HiddenFloorRange[] {
  const ranges: Array<HiddenFloorRange & { summarizedEnd: number }> = [];
  const hiddenMemories = [...memories]
    .filter((memory) => memory.hiddenStartFloor > 0 && memory.hiddenEndFloor >= memory.hiddenStartFloor)
    .sort((a, b) => a.startFloor - b.startFloor || a.endFloor - b.endFloor);

  hiddenMemories.forEach((memory) => {
    const start = Math.max(1, Math.floor(memory.hiddenStartFloor));
    const end = Math.max(start, Math.floor(memory.hiddenEndFloor));
    const summarizedStart = Math.max(1, Math.floor(memory.startFloor));
    const summarizedEnd = Math.max(summarizedStart, Math.floor(memory.endFloor));
    const previous = ranges[ranges.length - 1];
    const continuesPreviousSummary = previous && summarizedStart <= previous.summarizedEnd + 1 && start <= previous.summarizedEnd + 1;
    const touchesPreviousRange = previous && start <= previous.end + 1;

    if (previous && (continuesPreviousSummary || touchesPreviousRange)) {
      previous.end = Math.max(previous.end, end);
      previous.summarizedEnd = Math.max(previous.summarizedEnd, summarizedEnd);
      return;
    }

    ranges.push({ start, end, summarizedEnd });
  });

  return ranges.map(({ start, end }) => ({ start, end }));
}

export function getHiddenMessageIds(messages: ChatMessage[], memories: ConversationMemoryRecord[], settings: ConversationSettings) {
  if (!settings.memory.hideSummarizedMessages) return new Set<string>();
  const hiddenRanges = getEffectiveHiddenFloorRanges(memories);

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
  return {
    startFloor,
    endFloor,
    hiddenStartFloor: startFloor,
    hiddenEndFloor: getMemoryHiddenEndFloor(startFloor, endFloor),
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
  entries?: ConversationMemoryEntry[];
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
    entries: dedupeMemoryEntries(input.entries?.length ? normalizeMemoryRecordEntries({ summary: input.summary, startFloor: input.startFloor, endFloor: input.endFloor, entries: input.entries, createdAt: now, updatedAt: now }, now) : normalizeMemoryRecordEntries({ summary: input.summary, startFloor: input.startFloor, endFloor: input.endFloor, entries: [], createdAt: now, updatedAt: now }, now)),
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
