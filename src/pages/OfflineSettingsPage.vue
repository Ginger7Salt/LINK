<template>
  <section v-if="conversation && character" class="screen no-tabs offline-settings-page">
    <header class="offline-settings-topbar">
      <button class="settings-icon-button" type="button" aria-label="返回线下模式" @click="goBack">
        <ArrowLeft :size="21" />
      </button>
      <div class="settings-title-block">
        <span>chapter preset</span>
        <h1>线下设置</h1>
      </div>
      <div class="settings-avatar-wrap">
        <img :src="character.avatar" :alt="characterDisplayName" />
      </div>
    </header>

    <main class="offline-settings-main">
      <section class="settings-hero">
        <span>{{ characterDisplayName }}</span>
        <strong>RP chapter studio</strong>
        <p>这些选项会写入线下章节提示词。</p>
      </section>

      <section v-if="activeTab === 'enhance'" class="settings-section" aria-label="描写增强">
        <h2>描写增强</h2>
        <label v-for="item in toggleItems" :key="item.key" class="toggle-row">
          <span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <input :checked="Boolean(offlineSettings[item.key])" type="checkbox" @change="updateToggle(item.key, $event)" />
        </label>
      </section>

      <template v-if="activeTab === 'structure'">
      <section class="settings-section" aria-label="章节结构">
        <h2>章节结构</h2>
        <div class="setting-block">
          <span class="setting-label">段落长度</span>
          <div class="segmented-control segmented-control--three">
            <button v-for="option in paragraphOptions" :key="option.id" type="button" :class="{ active: offlineSettings.paragraphMode === option.id }" @click="updateOfflineSettings({ paragraphMode: option.id })">
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="setting-block">
          <span class="setting-label">叙事视角</span>
          <div class="option-grid">
            <button v-for="option in perspectiveOptions" :key="option.id" type="button" :class="{ active: offlineSettings.perspective === option.id }" @click="updateOfflineSettings({ perspective: option.id })">
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="setting-block">
          <span class="setting-label">剧情拓展</span>
          <div class="segmented-control">
            <button v-for="option in interruptionOptions" :key="option.id" type="button" :class="{ active: offlineSettings.interruptionMode === option.id }" @click="updateOfflineSettings({ interruptionMode: option.id })">
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="setting-block">
          <span class="setting-label">转述方式</span>
          <div class="segmented-control">
            <button v-for="option in retellOptions" :key="option.id" type="button" :class="{ active: offlineSettings.retellMode === option.id }" @click="updateOfflineSettings({ retellMode: option.id })">
              {{ option.label }}
            </button>
          </div>
          <p class="setting-note">转述会在章节前原样承接用户输出，并润色扩写动作、行为、神情和话语。</p>
        </div>
      </section>

      <section class="settings-section" aria-label="文字风格">
        <h2>文字规格</h2>
        <label class="text-field">
          <span>正文字数</span>
          <input v-model="wordCountDraft" placeholder="800-1200字" @change="commitTextSetting('wordCount')" @blur="commitTextSetting('wordCount')" />
        </label>
      </section>
      </template>

      <template v-if="activeTab === 'style'">
      <section class="settings-section preset-editor-section" aria-label="写作文风预设">
        <div class="section-title-row">
          <h2>写作文风</h2>
          <button class="small-action" type="button" @click="addPreset('writingStyle')">
            <Plus :size="14" />
            新增
          </button>
        </div>
        <label class="preset-select-field">
          <span>选择文风</span>
          <select :value="selectedWritingStylePresetId" @change="selectPresetFromEvent('writingStyle', $event)">
            <option v-for="preset in writingStylePresets" :key="preset.id" :value="preset.id">
              {{ preset.name }}{{ offlineSettings.writingStylePresetId === preset.id ? ' · 应用中' : '' }}
            </option>
          </select>
        </label>
        <label class="text-field">
          <span>预设名称</span>
          <input v-model="writingStyleNameDraft" placeholder="例如：白描" />
        </label>
        <label class="text-field text-field--textarea">
          <span>预设内容</span>
          <textarea v-model="writingStyleContentDraft" rows="5" placeholder="写下完整文风规则"></textarea>
        </label>
        <div class="preset-actions">
          <button type="button" @click="applyPreset('writingStyle')">
            <Check :size="14" />
            应用
          </button>
          <button type="button" @click="savePreset('writingStyle')">保存</button>
          <button class="danger-action" type="button" :disabled="writingStylePresets.length <= 1" @click="deletePreset('writingStyle')">
            <Trash2 :size="14" />
            删除
          </button>
        </div>
      </section>

      <section class="settings-section preset-editor-section" aria-label="基调预设">
        <div class="section-title-row">
          <h2>基调</h2>
          <button class="small-action" type="button" @click="addPreset('tone')">
            <Plus :size="14" />
            新增
          </button>
        </div>
        <label class="preset-select-field">
          <span>选择基调</span>
          <select :value="selectedTonePresetId" @change="selectPresetFromEvent('tone', $event)">
            <option v-for="preset in tonePresets" :key="preset.id" :value="preset.id">
              {{ preset.name }}{{ offlineSettings.tonePresetId === preset.id ? ' · 应用中' : '' }}
            </option>
          </select>
        </label>
        <label class="text-field">
          <span>预设名称</span>
          <input v-model="toneNameDraft" placeholder="例如：日常" />
        </label>
        <label class="text-field text-field--textarea">
          <span>预设内容</span>
          <textarea v-model="toneContentDraft" rows="5" placeholder="写下完整基调规则，不只是两个字"></textarea>
        </label>
        <div class="preset-actions">
          <button type="button" @click="applyPreset('tone')">
            <Check :size="14" />
            应用
          </button>
          <button type="button" @click="savePreset('tone')">保存</button>
          <button class="danger-action" type="button" :disabled="tonePresets.length <= 1" @click="deletePreset('tone')">
            <Trash2 :size="14" />
            删除
          </button>
        </div>
      </section>
      </template>
    </main>

    <footer class="offline-settings-tabs" aria-label="线下设置分类">
      <button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
        <component :is="tab.icon" :size="17" />
        <span>{{ tab.label }}</span>
      </button>
    </footer>
  </section>
  <section v-else class="screen no-tabs empty-state">会话不存在</section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Check, Feather, Layers3, Plus, SlidersHorizontal, Trash2 } from 'lucide-vue-next';
import { useAppStore } from '@/stores/appStore';
import type { ConversationOfflineSettings, OfflineInterruptionMode, OfflineParagraphMode, OfflinePerspective, OfflinePromptPreset, OfflineRetellMode } from '@/types/domain';
import { getCharacterDisplayName } from '@/utils/character';
import { createId } from '@/utils/id';

const props = defineProps<{
  id: string;
}>();

type SettingsTab = 'enhance' | 'structure' | 'style';

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof SlidersHorizontal }> = [
  { id: 'enhance', label: '描写增强', icon: SlidersHorizontal },
  { id: 'structure', label: '章节结构', icon: Layers3 },
  { id: 'style', label: '文风基调', icon: Feather }
];

const paragraphOptions: Array<{ id: OfflineParagraphMode; label: string }> = [
  { id: 'long', label: '长段落' },
  { id: 'short', label: '短段落' },
  { id: 'mixed', label: '交错' }
];

const perspectiveOptions: Array<{ id: OfflinePerspective; label: string }> = [
  { id: 'omniscient-third', label: '上帝视角第三人称' },
  { id: 'character-third', label: '角色第三人称' },
  { id: 'character-second', label: '角色第二人称' },
  { id: 'user-first', label: '用户第一人称' },
  { id: 'user-second', label: '用户第二人称' }
];

const interruptionOptions: Array<{ id: OfflineInterruptionMode; label: string }> = [
  { id: 'advance', label: '抢话' },
  { id: 'strict', label: '不抢话' }
];

const retellOptions: Array<{ id: OfflineRetellMode; label: string }> = [
  { id: 'retell', label: '转述' },
  { id: 'direct', label: '不转述' }
];

const toggleItems: Array<{ key: keyof Pick<ConversationOfflineSettings, 'enhanceAppearance' | 'enhanceOutfit' | 'expandLength' | 'characterPsychology'>; label: string; description: string }> = [
  { key: 'enhanceAppearance', label: '增强外貌描写', description: '更细地写神态、距离、光线下的外貌细节' },
  { key: 'enhanceOutfit', label: '增强服饰描写', description: '把衣着、材质、穿搭状态自然写入场景' },
  { key: 'expandLength', label: '增加对话篇幅', description: '扩展互动、环境和动作过渡' },
  { key: 'characterPsychology', label: '角色心理活动', description: '加入角色当下的真实心理和情绪余波' }
];

const store = useAppStore();
const router = useRouter();
const conversation = computed(() => store.conversationById(props.id));
const character = computed(() => (conversation.value ? store.characterById(conversation.value.charId) : undefined));
const characterDisplayName = computed(() => (character.value ? getCharacterDisplayName(character.value) : ''));
const chatSettings = computed(() => store.settingsForConversation(props.id));
const offlineSettings = computed(() => chatSettings.value.offline);
const writingStylePresets = computed(() => offlineSettings.value.writingStylePresets);
const tonePresets = computed(() => offlineSettings.value.tonePresets);
const activeTab = ref<SettingsTab>('enhance');
const wordCountDraft = ref('');
const selectedWritingStylePresetId = ref('');
const selectedTonePresetId = ref('');
const writingStyleNameDraft = ref('');
const writingStyleContentDraft = ref('');
const toneNameDraft = ref('');
const toneContentDraft = ref('');

type PresetKind = 'writingStyle' | 'tone';

function fallbackPreset(kind: PresetKind) {
  const presets = kind === 'writingStyle' ? writingStylePresets.value : tonePresets.value;
  const activeId = kind === 'writingStyle' ? offlineSettings.value.writingStylePresetId : offlineSettings.value.tonePresetId;
  return presets.find((preset) => preset.id === activeId) ?? presets[0];
}

function selectedPreset(kind: PresetKind) {
  const selectedId = kind === 'writingStyle' ? selectedWritingStylePresetId.value : selectedTonePresetId.value;
  const presets = kind === 'writingStyle' ? writingStylePresets.value : tonePresets.value;
  return presets.find((preset) => preset.id === selectedId) ?? fallbackPreset(kind);
}

function syncPresetDraft(kind: PresetKind) {
  const preset = selectedPreset(kind);
  if (!preset) return;
  if (kind === 'writingStyle') {
    selectedWritingStylePresetId.value = preset.id;
    writingStyleNameDraft.value = preset.name;
    writingStyleContentDraft.value = preset.content;
    return;
  }
  selectedTonePresetId.value = preset.id;
  toneNameDraft.value = preset.name;
  toneContentDraft.value = preset.content;
}

function syncDrafts() {
  wordCountDraft.value = offlineSettings.value.wordCount;
  syncPresetDraft('writingStyle');
  syncPresetDraft('tone');
}

onMounted(() => {
  void store.hydrate().then(syncDrafts);
});

watch(() => props.id, syncDrafts);
watch(offlineSettings, syncDrafts);

function updateOfflineSettings(patch: Partial<ConversationOfflineSettings>) {
  void store.saveConversationSettings({
    ...chatSettings.value,
    offline: {
      ...offlineSettings.value,
      ...patch
    }
  });
}

function updateToggle(key: keyof Pick<ConversationOfflineSettings, 'enhanceAppearance' | 'enhanceOutfit' | 'expandLength' | 'characterPsychology'>, event: Event) {
  updateOfflineSettings({ [key]: (event.target as HTMLInputElement).checked });
}

function commitTextSetting(key: 'wordCount') {
  const value = wordCountDraft.value.trim();
  updateOfflineSettings({ [key]: value });
}

function selectPreset(kind: PresetKind, presetId: string) {
  if (kind === 'writingStyle') {
    selectedWritingStylePresetId.value = presetId;
  } else {
    selectedTonePresetId.value = presetId;
  }
  syncPresetDraft(kind);
}

function selectPresetFromEvent(kind: PresetKind, event: Event) {
  selectPreset(kind, (event.target as HTMLSelectElement).value);
}

function presetDraft(kind: PresetKind) {
  return kind === 'writingStyle'
    ? { name: writingStyleNameDraft.value.trim() || '未命名文风', content: writingStyleContentDraft.value.trim() || '请补充这个写作文风的完整规则。' }
    : { name: toneNameDraft.value.trim() || '未命名基调', content: toneContentDraft.value.trim() || '请补充这个剧情基调的完整规则。' };
}

function savePreset(kind: PresetKind) {
  const preset = selectedPreset(kind);
  if (!preset) return;
  const drafts = presetDraft(kind);
  const presets = kind === 'writingStyle' ? writingStylePresets.value : tonePresets.value;
  const nextPresets = presets.map((item) => (item.id === preset.id ? { ...item, ...drafts } : item));
  updateOfflineSettings(kind === 'writingStyle' ? { writingStylePresets: nextPresets } : { tonePresets: nextPresets });
}

function addPreset(kind: PresetKind) {
  const preset: OfflinePromptPreset = kind === 'writingStyle'
    ? { id: createId('style'), name: '新文风', content: '写下这套文风的完整规则，例如叙述密度、对白比例、描写方式和节奏。' }
    : { id: createId('tone'), name: '新基调', content: '写下这套基调的完整规则，例如情绪温度、关系张力、推进速度和留白方式。' };
  if (kind === 'writingStyle') {
    selectedWritingStylePresetId.value = preset.id;
    updateOfflineSettings({ writingStylePresets: [...writingStylePresets.value, preset] });
  } else {
    selectedTonePresetId.value = preset.id;
    updateOfflineSettings({ tonePresets: [...tonePresets.value, preset] });
  }
}

function applyPreset(kind: PresetKind) {
  const preset = selectedPreset(kind);
  if (!preset) return;
  const drafts = presetDraft(kind);
  const presets = kind === 'writingStyle' ? writingStylePresets.value : tonePresets.value;
  const nextPresets = presets.map((item) => (item.id === preset.id ? { ...item, ...drafts } : item));
  updateOfflineSettings(kind === 'writingStyle'
    ? { writingStylePresets: nextPresets, writingStylePresetId: preset.id }
    : { tonePresets: nextPresets, tonePresetId: preset.id });
}

function deletePreset(kind: PresetKind) {
  const preset = selectedPreset(kind);
  const presets = kind === 'writingStyle' ? writingStylePresets.value : tonePresets.value;
  if (!preset || presets.length <= 1) return;
  const nextPresets = presets.filter((item) => item.id !== preset.id);
  const nextActiveId = kind === 'writingStyle'
    ? offlineSettings.value.writingStylePresetId === preset.id ? nextPresets[0].id : offlineSettings.value.writingStylePresetId
    : offlineSettings.value.tonePresetId === preset.id ? nextPresets[0].id : offlineSettings.value.tonePresetId;
  if (kind === 'writingStyle') {
    selectedWritingStylePresetId.value = nextActiveId;
    updateOfflineSettings({ writingStylePresets: nextPresets, writingStylePresetId: nextActiveId });
  } else {
    selectedTonePresetId.value = nextActiveId;
    updateOfflineSettings({ tonePresets: nextPresets, tonePresetId: nextActiveId });
  }
}

function goBack() {
  void router.replace({ name: 'offline-room', params: { id: props.id } });
}
</script>

<style scoped>
.offline-settings-page {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 0;
  color: #282328;
  background:
    linear-gradient(145deg, rgba(255, 230, 238, 0.78), rgba(246, 242, 255, 0.68) 44%, rgba(239, 251, 245, 0.8)),
    #fbf8fa;
}

.offline-settings-topbar {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 38px;
  align-items: center;
  gap: 10px;
  padding: calc(10px + var(--safe-top)) calc(14px + var(--safe-right)) 10px calc(14px + var(--safe-left));
  border-bottom: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.66);
  -webkit-backdrop-filter: blur(22px);
  backdrop-filter: blur(22px);
}

.settings-icon-button,
.settings-avatar-wrap {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 10px 24px rgba(77, 58, 71, 0.08);
}

.settings-avatar-wrap img {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  object-fit: cover;
}

.settings-title-block {
  display: grid;
  justify-items: center;
  gap: 2px;
  min-width: 0;
}

.settings-title-block span {
  color: #b28b99;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.settings-title-block h1 {
  margin: 0;
  color: #211d21;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.15;
}

.offline-settings-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  display: grid;
  align-content: start;
  gap: 12px;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 14px calc(14px + var(--safe-right)) 14px calc(14px + var(--safe-left));
}

.settings-hero,
.settings-section {
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 18px 44px rgba(96, 74, 88, 0.1);
}

.settings-hero {
  display: grid;
  gap: 4px;
  padding: 16px;
}

.settings-hero span {
  color: #b28b99;
  font-size: 11px;
  font-weight: 900;
}

.settings-hero strong {
  color: #211d21;
  font-size: 24px;
  font-weight: 900;
  line-height: 1.05;
}

.settings-hero p {
  margin: 2px 0 0;
  color: #8f858c;
  font-size: 12px;
  line-height: 1.5;
}

.settings-section {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.settings-section h2 {
  margin: 0 0 2px;
  color: #342d34;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.2;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.small-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(182, 154, 166, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.76);
  color: #302a30;
  font-size: 12px;
  font-weight: 900;
}

.toggle-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 10px 0;
  border-top: 1px solid rgba(46, 37, 43, 0.08);
}

.toggle-row:first-of-type {
  border-top: 0;
}

.toggle-row span {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.toggle-row strong,
.text-field span,
.setting-label {
  color: #302a30;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.2;
}

.toggle-row small {
  color: #92878e;
  font-size: 11px;
  line-height: 1.35;
}

.toggle-row input[type='checkbox'] {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  appearance: none;
  background: rgba(48, 42, 48, 0.16);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.72);
  transition: background 0.16s ease;
}

.toggle-row input[type='checkbox']::before {
  display: block;
  width: 20px;
  height: 20px;
  margin: 2px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 4px 10px rgba(47, 37, 45, 0.18);
  content: '';
  transition: transform 0.16s ease;
}

.toggle-row input[type='checkbox']:checked {
  background: #262126;
}

.toggle-row input[type='checkbox']:checked::before {
  transform: translateX(18px);
}

.setting-block,
.text-field,
.preset-select-field {
  display: grid;
  gap: 8px;
}

.setting-note {
  margin: -2px 0 0;
  color: #92878e;
  font-size: 11px;
  font-weight: 760;
  line-height: 1.45;
}

.preset-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.preset-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 38px;
  padding: 6px 8px;
  border: 1px solid rgba(182, 154, 166, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: #302a30;
  font-size: 12px;
  font-weight: 900;
}

.preset-actions button:first-child {
  border-color: #262126;
  background: #262126;
  color: #ffffff;
}

.preset-actions .danger-action {
  color: #a64d5b;
}

.preset-actions button:disabled {
  opacity: 0.42;
}

.segmented-control,
.option-grid,
.tone-grid {
  display: grid;
  gap: 7px;
}

.segmented-control {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.segmented-control--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.option-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.tone-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.segmented-control button,
.option-grid button,
.tone-grid button {
  min-height: 38px;
  padding: 6px 8px;
  border: 1px solid rgba(182, 154, 166, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
  color: #695d65;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.25;
}

.segmented-control button.active,
.option-grid button.active,
.tone-grid button.active {
  border-color: #262126;
  background: #262126;
  color: #ffffff;
}

.text-field input,
.text-field textarea,
.preset-select-field select {
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid rgba(182, 154, 166, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: #262126;
  font-size: 13px;
  font-weight: 800;
}

.preset-select-field span {
  color: #302a30;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.2;
}

.preset-select-field select {
  appearance: none;
  background:
    linear-gradient(45deg, transparent 50%, #6b6068 50%) calc(100% - 18px) 52% / 6px 6px no-repeat,
    linear-gradient(135deg, #fff, rgba(255, 255, 255, 0.72));
  color: #262126;
}

.text-field textarea {
  min-height: 96px;
  resize: vertical;
  padding: 10px 12px;
  line-height: 1.45;
}

.preset-editor-section {
  gap: 12px;
}

.text-field input::placeholder,
.text-field textarea::placeholder {
  color: #aaa0a7;
}

.offline-settings-tabs {
  position: relative;
  flex: 0 0 auto;
  z-index: 18;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 9px calc(12px + var(--safe-right)) calc(9px + var(--safe-bottom)) calc(12px + var(--safe-left));
  border-top: 1px solid rgba(255, 255, 255, 0.66);
  background: rgba(255, 255, 255, 0.78);
  -webkit-backdrop-filter: blur(22px);
  backdrop-filter: blur(22px);
}

.offline-settings-tabs button {
  display: grid;
  place-items: center;
  gap: 3px;
  min-width: 0;
  min-height: 48px;
  padding: 5px 4px;
  border: 1px solid rgba(182, 154, 166, 0.22);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.64);
  color: #71666e;
  font-size: 11px;
  font-weight: 900;
}

.offline-settings-tabs button.active {
  border-color: #262126;
  background: #262126;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(38, 33, 38, 0.16);
}

.offline-settings-tabs span {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>