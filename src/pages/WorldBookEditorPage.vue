<template>
  <section class="screen no-tabs world-book-editor-page">
    <header class="top-bar world-book-editor-topbar">
      <button class="world-book-editor-title-button" type="button" aria-label="返回世界书" @click="goBack">
        <h1 class="top-title">{{ pageTitle }}</h1>
      </button>

      <div v-if="store.ready && isLoaded && !missingBook" class="world-book-editor-actions">
        <button class="book-power-button" :class="{ active: draft.enabled }" type="button" @click="toggleBookEnabled">
          <span>{{ draft.enabled ? 'Enabled' : 'Disabled' }}</span>
        </button>
        <button v-if="selectedBookId" class="book-delete-button" type="button" @click="requestDeleteWorldBook">
          <span>Delete</span>
        </button>
        <button class="world-book-editor-save-button" type="button" aria-label="保存世界书" title="保存世界书" @click="finishEditing">
          <span>Save</span>
        </button>
      </div>
    </header>

    <main class="world-book-editor-main">
      <section v-if="store.ready && isLoaded && !missingBook" class="world-book-editor-panel">
        <section class="editor-sheet world-book-editor-sheet">
          <p v-if="draftError" class="draft-error">{{ draftError }}</p>

          <form class="editor-form" @submit.prevent="finishEditing">
            <section v-if="editorTab === 'cover'" class="editor-pane cover-pane">
              <section class="cover-editor">
                <div class="editor-cover-frame">
                  <img v-if="!isBrokenCoverImage(draftCoverImage)" class="editor-cover" :src="draftCoverImage" alt="世界书封面预览" @error="markBrokenCoverImage(draftCoverImage)" />
                  <span v-else class="editor-cover-fallback">{{ getCoverDescription() || '世界书封面预览' }}</span>
                </div>
                <div class="cover-tools">
                  <div class="cover-source-grid">
                    <div class="field cover-upload-field">
                      <span>本地封面</span>
                      <label class="cover-upload-button">
                        <input type="file" accept="image/*" @change="readCoverImage" />
                        <Upload :size="18" stroke-width="2.3" />
                        <strong>上传本地封面</strong>
                      </label>
                    </div>
                    <label class="field">
                      <span>封面导入 URL</span>
                      <input v-model="draft.coverImage" placeholder="留空显示默认封面" />
                    </label>
                  </div>
                  <p v-if="coverFeedback" class="cover-feedback" :class="coverState === 'error' ? 'error' : 'success'">
                    {{ coverFeedback }}
                  </p>
                </div>
              </section>

              <label class="field">
                <span>Description</span>
                <textarea
                  v-model="draft.coverPrompt"
                  class="prompt-area"
                  placeholder="描述这本世界书封面想呈现的画面、质感或氛围。"
                />
              </label>

              <button class="generate-button cover-bottom-generate" type="button" :disabled="coverState === 'loading'" @click="generateCover">
                {{ coverState === 'loading' ? '正在生成封面' : '调用生图接口生成封面' }}
              </button>
            </section>

            <section v-else class="editor-pane entry-pane">
              <section class="book-meta-grid" aria-label="世界书基础信息">
                <label class="field">
                  <span>书名</span>
                  <input v-model="draft.title" placeholder="例如：春日学园守则" />
                </label>
                <label class="field">
                  <span>作用域</span>
                  <select v-model="draft.scope">
                    <option value="global-online">线上全局世界书</option>
                    <option value="global-offline">线下全局世界书</option>
                    <option value="local">局部世界书</option>
                  </select>
                </label>
              </section>

              <div class="entry-toolbar">
                <div>
                  <span>World entries</span>
                  <strong>世界书内容</strong>
                  <small>{{ draftEnabledEntryCount }} / {{ draft.entries.length }} 条目开启</small>
                </div>
                <button class="add-entry-button" type="button" @click="addLoreEntry">
                  <Plus :size="15" stroke-width="2.5" />
                  <span>新增条目</span>
                </button>
              </div>

              <nav class="entry-pager" aria-label="世界书条目切换">
                <button class="entry-page-button" type="button" :disabled="draft.entries.length <= 1" @click="previousLoreEntry">
                  <ChevronLeftIcon :size="16" stroke-width="2.5" />
                  <span>上一条</span>
                </button>
                <strong>条目 {{ activeEntryIndex + 1 }} / {{ draft.entries.length }}</strong>
                <button class="entry-page-button" type="button" :disabled="draft.entries.length <= 1" @click="nextLoreEntry">
                  <span>下一条</span>
                  <ChevronRightIcon :size="16" stroke-width="2.5" />
                </button>
              </nav>

              <article
                v-if="activeEntry"
                :key="activeEntry.id"
                class="lore-entry-card"
                :class="[{ disabled: !activeEntry.enabled }, `mode-${activeEntry.activation}`]"
              >
                <header class="lore-entry-head">
                  <div class="entry-title-line">
                    <i class="entry-lamp" :class="entryLampClass(activeEntry)"></i>
                    <input v-model="activeEntry.title" class="entry-title-input" :placeholder="`条目 ${activeEntryIndex + 1}`" />
                  </div>
                  <div class="entry-action-row">
                    <button class="entry-switch" :class="{ active: activeEntry.enabled }" type="button" @click="toggleLoreEntry(activeEntryIndex)">
                      <span>{{ activeEntry.enabled ? '开启条目' : '关闭条目' }}</span>
                    </button>
                    <button class="entry-delete-button" type="button" :disabled="draft.entries.length <= 1" aria-label="删除条目" @click="removeLoreEntry(activeEntryIndex)">
                      <span>删除条目</span>
                    </button>
                    <label class="check-field entry-case-field">
                      <input v-model="activeEntry.caseSensitive" type="checkbox" />
                      <span>区分大小写</span>
                    </label>
                  </div>
                </header>

                <section class="entry-mode-tabs" aria-label="条目灯号">
                  <button
                    v-for="mode in activationModes"
                    :key="mode.id"
                    class="entry-mode-button"
                    :class="[{ active: activeEntry.activation === mode.id }, `mode-${mode.id}`]"
                    type="button"
                    @click="setEntryActivation(activeEntry, mode.id)"
                  >
                    <i></i>
                    <span>{{ mode.lamp }}</span>
                    <small>{{ mode.label }}</small>
                  </button>
                </section>

                <div class="entry-field-grid">
                  <label class="field entry-keyword-field">
                    <span>主关键词</span>
                    <input :value="activeEntry.keys.join('、')" placeholder="用逗号、顿号或换行分隔" @input="updateEntryList(activeEntry, 'keys', $event)" />
                  </label>
                  <label class="field entry-keyword-field">
                    <span>辅助关键词</span>
                    <input :value="activeEntry.secondaryKeys.join('、')" placeholder="可留空；填了则需要同时命中" @input="updateEntryList(activeEntry, 'secondaryKeys', $event)" />
                  </label>
                  <label class="field entry-metric-field">
                    <span>插入位置</span>
                    <select v-model="activeEntry.position">
                      <option value="before-chat">对话前</option>
                      <option value="after-chat">对话后</option>
                    </select>
                  </label>
                  <label class="field entry-metric-field">
                    <span>顺序</span>
                    <input v-model.number="activeEntry.order" type="number" min="0" max="9999" inputmode="numeric" />
                  </label>
                  <label class="field entry-metric-field">
                    <span>深度</span>
                    <input v-model.number="activeEntry.depth" type="number" min="0" max="12" inputmode="numeric" />
                  </label>
                  <label class="field entry-metric-field">
                    <span>概率 %</span>
                    <input v-model.number="activeEntry.probability" type="number" min="0" max="100" inputmode="numeric" />
                  </label>
                </div>

                <label class="field entry-content-field">
                  <span>条目内容</span>
                  <textarea v-model="activeEntry.content" placeholder="写入会被注入提示词的世界观、人物关系、地点规则、禁止事项或语气约束。" />
                </label>
              </article>
            </section>
          </form>
        </section>
      </section>

      <section v-else-if="store.ready && missingBook" class="missing-card">
        <p class="eyebrow">Not found</p>
        <h2>找不到这本世界书</h2>
        <p>它可能已经被删除，或当前数据还没有同步到本机。</p>
        <button type="button" @click="goBackToShelf">回到书架</button>
      </section>

      <section v-else class="loading-card">
        <p>正在展开世界书...</p>
      </section>
    </main>

    <nav v-if="store.ready && isLoaded && !missingBook" class="world-book-editor-tabs" aria-label="世界书编辑分区">
      <button class="world-book-editor-tab" :class="{ active: editorTab === 'cover' }" type="button" @click="editorTab = 'cover'">
        <ImageIcon :size="20" stroke-width="2.1" />
        <span>Cover</span>
      </button>
      <button class="world-book-editor-tab" :class="{ active: editorTab === 'entries' }" type="button" @click="editorTab = 'entries'">
        <BookOpen :size="20" stroke-width="2.1" />
        <span>Entries</span>
        <small>{{ draft.entries.length }}</small>
      </button>
    </nav>

    <AppModal v-model="showDeleteConfirm" title="确认删除世界书" :show-header="false" variant="ins">
      <section class="confirm-card world-book-delete-confirm">
        <p class="eyebrow">Delete check</p>
        <h2>确认删除这本世界书？</h2>
        <p>
          <strong>{{ deleteBookTitle }}</strong>
          删除后会从书架移除，绑定到角色的局部引用也会一并清掉。
        </p>
        <div class="confirm-actions">
          <button class="ghost-button" type="button" :disabled="isDeletingWorldBook" @click="cancelDeleteWorldBook">再想想</button>
          <button class="ghost-button danger" type="button" :disabled="isDeletingWorldBook" @click="confirmDeleteWorldBook">
            {{ isDeletingWorldBook ? '删除中' : '确认删除' }}
          </button>
        </div>
      </section>
    </AppModal>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BookOpen, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Image as ImageIcon, Plus, Upload } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import { generateImageByProvider } from '@/services/ai';
import { useAppStore } from '@/stores/appStore';
import type { ImageProviderType, WorldBookEntry, WorldBookEntryActivation, WorldBookLoreEntry } from '@/types/domain';
import { createId } from '@/utils/id';
import { getImagePromptPresetForProvider, getSelectedImageModelOption, normalizeAppSettings } from '@/utils/settings';
import { readImageFileFromInput } from '@/utils/imageFile';
import { createWorldBookLoreEntry, getWorldBookContentSummary, normalizeWorldBookEntry, resolveWorldBookCover } from '@/utils/worldBook';

type CoverState = 'idle' | 'loading' | 'success' | 'error';
type EditorTab = 'cover' | 'entries';

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const selectedBookId = ref<string | null>(null);
const coverState = ref<CoverState>('idle');
const coverFeedback = ref('');
const editorTab = ref<EditorTab>('cover');
const activeEntryIndex = ref(0);
const draftError = ref('');
const showDeleteConfirm = ref(false);
const isDeletingWorldBook = ref(false);
const brokenCoverImages = ref<string[]>([]);
const draft = reactive(createDraft());
const isRestoringDraft = ref(false);
const isLoaded = ref(false);
const missingBook = ref(false);
let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
let hasPendingAutoSave = false;

const activationModes: Array<{ id: WorldBookEntryActivation; lamp: string; label: string }> = [
  { id: 'keyword', lamp: '绿灯', label: '关键词' },
  { id: 'constant', lamp: '蓝灯', label: '常驻' },
  { id: 'priority', lamp: '黄灯', label: '优先' }
];

const isEditingRoute = computed(() => route.name === 'world-book-edit');
const pageTitle = computed(() => isEditingRoute.value ? 'Edit' : 'New');
const routeBookId = computed(() => String(route.params.id ?? '').trim());
const currentSettings = computed(() => normalizeAppSettings(store.settings));
const draftCoverImage = computed(() => resolveWorldBookCover(draft));
const draftEnabledEntryCount = computed(() => draft.entries.filter((entry) => entry.enabled).length);
const activeEntry = computed(() => draft.entries[activeEntryIndex.value] ?? draft.entries[0] ?? null);
const deleteBookTitle = computed(() => draft.title.trim() || '未命名世界书');

onMounted(() => {
  void store.hydrate();
});

onBeforeUnmount(() => {
  void flushAutoSave();
});

function normalizeScopeValue(value: unknown): WorldBookEntry['scope'] {
  const scope = Array.isArray(value) ? value[0] : value;
  return scope === 'global-online' || scope === 'global-offline' || scope === 'local' ? scope : 'local';
}

function createDraft(scope: WorldBookEntry['scope'] = 'local'): WorldBookEntry {
  return normalizeWorldBookEntry({
    id: createId('wb'),
    title: '',
    content: '',
    entries: [createWorldBookLoreEntry({ title: '默认条目', activation: 'constant', order: 100 })],
    scope,
    enabled: true,
    coverImage: '',
    coverPrompt: '',
    coverNegativePrompt: '',
    coverProvider: ''
  });
}

function cloneLoreEntry(entry: WorldBookLoreEntry): WorldBookLoreEntry {
  return {
    ...entry,
    keys: [...entry.keys],
    secondaryKeys: [...entry.secondaryKeys]
  };
}

function cloneWorldBook(entry: WorldBookEntry): WorldBookEntry {
  const normalizedEntry = normalizeWorldBookEntry(entry);
  return {
    ...normalizedEntry,
    entries: normalizedEntry.entries.length
      ? normalizedEntry.entries.map((item) => cloneLoreEntry(item))
      : [createWorldBookLoreEntry({ title: '默认条目', activation: 'constant', order: 100 })]
  };
}

function parseEntryList(value: string) {
  return [...new Set(value.split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean))];
}

function updateEntryList(entry: WorldBookLoreEntry, field: 'keys' | 'secondaryKeys', event: Event) {
  const value = event.target instanceof HTMLInputElement ? event.target.value : '';
  entry[field] = parseEntryList(value);
}

function resetCoverState() {
  coverState.value = 'idle';
  coverFeedback.value = '';
}

function beginDraftRestore() {
  isRestoringDraft.value = true;
  clearAutoSaveTimer();
  hasPendingAutoSave = false;
}

function endDraftRestore() {
  void nextTick(() => {
    isRestoringDraft.value = false;
  });
}

function clearAutoSaveTimer() {
  if (!autoSaveTimer) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = undefined;
}

function loadDraftFromRoute() {
  if (!store.ready) return;
  beginDraftRestore();
  editorTab.value = 'cover';
  activeEntryIndex.value = 0;
  draftError.value = '';
  resetCoverState();

  if (isEditingRoute.value) {
    const entry = store.worldBooks.find((book) => book.id === routeBookId.value);
    if (!entry) {
      selectedBookId.value = null;
      missingBook.value = true;
      isLoaded.value = true;
      endDraftRestore();
      return;
    }
    selectedBookId.value = entry.id;
    missingBook.value = false;
    Object.assign(draft, cloneWorldBook(entry));
  } else {
    selectedBookId.value = null;
    missingBook.value = false;
    Object.assign(draft, createDraft(normalizeScopeValue(route.query.scope)));
  }

  isLoaded.value = true;
  endDraftRestore();
}

function getPreparedEntries() {
  const entries = draft.entries.length ? draft.entries : [createWorldBookLoreEntry({ title: '默认条目', activation: 'constant', order: 100 })];
  return entries.map((entry, index) => createWorldBookLoreEntry({
    ...entry,
    title: entry.title.trim() || `条目 ${index + 1}`
  }));
}

function createPersistedDraft() {
  const title = draft.title.trim() || '未命名世界书';
  const entries = getPreparedEntries();
  const content = entries.map((entry) => entry.content).join('\n\n');
  return normalizeWorldBookEntry({ ...draft, title, content, entries });
}

async function persistDraft() {
  if (isRestoringDraft.value || !isLoaded.value || missingBook.value) return;
  const persistedDraft = createPersistedDraft();
  draftError.value = '';
  selectedBookId.value = persistedDraft.id;
  await store.saveWorldBook(persistedDraft);
}

function scheduleAutoSave() {
  if (!isLoaded.value || missingBook.value || isRestoringDraft.value) return;
  hasPendingAutoSave = true;
  clearAutoSaveTimer();
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = undefined;
    if (!hasPendingAutoSave) return;
    hasPendingAutoSave = false;
    void persistDraft();
  }, 350);
}

async function flushAutoSave(force = false) {
  if (isRestoringDraft.value || !isLoaded.value || missingBook.value) return;
  clearAutoSaveTimer();
  if (!force && !hasPendingAutoSave) return;
  hasPendingAutoSave = false;
  await persistDraft();
}

async function goBack() {
  await flushAutoSave();
  goBackToShelf();
}

function goBackToShelf() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  void router.push({ name: 'world-book' });
}

async function finishEditing() {
  await flushAutoSave(true);
  goBackToShelf();
}

async function requestDeleteWorldBook() {
  await flushAutoSave(true);
  const targetId = selectedBookId.value || draft.id;
  if (!targetId) return;
  showDeleteConfirm.value = true;
}

function cancelDeleteWorldBook() {
  if (isDeletingWorldBook.value) return;
  showDeleteConfirm.value = false;
}

async function confirmDeleteWorldBook() {
  const targetId = selectedBookId.value || draft.id;
  if (!targetId || isDeletingWorldBook.value) return;
  isDeletingWorldBook.value = true;
  try {
    await store.deleteWorldBook(targetId);
    showDeleteConfirm.value = false;
    clearAutoSaveTimer();
    hasPendingAutoSave = false;
    isLoaded.value = false;
    void router.replace({ name: 'world-book' });
  } finally {
    isDeletingWorldBook.value = false;
  }
}

function entryLampClass(entry: WorldBookLoreEntry) {
  if (!entry.enabled) return 'lamp-off';
  return {
    keyword: 'lamp-green',
    constant: 'lamp-blue',
    priority: 'lamp-gold'
  }[entry.activation];
}

function toggleBookEnabled() {
  draft.enabled = !draft.enabled;
  draftError.value = '';
}

function toggleLoreEntry(index: number) {
  const entry = draft.entries[index];
  if (!entry) return;
  entry.enabled = !entry.enabled;
  draftError.value = '';
}

function clampActiveEntryIndex() {
  activeEntryIndex.value = Math.min(Math.max(activeEntryIndex.value, 0), Math.max(draft.entries.length - 1, 0));
}

function previousLoreEntry() {
  if (draft.entries.length <= 1) return;
  activeEntryIndex.value = (activeEntryIndex.value - 1 + draft.entries.length) % draft.entries.length;
}

function nextLoreEntry() {
  if (draft.entries.length <= 1) return;
  activeEntryIndex.value = (activeEntryIndex.value + 1) % draft.entries.length;
}

function setEntryActivation(entry: WorldBookLoreEntry, activation: WorldBookEntryActivation) {
  entry.activation = activation;
  draftError.value = '';
}

function addLoreEntry() {
  draft.entries.push(createWorldBookLoreEntry({
    title: `条目 ${draft.entries.length + 1}`,
    activation: 'keyword',
    order: 100 + draft.entries.length * 10
  }));
  activeEntryIndex.value = draft.entries.length - 1;
  editorTab.value = 'entries';
  draftError.value = '';
}

function removeLoreEntry(index: number) {
  if (draft.entries.length <= 1) return;
  draft.entries.splice(index, 1);
  clampActiveEntryIndex();
  draftError.value = '';
}

function getCoverDescription() {
  const title = draft.title.trim() || 'private world book';
  const contentHint = getWorldBookContentSummary(draft).slice(0, 90);
  return draft.coverPrompt.trim() || [title, contentHint].filter(Boolean).join(', ');
}

function buildCoverPrompt(provider: ImageProviderType) {
  const preset = getImagePromptPresetForProvider(currentSettings.value, provider);
  return [preset.positivePrompt, getCoverDescription()].filter(Boolean).join(', ');
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '封面生成失败，请检查图片接口配置。';
}

function getCoverModelLabel(provider: ImageProviderType) {
  const selected = getSelectedImageModelOption(currentSettings.value, 'worldBook');
  return selected?.provider === provider ? selected.label : '';
}

function getCoverSizeLabel(provider: ImageProviderType) {
  return provider === 'openai' ? '1024x1536' : '832x1216';
}

async function generateCover() {
  if (coverState.value === 'loading') return;
  const selectedModel = getSelectedImageModelOption(currentSettings.value, 'worldBook');
  if (!selectedModel) {
    coverState.value = 'error';
    coverFeedback.value = '请先在顶部切换按钮里选择一个已配置的生图模型。';
    return;
  }

  const provider = selectedModel.provider;
  const positivePrompt = buildCoverPrompt(provider);
  const promptPreset = getImagePromptPresetForProvider(currentSettings.value, provider);
  let imageSettings = currentSettings.value;
  const imageOverrides = {
    positivePrompt,
    negativePrompt: promptPreset.negativePrompt,
    size: '1024x1536',
    width: 832,
    height: 1216,
    model: selectedModel.model
  };

  if (provider === 'openai') {
    const [vendorId, ...modelParts] = selectedModel.model.split('::');
    imageSettings = {
      ...currentSettings.value,
      imageOpenAi: {
        ...currentSettings.value.imageOpenAi,
        activeVendorId: vendorId || currentSettings.value.imageOpenAi.activeVendorId
      }
    };
    imageOverrides.model = modelParts.join('::') || currentSettings.value.imageModel;
  }

  coverState.value = 'loading';
  coverFeedback.value = '';

  try {
    const result = await generateImageByProvider(provider, imageSettings, imageOverrides);
    clearBrokenCoverImage(result.imageUrl);
    draft.coverImage = result.imageUrl;
    draft.coverProvider = result.provider;
    await store.addGeneratedImage({
      provider: result.provider,
      imageUrl: result.imageUrl,
      title: `${draft.title.trim() || '世界书'}封面`,
      prompt: positivePrompt,
      negativePrompt: promptPreset.negativePrompt,
      model: getCoverModelLabel(result.provider),
      size: getCoverSizeLabel(result.provider),
      source: 'world-book'
    });
    coverState.value = 'success';
    coverFeedback.value = '封面已生成，并会自动固定到这本世界书。';
  } catch (error) {
    coverState.value = 'error';
    coverFeedback.value = getErrorMessage(error);
  }
}

async function readCoverImage(event: Event) {
  const image = await readImageFileFromInput(event);
  if (!image) return;
  clearBrokenCoverImage(image);
  draft.coverImage = image;
  draft.coverProvider = '';
  coverState.value = 'success';
  coverFeedback.value = '本地封面已载入，并会自动保存到这本世界书。';
}

function isBrokenCoverImage(imageUrl: string | undefined) {
  return Boolean(imageUrl && brokenCoverImages.value.includes(imageUrl));
}

function markBrokenCoverImage(imageUrl: string | undefined) {
  if (!imageUrl || brokenCoverImages.value.includes(imageUrl)) return;
  brokenCoverImages.value = [...brokenCoverImages.value, imageUrl];
  if (draft.coverImage.trim() === imageUrl) {
    coverState.value = 'error';
    coverFeedback.value = '封面图片加载失败，已显示文字封面。请重新生成、上传本地封面，或更换可访问的图片地址。';
  }
}

function clearBrokenCoverImage(imageUrl: string | undefined) {
  if (!imageUrl) return;
  brokenCoverImages.value = brokenCoverImages.value.filter((item) => item !== imageUrl);
}

watch(
  () => [store.ready, route.name, routeBookId.value, String(route.query.scope ?? '')],
  loadDraftFromRoute,
  { immediate: true }
);

watch(draft, scheduleAutoSave, { deep: true });
</script>

<style scoped>
.world-book-editor-page {
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
  background:
    radial-gradient(circle at top left, rgba(6, 199, 85, 0.12), transparent 34%),
    radial-gradient(circle at top right, rgba(255, 214, 224, 0.4), transparent 28%),
    linear-gradient(180deg, #fffdfd 0%, #f6f8f7 56%, #eef3f0 100%);
}

.world-book-editor-topbar {
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(18px);
}

.world-book-editor-title-button {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 0;
  margin-right: auto;
}

.world-book-editor-title-button .top-title {
  margin: 0;
  text-align: left;
}

.world-book-editor-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  margin-left: auto;
}

.world-book-editor-save-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #111111;
  font-size: 12px;
  font-weight: 900;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.world-book-editor-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 10px calc(16px + var(--safe-right)) 18px calc(16px + var(--safe-left));
}

.world-book-editor-panel,
.loading-card,
.missing-card {
  display: grid;
  padding: 16px;
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 32px rgba(16, 24, 20, 0.06);
}

.loading-card,
.missing-card {
  place-items: center;
  min-height: 240px;
  color: #69706a;
  font-size: 15px;
  text-align: center;
}

.missing-card {
  gap: 10px;
  place-items: center;
}

.missing-card h2,
.missing-card p {
  margin: 0;
}

.missing-card button {
  min-height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  background: #06c755;
  color: #ffffff;
  font-weight: 900;
}

.editor-sheet {
  --accent: #06c755;
  --accent-soft: #eef8f1;
  --blue: #3b82f6;
  --blue-soft: rgba(59, 130, 246, 0.12);
  --gold: #d49628;
  --gold-soft: rgba(212, 150, 40, 0.14);
  --panel-strong: rgba(255, 255, 255, 0.96);
  --ink: #1f2622;
  --muted: #7c847f;
  --line: rgba(17, 17, 17, 0.05);
  display: grid;
  gap: 14px;
  min-width: 0;
}

.eyebrow {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.book-power-button,
.book-delete-button,
.generate-button,
.add-entry-button,
.entry-switch,
.entry-delete-button,
.entry-mode-button,
.entry-page-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-weight: 900;
}

.book-power-button,
.book-delete-button {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 10px;
  font-size: 11px;
  white-space: nowrap;
  box-shadow: 0 10px 22px rgba(244, 154, 181, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.book-power-button {
  border: 1px solid rgba(244, 154, 181, 0.24);
  background: linear-gradient(135deg, rgba(255, 241, 245, 0.95), rgba(255, 255, 255, 0.9));
  color: #9a5367;
}

.book-power-button.active {
  border-color: rgba(6, 199, 85, 0.2);
  background: linear-gradient(135deg, rgba(238, 248, 241, 0.98), rgba(255, 255, 255, 0.92));
  color: #2c7544;
}

.book-delete-button {
  border: 1px solid rgba(180, 72, 92, 0.18);
  background: linear-gradient(135deg, rgba(255, 241, 245, 0.96), rgba(255, 255, 255, 0.9));
  color: #b4485c;
}

.world-book-delete-confirm {
  display: grid;
  gap: 14px;
  padding: 18px;
  color: #7c847f;
}

.world-book-delete-confirm h2,
.world-book-delete-confirm p {
  margin: 0;
}

.world-book-delete-confirm h2 {
  color: #1f2622;
  font-size: 24px;
  line-height: 1.1;
}

.world-book-delete-confirm p {
  line-height: 1.7;
}

.world-book-delete-confirm strong {
  display: block;
  margin-bottom: 4px;
  color: #1f2622;
}

.confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 15px;
  border: 1px solid rgba(17, 17, 17, 0.05);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #1f2622;
  font-weight: 900;
}

.ghost-button.danger {
  background: rgba(239, 68, 90, 0.08);
  color: #b4485c;
}

.ghost-button:disabled {
  opacity: 0.52;
}

.world-book-editor-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 8px calc(12px + var(--safe-right)) calc(10px + var(--safe-bottom)) calc(12px + var(--safe-left));
  border-top: 1px solid rgba(17, 17, 17, 0.05);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
}

.world-book-editor-tab {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 4px;
  min-height: 48px;
  padding: 6px 4px;
  border-radius: 14px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
}

.world-book-editor-tab.active {
  background: #eef8f1;
  color: #111111;
}

.world-book-editor-tab svg {
  width: 20px;
  height: 20px;
}

.world-book-editor-tab small {
  position: absolute;
  top: 5px;
  right: calc(50% - 28px);
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: #2c7544;
  font-size: 9px;
  line-height: 16px;
  text-align: center;
}

.draft-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(239, 68, 90, 0.1);
  color: #b4485c;
  font-weight: 900;
}

.editor-form,
.editor-pane,
.cover-tools,
.field,
.cover-upload-button {
  display: grid;
  gap: 10px;
}

.editor-form {
  gap: 14px;
}

.cover-editor {
  display: grid;
  grid-template-columns: minmax(112px, 36%) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  padding: 12px;
  border: 1px solid rgba(17, 17, 17, 0.05);
  border-radius: 24px;
  background: rgba(247, 249, 248, 0.92);
}

.editor-cover-frame {
  display: grid;
  place-items: center;
  aspect-ratio: 0.68;
  overflow: hidden;
  border-radius: 16px 21px 21px 16px;
  background: linear-gradient(180deg, #f0f4f2, #e4ebe6);
  box-shadow: inset 8px 0 12px rgba(72, 84, 77, 0.1), 0 16px 28px rgba(16, 24, 20, 0.1);
}

.editor-cover-fallback {
  max-width: 100%;
  padding: 18px;
  color: #24302a;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.55;
  text-align: center;
  overflow-wrap: anywhere;
}

.editor-cover {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.book-meta-grid,
.entry-field-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.field span,
.entry-toolbar span,
.check-field span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
}

.field input,
.field select,
.field textarea,
.check-field,
.cover-upload-button {
  border: 1px solid rgba(17, 17, 17, 0.05);
  border-radius: 18px;
  background: var(--panel-strong);
  color: var(--ink);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.field input,
.field select {
  min-height: 46px;
  padding: 0 14px;
}

.field textarea {
  min-height: 150px;
  padding: 13px 14px;
  resize: none;
  line-height: 1.7;
}

.field textarea.prompt-area {
  min-height: 112px;
}

.cover-source-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cover-source-grid .field,
.cover-upload-field {
  min-width: 0;
}

.cover-source-grid .field span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cover-upload-button {
  position: relative;
  grid-auto-flow: column;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 14px;
  color: var(--ink);
  cursor: pointer;
  overflow: hidden;
}

.cover-upload-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.cover-upload-button span {
  color: var(--ink);
  font-size: 12px;
  font-weight: 900;
}

.cover-upload-button strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 13px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generate-button {
  width: 100%;
  min-height: 40px;
  padding: 0 14px;
  background: rgba(31, 38, 34, 0.1);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px rgba(31, 38, 34, 0.04);
}

.generate-button:disabled {
  opacity: 0.62;
}

.cover-bottom-generate {
  min-height: 46px;
}

.cover-feedback {
  margin: 0;
  padding: 10px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.cover-feedback.success {
  background: var(--accent-soft);
  color: #416d4f;
}

.cover-feedback.error {
  background: rgba(239, 68, 90, 0.1);
  color: #b4485c;
}

.entry-pane {
  gap: 12px;
}

.book-meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(17, 17, 17, 0.05);
  border-radius: 22px;
  background: rgba(247, 249, 248, 0.92);
}

.book-meta-grid .field,
.entry-field-grid .field {
  min-width: 0;
  gap: 6px;
}

.book-meta-grid .field span,
.entry-field-grid .field span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.entry-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.entry-toolbar div {
  display: grid;
  gap: 3px;
}

.entry-toolbar strong {
  color: var(--ink);
  font-size: 16px;
  font-weight: 900;
}

.entry-toolbar small {
  color: #64716a;
  font-weight: 800;
}

.add-entry-button {
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  background: var(--accent-soft);
  color: #2c7544;
}

.entry-pager {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(62px, auto) minmax(0, 1fr);
  gap: clamp(4px, 1.8vw, 8px);
  align-items: center;
  padding: 6px;
  border-radius: 999px;
  background: rgba(31, 38, 34, 0.06);
  white-space: nowrap;
}

.entry-pager strong {
  min-width: 0;
  color: var(--ink);
  font-size: 12px;
  font-weight: 900;
  text-align: center;
}

.entry-page-button {
  gap: 5px;
  min-width: 0;
  min-height: 34px;
  padding: 0 clamp(6px, 2vw, 10px);
  background: rgba(255, 255, 255, 0.9);
  color: var(--ink);
  white-space: nowrap;
}

.entry-page-button:disabled {
  color: rgba(31, 38, 34, 0.28);
  background: rgba(255, 255, 255, 0.5);
}

.lore-entry-card {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(17, 17, 17, 0.05);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 12px 24px rgba(16, 24, 20, 0.05);
}

.lore-entry-card.disabled {
  opacity: 0.7;
}

.lore-entry-card.mode-constant {
  border-color: rgba(59, 130, 246, 0.16);
}

.lore-entry-card.mode-priority {
  border-color: rgba(212, 150, 40, 0.18);
}

.lore-entry-head {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.entry-title-line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.entry-lamp,
.entry-mode-button i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(31, 38, 34, 0.18);
}

.lamp-green,
.entry-mode-button.mode-keyword.active i {
  background: var(--accent);
  box-shadow: 0 0 0 5px rgba(6, 199, 85, 0.12), 0 0 14px rgba(6, 199, 85, 0.32);
}

.lamp-blue,
.entry-mode-button.mode-constant.active i {
  background: var(--blue);
  box-shadow: 0 0 0 5px var(--blue-soft), 0 0 14px rgba(59, 130, 246, 0.3);
}

.lamp-gold,
.entry-mode-button.mode-priority.active i {
  background: var(--gold);
  box-shadow: 0 0 0 5px var(--gold-soft), 0 0 14px rgba(212, 150, 40, 0.3);
}

.lamp-off {
  background: rgba(31, 38, 34, 0.18);
}

.entry-title-input {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(17, 17, 17, 0.05);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--ink);
  font-weight: 900;
}

.entry-action-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.entry-switch,
.entry-delete-button,
.entry-case-field {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 0 8px;
  white-space: nowrap;
}

.entry-switch {
  background: rgba(31, 38, 34, 0.08);
  color: #6f7772;
}

.entry-switch.active {
  background: var(--accent-soft);
  color: #2c7544;
}

.entry-delete-button {
  color: #b4485c;
  background: rgba(239, 68, 90, 0.08);
}

.entry-delete-button span {
  font-size: 12px;
  font-weight: 900;
}

.entry-delete-button:disabled {
  color: rgba(31, 38, 34, 0.22);
  background: rgba(31, 38, 34, 0.05);
}

.entry-case-field {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding-inline: 4px;
}

.entry-case-field input {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
}

.entry-case-field span {
  flex: 0 0 auto;
  font-size: 11px;
}

.entry-mode-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.entry-mode-button {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  justify-items: start;
  gap: 2px 6px;
  min-width: 0;
  min-height: 46px;
  padding: 7px 9px;
  border: 1px solid rgba(17, 17, 17, 0.05);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--muted);
  text-align: left;
}

.entry-mode-button i {
  grid-row: 1 / span 2;
  align-self: center;
}

.entry-mode-button span {
  color: var(--ink);
  font-size: 12px;
  font-weight: 900;
}

.entry-mode-button small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
}

.entry-mode-button.active.mode-keyword {
  background: var(--accent-soft);
}

.entry-mode-button.active.mode-constant {
  background: var(--blue-soft);
}

.entry-mode-button.active.mode-priority {
  background: var(--gold-soft);
}

.entry-field-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  align-items: end;
}

.entry-keyword-field {
  grid-column: span 2;
}

.entry-metric-field {
  grid-column: span 1;
}

.entry-content-field textarea {
  min-height: 170px;
}

@media (max-width: 430px) {
  .world-book-editor-main {
    padding-inline: 12px;
  }

  .world-book-editor-panel,
  .loading-card,
  .missing-card {
    padding: 14px;
    border-radius: 20px;
  }

  .cover-editor {
    grid-template-columns: 1fr;
  }

  .editor-cover-frame {
    width: min(54vw, 190px);
    justify-self: center;
  }
}

@media (max-width: 360px) {
  .world-book-editor-actions,
  .entry-action-row,
  .entry-mode-tabs {
    gap: 5px;
  }

  .book-power-button,
  .book-delete-button {
    padding-inline: 8px;
  }

  .book-meta-grid {
    gap: 7px;
    padding: 10px;
  }

  .book-meta-grid .field span,
  .entry-mode-button span,
  .entry-field-grid .field span {
    font-size: 10px;
  }

  .entry-mode-button {
    gap: 1px 4px;
    min-height: 42px;
    padding: 6px 5px;
  }

  .entry-mode-button small {
    font-size: 9px;
  }

  .entry-field-grid {
    gap: 7px 5px;
  }
}
</style>