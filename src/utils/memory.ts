import type { ChatMemorySettings, ChatMessage, ChatMode, ConversationMemoryEntry, ConversationMemoryEntryStatus, ConversationMemoryEntryType, ConversationMemoryRecord, ConversationMemoryTimeBasis, ConversationOfflineSettings, ConversationSettings, OfflineInterruptionMode, OfflineParagraphMode, OfflinePerspective, OfflinePromptPreset, OfflineRetellMode, OfflineTonePreset, VoomImageMode } from '@/types/domain';
import { createId } from './id';
import { normalizeChatModelOverrides } from './settings';
import { defaultTimeAwarenessSettings, normalizeTimeAwarenessSettings } from './timeAwareness';
import { normalizeVoomFrequency } from './voom';

const legacyChatMemoryDefaults = {
  summarizeEvery: 6,
  grandSummaryVisibleTailFloors: 10,
  grandSummaryEvery: 60
};

export const defaultChatMemorySettings: ChatMemorySettings = {
  enabled: true,
  autoSummarize: true,
  summarizeEvery: 50,
  summaryModel: '',
  summaryPrompt: `停止剧情，停止输出其他所有内容，开始执行五十楼回忆录。

执行规则：
1. 每五十楼调用 API 生成一份由“摘要”和“角色表”组成的回忆录，以{{char}}相关会话为记录对象。
2. 摘要必须包含 time、location、plot、echo 四项。
3. time：当前详细时间，精确到小时；如果开启时间感知，使用当前本机时间与待总结楼层时间线；如果没有开启，则跟随世界观，合理虚构精确时间，并保证时间流逝合理。
4. location：角色所在地点；如正文未明说，可根据世界观和上下文合理推断，但不要随意跳地点。
5. plot：全面总结本次剧情，保留关键信息，记录新名词和新信息，避免升华和评价，使用流水账形式。
6. echo：记录本次剧情中的重要对白 1-2 句，必须明确涉及人物。
7. 角色表只记录当前六楼涉及或明确伏笔影响的人物，不剧透未揭示身份。

固定输出格式：
time：
location：
plot：
echo：

<profile>
| 类别 | 名字(仅当前正文) | 身份(避免剧透) | 重要伏笔（伏笔人物的作用） |
| --- | --- | --- | --- |
| 当前出现人物 or 伏笔人物 |  |  |  |

用 mermaid 记录角色之间的互动和变化。仅基础结构，不含任何样式和配色。
\`\`\`mermaid
graph TD
subgraph 示例
A[开始]-->|"是(继续)"|B[下一步]
A-->|否|C[结束]
end
\`\`\`
</profile>`,
  mergeSummaryPrompt: `停止剧情，停止输出其他所有内容，开始执行新增大总结。

执行规则

1. 标注本次为第几次大总结。
2. 严格按照时间线梳理，区分不同日期、时段和小时发生的事件，保证时序清晰。
3. 每个“时间”必须写成“日期 + 时段 + 具体小时”，例如“2026-07-02 08:00 早上”。
4. 如果开启时间感知，以待总结楼层时间线和回忆录中的 time 为最高优先级。
6. 保留核心事件、人物决定、物品约定、关系变化和关键伏笔，完整保留剧情细节，保证剧情记录完整；删掉寒暄、重复情绪、铺垫修辞、普通动作和未改变走向的内心戏。
7. 关键对话或内心戏只作为“剧情转折证据”记录：每个时间节点最多 2 条，每条不超过 35 字；不要逐句摘录，不要整理成对白列表。
8. 文字简洁直白，无需加粗、排版美化。

固定输出格式

plaintext

- 时间：日期 + 时段 + 具体小时
  - 关键事件：用 2-6 句概括事件经过、出场人物和结果
  - 重要细节：
  - 关键对话/内心证据：最多 2 条，标注对应角色
  - 角色关键行为：标注对应角色
  - 角色与用户之间的情感变化（选填）
  - 事件收尾与后续小互动（选填）

- 时间：日期 + 时段 + 具体小时
  - 关键事件：用 2-6 句概括事件经过、出场人物和结果
  - 重要细节：
  - 关键对话/内心证据：最多 2 条，标注对应角色
  - 角色关键行为：标注对应角色
  - 角色与用户之间的情感变化（选填）
  - 事件收尾与后续小互动（选填）

角色表

只保留影响主线剧情的人物，路人 NPC 全部剔除，附带 Markdown 人物表格与 mermaid 角色互动关系图，严格遵守角色表规范。

| 名字 | 身份 | 重要伏笔 |
| --- | --- | --- |
|  |  |  |

用 mermaid 记录角色之间的互动和变化。仅基础结构，不含任何样式和配色。
\`\`\`mermaid
graph TD
A[角色A]-->|关系变化|B[角色B]
\`\`\`
`,
  vectorMemoryEnabled: false,
  hideSummarizedMessages: true,
  grandSummaryHiddenStartFloor: 1,
  grandSummaryVisibleTailFloors: 20,
  atomWriterEnabled: false,
  atomWriterEvery: 1,
  autoGrandSummaryEnabled: true,
  grandSummaryEvery: 250,
  autoMergeEnabled: true,
  autoMergeThreshold: 8,
  autoMergeBatchSize: 6
};

function normalizeMemoryPrompt(value: unknown, fallback: string) {
  const prompt = String(value ?? '').trim();
  if (!prompt) return fallback;
  const isLegacyDefaultPrompt = prompt.includes('保留人物关系变化、承诺、偏好、冲突和未解决事项')
    || prompt.includes('保留稳定事实、长期关系变化、重要承诺、偏好、冲突和未解决事项')
    || (prompt.includes('[类型|状态|重要度1-5|主体|证据楼层]') && !prompt.includes('发生时间'))
    || (prompt.includes('新增大总结') && prompt.includes('关键对话与内心戏：标注对应角色') && prompt.includes('完整叙述事件经过与出场人物'));
  return isLegacyDefaultPrompt ? fallback : prompt;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  const numericValue = Number(value);
  return Math.max(0, Math.round(Number.isFinite(numericValue) ? numericValue : fallback));
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
const voomImageModes: VoomImageMode[] = ['character-choice', 'manual'];

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
  voomImageMode: 'manual',
  voomImageEnabled: true,
  voomImageFrequency: 'always',
  autoGenerateTheater: true,
  theaterFrequency: 'medium',
  stickerVisionEnabled: true,
  stickerSuggestionsEnabled: true,
  offlineInvitationEnabled: true,
  characterStickerGroupIds: defaultCharacterStickerGroupIds,
  timeAwareness: defaultTimeAwarenessSettings,
  proactiveReply: {
    enabled: false,
    frequency: 'medium',
    lastTriggeredAt: 0
  },
  offline: defaultOfflineSettings
};

export function normalizeConversationSettings(settings: Partial<ConversationSettings> | null | undefined, conversationId: string, mode: ChatMode = 'online'): ConversationSettings {
  const memoryDefaults = defaultChatMemorySettings;
  const memory = settings?.memory ?? memoryDefaults;
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
  const voomImageMode = normalizeStringOption(settings?.voomImageMode, voomImageModes, defaultConversationSettings.voomImageMode);
  const voomImageFrequency = normalizeVoomFrequency(settings?.voomImageFrequency, defaultConversationSettings.voomImageFrequency);
  const theaterFrequency = normalizeVoomFrequency(settings?.theaterFrequency, defaultConversationSettings.theaterFrequency);
  const proactiveReply = settings?.proactiveReply ?? defaultConversationSettings.proactiveReply;
  const rawSummarizeEvery = Math.round(Number(memory.summarizeEvery) || memoryDefaults.summarizeEvery);
  const summarizeEvery = Math.max(1, rawSummarizeEvery === legacyChatMemoryDefaults.summarizeEvery ? memoryDefaults.summarizeEvery : rawSummarizeEvery);
  const grandSummaryHiddenStartFloor = normalizeNonNegativeInteger(memory.grandSummaryHiddenStartFloor, memoryDefaults.grandSummaryHiddenStartFloor);
  const grandSummaryVisibleTailFloors = normalizeNonNegativeInteger(memory.grandSummaryVisibleTailFloors, memoryDefaults.grandSummaryVisibleTailFloors);
  const rawGrandSummaryEvery = Math.round(Number(memory.grandSummaryEvery) || memoryDefaults.grandSummaryEvery);
  const grandSummaryEvery = rawGrandSummaryEvery === legacyChatMemoryDefaults.grandSummaryEvery ? memoryDefaults.grandSummaryEvery : rawGrandSummaryEvery;

  return {
    conversationId,
    memory: {
      enabled: true,
      autoSummarize: memory.autoSummarize ?? memoryDefaults.autoSummarize,
      summarizeEvery,
      summaryModel,
      summaryPrompt: normalizeMemoryPrompt(memory.summaryPrompt, memoryDefaults.summaryPrompt),
      mergeSummaryPrompt: normalizeMemoryPrompt(memory.mergeSummaryPrompt, memoryDefaults.mergeSummaryPrompt),
      vectorMemoryEnabled: false,
      hideSummarizedMessages: memory.hideSummarizedMessages ?? memoryDefaults.hideSummarizedMessages,
      grandSummaryHiddenStartFloor,
      grandSummaryVisibleTailFloors,
      atomWriterEnabled: false,
      atomWriterEvery: 1,
      autoGrandSummaryEnabled: memory.autoGrandSummaryEnabled ?? memory.autoMergeEnabled ?? memoryDefaults.autoGrandSummaryEnabled,
      grandSummaryEvery: Math.min(300, Math.max(20, grandSummaryEvery)),
      autoMergeEnabled: memory.autoMergeEnabled ?? memoryDefaults.autoMergeEnabled,
      autoMergeThreshold: Math.min(30, Math.max(3, Math.round(Number(memory.autoMergeThreshold) || memoryDefaults.autoMergeThreshold))),
      autoMergeBatchSize: Math.min(20, Math.max(2, Math.round(Number(memory.autoMergeBatchSize) || memoryDefaults.autoMergeBatchSize)))
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
    voomImageMode,
    voomImageEnabled: settings?.voomImageEnabled ?? defaultConversationSettings.voomImageEnabled,
    voomImageFrequency,
    autoGenerateTheater: settings?.autoGenerateTheater ?? defaultConversationSettings.autoGenerateTheater,
    theaterFrequency,
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

function normalizeOptionalMemoryText(value: unknown) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || undefined;
}

function normalizeMemoryTimestamp(value: unknown) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const parsed = Date.parse(text.replace(/[年月]/g, '-').replace(/[日号]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeMemoryTimeBasis(value: unknown, fallback: ConversationMemoryTimeBasis): ConversationMemoryTimeBasis {
  const normalized = String(value ?? '').trim() as ConversationMemoryTimeBasis;
  return ['message-time', 'model-time', 'memory-created', 'user-edited'].includes(normalized) ? normalized : fallback;
}

function formatMemorySourceTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeMemoryTimeLabel(value: unknown) {
  const text = normalizeOptionalMemoryText(value);
  if (!text || /^时间未知$|^unknown$/i.test(text)) return undefined;
  return text;
}

function memoryTimeFromMessages(sourceMessages: ChatMessage[] | undefined, evidenceFloors: number[], fallbackStartFloor: number, fallbackEndFloor: number): Partial<Pick<ConversationMemoryEntry, 'occurredAt' | 'occurredEndAt' | 'timeLabel' | 'timeBasis'>> {
  if (!sourceMessages?.length) return {};
  const floorMap = getMessageFloorMap(sourceMessages);
  const evidenceFloorSet = new Set(evidenceFloors.map((floor) => Math.max(1, Math.floor(floor))));
  const matchedMessages = sourceMessages.filter((message) => {
    const localFloor = floorMap.get(message.id) ?? 0;
    const floor = localFloor ? fallbackStartFloor + localFloor - 1 : 0;
    return evidenceFloorSet.has(floor) || (floor >= fallbackStartFloor && floor <= fallbackEndFloor && !evidenceFloorSet.size);
  });
  const timeSources = matchedMessages.length ? matchedMessages : sourceMessages;
  const timestamps = timeSources
    .map((message) => Number(message.createdAt))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
    .sort((left, right) => left - right);
  if (!timestamps.length) return {};
  const occurredAt = timestamps[0];
  const occurredEndAt = timestamps[timestamps.length - 1];
  const startText = formatMemorySourceTime(occurredAt);
  const endText = formatMemorySourceTime(occurredEndAt);
  return {
    occurredAt,
    ...(occurredEndAt > occurredAt ? { occurredEndAt } : {}),
    timeLabel: startText && endText && startText !== endText ? `${startText} 至 ${endText}` : startText,
    timeBasis: 'message-time' as ConversationMemoryTimeBasis
  };
}

function normalizeMemoryTimeMeta(entry: Partial<ConversationMemoryEntry>, fallback: { startFloor: number; endFloor: number; createdAt: number; sourceMessages?: ChatMessage[] }) {
  const occurredAt = normalizeMemoryTimestamp(entry.occurredAt);
  const occurredEndAt = normalizeMemoryTimestamp(entry.occurredEndAt);
  const evidenceFloors = parseEvidenceFloors(entry.evidenceFloors?.join(','), fallback.startFloor, fallback.endFloor);
  const sourceTime = memoryTimeFromMessages(fallback.sourceMessages, evidenceFloors, fallback.startFloor, fallback.endFloor);
  const timeLabel = normalizeMemoryTimeLabel(entry.timeLabel) || sourceTime.timeLabel || `第 ${fallback.startFloor}-${fallback.endFloor} 楼 / 时间未知`;
  const resolvedOccurredAt = occurredAt ?? sourceTime.occurredAt ?? fallback.createdAt;
  const resolvedOccurredEndAt = occurredEndAt ?? sourceTime.occurredEndAt;
  return {
    occurredAt: resolvedOccurredAt,
    ...(resolvedOccurredEndAt && resolvedOccurredEndAt > resolvedOccurredAt ? { occurredEndAt: resolvedOccurredEndAt } : {}),
    timeLabel,
    timeBasis: normalizeMemoryTimeBasis(entry.timeBasis, sourceTime.timeBasis ?? (normalizeMemoryTimeLabel(entry.timeLabel) ? 'model-time' : 'memory-created'))
  };
}

function inferMemoryEntryMeta(type: ConversationMemoryEntryType, status: ConversationMemoryEntryStatus, subject: string, content: string) {
  const text = `${subject} ${content}`;
  const due = text.match(/(?:期限|时间|约定|计划|改天|下次|今晚|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}[月/-]\d{1,2}[日号]?)/)?.[0];
  const resolution = status === 'resolved'
    ? text.match(/(?:已|已经|后来)?(?:兑现|完成|解决|和解|说清|拒绝|撤销|取消|放下)[^。；，,]*/)?.[0]
    : undefined;
  const owner = type === 'promise'
    ? text.match(/(?:由|责任人[:：]?|承诺方[:：]?)([^，。；,]{1,16})/)?.[1]?.trim()
      ?? text.match(/([^，。；,]{1,10})(?:答应|承诺|保证|约定)/)?.[1]?.trim()
    : undefined;
  const counterparty = type === 'promise'
    ? text.match(/(?:给|向|陪|帮|和)([^，。；,]{1,16})(?:[^，。；,]{0,8})(?:做|去|完成|解释|见面|联系|处理)/)?.[1]?.trim()
    : type === 'conflict'
      ? text.match(/(?:与|和|跟)([^，。；,]{1,16})(?:之间)?(?:冲突|争执|误会|矛盾)/)?.[1]?.trim()
      : undefined;
  return {
    owner: normalizeOptionalMemoryText(owner),
    counterparty: normalizeOptionalMemoryText(counterparty),
    due: normalizeOptionalMemoryText(due),
    resolution: normalizeOptionalMemoryText(resolution)
  };
}

function normalizeMemoryEntryMeta(entry: Partial<ConversationMemoryEntry>, type: ConversationMemoryEntryType, status: ConversationMemoryEntryStatus, subject: string, content: string) {
  const inferred = inferMemoryEntryMeta(type, status, subject, content);
  const normalizeField = (field: 'owner' | 'counterparty' | 'due' | 'resolution') => (
    Object.prototype.hasOwnProperty.call(entry, field)
      ? normalizeOptionalMemoryText(entry[field])
      : inferred[field]
  );
  return {
    owner: normalizeField('owner'),
    counterparty: normalizeField('counterparty'),
    due: normalizeField('due'),
    resolution: normalizeField('resolution'),
    sourceAtomIds: Array.isArray(entry.sourceAtomIds) ? [...new Set(entry.sourceAtomIds.map((id) => String(id).trim()).filter(Boolean))] : undefined
  };
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

function parseBracketMemoryEntry(line: string, fallbackType: ConversationMemoryEntryType, fallbackStatus: ConversationMemoryEntryStatus, fallbackStartFloor: number, fallbackEndFloor: number, now: number, sourceMessages?: ChatMessage[]): ConversationMemoryEntry | null {
  const match = line.match(/^[-*]\s*\[([^\]]+)]\s*(.+)$/);
  if (!match) return null;
  const parts = match[1].split('|').map((part) => part.trim());
  const type = normalizeMemoryEntryType(parts[0], fallbackType);
  const status = normalizeMemoryEntryStatus(parts[1], fallbackStatus);
  const importance = clampMemoryImportance(parts[2]);
  const subject = parts[3]?.trim() || buildFallbackSubject(type);
  const evidenceFloors = parseEvidenceFloors(parts[4], fallbackStartFloor, fallbackEndFloor);
  const timeLabel = normalizeMemoryTimeLabel(parts[5]);
  const content = normalizeMemoryContent(match[2]);
  if (!content) return null;
  return {
    id: createId('memitem'),
    type,
    status,
    subject,
    content,
    ...normalizeMemoryEntryMeta({}, type, status, subject, content),
    evidenceFloors,
    lastTouchedFloor: Math.max(...evidenceFloors, fallbackEndFloor),
    ...normalizeMemoryTimeMeta({ evidenceFloors, timeLabel }, { startFloor: fallbackStartFloor, endFloor: fallbackEndFloor, createdAt: now, sourceMessages }),
    importance,
    vector: vectorizeText(`${subject} ${content}`),
    createdAt: now,
    updatedAt: now
  };
}

function parseLooseMemoryEntry(line: string, fallbackType: ConversationMemoryEntryType, fallbackStatus: ConversationMemoryEntryStatus, fallbackStartFloor: number, fallbackEndFloor: number, now: number, sourceMessages?: ChatMessage[]): ConversationMemoryEntry | null {
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
    ...normalizeMemoryEntryMeta({}, type, status, buildFallbackSubject(type), content),
    evidenceFloors,
    lastTouchedFloor: Math.max(...evidenceFloors, fallbackEndFloor),
    ...normalizeMemoryTimeMeta({ evidenceFloors }, { startFloor: fallbackStartFloor, endFloor: fallbackEndFloor, createdAt: now, sourceMessages }),
    importance: status === 'open' || type === 'relationship' ? 4 : 3,
    vector: vectorizeText(`${buildFallbackSubject(type)} ${content}`),
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeMemoryRecordEntries(memory: Pick<ConversationMemoryRecord, 'summary' | 'startFloor' | 'endFloor' | 'entries' | 'createdAt' | 'updatedAt'> & { sourceMessages?: ChatMessage[] }, now = Date.now()): ConversationMemoryEntry[] {
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
          ...normalizeMemoryEntryMeta(entry, type, status, String(entry.subject ?? '').trim() || buildFallbackSubject(type), content),
          evidenceFloors,
          lastTouchedFloor: Math.max(1, Math.floor(Number(entry.lastTouchedFloor) || Math.max(...evidenceFloors, endFloor))),
          ...normalizeMemoryTimeMeta(entry, { startFloor, endFloor, createdAt: memory.createdAt || now, sourceMessages: memory.sourceMessages }),
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
    const parsed = parseBracketMemoryEntry(line, currentType, currentStatus, startFloor, endFloor, updatedAt, memory.sourceMessages)
      ?? parseLooseMemoryEntry(line, currentType, currentStatus, startFloor, endFloor, updatedAt, memory.sourceMessages);
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
    ...normalizeMemoryEntryMeta({}, 'plot', 'active', '摘要', content),
    evidenceFloors: startFloor === endFloor ? [startFloor] : [startFloor, endFloor],
    lastTouchedFloor: endFloor,
    ...normalizeMemoryTimeMeta({ evidenceFloors: startFloor === endFloor ? [startFloor] : [startFloor, endFloor] }, { startFloor, endFloor, createdAt, sourceMessages: memory.sourceMessages }),
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

interface MemoryScoreContext {
  queryText: string;
  queryTokens: Set<string>;
  queryVector: number[];
  queryLocalVector: number[];
  latestFloor: number;
  now: number;
}

type MemoryScoreBreakdown = Array<{ label: string; value: number; reason: string }>;

function compactScoreValue(value: number) {
  return Number(value.toFixed(2));
}

function pushScorePart(parts: MemoryScoreBreakdown, label: string, value: number, reason: string) {
  if (!value) return;
  parts.push({ label, value: compactScoreValue(value), reason });
}

function scoreMemoryEntryDetailed(entry: ConversationMemoryEntry, context: MemoryScoreContext) {
  const entryTokens = tokenizeMemoryText(getEntryText(entry));
  const matchedTokens = [...context.queryTokens].filter((token) => entryTokens.has(token)).slice(0, 8);
  const semanticSimilarity = context.queryVector.length && entry.vector?.length === context.queryVector.length
    ? cosineSimilarity(context.queryVector, entry.vector)
    : 0;
  const localSimilarity = context.queryLocalVector.length
    ? cosineSimilarity(context.queryLocalVector, vectorizeText(getEntryText(entry)))
    : 0;
  const vectorScore = semanticSimilarity ? semanticSimilarity * 12 : localSimilarity * 8;
  const statusWeight = {
    open: 18,
    active: 12,
    resolved: -2,
    superseded: -12,
    cancelled: -16
  }[entry.status];
  const typeWeight = entry.type === 'relationship' ? 5 : entry.type === 'preference' ? 4 : entry.type === 'promise' || entry.type === 'conflict' ? 6 : 0;
  const floorDistance = Math.max(0, context.latestFloor - entry.lastTouchedFloor);
  const recencyWeight = Math.max(0, 8 - Math.floor(floorDistance / 20));
  const agePenalty = entry.expiresAt && entry.expiresAt < context.now ? 30 : 0;
  const scoreBreakdown: MemoryScoreBreakdown = [];
  pushScorePart(scoreBreakdown, '关键词', matchedTokens.length * 7, matchedTokens.length ? matchedTokens.join('/') : '无关键词命中');
  pushScorePart(scoreBreakdown, '本地相关', vectorScore, `相似度 ${(semanticSimilarity || localSimilarity).toFixed(2)}`);
  pushScorePart(scoreBreakdown, '重要度', entry.importance * 4, `重要度 ${entry.importance}`);
  pushScorePart(scoreBreakdown, '状态', statusWeight, entry.status);
  pushScorePart(scoreBreakdown, '类型', typeWeight, entry.type);
  pushScorePart(scoreBreakdown, '近期', recencyWeight, `${floorDistance} 楼前`);
  pushScorePart(scoreBreakdown, '过期', -agePenalty, '超过 expiresAt');
  return {
    score: matchedTokens.length * 7 + vectorScore + entry.importance * 4 + statusWeight + typeWeight + recencyWeight - agePenalty,
    scoreBreakdown,
    matchedTokens
  };
}

function scoreMemoryEntry(entry: ConversationMemoryEntry, queryTokens: Set<string>, queryVector: number[], latestFloor: number, now: number) {
  const isLocalQueryVector = queryVector.length === 16;
  return scoreMemoryEntryDetailed(entry, {
    queryText: '',
    queryTokens,
    queryVector: isLocalQueryVector ? [] : queryVector,
    queryLocalVector: isLocalQueryVector ? queryVector : [],
    latestFloor,
    now
  }).score;
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
  const timeText = entry.timeLabel ? `；发生时间 ${entry.timeLabel}` : '';
  const metaText = [
    entry.owner ? `责任 ${entry.owner}` : '',
    entry.counterparty ? `对象 ${entry.counterparty}` : '',
    entry.due ? `期限 ${entry.due}` : '',
    entry.resolution ? `结果 ${entry.resolution}` : ''
  ].filter(Boolean).join('；');
  return `- ${entry.subject}：${entry.content}（${statusLabel}；重要度 ${entry.importance}${floorText}${timeText}${metaText ? `；${metaText}` : ''}）`;
}

function memoryContextSection(title: string, entries: ConversationMemoryEntry[]) {
  if (!entries.length) return '';
  return `【${title}】\n${entries.map(formatMemoryEntry).join('\n')}`;
}

function hasExcludedSourceMessage(sourceMessageIds: string[], excludedSourceMessageIds?: Set<string>) {
  return Boolean(excludedSourceMessageIds?.size && sourceMessageIds.some((id) => excludedSourceMessageIds.has(id)));
}

function normalizeExcludedSourceMessageIds(ids: string[] | undefined) {
  return new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean));
}

export function getMemoryMergeDepth(memory: ConversationMemoryRecord): number {
  if (!memory.isMergedSummary) return 0;
  const childDepth = memory.mergedFrom?.reduce((max, childMemory) => Math.max(max, getMemoryMergeDepth(childMemory)), 0) ?? 0;
  return childDepth + 1;
}

export function filterHighestMemoryLayers(memories: ConversationMemoryRecord[]) {
  const memoryDepths = new Map(memories.map((memory) => [memory.id, getMemoryMergeDepth(memory)]));
  return memories.filter((memory) => {
    const depth = memoryDepths.get(memory.id) ?? 0;
    return !memories.some((candidate) => {
      if (candidate.id === memory.id) return false;
      if (candidate.conversationId !== memory.conversationId || candidate.mode !== memory.mode) return false;
      const candidateDepth = memoryDepths.get(candidate.id) ?? 0;
      if (candidateDepth <= depth) return false;
      return candidate.startFloor <= memory.startFloor && candidate.endFloor >= memory.endFloor;
    });
  });
}

export function getMemoryContext(memories: ConversationMemoryRecord[], options: { queryText?: string; maxEntries?: number; includeResolved?: boolean; excludeSourceMessageIds?: string[] } = {}) {
  const excludedSourceMessageIds = normalizeExcludedSourceMessageIds(options.excludeSourceMessageIds);
  const sorted = filterHighestMemoryLayers(memories)
    .filter((memory) => !hasExcludedSourceMessage(memory.sourceMessageIds, excludedSourceMessageIds))
    .sort((a, b) => a.startFloor - b.startFloor);
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

export function getMessageFloorMap(messages: ChatMessage[]) {
  const floorMap = new Map<string, number>();
  getConversationFloors(messages).forEach((floorMessages, index) => {
    floorMessages.forEach((message) => floorMap.set(message.id, index + 1));
  });
  return floorMap;
}

export function getConversationActiveMessages(messages: ChatMessage[]) {
  return messages.filter((message) => message.replyVariantState !== 'inactive');
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

export const grandSummaryVisibleTailFloors = 10;
export const grandSummaryHiddenStartFloor = 1;

export interface HiddenFloorRange {
  start: number;
  end: number;
}

export function getGrandSummaryHiddenEndFloor(endFloor: number, visibleTailFloors = grandSummaryVisibleTailFloors) {
  const normalizedEndFloor = Math.max(1, Math.floor(endFloor));
  const normalizedTailFloors = Math.max(0, Math.floor(Number(visibleTailFloors) || 0));
  return Math.max(0, normalizedEndFloor - normalizedTailFloors);
}

export function getGrandSummaryHiddenRange(endFloor: number, hiddenStartFloor = grandSummaryHiddenStartFloor, visibleTailFloors = grandSummaryVisibleTailFloors) {
  const normalizedEndFloor = Math.max(1, Math.floor(endFloor));
  const normalizedStartFloor = Math.max(0, Math.floor(Number(hiddenStartFloor) || 0));
  const hiddenEndFloor = getGrandSummaryHiddenEndFloor(normalizedEndFloor, visibleTailFloors);
  const clampedStartFloor = normalizedStartFloor > 0 ? Math.min(normalizedStartFloor, normalizedEndFloor) : 0;
  return clampedStartFloor > 0 && hiddenEndFloor >= clampedStartFloor
    ? { hiddenStartFloor: clampedStartFloor, hiddenEndFloor }
    : { hiddenStartFloor: 0, hiddenEndFloor: 0 };
}

export function isIncrementalGrandSummary(memory: ConversationMemoryRecord) {
  return memory.summaryRole === 'incremental-grand';
}

export function collectIncrementalGrandSummaries(memory: ConversationMemoryRecord): ConversationMemoryRecord[] {
  return [
    ...(isIncrementalGrandSummary(memory) ? [memory] : []),
    ...(memory.mergedFrom?.flatMap((childMemory) => collectIncrementalGrandSummaries(childMemory)) ?? [])
  ];
}

function memorySourceMessagesAreActive(memory: ConversationMemoryRecord, sourceMessagesById: Map<string, ChatMessage>) {
  return Boolean(memory.sourceMessageIds.length) && memory.sourceMessageIds.every((messageId) => {
    const sourceMessage = sourceMessagesById.get(messageId);
    return Boolean(sourceMessage && sourceMessage.replyVariantState !== 'inactive');
  });
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
  const sourceMessagesById = new Map(messages.map((message) => [message.id, message]));
  const hiddenRanges = getEffectiveHiddenFloorRanges(memories.flatMap((memory) => collectIncrementalGrandSummaries(memory)).filter((memory) => memorySourceMessagesAreActive(memory, sourceMessagesById)));

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

export function getNextSummaryStartFloor(messages: ChatMessage[], memories: ConversationMemoryRecord[]) {
  const sourceMessagesById = new Map(messages.map((message) => [message.id, message]));
  const coveredRanges = memories
    .filter((memory) => memorySourceMessagesAreActive(memory, sourceMessagesById))
    .map((memory) => ({ start: Math.max(1, Math.floor(memory.startFloor)), end: Math.max(1, Math.floor(memory.endFloor)) }))
    .filter((range) => range.end >= range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let startFloor = 1;
  for (const range of coveredRanges) {
    if (range.end < startFloor) continue;
    if (range.start > startFloor) break;
    startFloor = Math.max(startFloor, range.end + 1);
  }
  return startFloor;
}

export function getNextSummaryRange(messages: ChatMessage[], memories: ConversationMemoryRecord[], settings: ConversationSettings) {
  if (!settings.memory.autoSummarize) return null;
  const step = settings.memory.summarizeEvery;
  const floorCount = getConversationFloorCount(messages);
  const startFloor = getNextSummaryStartFloor(messages, memories);
  const endFloor = startFloor + step - 1;
  if (floorCount < endFloor) return null;
  const sourceMessages = getMessagesInFloorRange(messages, startFloor, endFloor);
  return {
    startFloor,
    endFloor,
    hiddenStartFloor: 0,
    hiddenEndFloor: 0,
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
    summaryRole: 'memoir',
    startFloor: input.startFloor,
    endFloor: input.endFloor,
    hiddenStartFloor: input.hiddenStartFloor,
    hiddenEndFloor: input.hiddenEndFloor,
    summary: input.summary,
    tokenCount: estimateTokenCount(input.summary),
    vector: [...(input.vector ?? [])],
    entries: dedupeMemoryEntries(input.entries?.length ? normalizeMemoryRecordEntries({ summary: input.summary, startFloor: input.startFloor, endFloor: input.endFloor, entries: input.entries, createdAt: now, updatedAt: now, sourceMessages: input.sourceMessages }, now) : normalizeMemoryRecordEntries({ summary: input.summary, startFloor: input.startFloor, endFloor: input.endFloor, entries: [], createdAt: now, updatedAt: now, sourceMessages: input.sourceMessages }, now)),
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
