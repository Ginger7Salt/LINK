<template>
  <section class="control-panel">
      <section v-if="activeTab === 'memory'" class="panel-section memory-panel">
        <section class="memory-hero">
          <div>
            <span>Hippocampus Memory</span>
            <strong>{{ totalMemoryTokens }} tokens</strong>
            <p>{{ hiddenFloorStatus }}</p>
          </div>
          <button class="manual-summary-button" type="button" :disabled="summarizing" @click="showManualSummary = !showManualSummary">
            {{ summarizing ? '总结中' : '手动总结' }}
          </button>
        </section>

        <form v-if="showManualSummary" class="manual-summary-card settings-block" @submit.prevent="manualSummarize">
          <header class="section-header compact-header">
            <div>
              <span>Manual range</span>
              <strong>手动总结范围</strong>
            </div>
          </header>
          <div class="range-grid">
            <label class="field">
              <span>总结开始楼层</span>
              <input v-model.number="manualSummary.startFloor" min="1" type="number" />
            </label>
            <label class="field">
              <span>总结结束楼层</span>
              <input v-model.number="manualSummary.endFloor" :max="messageCount" min="1" type="number" />
            </label>
            <label class="field">
              <span>隐藏开始楼层</span>
              <input v-model.number="manualSummary.hiddenStartFloor" min="0" type="number" />
            </label>
            <label class="field">
              <span>隐藏结束楼层</span>
              <input v-model.number="manualSummary.hiddenEndFloor" :max="messageCount" min="0" type="number" />
            </label>
          </div>
          <p>当前会话共 {{ messageCount }} 楼。隐藏范围填 0 表示不隐藏；隐藏范围必须在总结范围内。</p>
          <div class="manual-summary-actions">
            <button class="summary-submit" type="submit" :disabled="summarizing || !canManualSummarize">生成总结</button>
            <button class="secondary-action" type="button" @click="fillLatestRange">填入未总结楼层</button>
          </div>
        </form>

        <section class="settings-block memory-strategy-block">
          <header class="section-header">
            <div>
              <span>Automation</span>
              <strong>记忆策略</strong>
            </div>
          </header>
          <div class="memory-toggle-grid">
            <label class="switch-card">
              <input v-model="draft.memory.autoSummarize" type="checkbox" @change="saveDraft" />
              <span class="switch-track"></span>
              <div>
                <strong>自动总结</strong>
              </div>
            </label>
            <label class="field compact-field">
              <span>每多少楼总结</span>
              <input v-model.number="draft.memory.summarizeEvery" min="10" step="10" type="number" @change="saveDraft" />
            </label>
          </div>
          <div class="memory-toggle-grid">
            <label class="switch-card">
              <input v-model="draft.memory.hideSummarizedMessages" type="checkbox" @change="saveDraft" />
              <span class="switch-track"></span>
              <div>
                <strong>自动隐藏楼层</strong>
              </div>
            </label>
            <label class="switch-card">
              <input v-model="draft.memory.vectorMemoryEnabled" type="checkbox" @change="saveDraft" />
              <span class="switch-track"></span>
              <div>
                <strong>向量化记忆</strong>
              </div>
            </label>
          </div>
          <label class="field model-select-field">
            <span>自动总结模型</span>
            <div class="model-select-shell">
              <img v-if="selectedModelMeta(draft.modelOverrides.summary)" :src="selectedModelMeta(draft.modelOverrides.summary)?.avatar" :alt="selectedModelMeta(draft.modelOverrides.summary)?.vendorName" />
              <span v-if="selectedModelMeta(draft.modelOverrides.summary)" class="model-select-vendor">{{ selectedModelMeta(draft.modelOverrides.summary)?.vendorName }}</span>
              <select v-model="draft.modelOverrides.summary" :class="{ 'with-provider': selectedModelMeta(draft.modelOverrides.summary) }" @change="saveDraft">
                <option value="">跟随全局总结模型</option>
                <optgroup v-for="vendor in groupedModels" :key="vendor.id" :label="vendorSelectLabel(vendor)">
                  <option v-for="model in vendor.models" :key="model.value" :value="model.value">
                    {{ model.label }}
                  </option>
                </optgroup>
              </select>
            </div>
          </label>
        </section>

        <section class="memory-records settings-block">
          <header class="section-header record-header">
            <div>
              <span>Memory space</span>
              <strong>记忆空间</strong>
            </div>
            <em>{{ memories.length }} 条</em>
          </header>
          <div class="merge-actions">
            <button class="secondary-action" type="button" :disabled="summarizing || mergeDisabled" @click="showMergePicker = !showMergePicker">合并大总结</button>
            <button class="secondary-action" type="button" :disabled="summarizing || !hasMergedSummary" @click="showUnmergePicker = !showUnmergePicker">取消合并大总结</button>
          </div>
          <section v-if="showMergePicker" class="merge-picker">
            <label v-for="memory in mergeableMemories" :key="memory.id" class="merge-row switch-card compact-switch">
              <input v-model="selectedMergeIds" :value="memory.id" type="checkbox" />
              <span class="switch-track"></span>
              <span>{{ memory.startFloor }}-{{ memory.endFloor }}楼</span>
            </label>
            <button class="summary-submit" type="button" :disabled="summarizing || selectedMergeIds.length <= 1" @click="mergeMemories">确认合并</button>
          </section>
          <section v-if="showUnmergePicker" class="merge-picker">
            <button v-for="memory in mergedMemories" :key="memory.id" class="merge-row button-row" type="button" @click="unmergeMemories(memory.id)">
              撤回 {{ memory.startFloor }}-{{ memory.endFloor }}楼大总结
            </button>
          </section>
          <article v-for="memory in memories" :key="memory.id" class="memory-card">
            <div class="memory-card-head">
              <div>
                <span>{{ memory.isMergedSummary ? 'Long memory page' : 'Memory page' }}</span>
                <strong>{{ memory.startFloor }}-{{ memory.endFloor }}楼</strong>
              </div>
              <em>{{ memory.isMergedSummary ? '合并大总结' : '片段记忆' }}</em>
            </div>
            <textarea :value="memory.summary" @change="updateMemorySummary(memory, $event)"></textarea>
            <div class="memory-actions">
              <button class="secondary-action" type="button" :disabled="summarizing" @click="confirmResummarize(memory.id)">重新总结</button>
              <button class="danger-action" type="button" @click="confirmDeleteMemory(memory.id)">删除总结</button>
            </div>
          </article>
          <div v-if="!memories.length" class="empty-note memory-empty-note">记忆空间暂时空着。达到楼层或点击手动总结后，新的书页会收进这里。</div>
        </section>
      </section>

      <section v-else-if="activeTab === 'beauty'" class="panel-section beauty-panel">
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Canvas</span>
              <strong>聊天背景</strong>
            </div>
          </header>
          <div class="background-manager">
            <section class="background-tool-panel" aria-label="背景导入与颜色">
              <label class="field background-url-card">
                <div class="background-field-title">
                  <span>背景图 URL</span>
                  <button class="setting-action-button primary-setting-action" type="button" aria-label="添加背景图 URL" @click="addBackgroundImageFromUrl">
                    <Plus :size="16" stroke-width="2.5" aria-hidden="true" />
                  </button>
                </div>
                <input v-model="backgroundImageUrlDraft" placeholder="https://..." @keydown.enter.prevent="addBackgroundImageFromUrl" />
              </label>
              <div class="background-quick-actions">
                <label class="upload-card background-upload-card">
                  <strong>导入本地图片</strong>
                  <input type="file" accept="image/*" multiple @change="readAppearanceFiles" />
                </label>
                <label class="field background-color-card appearance-color-field">
                  <span>背景色</span>
                  <div class="background-color-select">
                    <input v-model="draft.appearance.backgroundColor" type="color" @change="saveDraft" />
                    <span>{{ draft.appearance.backgroundColor }}</span>
                  </div>
                </label>
              </div>
            </section>
            <section class="background-library" aria-label="背景图列表">
              <article
                v-for="(image, index) in backgroundImageOptions"
                :key="`${image}-${index}`"
                class="background-thumb-card"
                :class="{ active: draft.appearance.backgroundImage === image }"
              >
                <button class="background-thumb" type="button" :style="{ backgroundImage: `url(${image})` }" @click="applyBackgroundImage(image)">
                  <span>{{ draft.appearance.backgroundImage === image ? '使用中' : `背景 ${index + 1}` }}</span>
                </button>
                <div class="background-thumb-actions">
                  <button type="button" :disabled="draft.appearance.backgroundImage === image" @click="applyBackgroundImage(image)">应用</button>
                  <button type="button" @click="removeBackgroundImage(image)">删除</button>
                </div>
              </article>
              <div v-if="!backgroundImageOptions.length" class="empty-note compact-empty-note">还没有背景图，添加 URL 或导入本地图片即可保存多个方案。</div>
            </section>
          </div>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Bubble system</span>
              <strong>气泡配色</strong>
            </div>
          </header>
          <section class="bubble-preview" :style="bubblePreviewStyle" aria-label="气泡预览">
            <div class="preview-row character-preview-row">
              <img class="avatar mini" :src="characterDraft.avatar" :alt="characterDraftNickname" />
              <div class="preview-bubble" :style="characterBubblePreviewStyle">角色的聊天会像这样显示。</div>
            </div>
            <div class="preview-row user-preview-row">
              <div class="preview-bubble" :style="userBubblePreviewStyle">用户气泡颜色在这里预览。</div>
            </div>
          </section>
          <div class="color-grid">
            <label class="field color-card">
              <span>我方气泡</span>
              <input v-model="draft.appearance.userBubbleColor" type="color" @change="saveDraft" />
            </label>
            <label class="field color-card">
              <span>我方文字</span>
              <input v-model="draft.appearance.userTextColor" type="color" @change="saveDraft" />
            </label>
            <label class="field color-card">
              <span>对方气泡</span>
              <input v-model="draft.appearance.characterBubbleColor" type="color" @change="saveDraft" />
            </label>
            <label class="field color-card">
              <span>对方文字</span>
              <input v-model="draft.appearance.characterTextColor" type="color" @change="saveDraft" />
            </label>
          </div>
        </section>
        <section class="settings-block display-options-grid">
          <label class="switch-card wide">
            <input v-model="draft.appearance.showReadStatus" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>显示已读未读</strong>
            </div>
          </label>
          <label class="switch-card wide">
            <input v-model="draft.appearance.showMessageTime" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>显示气泡外时间</strong>
            </div>
          </label>
          <label class="switch-card wide">
            <input v-model="draft.appearance.showOnlyFirstAvatarInReply" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>连续角色消息仅首条头像</strong>
            </div>
          </label>
          <label class="switch-card wide">
            <input v-model="draft.appearance.hideVoomNarration" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>隐藏 VOOM 旁白</strong>
            </div>
          </label>
        </section>
      </section>

      <section v-else-if="activeTab === 'profile'" class="panel-section profile-panel">
        <section class="profile-section wide-field" aria-label="角色基础资料">
          <div class="avatar-card">
            <img class="avatar-preview" :src="characterDraft.avatar" :alt="characterDraftNickname" />
            <label class="avatar-upload">
              <input type="file" accept="image/*" @change="readAvatarFile" />
              <span>导入头像</span>
            </label>
          </div>
          <div class="profile-fields">
            <label class="field avatar-url-field">
              <span>头像 URL</span>
              <input v-model="characterDraft.avatar" @change="saveCharacterDraft" />
            </label>

            <section class="identity-row" aria-label="角色名称资料">
              <label class="field compact-field">
                <span>名字</span>
                <input v-model="characterDraft.name" @change="saveCharacterDraft" />
              </label>

              <label class="field compact-field">
                <span>网名</span>
                <input v-model="characterDraft.nickname" @change="saveCharacterDraft" />
              </label>

              <label class="field compact-field note-field">
                <span>备注</span>
                <input v-model="characterDraft.userNote" @change="saveCharacterDraft" />
              </label>
            </section>
          </div>
        </section>

        <label class="field wide-field">
          <span>个性签名</span>
          <input v-model="characterDraft.signature" @change="saveCharacterDraft" />
        </label>

        <label class="field wide-field">
          <span>角色资料</span>
          <textarea v-model="characterDraft.description" rows="7" @change="saveCharacterDraft"></textarea>
        </label>

        <section class="local-book-bind wide-field" aria-labelledby="profile-local-world-book-title">
          <div class="local-book-header">
            <strong id="profile-local-world-book-title">绑定局部世界书</strong>
            <span v-if="localWorldBooks.length">{{ characterDraft.localWorldBookIds.length }}/{{ localWorldBooks.length }}</span>
          </div>
          <div v-if="localWorldBooks.length" class="local-book-list">
            <label v-for="book in localWorldBooks" :key="book.id" class="local-book-row" :class="{ selected: characterDraft.localWorldBookIds.includes(book.id) }">
              <input :checked="characterDraft.localWorldBookIds.includes(book.id)" type="checkbox" @change="toggleLocalWorldBook(book.id, $event)" />
              <span>{{ book.title }}</span>
              <span class="book-check" aria-hidden="true"></span>
            </label>
          </div>
          <p v-else class="local-book-empty">暂无局部世界书</p>
        </section>
      </section>

      <section v-else class="panel-section other-panel">
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Narration</span>
              <strong>旁白模式</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input v-model="draft.narrationModeEnabled" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>开启旁白模式</strong>
              <span>线上聊天回复会加入角色动描等旁白。</span>
            </div>
          </label>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Stickers</span>
              <strong>贴纸读取</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input v-model="draft.stickerVisionEnabled" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>开启 Stickers 识图</strong>
              <span>关闭后角色只能读取 Sticker 的文字描述。</span>
            </div>
          </label>
          <button class="sticker-bind-trigger" type="button" @click="toggleStickerGroupPicker">
            <span>
              <strong>角色绑定 Stickers分组</strong>
              <small>{{ characterStickerBindingSummary }}</small>
            </span>
            <ChevronDown :size="18" aria-hidden="true" />
          </button>
          <section v-if="showStickerGroupPicker" class="sticker-group-popover">
            <label v-for="group in stickerGroupPickerRows" :key="group.id" class="sticker-group-option switch-card compact-switch">
              <input :checked="draft.characterStickerGroupIds.includes(group.id)" type="checkbox" @change="updateCharacterStickerGroup(group.id, $event)" />
              <span class="switch-track"></span>
              <span class="sticker-group-name">{{ group.name }}</span>
            </label>
            <div v-if="!stickerGroupPickerRows.length" class="empty-note">暂无 Stickers 分组。</div>
          </section>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>VOOM</span>
              <strong>动态生成</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input :checked="draft.autoGenerateVoom" type="checkbox" @change="updateAutoGenerateVoom" />
            <span class="switch-track"></span>
            <div>
              <strong>允许 AI 回复时自动生成 VOOM</strong>
            </div>
          </label>
          <label class="field frequency-field">
            <span>该角色 VOOM 频率</span>
            <select :value="draft.voomFrequency" @change="updateVoomFrequency">
              <option v-for="option in voomFrequencyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Local time</span>
              <strong>时间感知</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input v-model="draft.timeAwareness.enabled" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>开启时间感知</strong>
              <span>覆盖聊天回复、VOOM 生成与评论区回复。</span>
            </div>
          </label>
          <section v-if="draft.timeAwareness.enabled" class="time-awareness-note">
            每次生成内容时都会重新读取本机实时信息，适合判断作息、日期和日常节奏。
          </section>
        </section>
      </section>

      <AvatarCropperModal v-model="showAvatarEditor" :src="avatarEditorSource" @confirm="applyEditedAvatar" />
  </section>
</template>

<script setup lang="ts">
import { ChevronDown, Plus } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import AvatarCropperModal from '@/components/image/AvatarCropperModal.vue';
import { useAppStore } from '@/stores/appStore';
import type { CharacterProfile, ConversationMemoryRecord, ConversationSettings } from '@/types/domain';
import { readImageFileFromInput } from '@/utils/imageFile';
import { estimateTokenCount, getConversationFloorCount, normalizeConversationSettings } from '@/utils/memory';
import { normalizeVoomFrequency, voomFrequencyOptions } from '@/utils/voom';

const props = defineProps<{
  conversationId: string;
  character: CharacterProfile;
  activeTab: PanelTab;
}>();

const store = useAppStore();
export type PanelTab = 'memory' | 'beauty' | 'profile' | 'other';

const activeTab = computed(() => props.activeTab);
const summarizing = ref(false);
const showManualSummary = ref(false);
const showMergePicker = ref(false);
const showUnmergePicker = ref(false);
const showStickerGroupPicker = ref(false);
const showAvatarEditor = ref(false);
const avatarEditorSource = ref('');
const backgroundImageUrlDraft = ref('');
const selectedMergeIds = ref<string[]>([]);
const draft = reactive<ConversationSettings>(normalizeConversationSettings(null, props.conversationId));
const characterDraft = reactive<CharacterProfile>({ ...props.character, localWorldBookIds: [...props.character.localWorldBookIds] });
const manualSummary = reactive({
  startFloor: 1,
  endFloor: 1,
  hiddenStartFloor: 0,
  hiddenEndFloor: 0
});

const memories = computed(() => store.memoriesForConversation(props.conversationId));
const totalMemoryTokens = computed(() => store.nextReplyTokenCountForConversation(props.conversationId));
const messageCount = computed(() => getConversationFloorCount(store.messagesForConversation(props.conversationId)));
const hiddenFloorStatus = computed(() => {
  const hiddenRanges = memories.value
    .filter((memory) => memory.hiddenStartFloor > 0 && memory.hiddenEndFloor >= memory.hiddenStartFloor)
    .map((memory) => `${memory.hiddenStartFloor}-${memory.hiddenEndFloor}楼`);
  if (!hiddenRanges.length) return `当前对话共 ${messageCount.value} 楼，暂无隐藏楼层。`;
  return `当前对话共 ${messageCount.value} 楼，已隐藏 ${hiddenRanges.join('、')}。`;
});
const hasMergedSummary = computed(() => memories.value.some((memory) => memory.isMergedSummary));
const mergeDisabled = computed(() => hasMergedSummary.value || memories.value.filter((memory) => !memory.isMergedSummary).length <= 1);
const mergeableMemories = computed(() => memories.value.filter((memory) => !memory.isMergedSummary));
const mergedMemories = computed(() => memories.value.filter((memory) => memory.isMergedSummary));
const characterDraftNickname = computed(() => characterDraft.nickname || 'new.friend');
const backgroundImageOptions = computed(() => draft.appearance.backgroundImages);
const localWorldBooks = computed(() => store.worldBooks.filter((book) => book.scope === 'local'));
const bubblePreviewStyle = computed(() => ({
  backgroundColor: draft.appearance.backgroundColor,
  backgroundImage: draft.appearance.backgroundImage ? `url(${draft.appearance.backgroundImage})` : 'none'
}));
const userBubblePreviewStyle = computed(() => ({
  background: draft.appearance.userBubbleColor,
  color: draft.appearance.userTextColor
}));
const characterBubblePreviewStyle = computed(() => ({
  background: draft.appearance.characterBubbleColor,
  color: draft.appearance.characterTextColor
}));
const groupedModels = computed(() => {
  return (store.settings?.apiVendors ?? [])
    .map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      avatar: vendor.avatar,
      models: vendor.models
        .filter((model) => model.selected)
        .map((model) => ({
          value: `${vendor.id}::${model.id}`,
          label: model.nickname || model.id
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
    }))
    .filter((vendor) => vendor.models.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
});
const stickerGroupPickerRows = computed(() => store.sortedStickerGroups.map((group) => ({
  id: group.id,
  name: group.name
})));
const characterStickerBindingSummary = computed(() => {
  const groupIds = new Set(draft.characterStickerGroupIds);
  if (!groupIds.size) return '未选择';
  const names = stickerGroupPickerRows.value
    .filter((group) => groupIds.has(group.id))
    .map((group) => group.name);
  if (!names.length) return '未选择';
  return names.join('、');
});
const canManualSummarize = computed(() => {
  const start = Number(manualSummary.startFloor);
  const end = Number(manualSummary.endFloor);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start || end > messageCount.value) return false;
  const hiddenStart = Number(manualSummary.hiddenStartFloor);
  const hiddenEnd = Number(manualSummary.hiddenEndFloor);
  if (!hiddenStart && !hiddenEnd) return true;
  return hiddenStart >= start && hiddenEnd >= hiddenStart && hiddenEnd <= end;
});

watch(
  () => [props.conversationId, store.conversationSettings.length] as const,
  () => {
    Object.assign(draft, normalizeConversationSettings(store.settingsForConversation(props.conversationId), props.conversationId));
    showStickerGroupPicker.value = false;
    fillLatestRange();
  },
  { immediate: true }
);

watch(
  () => props.character,
  (nextCharacter) => Object.assign(characterDraft, { ...nextCharacter, localWorldBookIds: [...nextCharacter.localWorldBookIds] }),
  { immediate: true, deep: true }
);

function saveDraft() {
  void store.saveConversationSettings({ ...draft, conversationId: props.conversationId });
}

function updateAutoGenerateVoom(event: Event) {
  draft.autoGenerateVoom = (event.target as HTMLInputElement).checked;
  saveDraft();
}

function updateVoomFrequency(event: Event) {
  draft.voomFrequency = normalizeVoomFrequency((event.target as HTMLSelectElement).value, draft.voomFrequency);
  saveDraft();
}

function normalizeSelectedStickerGroupIds(groupIds: string[]) {
  const selectedIds = new Set(groupIds.map((groupId) => groupId.trim()).filter(Boolean));
  return store.sortedStickerGroups.map((group) => group.id).filter((groupId) => selectedIds.has(groupId));
}

function toggleStickerGroupPicker() {
  showStickerGroupPicker.value = !showStickerGroupPicker.value;
}

async function updateCharacterStickerGroup(groupId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const groupIds = new Set(draft.characterStickerGroupIds);
  if (checked) groupIds.add(groupId);
  else groupIds.delete(groupId);
  const nextSettings = normalizeConversationSettings({
    ...draft,
    conversationId: props.conversationId,
    characterStickerGroupIds: normalizeSelectedStickerGroupIds([...groupIds])
  }, props.conversationId);
  Object.assign(draft, nextSettings);
  await store.saveConversationSettings(nextSettings);
  Object.assign(draft, normalizeConversationSettings(store.settingsForConversation(props.conversationId), props.conversationId));
}

async function manualSummarize() {
  if (!canManualSummarize.value) return;
  summarizing.value = true;
  try {
    await store.summarizeConversationWindow(props.conversationId, {
      forceStartFloor: Math.max(1, Math.floor(Number(manualSummary.startFloor))),
      forceEndFloor: Math.max(1, Math.floor(Number(manualSummary.endFloor))),
      hiddenStartFloor: Math.max(0, Math.floor(Number(manualSummary.hiddenStartFloor) || 0)),
      hiddenEndFloor: Math.max(0, Math.floor(Number(manualSummary.hiddenEndFloor) || 0))
    });
    fillLatestRange();
  } finally {
    summarizing.value = false;
  }
}

function fillLatestRange() {
  const lastEndFloor = memories.value.reduce((max, memory) => Math.max(max, memory.endFloor), 0);
  const startFloor = Math.min(Math.max(1, lastEndFloor + 1), Math.max(1, messageCount.value));
  const endFloor = Math.max(startFloor, messageCount.value);
  manualSummary.startFloor = startFloor;
  manualSummary.endFloor = endFloor;
  const length = endFloor - startFloor + 1;
  const keepTail = Math.min(10, Math.max(1, Math.ceil(length * 0.1)));
  const hiddenEndFloor = Math.max(startFloor - 1, endFloor - keepTail);
  manualSummary.hiddenStartFloor = hiddenEndFloor >= startFloor ? startFloor : 0;
  manualSummary.hiddenEndFloor = hiddenEndFloor >= startFloor ? hiddenEndFloor : 0;
}

async function resummarize(memoryId: string) {
  summarizing.value = true;
  try {
    await store.resummarizeMemory(memoryId);
  } finally {
    summarizing.value = false;
  }
}

async function confirmResummarize(memoryId: string) {
  if (!window.confirm('确认重新调用 API 总结这条记录吗？')) return;
  await resummarize(memoryId);
}

async function mergeMemories() {
  if (selectedMergeIds.value.length <= 1) return;
  summarizing.value = true;
  try {
    await store.mergeConversationMemories(props.conversationId, selectedMergeIds.value);
    selectedMergeIds.value = [];
    showMergePicker.value = false;
  } finally {
    summarizing.value = false;
  }
}

async function unmergeMemories(memoryId: string) {
  summarizing.value = true;
  try {
    await store.unmergeConversationMemories(props.conversationId, memoryId);
    showUnmergePicker.value = false;
  } finally {
    summarizing.value = false;
  }
}

async function confirmDeleteMemory(memoryId: string) {
  if (!window.confirm('确认删除这条总结吗？')) return;
  await store.deleteMemoryRecord(memoryId);
}

function updateMemorySummary(memory: ConversationMemoryRecord, event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  void store.updateMemoryRecord({
    ...memory,
    summary: textarea.value,
    tokenCount: estimateTokenCount(textarea.value)
  });
}

function toggleHidden(memory: ConversationMemoryRecord, hidden: boolean) {
  void store.toggleMemoryHiddenRange(memory.id, hidden);
}

function hiddenRangeLabel(memory: ConversationMemoryRecord) {
  if (!hasHiddenRange(memory)) return '未隐藏';
  return `${memory.hiddenStartFloor}-${memory.hiddenEndFloor}楼`;
}

function hasHiddenRange(memory: ConversationMemoryRecord) {
  return memory.hiddenStartFloor > 0 && memory.hiddenEndFloor >= memory.hiddenStartFloor;
}

function vendorSelectLabel(vendor: { avatar: string; name: string }) {
  return `${vendor.avatar ? '◉ ' : ''}${vendor.name}`;
}

function selectedModelMeta(value: string) {
  if (!value.trim()) return null;
  const [vendorId, ...modelParts] = value.split('::');
  if (!modelParts.length) return null;
  const vendor = groupedModels.value.find((item) => item.id === vendorId);
  if (!vendor) return null;
  const modelValue = `${vendorId}::${modelParts.join('::')}`;
  const model = vendor.models.find((item) => item.value === modelValue);
  if (!model) return null;
  return {
    avatar: vendor.avatar,
    vendorName: vendor.name,
    modelLabel: model.label
  };
}

function saveCharacterDraft() {
  void store.saveCharacter({ ...characterDraft, localWorldBookIds: [...characterDraft.localWorldBookIds] });
}

function toggleLocalWorldBook(bookId: string, event: Event) {
  const checked = event.target instanceof HTMLInputElement ? event.target.checked : false;
  const ids = new Set(characterDraft.localWorldBookIds);
  if (checked) ids.add(bookId);
  else ids.delete(bookId);
  characterDraft.localWorldBookIds = localWorldBooks.value.map((book) => book.id).filter((id) => ids.has(id));
  saveCharacterDraft();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function syncBackgroundImages(images: string[], activeImage = draft.appearance.backgroundImage) {
  const normalizedImages = [...new Set(images.map((image) => image.trim()).filter(Boolean))];
  draft.appearance.backgroundImages = normalizedImages;
  draft.appearance.backgroundImage = normalizedImages.includes(activeImage) ? activeImage : normalizedImages[0] ?? '';
  saveDraft();
}

function addBackgroundImages(images: string[]) {
  const nextImages = [...draft.appearance.backgroundImages, ...images];
  const activeImage = images[images.length - 1]?.trim() || draft.appearance.backgroundImage;
  syncBackgroundImages(nextImages, activeImage);
}

function addBackgroundImageFromUrl() {
  const image = backgroundImageUrlDraft.value.trim();
  if (!image) return;
  addBackgroundImages([image]);
  backgroundImageUrlDraft.value = '';
}

async function readAppearanceFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (!files.length) return;
  const images = (await Promise.all(files.map((file) => readFileAsDataUrl(file)))).filter(Boolean);
  if (images.length) addBackgroundImages(images);
  input.value = '';
}

function applyBackgroundImage(image: string) {
  if (!image.trim()) return;
  syncBackgroundImages(draft.appearance.backgroundImages, image.trim());
}

function removeBackgroundImage(image: string) {
  const nextImages = draft.appearance.backgroundImages.filter((item) => item !== image);
  syncBackgroundImages(nextImages, draft.appearance.backgroundImage === image ? nextImages[0] ?? '' : draft.appearance.backgroundImage);
}

async function readAvatarFile(event: Event) {
  const image = await readImageFileFromInput(event);
  if (!image) return;
  avatarEditorSource.value = image;
  showAvatarEditor.value = true;
}

function applyEditedAvatar(value: string) {
  characterDraft.avatar = value;
  saveCharacterDraft();
}
</script>

<style scoped>
.control-panel {
  position: relative;
  display: grid;
  gap: 14px;
}

.panel-section {
  display: grid;
  gap: 14px;
}

.memory-hero,
.profile-preview,
.upload-card,
.empty-note {
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.memory-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.memory-hero div {
  display: grid;
  gap: 4px;
}

.memory-hero span,
.memory-card p,
.empty-note,
.upload-card span,
.profile-preview span,
.switch-card span:not(.switch-track) {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.memory-hero strong {
  font-size: 22px;
}

.memory-hero p {
  margin: 0;
  color: #716d72;
  font-size: 12px;
  line-height: 1.5;
}

.manual-summary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #181717, #4a443f);
  color: #fffaf4;
  font-size: 13px;
  font-weight: 900;
  box-shadow: 0 12px 28px rgba(34, 27, 23, 0.22);
}

.manual-summary-button:disabled {
  opacity: 0.55;
}

.manual-summary-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(255, 235, 203, 0.9), transparent 38%),
    rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 46px rgba(73, 57, 43, 0.12);
}

.range-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.manual-summary-card p {
  margin: 0;
  color: #7a7473;
  font-size: 12px;
  line-height: 1.5;
}

.manual-summary-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.summary-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  background: #22201e;
  color: #ffffff;
  font-weight: 900;
}

.summary-submit:disabled {
  background: #c9c2bb;
  color: #fffaf4;
}

.memory-toggle-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.compact-field {
  justify-content: center;
  min-height: 76px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.compact-field input {
  min-height: 32px;
  border-radius: 12px;
}

.switch-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.switch-card.wide {
  grid-template-columns: auto minmax(0, 1fr);
}

.switch-card.compact-switch {
  min-height: 34px;
  padding: 8px 10px;
  border-radius: 12px;
}

.compact-switch .switch-track {
  width: 38px;
  height: 22px;
}

.compact-switch .switch-track::after {
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
}

.compact-switch input:checked + .switch-track::after {
  transform: translateX(16px);
}

.switch-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch-track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: #d8d2cf;
  transition: background 0.18s ease;
}

.switch-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 3px 8px rgba(42, 35, 31, 0.2);
  transition: transform 0.18s ease;
}

.switch-card input:checked + .switch-track {
  background: #24211f;
}

.switch-card input:checked + .switch-track::after {
  transform: translateX(18px);
}

.switch-card div {
  display: grid;
  gap: 3px;
}

.switch-card strong {
  font-size: 13px;
}

.sticker-bind-trigger {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  color: #24201e;
  text-align: left;
}

.sticker-bind-trigger span {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.sticker-bind-trigger strong,
.sticker-bind-trigger small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticker-bind-trigger strong {
  font-size: 13px;
  font-weight: 900;
}

.sticker-bind-trigger small {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.sticker-bind-trigger svg {
  flex: 0 0 auto;
  color: #4f4844;
}

.sticker-group-popover {
  display: grid;
  gap: 4px;
  padding: 6px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: inset 0 0 0 1px rgba(36, 32, 29, 0.06);
}

.sticker-group-option {
  grid-template-columns: auto minmax(0, 1fr);
  color: #28231f;
  font-weight: 800;
}

.sticker-group-option:active {
  background: rgba(36, 32, 29, 0.06);
}

.sticker-group-name {
  min-width: 0;
  overflow: hidden;
  color: #28231f;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-awareness-note {
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}

.model-picker-field {
  display: grid;
  gap: 9px;
}

.model-picker-field > span {
  color: #686b70;
  font-size: 12px;
  font-weight: 800;
}

.model-select-field select {
  width: 100%;
  min-height: 42px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.76);
  color: #24201e;
  font-weight: 800;
}

.model-select-shell {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 5px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
}

.model-select-shell img {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--soft);
}

.model-select-vendor {
  max-width: 86px;
  overflow: hidden;
  color: #5f5a56;
  font-size: 12px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-select-shell select:not(.with-provider) {
  grid-column: 1 / -1;
}

.model-default,
.model-choice {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid rgba(36, 32, 29, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.68);
  color: #34302d;
  font-size: 12px;
  font-weight: 800;
}

.model-default.active,
.model-choice.active {
  border-color: rgba(28, 26, 24, 0.82);
  background: #1e1c1a;
  color: #ffffff;
}

.provider-model-list {
  display: grid;
  gap: 10px;
}

.provider-model-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.68);
}

.provider-model-card header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.provider-model-card img {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--soft);
}

.provider-model-card strong {
  font-size: 13px;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.appearance-tools-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.appearance-tool-card {
  min-width: 0;
  min-height: 82px;
  justify-content: start;
  padding: 10px;
}

.appearance-tool-card input {
  min-width: 0;
}

.appearance-upload-card {
  position: relative;
  cursor: pointer;
}

.appearance-upload-card input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.appearance-color-field input[type='color'] {
  width: 100%;
  min-height: 32px;
  padding: 3px;
}

.profile-avatar-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

.profile-avatar-grid .field,
.profile-avatar-grid .upload-card {
  min-width: 0;
}

.profile-avatar-grid .upload-card {
  padding: 10px;
}

.profile-avatar-grid input {
  min-width: 0;
}

.memory-records {
  display: grid;
  gap: 10px;
}

.memory-records > header,
.memory-card-head,
.memory-actions,
.profile-preview {
  display: flex;
  align-items: center;
}

.memory-records > header,
.memory-card-head {
  justify-content: space-between;
  gap: 10px;
}

.memory-records > header span,
.memory-card-head span {
  color: var(--muted);
  font-size: 12px;
}

.merge-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.merge-picker {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.68);
}

.merge-row {
  grid-template-columns: auto minmax(0, 1fr);
  background: rgba(244, 242, 242, 0.82);
  color: #302c29;
  font-size: 12px;
  font-weight: 800;
}

.merge-row span:not(.switch-track) {
  color: #302c29;
}

.button-row {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 10px;
}

.memory-card {
  display: grid;
  gap: 9px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.8);
}

.memory-card p {
  margin: 0;
}

.memory-card textarea {
  min-height: 96px;
  padding: 10px;
  border: 0;
  border-radius: 12px;
  outline: 0;
  background: #f4f2f2;
  resize: vertical;
}

.memory-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  flex-wrap: wrap;
  gap: 8px;
}

.danger-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  background: rgba(239, 68, 90, 0.12);
  color: var(--danger);
  font-weight: 800;
}

.upload-card {
  display: grid;
  gap: 5px;
  padding: 12px;
}

.upload-card input {
  min-height: 34px;
}

.profile-preview {
  gap: 10px;
  padding: 12px;
}

.profile-preview div {
  display: grid;
  gap: 3px;
}

.empty-note {
  padding: 12px;
}

.control-panel {
  gap: 16px;
  color: #171717;
}

.panel-section {
  gap: 12px;
}

.settings-block {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(19, 24, 22, 0.06);
  border-radius: 20px;
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 248, 0.9)),
    radial-gradient(circle at top right, rgba(6, 199, 85, 0.09), transparent 34%);
  box-shadow: 0 14px 34px rgba(16, 24, 20, 0.07);
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-header div {
  display: grid;
  gap: 2px;
}

.section-header span {
  color: #8a8f94;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-header strong {
  color: #161616;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0;
}

.compact-header strong {
  font-size: 14px;
}

.memory-hero,
.profile-preview {
  padding: 18px;
  border: 1px solid rgba(19, 24, 22, 0.05);
  border-radius: 24px;
  background:
    radial-gradient(circle at 92% 4%, rgba(6, 199, 85, 0.16), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 248, 0.92));
  box-shadow: 0 18px 42px rgba(18, 25, 22, 0.08);
}

.memory-hero {
  align-items: flex-start;
  min-height: 118px;
}

.memory-hero span,
.profile-preview span {
  color: #8a8f94;
  font-size: 12px;
  font-weight: 700;
}

.memory-hero strong {
  color: #0f1111;
  font-size: 28px;
  line-height: 1;
  letter-spacing: 0;
}

.memory-hero p {
  max-width: 210px;
  color: #74797d;
  font-size: 12px;
}

.manual-summary-button,
.summary-submit {
  min-height: 40px;
  border-radius: 14px;
  background: #171717;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(17, 17, 17, 0.18);
}

.manual-summary-button {
  flex: 0 0 auto;
  padding: 0 16px;
}

.manual-summary-button:active,
.summary-submit:active {
  transform: translateY(1px);
}

.manual-summary-card {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(251, 248, 245, 0.92)),
    radial-gradient(circle at top right, rgba(240, 168, 123, 0.16), transparent 34%);
}

.manual-summary-card p {
  color: #797d82;
}

.memory-toggle-grid,
.display-options-grid {
  gap: 9px;
}

.switch-card,
.compact-field,
.sticker-bind-trigger,
.field input,
.field textarea,
.field select,
.upload-card,
.time-awareness-note,
.empty-note,
.memory-card,
.merge-picker {
  border: 1px solid rgba(20, 24, 22, 0.05);
  border-radius: 16px;
  background: #f6f7f7;
  box-shadow: none;
}

.switch-card {
  min-height: 58px;
  padding: 12px;
}

.switch-card strong,
.sticker-bind-trigger strong {
  color: #171717;
  font-size: 14px;
  font-weight: 900;
}

.switch-card span:not(.switch-track),
.sticker-bind-trigger small,
.time-awareness-note,
.empty-note {
  color: #85898e;
  font-size: 12px;
}

.switch-track {
  width: 46px;
  height: 28px;
  background: #dedad7;
}

.switch-track::after {
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
}

.switch-card input:checked + .switch-track {
  background: #171717;
}

.switch-card input:checked + .switch-track::after {
  transform: translateX(18px);
}

.compact-switch .switch-track {
  width: 38px;
  height: 22px;
}

.compact-switch .switch-track::after {
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
}

.compact-switch input:checked + .switch-track::after {
  transform: translateX(16px);
}

.compact-field {
  min-height: 76px;
  justify-content: center;
}

.field > span {
  color: #767b81;
  font-size: 12px;
  font-weight: 800;
}

.field input,
.field textarea,
.field select {
  min-height: 42px;
  padding: 10px 12px;
  color: #171717;
  font-weight: 700;
}

.field textarea {
  min-height: 112px;
  line-height: 1.55;
}

.model-select-shell {
  min-height: 48px;
  border: 1px solid rgba(20, 24, 22, 0.05);
  background: #f6f7f7;
}

.model-select-field select {
  background: transparent;
}

.record-header em {
  align-self: center;
  color: #898e93;
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
}

.merge-actions,
.manual-summary-actions,
.memory-actions {
  gap: 8px;
}

.secondary-action,
.danger-action {
  min-height: 40px;
  border-radius: 14px;
  font-weight: 900;
}

.secondary-action {
  background: #eef0f1;
  color: #171717;
}

.secondary-action:disabled,
.summary-submit:disabled {
  background: #ece9e7;
  color: #aba7a4;
  box-shadow: none;
}

.danger-action {
  background: rgba(239, 68, 90, 0.11);
}

.memory-card {
  gap: 10px;
  padding: 12px;
}

.memory-card textarea {
  min-height: 104px;
  border: 1px solid rgba(20, 24, 22, 0.05);
  background: #ffffff;
}

.appearance-tools-grid,
.color-grid,
.profile-avatar-grid {
  gap: 9px;
}

.appearance-tool-card,
.color-card,
.profile-avatar-grid .field,
.profile-avatar-grid .upload-card {
  min-height: 88px;
}

.appearance-tool-card,
.color-card {
  padding: 12px;
}

.color-card input[type='color'],
.appearance-color-field input[type='color'] {
  min-height: 38px;
  padding: 4px;
  border-radius: 12px;
  background: #ffffff;
}

.upload-card {
  position: relative;
  align-content: center;
  gap: 4px;
  padding: 12px;
  cursor: pointer;
}

.upload-card strong {
  color: #171717;
  font-size: 14px;
  font-weight: 900;
}

.upload-card input[type='file'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  opacity: 0;
  cursor: pointer;
}

.profile-preview {
  gap: 14px;
}

.profile-preview .avatar {
  width: 60px;
  height: 60px;
  border: 3px solid #ffffff;
  box-shadow: 0 10px 24px rgba(18, 25, 22, 0.12);
}

.profile-preview strong {
  color: #171717;
  font-size: 17px;
  font-weight: 900;
}

.sticker-bind-trigger {
  min-height: 56px;
  padding: 12px;
}

.sticker-group-popover {
  gap: 7px;
  padding: 8px;
  border: 1px solid rgba(20, 24, 22, 0.05);
  background: #ffffff;
}

.time-awareness-note {
  padding: 12px;
  line-height: 1.55;
}

.control-panel button,
.setting-action-button,
.secondary-action,
.danger-action,
.summary-submit,
.manual-summary-button,
.sticker-bind-trigger,
.background-thumb-actions button {
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, opacity 0.16s ease;
}

.control-panel button:active,
.setting-action-button:active,
.secondary-action:active,
.danger-action:active,
.summary-submit:active,
.manual-summary-button:active,
.sticker-bind-trigger:active,
.background-thumb-actions button:active {
  transform: translateY(1px);
}

.manual-summary-button,
.summary-submit,
.setting-action-button,
.secondary-action,
.danger-action,
.background-thumb-actions button {
  min-height: 42px;
  border-radius: 13px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
}

.manual-summary-button,
.summary-submit,
.primary-setting-action {
  background: linear-gradient(145deg, #181818, #31302d);
  color: #ffffff;
  box-shadow: 0 12px 22px rgba(22, 22, 22, 0.16);
}

.secondary-action,
.background-thumb-actions button:first-child {
  background: #edf1ef;
  color: #171717;
  box-shadow: inset 0 0 0 1px rgba(23, 23, 23, 0.04);
}

.danger-action,
.background-thumb-actions button:last-child {
  background: rgba(239, 68, 90, 0.1);
  color: #d73850;
  box-shadow: inset 0 0 0 1px rgba(239, 68, 90, 0.08);
}

.secondary-action:disabled,
.summary-submit:disabled,
.background-thumb-actions button:disabled {
  transform: none;
  background: #ebe8e5;
  color: #aaa5a0;
  box-shadow: none;
  cursor: default;
}

.memory-records {
  gap: 12px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 249, 0.9)),
    radial-gradient(circle at 12% 0%, rgba(6, 199, 85, 0.09), transparent 32%);
}

.memory-card {
  position: relative;
  gap: 12px;
  padding: 15px 14px 14px 18px;
  border: 1px solid rgba(50, 43, 35, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(90deg, rgba(224, 217, 205, 0.58) 0 8px, transparent 8px),
    linear-gradient(180deg, #fffdf9 0%, #fbfaf6 100%);
  box-shadow: 0 16px 28px rgba(36, 30, 24, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.memory-card::after {
  content: '';
  position: absolute;
  inset: 14px 12px 14px auto;
  width: 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(77, 67, 55, 0.05));
  pointer-events: none;
}

.memory-card-head {
  align-items: flex-start;
}

.memory-card-head div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.memory-card-head span {
  color: #9b8f82;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.memory-card-head strong {
  color: #221f1c;
  font-size: 15px;
  font-weight: 900;
}

.memory-card-head em {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef8f1;
  color: #1f6b3a;
  font-style: normal;
  font-size: 10px;
  font-weight: 900;
}

.memory-card textarea {
  min-height: 178px;
  padding: 14px 14px 14px 16px;
  border: 1px solid rgba(84, 74, 62, 0.08);
  border-radius: 14px;
  background:
    repeating-linear-gradient(180deg, transparent 0 27px, rgba(70, 60, 48, 0.045) 28px),
    rgba(255, 255, 255, 0.72);
  color: #2a2723;
  font-size: 13px;
  line-height: 1.85;
}

.memory-empty-note {
  min-height: 96px;
  display: grid;
  place-items: center;
  text-align: center;
  background:
    linear-gradient(90deg, rgba(224, 217, 205, 0.44) 0 8px, transparent 8px),
    #fffdf9;
  color: #8b847d;
}

.background-manager {
  display: grid;
  gap: 10px;
}

.background-url-card,
.background-upload-card,
.background-color-card {
  min-height: 84px;
  padding: 12px;
  border: 1px solid rgba(20, 24, 22, 0.05);
  border-radius: 16px;
  background: #f6f8f7;
}

.inline-input-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.inline-input-action input {
  min-width: 0;
}

.setting-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  padding: 0 12px;
}

.background-color-card input[type='color'] {
  width: 100%;
  min-height: 42px;
  padding: 5px;
  border-radius: 13px;
  background: #ffffff;
}

.background-library {
  display: grid;
  gap: 10px;
}

.background-thumb-card {
  display: grid;
  gap: 8px;
  padding: 9px;
  border: 1px solid rgba(20, 24, 22, 0.06);
  border-radius: 18px;
  background: #ffffff;
}

.background-thumb-card.active {
  border-color: rgba(6, 199, 85, 0.36);
  box-shadow: 0 12px 24px rgba(6, 199, 85, 0.09);
}

.background-thumb {
  position: relative;
  display: grid;
  align-items: end;
  width: 100%;
  min-height: 118px;
  padding: 10px;
  border-radius: 14px;
  overflow: hidden;
  background-color: #eef1ef;
  background-position: center;
  background-size: cover;
  color: #ffffff;
  text-align: left;
}

.background-thumb::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 28%, rgba(0, 0, 0, 0.35));
}

.background-thumb span {
  position: relative;
  width: fit-content;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.72);
  font-size: 11px;
  font-weight: 900;
}

.background-thumb-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.background-thumb-actions button {
  min-height: 36px;
}

.compact-empty-note {
  min-height: 72px;
  display: grid;
  place-items: center;
  text-align: center;
}

.bubble-preview {
  display: grid;
  gap: 10px;
  min-height: 154px;
  padding: 14px;
  border: 1px solid rgba(20, 24, 22, 0.06);
  border-radius: 18px;
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 999px rgba(255, 255, 255, 0.26);
}

.preview-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.user-preview-row {
  justify-content: flex-end;
}

.preview-bubble {
  max-width: 76%;
  padding: 9px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

.character-preview-row .preview-bubble {
  border-bottom-left-radius: 6px;
}

.user-preview-row .preview-bubble {
  border-bottom-right-radius: 6px;
}

.display-options-grid {
  grid-template-columns: 1fr;
}

.display-options-grid .switch-card {
  min-height: 58px;
}

.wide-field {
  min-width: 0;
}

.profile-section,
.local-book-bind {
  border: 1px solid rgba(17, 17, 17, 0.04);
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 14px 36px rgba(21, 30, 26, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.92);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.profile-section {
  display: grid;
  grid-template-columns: clamp(82px, 25vw, 104px) minmax(0, 1fr);
  gap: clamp(10px, 3vw, 14px);
  align-items: center;
  min-width: 0;
  padding: clamp(12px, 3.5vw, 14px);
  border-radius: 24px;
}

.avatar-card {
  align-self: center;
  display: grid;
  justify-items: center;
  gap: 10px;
  min-width: 0;
}

.avatar-preview {
  width: clamp(70px, 21vw, 88px);
  height: clamp(70px, 21vw, 88px);
  border-radius: clamp(20px, 6vw, 26px);
  background: #eef3f1;
  object-fit: cover;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.05), 0 12px 26px rgba(26, 33, 30, 0.08);
}

.avatar-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  max-width: 100%;
  padding: 0 clamp(10px, 2.8vw, 12px);
  border: 1px solid rgba(6, 199, 85, 0.16);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(232, 249, 239, 0.98), rgba(255, 242, 247, 0.96));
  color: #16643e;
  font-size: 11px;
  font-weight: 850;
  white-space: nowrap;
  box-shadow: 0 10px 20px rgba(31, 120, 74, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  touch-action: manipulation;
}

.avatar-upload input {
  display: none;
}

.profile-fields {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.identity-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(8px, 2.5vw, 10px);
  min-width: 0;
}

.note-field {
  grid-column: 1 / -1;
}

.profile-section .compact-field {
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.profile-section .compact-field input {
  min-height: 44px;
  padding: 11px 12px;
  border-radius: 16px;
}

.profile-panel > .field textarea {
  min-height: 168px;
}

.local-book-bind {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
}

.local-book-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.local-book-header strong {
  color: #30363a;
  font-size: 13px;
}

.local-book-header > span,
.local-book-empty {
  color: #69736f;
  font-size: 11px;
  font-weight: 850;
}

.local-book-list {
  display: grid;
  gap: 10px;
  max-height: calc(58px * 4 + 10px * 3);
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.local-book-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 58px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  color: #151719;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 8px 18px rgba(30, 55, 45, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
  touch-action: manipulation;
}

.local-book-row.selected {
  border-color: rgba(6, 199, 85, 0.34);
  background: #f7fffa;
  color: #146b3f;
  box-shadow: inset 0 0 0 1px rgba(6, 199, 85, 0.12), 0 8px 18px rgba(30, 55, 45, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.local-book-row input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.book-check {
  position: relative;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(21, 23, 25, 0.05);
  box-shadow: inset 0 0 0 1px rgba(21, 23, 25, 0.1);
}

.book-check::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 3px;
  width: 5px;
  height: 9px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  opacity: 0;
  transform: rotate(45deg) scale(0.7);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.local-book-row.selected .book-check {
  background: var(--link-green);
  box-shadow: inset 0 0 0 1px rgba(6, 199, 85, 0.7), 0 6px 14px rgba(6, 199, 85, 0.22);
}

.local-book-row.selected .book-check::after {
  opacity: 1;
  transform: rotate(45deg) scale(1);
}

.local-book-row span:first-of-type {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-book-empty {
  margin: 0;
  line-height: 1.5;
}

@media (max-width: 360px) {
  .memory-toggle-grid,
  .range-grid,
  .color-grid,
  .local-book-list,
  .profile-avatar-stack {
    grid-template-columns: 1fr;
  }

  .appearance-tools-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.control-panel {
  gap: 14px;
  min-width: 0;
  color: #151719;
  font-size: 12px;
}

.control-panel *,
.control-panel *::before,
.control-panel *::after {
  min-width: 0;
}

.panel-section {
  gap: 14px;
  min-width: 0;
}

.settings-block,
.memory-hero,
.profile-preview,
.manual-summary-card,
.memory-records {
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 14px 36px rgba(21, 30, 26, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.92);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.settings-block,
.manual-summary-card,
.memory-records {
  display: grid;
  gap: 14px;
  padding: 14px;
}

.section-header {
  align-items: flex-start;
  gap: 10px;
}

.section-header div {
  gap: 4px;
}

.section-header span,
.memory-card-head span {
  color: #8a8f94;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.2;
  text-transform: uppercase;
}

.section-header strong {
  color: #151719;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.15;
}

.memory-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  min-height: 118px;
  padding: 18px;
  background:
    radial-gradient(circle at 94% 6%, rgba(6, 199, 85, 0.14), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 248, 0.92));
}

.memory-hero div {
  gap: 6px;
}

.memory-hero span,
.profile-preview span,
.upload-card span,
.empty-note,
.switch-card span:not(.switch-track) {
  color: #747b80;
  font-size: 12px;
  line-height: 1.45;
}

.memory-hero span,
.profile-preview span {
  font-weight: 800;
}

.memory-hero strong {
  color: #0f1111;
  font-size: 30px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
}

.memory-hero p {
  max-width: 100%;
  margin: 0;
  color: #747b80;
  font-size: 12px;
  line-height: 1.45;
}

.field,
.profile-avatar-stack {
  display: grid;
  gap: 8px;
}

.field > span {
  max-width: 100%;
  overflow: hidden;
  color: #4c5357;
  font-size: 11px;
  font-weight: 850;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field input,
.field textarea,
.field select,
.model-select-shell,
.sticker-bind-trigger,
.switch-card,
.compact-field,
.upload-card,
.time-awareness-note,
.empty-note,
.merge-picker,
.memory-card,
.background-url-card,
.background-upload-card,
.background-color-card,
.background-thumb-card,
.bubble-preview {
  border: 1px solid rgba(42, 75, 60, 0.08);
  border-radius: 16px;
  background: rgba(250, 252, 250, 0.96);
  box-shadow: 0 8px 18px rgba(30, 55, 45, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.field input,
.field textarea,
.field select {
  width: 100%;
  min-height: 44px;
  padding: 11px 12px;
  color: #151719;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.field textarea {
  min-height: 132px;
  max-width: 100%;
  resize: vertical;
}

.field input::placeholder,
.field textarea::placeholder {
  color: #a3a9ad;
}

.field:focus-within > span {
  color: #17191b;
}

.field:focus-within input,
.field:focus-within textarea,
.field:focus-within select,
.model-select-shell:focus-within {
  box-shadow: inset 0 0 0 1px rgba(6, 199, 85, 0.35), 0 0 0 3px rgba(6, 199, 85, 0.1);
}

.memory-toggle-grid,
.range-grid,
.color-grid,
.manual-summary-actions,
.merge-actions,
.memory-actions,
.background-thumb-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.switch-card,
.compact-field {
  min-height: 66px;
  padding: 12px;
}

.switch-card {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  touch-action: manipulation;
}

.switch-card div {
  gap: 3px;
}

.switch-card strong,
.sticker-bind-trigger strong,
.upload-card strong {
  max-width: 100%;
  overflow: hidden;
  color: #151719;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.switch-track {
  flex: 0 0 auto;
  width: 46px;
  height: 28px;
  background: #171717;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.08);
}

.switch-track::after {
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  box-shadow: 0 3px 8px rgba(42, 35, 31, 0.18);
}

.switch-card input:not(:checked) + .switch-track {
  background: #dedad7;
}

.switch-card input:checked + .switch-track::after {
  transform: translateX(18px);
}

.compact-switch {
  min-height: 42px;
  padding: 9px 10px;
  border-radius: 14px;
}

.compact-switch .switch-track {
  width: 38px;
  height: 22px;
}

.compact-switch .switch-track::after {
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
}

.compact-switch input:checked + .switch-track::after {
  transform: translateX(16px);
}

.compact-field {
  justify-content: center;
}

.compact-field input {
  min-height: 36px;
  padding: 8px 10px;
  border-radius: 13px;
}

.manual-summary-button,
.summary-submit,
.setting-action-button,
.secondary-action,
.danger-action,
.background-thumb-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 42px;
  padding: 0 12px;
  overflow: hidden;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.15;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  touch-action: manipulation;
}

.manual-summary-button,
.summary-submit,
.primary-setting-action {
  background: #171717;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(17, 17, 17, 0.16);
}

.secondary-action,
.background-thumb-actions button:first-child {
  background: #edf1ef;
  color: #171717;
  box-shadow: inset 0 0 0 1px rgba(23, 23, 23, 0.04);
}

.danger-action,
.background-thumb-actions button:last-child {
  background: rgba(239, 68, 90, 0.1);
  color: #d73850;
  box-shadow: inset 0 0 0 1px rgba(239, 68, 90, 0.08);
}

.manual-summary-button:disabled,
.summary-submit:disabled,
.secondary-action:disabled,
.danger-action:disabled,
.background-thumb-actions button:disabled {
  transform: none;
  background: #ebe8e5;
  color: #aaa5a0;
  box-shadow: none;
  cursor: default;
}

.manual-summary-card p,
.time-awareness-note,
.empty-note {
  margin: 0;
  color: #747b80;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.55;
}

.model-select-shell {
  display: grid;
  align-items: center;
  gap: 8px;
  min-height: 50px;
  padding: 6px;
}

.model-select-shell {
  grid-template-columns: auto auto minmax(0, 1fr);
}

.model-select-shell select:not(.with-provider) {
  grid-column: 1 / -1;
}

.model-select-shell img {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  object-fit: cover;
}

.model-select-vendor {
  max-width: 76px;
  overflow: hidden;
  color: #5f6662;
  font-size: 11px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-select-field select,
.frequency-field select {
  min-width: 0;
  overflow: hidden;
  background: transparent;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-header em,
.memory-card-head em {
  flex: 0 0 auto;
  font-style: normal;
  white-space: nowrap;
}

.record-header em {
  color: #747b80;
  font-size: 12px;
  font-weight: 900;
}

.merge-picker {
  display: grid;
  gap: 8px;
  padding: 10px;
}

.memory-card {
  position: relative;
  display: grid;
  gap: 12px;
  padding: 14px;
  background: #fffdf9;
}

.memory-card-head {
  align-items: flex-start;
}

.memory-card-head div {
  display: grid;
  gap: 3px;
}

.memory-card-head strong {
  color: #221f1c;
  font-size: 15px;
  font-weight: 900;
  line-height: 1.2;
}

.memory-card-head em {
  max-width: 44%;
  padding: 4px 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #eef8f1;
  color: #1f6b3a;
  font-size: 10px;
  font-weight: 900;
  text-overflow: ellipsis;
}

.memory-card textarea {
  min-height: 156px;
  padding: 13px;
  border: 1px solid rgba(84, 74, 62, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.84);
  color: #2a2723;
  font-size: 13px;
  line-height: 1.7;
}

.memory-empty-note,
.compact-empty-note {
  display: grid;
  min-height: 92px;
  place-items: center;
  text-align: center;
}

.background-manager,
.background-library {
  display: grid;
  gap: 10px;
}

.background-url-card,
.background-upload-card,
.background-color-card,
.profile-avatar-stack .field,
.profile-avatar-stack .upload-card {
  min-height: 84px;
  padding: 12px;
}

.inline-input-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.setting-action-button {
  min-width: 64px;
}

.background-color-card input[type='color'],
.color-card input[type='color'],
.appearance-color-field input[type='color'] {
  width: 100%;
  min-height: 40px;
  padding: 4px;
  border-radius: 13px;
  background: #ffffff;
}

.background-thumb-card {
  display: grid;
  gap: 8px;
  padding: 9px;
}

.background-thumb-card.active {
  border-color: rgba(6, 199, 85, 0.32);
  background: linear-gradient(135deg, rgba(237, 252, 242, 0.98), rgba(255, 246, 249, 0.96));
  box-shadow: 0 10px 24px rgba(31, 120, 74, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.background-thumb {
  min-height: 118px;
  border-radius: 14px;
}

.background-thumb span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bubble-preview {
  display: grid;
  gap: 10px;
  min-height: 154px;
  padding: 14px;
  background-position: center;
  background-size: cover;
}

.preview-row {
  min-width: 0;
}

.preview-bubble {
  max-width: min(76%, 280px);
  overflow-wrap: anywhere;
}

.profile-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 16px;
}

.profile-preview .avatar {
  width: 62px;
  height: 62px;
  border: 3px solid #ffffff;
  border-radius: 20px;
  object-fit: cover;
  box-shadow: 0 10px 24px rgba(18, 25, 22, 0.12);
}

.profile-preview div {
  display: grid;
  gap: 4px;
}

.profile-preview strong {
  overflow: hidden;
  color: #151719;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-preview span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-card {
  position: relative;
  display: grid;
  align-content: center;
  gap: 5px;
  cursor: pointer;
}

.upload-card input[type='file'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  opacity: 0;
  cursor: pointer;
}

.sticker-bind-trigger {
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 58px;
  padding: 12px;
  overflow: hidden;
  text-align: left;
  white-space: nowrap;
  touch-action: manipulation;
}

.sticker-bind-trigger > span {
  display: grid;
  grid-template-columns: 1fr;
  gap: 3px;
}

.sticker-bind-trigger small,
.sticker-group-name {
  overflow: hidden;
  color: #747b80;
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticker-bind-trigger svg {
  flex: 0 0 auto;
}

.sticker-group-popover {
  display: grid;
  gap: 7px;
  padding: 8px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: inset 0 0 0 1px rgba(20, 24, 22, 0.05);
}

.sticker-group-option,
.merge-row {
  grid-template-columns: auto minmax(0, 1fr);
}

.time-awareness-note {
  padding: 12px;
}

@media (min-width: 520px) {
  .background-library {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 380px) {
  .settings-block,
  .manual-summary-card,
  .memory-records {
    padding: 12px;
    border-radius: 22px;
  }

  .memory-hero {
    padding: 16px;
  }

  .switch-card,
  .compact-field {
    min-height: 62px;
    padding: 10px;
  }

  .switch-card {
    gap: 8px;
  }

  .switch-card strong,
  .sticker-bind-trigger strong,
  .upload-card strong {
    font-size: 13px;
  }

  .manual-summary-button,
  .summary-submit,
  .setting-action-button,
  .secondary-action,
  .danger-action,
  .background-thumb-actions button {
    padding-inline: 10px;
  }
}

@media (max-width: 340px) {
  .memory-hero,
  .inline-input-action,
  .profile-preview {
    grid-template-columns: 1fr;
  }

  .manual-summary-button,
  .setting-action-button {
    width: 100%;
  }

  .memory-toggle-grid,
  .range-grid,
  .color-grid,
  .manual-summary-actions,
  .merge-actions,
  .memory-actions,
  .background-thumb-actions {
    grid-template-columns: 1fr;
  }

  .memory-card-head {
    display: grid;
    grid-template-columns: 1fr;
  }

  .memory-card-head em {
    max-width: 100%;
    width: fit-content;
  }
}

.settings-block,
.memory-hero,
.profile-preview,
.manual-summary-card,
.memory-records,
.switch-card,
.compact-field,
.upload-card,
.time-awareness-note,
.empty-note,
.merge-picker,
.memory-card,
.background-url-card,
.background-upload-card,
.background-color-card,
.background-thumb-card,
.bubble-preview,
.sticker-bind-trigger,
.sticker-group-popover {
  border-color: transparent;
}

.switch-card,
.compact-field,
.upload-card,
.time-awareness-note,
.empty-note,
.merge-picker,
.background-url-card,
.background-upload-card,
.background-color-card,
.background-thumb-card,
.sticker-bind-trigger,
.sticker-group-popover {
  background: rgba(248, 251, 249, 0.9);
  box-shadow: 0 10px 22px rgba(28, 55, 44, 0.035), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.model-select-shell {
  border-color: transparent;
  background: rgba(255, 255, 255, 0.95);
}

.manual-summary-button,
.summary-submit,
.primary-setting-action {
  border: 1px solid rgba(6, 199, 85, 0.18);
  background: linear-gradient(135deg, rgba(224, 249, 233, 0.98), rgba(255, 242, 247, 0.96));
  color: #16643e;
  box-shadow: 0 14px 28px rgba(31, 120, 74, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.secondary-action,
.background-thumb-actions button:first-child {
  border: 0;
  background: #edf8f1;
  color: #1f6b3a;
  box-shadow: inset 0 0 0 1px rgba(6, 199, 85, 0.08);
}

.danger-action,
.background-thumb-actions button:last-child {
  border: 0;
  background: rgba(239, 68, 90, 0.09);
  color: #d73850;
  box-shadow: inset 0 0 0 1px rgba(239, 68, 90, 0.06);
}

.switch-track {
  background: #dceee4;
  box-shadow: inset 0 0 0 1px rgba(31, 107, 58, 0.08);
}

.switch-card input:not(:checked) + .switch-track {
  background: #dfe8e4;
}

.switch-card input:checked + .switch-track {
  background: linear-gradient(135deg, #62d98d, #06c755);
  box-shadow: 0 8px 16px rgba(6, 199, 85, 0.18), inset 0 0 0 1px rgba(6, 199, 85, 0.18);
}

.switch-track::after {
  background: #ffffff;
  box-shadow: 0 3px 8px rgba(31, 107, 58, 0.18);
}

.manual-summary-button:disabled,
.summary-submit:disabled,
.secondary-action:disabled,
.danger-action:disabled,
.background-thumb-actions button:disabled {
  background: rgba(239, 242, 240, 0.86);
  color: #a0aaa5;
  box-shadow: none;
}

.beauty-panel .background-manager {
  gap: 9px;
}

.beauty-panel .background-tool-panel {
  display: grid;
  grid-template-columns: 1fr;
  gap: 9px;
  align-items: stretch;
  min-width: 0;
}

.beauty-panel .background-quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  min-width: 0;
}

.beauty-panel .background-url-card,
.beauty-panel .background-upload-card,
.beauty-panel .background-color-card {
  min-height: 0;
  padding: 10px;
  border-radius: 16px;
  background: rgba(248, 251, 249, 0.92);
  box-shadow: 0 8px 18px rgba(28, 55, 44, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.beauty-panel .background-url-card {
  align-content: stretch;
  gap: 8px;
}

.beauty-panel .background-field-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.beauty-panel .background-field-title > span {
  min-width: 0;
  overflow: hidden;
  color: #626d68;
  font-size: 11px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beauty-panel .background-field-title .setting-action-button {
  flex: 0 0 28px;
  width: 28px;
  min-width: 28px;
  min-height: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #16643e;
  box-shadow: none;
}

.beauty-panel .background-field-title .setting-action-button svg {
  flex: 0 0 auto;
}

.beauty-panel .background-url-card > span,
.beauty-panel .background-color-card > span {
  color: #626d68;
  font-size: 11px;
  font-weight: 900;
}

.beauty-panel .inline-input-action {
  gap: 7px;
}

.beauty-panel .background-url-card > input,
.beauty-panel .inline-input-action input {
  min-height: 42px;
  border-radius: 14px;
  font-weight: 800;
}

.beauty-panel .setting-action-button {
  min-width: 56px;
  min-height: 42px;
  padding-inline: 12px;
  border-radius: 14px;
}

.beauty-panel .background-upload-card {
  align-content: center;
  gap: 2px;
  min-height: 54px;
}

.beauty-panel .background-upload-card strong {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beauty-panel .background-upload-card span {
  color: #78827d;
  font-size: 11px;
  font-weight: 800;
}

.beauty-panel .background-color-card {
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
  align-items: stretch;
  min-height: 54px;
}

.beauty-panel .background-color-select {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 0;
  height: 28px;
  padding: 4px 9px 4px 4px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: inset 0 0 0 1px rgba(42, 75, 60, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.beauty-panel .background-color-select input[type='color'] {
  width: 20px;
  min-width: 20px;
  min-height: 20px;
  height: 20px;
  padding: 3px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  box-shadow: none;
}

.beauty-panel .background-color-select span {
  min-width: 0;
  overflow: hidden;
  color: #626d68;
  font-size: 11px;
  font-weight: 850;
  text-transform: uppercase;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beauty-panel .background-library {
  gap: 8px;
  max-height: min(306px, 42vh);
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.beauty-panel .compact-empty-note {
  min-height: 58px;
  padding: 10px 12px;
  border-radius: 16px;
  color: #74807a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.45;
}

.beauty-panel .background-thumb-card {
  gap: 7px;
  padding: 8px;
  border-radius: 16px;
}

.beauty-panel .background-thumb {
  min-height: 86px;
  border-radius: 13px;
}

.beauty-panel .background-thumb-actions {
  gap: 7px;
}

.beauty-panel .background-thumb-actions button {
  min-height: 34px;
  border-radius: 12px;
}

@media (max-width: 360px) {
  .beauty-panel .background-tool-panel {
    grid-template-columns: 1fr;
  }

  .beauty-panel .background-quick-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
