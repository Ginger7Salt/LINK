<template>
  <section class="screen no-tabs stickers-page">
    <header class="top-bar stickers-topbar">
      <button class="stickers-title-button" type="button" aria-label="返回首页" @click="goBack">
        <h1 class="top-title">Stickers</h1>
      </button>

      <div class="stickers-actions">
        <button class="stickers-action-button" type="button" aria-label="导入 Stickers" @click="openImportModal">
          <Plus :size="20" stroke-width="2.4" />
        </button>
        <button class="stickers-action-button" type="button" aria-label="管理 Stickers" @click="openManagePage">
          <PencilLine :size="19" stroke-width="2.3" />
        </button>
      </div>
    </header>

    <main class="stickers-main">
      <section v-if="store.ready" class="stickers-panel">
        <StickerLibraryPanel
          v-model:activeGroupId="activeGroupId"
          :show-close="false"
          :show-toolbar-actions="false"
          :allow-sticker-editing="false"
        />
      </section>
      <section v-else class="loading-card">
        <p>正在整理贴纸抽屉...</p>
      </section>
    </main>

    <StickerImportModal
      v-model="showImportModal"
      :active-tab="importTab"
      :groups="groups"
      :selected-group-id="importTargetGroupId"
      :text-value="importText"
      :selected-files="selectedFiles"
      :new-group-name="importNewGroupName"
      :feedback="importFeedback"
      :disabled="importDisabled"
      @update:active-tab="handleImportTabChange"
      @update:selected-group-id="importTargetGroupId = $event"
      @update:text-value="importText = $event"
      @update:selected-files="selectedFiles = $event"
      @update:new-group-name="importNewGroupName = $event"
      @create-group="createImportGroup"
      @submit="submitImport"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { PencilLine, Plus } from 'lucide-vue-next';
import StickerImportModal, { type StickerImportTab } from '@/components/stickers/StickerImportModal.vue';
import StickerLibraryPanel from '@/components/stickers/StickerLibraryPanel.vue';
import { useAppStore } from '@/stores/appStore';
import type { StickerSourceType } from '@/types/domain';
import { RECENT_STICKER_GROUP_ID, createImageFileStickerDraft, parseStickerImportText, readStickerImportFile, type StickerImportDraft } from '@/utils/stickers';

const router = useRouter();
const store = useAppStore();
const activeGroupId = ref(RECENT_STICKER_GROUP_ID);
const showImportModal = ref(false);
const importTab = ref<StickerImportTab>('url');
const importTargetGroupId = ref('');
const importText = ref('');
const selectedFiles = ref<File[]>([]);
const importNewGroupName = ref('');
const importFeedback = ref('');
const importing = ref(false);

const groups = computed(() => store.sortedStickerGroups ?? []);
const importDisabled = computed(() => {
  if (importing.value || !importTargetGroupId.value) return true;
  return importTab.value === 'url' ? !importText.value.trim() : !selectedFiles.value.length;
});

onMounted(() => {
  void store.hydrate();
});

watch(
  groups,
  (nextGroups) => {
    if (activeGroupId.value !== RECENT_STICKER_GROUP_ID && !nextGroups.some((group) => group.id === activeGroupId.value)) activeGroupId.value = RECENT_STICKER_GROUP_ID;
    const defaultGroupId = pickDefaultGroupId(nextGroups);
    if (!nextGroups.some((group) => group.id === importTargetGroupId.value)) importTargetGroupId.value = defaultGroupId;
  },
  { immediate: true }
);

function pickDefaultGroupId(sourceGroups = groups.value) {
  if (activeGroupId.value !== RECENT_STICKER_GROUP_ID && sourceGroups.some((group) => group.id === activeGroupId.value)) return activeGroupId.value;
  return sourceGroups[0]?.id ?? '';
}

function resetImportState() {
  importText.value = '';
  selectedFiles.value = [];
  importNewGroupName.value = '';
  importFeedback.value = '';
  importTargetGroupId.value = pickDefaultGroupId();
}

function openImportModal() {
  importTab.value = 'url';
  resetImportState();
  showImportModal.value = true;
}

function openManagePage() {
  showImportModal.value = false;
  void router.push({ name: 'stickers-manage' });
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  void router.push({ name: 'home' });
}

function handleImportTabChange(tab: StickerImportTab) {
  importTab.value = tab;
  importFeedback.value = '';
  importText.value = tab === 'url' ? importText.value : '';
  selectedFiles.value = [];
}

function importSourceTypeForFile(file: File): StickerSourceType {
  if (/\.json$/i.test(file.name)) return 'json-file';
  if (/\.docx?$/i.test(file.name)) return 'doc-file';
  if (file.type.startsWith('image/')) return 'local-image';
  if (/\.txt$/i.test(file.name) || file.type === 'text/plain') return 'text-file';
  return 'url';
}

async function buildImportDrafts() {
  if (importTab.value === 'url') return parseStickerImportText(importText.value, 'url');

  const drafts: StickerImportDraft[] = [];
  for (const file of selectedFiles.value) {
    if (file.type.startsWith('image/')) {
        drafts.push(createImageFileStickerDraft(file));
      continue;
    }
    const text = await readStickerImportFile(file);
    drafts.push(...parseStickerImportText(text, importSourceTypeForFile(file)));
  }
  return drafts;
}

async function submitImport() {
  if (importDisabled.value) return;
  importing.value = true;
  importFeedback.value = '';
  try {
    const drafts = await buildImportDrafts();
    if (!drafts.length) {
      importFeedback.value = '没有识别到可导入的 Stickers 内容。';
      return;
    }
    const created = await store.importStickers(drafts, [importTargetGroupId.value]);
    if (!created.length) {
      importFeedback.value = '没有新增 Stickers。';
      return;
    }
    activeGroupId.value = importTargetGroupId.value;
    resetImportState();
    showImportModal.value = false;
  } catch (error) {
    importFeedback.value = error instanceof Error ? error.message : '导入失败，请重试。';
  } finally {
    importing.value = false;
  }
}

async function createImportGroup() {
  const name = importNewGroupName.value.trim();
  if (!name) return;
  const group = await store.addStickerGroup(name);
  if (!group) return;
  importTargetGroupId.value = group.id;
  activeGroupId.value = group.id;
  importNewGroupName.value = '';
  importFeedback.value = `已添加分组“${group.name}”。`;
}

</script>

<style scoped>
.stickers-page {
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(255, 213, 226, 0.72), transparent 30%),
    radial-gradient(circle at top right, rgba(6, 199, 85, 0.1), transparent 28%),
    linear-gradient(180deg, #fffafc 0%, #f7f8fb 56%, #eef4f0 100%);
}

.stickers-topbar {
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(18px);
}

.stickers-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.stickers-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  color: #111111;
}

.stickers-action-button.active {
  border-radius: 8px;
  background: #111111;
  color: #ffffff;
}

.stickers-action-button svg {
  pointer-events: none;
}

.stickers-title-button {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 0;
  margin-right: auto;
}

.stickers-title-button .top-title {
  margin: 0;
  text-align: left;
}

.stickers-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 16px 24px;
  -webkit-overflow-scrolling: touch;
}

.stickers-panel {
  display: grid;
  align-content: start;
  align-items: start;
  min-width: 0;
  padding: 16px;
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 32px rgba(16, 24, 20, 0.06);
}

.loading-card {
  display: grid;
  place-items: center;
  min-height: 260px;
  padding: 16px;
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 32px rgba(16, 24, 20, 0.06);
  color: #6b6d73;
  font-size: 15px;
}

.stickers-panel :deep(.sticker-sheet) {
  min-height: 0;
  align-content: start;
}

.stickers-panel :deep(.group-tabs) {
  padding-bottom: 2px;
}

.stickers-panel :deep(.sticker-grid) {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding-bottom: 6px;
}

.stickers-panel :deep(.sticker-tile) {
  padding: 8px;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 247, 250, 0.88));
}

.stickers-panel :deep(.empty-stickers) {
  min-height: 360px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(249, 250, 252, 0.84));
}

@media (max-width: 420px) {
  .stickers-main {
    padding-inline: 12px;
  }

  .stickers-panel {
    padding: 14px;
  }
}
</style>