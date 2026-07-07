<template>
  <section class="sticker-sheet" :class="[`sticker-sheet-${presentation}`, { 'is-managing': managementMode }]" @click="hideTransientUi">
    <header class="sticker-head" :class="{ 'is-searching': showInlineSearch }" @click.stop>
      <form v-if="showInlineSearch" class="head-search-row" @submit.prevent>
        <Search :size="15" />
        <input v-model="searchText" type="search" aria-label="搜索 Stickers" placeholder="搜索 Stickers" />
        <button class="icon-action" type="button" :disabled="!searchText" aria-label="清除搜索" @click="clearSearch">
          <X :size="15" />
        </button>
      </form>
      <strong v-else>Stickers</strong>
      <div v-if="showToolbarActions || showSearchAction || showManageAction || showClose" class="head-actions">
        <template v-if="showToolbarActions">
          <button class="head-icon" :class="{ active: activeTool === 'group-name' }" type="button" aria-label="分组名" @click="toggleTool('group-name')">
            <PencilLine :size="17" />
          </button>
          <button class="head-icon" :class="{ active: activeTool === 'import' }" type="button" aria-label="URL / 文本导入" @click="toggleTool('import')">
            <Upload :size="17" />
          </button>
          <label class="head-icon file-head" aria-label="文件">
            <FileUp :size="17" />
            <input type="file" multiple accept="image/*,.txt,.json,.doc,.docx,text/plain,application/json,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="importFiles" />
          </label>
        </template>
        <button v-if="showManageAction" class="head-icon" type="button" aria-label="管理 Stickers" @click="emit('manage')">
          <Settings2 :size="18" />
        </button>
        <button v-if="showClose" class="close-button" type="button" aria-label="关闭" @click="emit('close')">
          <X :size="18" />
        </button>
      </div>
    </header>

    <nav class="group-tabs" aria-label="Stickers 分组" @click.stop>
      <button
        v-for="group in groupTabs"
        :key="group.id"
        class="group-pill"
        :class="{ active: currentActiveGroupId === group.id }"
        type="button"
        @click="currentActiveGroupId = group.id"
      >
        <span>{{ group.name }}</span>
        <small>{{ group.count }}</small>
      </button>
    </nav>

    <section v-if="managementMode" class="manage-bar" @click.stop>
      <div class="manage-choice-row">
        <button class="manage-choice" :class="{ active: managementPanel === 'group' }" type="button" @click="toggleManagementPanel('group')">
          <span>当前分组</span>
          <small>{{ currentGroupLabel }}</small>
        </button>
        <button class="manage-choice" :class="{ active: managementPanel === 'select' }" type="button" :disabled="!filteredStickers.length" @click="toggleManagementPanel('select')">
          <span>批量选择</span>
          <small>{{ filteredStickers.length ? `${selectedStickerIds.length} / ${filteredStickers.length}` : '暂无贴纸' }}</small>
        </button>
      </div>

      <form v-if="managementPanel === 'group'" class="manage-panel group-manage-panel" @submit.prevent="submitGroupName">
        <label class="field-stack">
          <span>{{ isActiveRecentGroup ? '固定分组' : '分组名称' }}</span>
          <input v-model="newGroupName" :disabled="isActiveRecentGroup" aria-label="当前分组名称" :placeholder="isActiveRecentGroup ? '最近固定，不能修改' : '输入分组名称'" />
        </label>
        <div class="group-action-grid">
          <button class="text-action" type="button" @click="createGroup">
            <Plus :size="15" />
            <span>新建分组</span>
          </button>
          <button v-if="!isActiveRecentGroup" class="text-action" type="submit" :disabled="!newGroupName.trim()">
            <Check :size="15" />
            <span>保存名称</span>
          </button>
          <button v-if="!isActiveRecentGroup" class="text-action" type="button" :disabled="!canMoveActiveGroupUp" @click="moveActiveGroup('up')">
            <ArrowUp :size="15" />
            <span>上移</span>
          </button>
          <button v-if="!isActiveRecentGroup" class="text-action" type="button" :disabled="!canMoveActiveGroupDown" @click="moveActiveGroup('down')">
            <ArrowDown :size="15" />
            <span>下移</span>
          </button>
          <button v-if="!isActiveRecentGroup" class="text-action danger" type="button" :disabled="!canDeleteActiveGroup" @click="deleteActiveGroup">
            <Trash2 :size="15" />
            <span>删除分组</span>
          </button>
        </div>
      </form>

      <section v-if="managementPanel === 'select'" class="manage-panel batch-manage-panel">
        <div class="batch-head">
          <span>选择当前分组里的贴纸</span>
          <button class="link-action" type="button" @click="toggleSelectAll">
            {{ allVisibleSelected ? '取消全选' : '全选' }}
          </button>
        </div>
        <div class="batch-action-row">
          <select v-model="moveTargetGroupId" aria-label="移动到分组" :disabled="!sortedStickerGroups.length">
            <option value="">移动到分组</option>
            <option v-for="group in sortedStickerGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
          </select>
          <button class="text-action" type="button" :disabled="!selectedStickerIds.length || !moveTargetGroupId" @click="moveSelectedStickers">
            <MoveRight :size="15" />
            <span>移动选中</span>
          </button>
          <button class="text-action danger" type="button" :disabled="!selectedStickerIds.length" @click="deleteSelectedStickers">
            <Trash2 :size="15" />
            <span>删除选中</span>
          </button>
        </div>
      </section>

      <p v-if="feedback" class="feedback">{{ feedback }}</p>
    </section>

    <section v-if="activeTool && !showInlineSearch" class="tool-popover" @click.stop>
      <form v-if="activeTool === 'group-name'" class="group-editor" @submit.prevent="submitGroupName">
        <input v-model="newGroupName" :disabled="isActiveRecentGroup" aria-label="Stickers 分组名" :placeholder="isActiveRecentGroup ? '固定分组' : '新分组'" />
        <button class="icon-action" type="submit" :disabled="isActiveRecentGroup" :aria-label="currentActiveGroupId === 'all' ? '添加分组' : '保存分组名'">
          <component :is="currentActiveGroupId === 'all' ? Plus : Check" :size="16" />
        </button>
        <button class="icon-action danger" type="button" :disabled="!canDeleteActiveGroup" aria-label="删除分组" @click="deleteActiveGroup">
          <Trash2 :size="15" />
        </button>
      </form>

      <div v-else-if="activeTool === 'import'" class="import-row">
        <textarea v-model="importText" aria-label="URL / 文本导入"></textarea>
        <button class="mini-action" type="button" :disabled="importing || !importText.trim()" aria-label="导入" @click="importFromText"></button>
      </div>
      <form v-else class="search-row" @submit.prevent>
        <Search :size="15" />
        <input v-model="searchText" type="search" aria-label="搜索 Stickers" placeholder="搜索描述或分组" />
        <button class="icon-action" type="button" :disabled="!searchText" aria-label="清除搜索" @click="clearSearch">
          <X :size="15" />
        </button>
      </form>
      <p v-if="feedback" class="feedback">{{ feedback }}</p>
    </section>

    <section v-if="filteredStickers.length" class="sticker-grid">
      <template v-for="sticker in filteredStickers" :key="sticker.id">
        <article v-if="managementMode" class="sticker-tile manage-tile" :class="{ selected: selectedStickerId === sticker.id, checked: selectedStickerIds.includes(sticker.id), selectable: isSelectionMode }" @click.stop="handleManagedStickerClick(sticker)">
          <label v-if="isSelectionMode" class="tile-check" aria-label="选择 Sticker" @click.stop>
            <input :checked="selectedStickerIds.includes(sticker.id)" type="checkbox" @change="toggleStickerSelection(sticker.id)" />
            <span></span>
          </label>
          <img :src="getStickerDisplayImageUrl(sticker)" :alt="sticker.description" />
          <span>{{ sticker.description }}</span>
        </article>
        <button
          v-else
          class="sticker-tile"
          :class="{ selected: selectedStickerId === sticker.id }"
          type="button"
          :disabled="disabled && Boolean(conversationId)"
          @click.stop="handleStickerClick(sticker)"
        >
          <img :src="getStickerDisplayImageUrl(sticker)" :alt="sticker.description" />
          <span>{{ sticker.description }}</span>
        </button>
      </template>
    </section>
    <section v-else class="empty-stickers">
      <ImagePlus :size="28" />
      <strong>{{ emptyStickerTitle }}</strong>
    </section>

    <form v-if="allowStickerEditing && selectedSticker && !conversationId" class="sticker-editor" @click.stop @submit.prevent="saveSelectedSticker">
      <div class="editor-head">
        <strong>编辑贴纸</strong>
        <button class="text-action danger compact" type="button" @click="deleteSelectedSticker">
          <Trash2 :size="16" />
          <span>删除</span>
        </button>
      </div>
      <div class="editor-fields">
        <input v-model="draftDescription" aria-label="文字描述" placeholder="文字描述" required />
        <input v-model="draftImageUrl" aria-label="图片地址" placeholder="图片地址" required />
      </div>
      <div class="editor-actions">
        <select v-model="draftGroupId" aria-label="Sticker 分组">
          <option value="">未分组</option>
          <option v-for="group in sortedStickerGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
        </select>
        <button class="save-button" type="submit" aria-label="保存 Sticker">
          <Check :size="16" />
          <span>保存</span>
        </button>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowDown, ArrowUp, Check, FileUp, ImagePlus, MoveRight, PencilLine, Plus, Search, Settings2, Trash2, Upload, X } from 'lucide-vue-next';
import { useAppStore } from '@/stores/appStore';
import type { Sticker, StickerSourceType } from '@/types/domain';
import { RECENT_STICKER_GROUP_ID, RECENT_STICKER_GROUP_NAME, createImageFileStickerDraft, getStickerDisplayImageUrl, parseStickerImportText, readStickerImportFile } from '@/utils/stickers';
import { RECOMMENDED_STICKER_GROUP_ID, RECOMMENDED_STICKER_GROUP_NAME } from '@/utils/stickerRecommendations';

const props = withDefaults(defineProps<{
  conversationId?: string;
  showClose?: boolean;
  showToolbarActions?: boolean;
  showManageAction?: boolean;
  activeGroupId?: string;
  allowStickerEditing?: boolean;
  managementMode?: boolean;
  disabled?: boolean;
  recommendationQuery?: string;
  recommendedStickers?: Sticker[];
  presentation?: 'page' | 'modal';
}>(), {
  conversationId: undefined,
  showClose: true,
  showToolbarActions: true,
  showManageAction: false,
  activeGroupId: undefined,
  allowStickerEditing: true,
  managementMode: false,
  disabled: false,
  recommendationQuery: '',
  recommendedStickers: () => [],
  presentation: 'page'
});

const emit = defineEmits<{
  close: [];
  manage: [];
  'update:activeGroupId': [value: string];
}>();

const store = useAppStore();
const internalActiveGroupId = ref(props.activeGroupId ?? RECENT_STICKER_GROUP_ID);
const newGroupName = ref('');
const importText = ref('');
const searchText = ref('');
const feedback = ref('');
const importing = ref(false);
const selectedStickerId = ref('');
const draftDescription = ref('');
const draftImageUrl = ref('');
const draftGroupId = ref('');
const selectedStickerIds = ref<string[]>([]);
const moveTargetGroupId = ref('');
const managementPanel = ref<'group' | 'select' | ''>('');
const activeTool = ref<'group-name' | 'import' | ''>('');

const stickers = computed(() => store.stickers ?? []);
const stickerGroups = computed(() => store.stickerGroups ?? []);
const sortedStickerGroups = computed(() => store.sortedStickerGroups ?? []);
const currentActiveGroupId = computed({
  get: () => props.activeGroupId ?? internalActiveGroupId.value,
  set: (value: string) => {
    internalActiveGroupId.value = value;
    emit('update:activeGroupId', value);
  }
});

const firstGroupId = computed(() => sortedStickerGroups.value[0]?.id ?? '');
const hasRecommendations = computed(() => Boolean(props.recommendedStickers.length));
const showSearchAction = computed(() => props.presentation === 'modal' && !props.managementMode);
const showInlineSearch = computed(() => showSearchAction.value);
const searchQuery = computed(() => searchText.value.replace(/\s+/g, ' ').trim().toLocaleLowerCase());
const stickerGroupNamesById = computed(() => new Map(stickerGroups.value.map((group) => [group.id, group.name])));
const groupTabs = computed(() => [
  ...(hasRecommendations.value ? [{
    id: RECOMMENDED_STICKER_GROUP_ID,
    name: RECOMMENDED_STICKER_GROUP_NAME,
    count: props.recommendedStickers.length
  }] : []),
  {
    id: RECENT_STICKER_GROUP_ID,
    name: RECENT_STICKER_GROUP_NAME,
    count: store.recentStickers.length
  },
  ...sortedStickerGroups.value.map((group) => ({
    id: group.id,
    name: group.name,
    count: store.stickersForGroup(group.id).length
  }))]
);
const searchableStickers = computed(() => {
  const stickerMap = new Map<string, Sticker>();
  for (const sticker of stickers.value) stickerMap.set(sticker.id, sticker);
  for (const sticker of props.recommendedStickers) stickerMap.set(sticker.id, sticker);
  return [...stickerMap.values()];
});
const filteredStickers = computed(() => {
  if (searchQuery.value) return searchableStickers.value.filter((sticker) => stickerMatchesSearch(sticker, searchQuery.value));
  if (currentActiveGroupId.value === RECOMMENDED_STICKER_GROUP_ID) return props.recommendedStickers;
  return currentActiveGroupId.value ? store.stickersForGroup(currentActiveGroupId.value) : [];
});
const emptyStickerTitle = computed(() => searchQuery.value ? '没有找到匹配的 Stickers' : '暂无 Stickers');
const selectedSticker = computed(() => stickers.value.find((sticker) => sticker.id === selectedStickerId.value) ?? null);
const isActiveRecentGroup = computed(() => currentActiveGroupId.value === RECENT_STICKER_GROUP_ID);
const activeGroupIndex = computed(() => sortedStickerGroups.value.findIndex((group) => group.id === currentActiveGroupId.value));
const canDeleteActiveGroup = computed(() => !isActiveRecentGroup.value && currentActiveGroupId.value !== 'all' && activeGroupIndex.value >= 0);
const canMoveActiveGroupUp = computed(() => !isActiveRecentGroup.value && activeGroupIndex.value > 0);
const canMoveActiveGroupDown = computed(() => !isActiveRecentGroup.value && activeGroupIndex.value >= 0 && activeGroupIndex.value < sortedStickerGroups.value.length - 1);
const allVisibleSelected = computed(() => Boolean(filteredStickers.value.length) && filteredStickers.value.every((sticker) => selectedStickerIds.value.includes(sticker.id)));
const isSelectionMode = computed(() => props.managementMode && managementPanel.value === 'select');
const currentGroupLabel = computed(() => {
  if (isActiveRecentGroup.value) return `最近 · ${filteredStickers.value.length}`;
  const group = sortedStickerGroups.value.find((item) => item.id === currentActiveGroupId.value);
  return `${group?.name ?? '未选择'} · ${filteredStickers.value.length}`;
});
const targetImportGroupIds = computed(() => {
  if (currentActiveGroupId.value && !isActiveRecentGroup.value) return [currentActiveGroupId.value];
  return firstGroupId.value ? [firstGroupId.value] : [];
});

onMounted(() => {
  void store.hydrate();
});

watch(
  () => props.activeGroupId,
  (groupId) => {
    if (groupId !== undefined) internalActiveGroupId.value = groupId;
  }
);

watch(
  () => stickerGroups.value,
  () => {
    feedback.value = '';
    if (currentActiveGroupId.value === RECOMMENDED_STICKER_GROUP_ID && hasRecommendations.value) return;
    if (isActiveRecentGroup.value) return;
    if (!sortedStickerGroups.value.some((group) => group.id === currentActiveGroupId.value)) currentActiveGroupId.value = RECENT_STICKER_GROUP_ID;
  },
  { immediate: true }
);

watch(
  () => props.recommendedStickers.length,
  (count) => {
    if (count > 0 && !props.activeGroupId && currentActiveGroupId.value === RECENT_STICKER_GROUP_ID) {
      currentActiveGroupId.value = RECOMMENDED_STICKER_GROUP_ID;
      return;
    }
    if (!count && currentActiveGroupId.value === RECOMMENDED_STICKER_GROUP_ID) currentActiveGroupId.value = RECENT_STICKER_GROUP_ID;
  },
  { immediate: true }
);

watch(
  () => currentActiveGroupId.value,
  (groupId) => {
    selectedStickerId.value = '';
    selectedStickerIds.value = [];
    moveTargetGroupId.value = '';
    if (managementPanel.value === 'select' && !filteredStickers.value.length) managementPanel.value = '';
    const group = stickerGroups.value.find((item) => item.id === groupId);
    newGroupName.value = group?.name ?? '';
  },
  { immediate: true }
);

watch(
  () => props.managementMode,
  (enabled) => {
    if (enabled) return;
    managementPanel.value = '';
    selectedStickerIds.value = [];
    selectedStickerId.value = '';
    moveTargetGroupId.value = '';
  }
);

watch(filteredStickers, (nextStickers) => {
  const visibleIds = new Set(nextStickers.map((sticker) => sticker.id));
  selectedStickerIds.value = selectedStickerIds.value.filter((id) => visibleIds.has(id));
});

watch(selectedSticker, (sticker) => {
  if (!sticker) return;
  draftDescription.value = sticker.description;
  draftImageUrl.value = sticker.imageUrl;
  draftGroupId.value = sticker.groupIds[0] ?? sortedStickerGroups.value[0]?.id ?? '';
});

function sourceTypeForFile(file: File): StickerSourceType {
  if (/\.json$/i.test(file.name)) return 'json-file';
  return /\.docx?$/i.test(file.name) ? 'doc-file' : 'text-file';
}

function selectSticker(sticker: Sticker) {
  selectedStickerId.value = sticker.id;
}

function toggleManagementPanel(panel: 'group' | 'select') {
  managementPanel.value = managementPanel.value === panel ? '' : panel;
  feedback.value = '';
  if (panel === 'select') {
    selectedStickerId.value = '';
    return;
  }
  selectedStickerIds.value = [];
  moveTargetGroupId.value = '';
}

function handleManagedStickerClick(sticker: Sticker) {
  if (isSelectionMode.value) {
    toggleStickerSelection(sticker.id);
    return;
  }
  selectSticker(sticker);
}

function hideTransientUi() {
  selectedStickerId.value = '';
  activeTool.value = '';
}

function stickerMatchesSearch(sticker: Sticker, query: string) {
  const groupNames = sticker.groupIds.map((groupId) => stickerGroupNamesById.value.get(groupId) ?? '').join(' ');
  return `${sticker.description} ${groupNames}`.toLocaleLowerCase().includes(query);
}

function toggleTool(tool: 'group-name' | 'import') {
  selectedStickerId.value = '';
  feedback.value = '';
  activeTool.value = activeTool.value === tool ? '' : tool;
}

function clearSearch() {
  searchText.value = '';
}

async function handleStickerClick(sticker: Sticker) {
  if (!props.conversationId) {
    if (props.allowStickerEditing) selectSticker(sticker);
    return;
  }
  if (props.disabled) return;
  await store.sendStickerMessage(props.conversationId, sticker);
  emit('close');
}

async function submitGroupName() {
  if (isActiveRecentGroup.value) return;
  const name = newGroupName.value.trim();
  if (!name) return;
  const existingGroup = stickerGroups.value.find((item) => item.id === currentActiveGroupId.value);
  if (existingGroup) {
    await store.saveStickerGroup({ ...existingGroup, name });
    feedback.value = '分组名已保存。';
    return;
  }
  const group = await store.addStickerGroup(name);
  if (!group) return;
  currentActiveGroupId.value = group.id;
}

async function createGroup() {
  const baseName = '新分组';
  const existingNames = new Set([...sortedStickerGroups.value.map((group) => group.name.trim().toLocaleLowerCase()), RECENT_STICKER_GROUP_NAME.toLocaleLowerCase()]);
  let name = baseName;
  for (let index = 2; existingNames.has(name.toLocaleLowerCase()); index += 1) name = `${baseName} ${index}`;
  const group = await store.addStickerGroup(name);
  if (!group) return;
  currentActiveGroupId.value = group.id;
  feedback.value = `已添加分组“${group.name}”。`;
}

async function deleteActiveGroup() {
  if (!canDeleteActiveGroup.value) return;
  const group = stickerGroups.value.find((item) => item.id === currentActiveGroupId.value);
  if (!group || !window.confirm(`删除分组“${group.name}”？分组内 Sticker 会保留。`)) return;
  const deleted = await store.deleteStickerGroup(group.id);
  if (deleted) currentActiveGroupId.value = sortedStickerGroups.value.find((item) => item.id !== group.id)?.id ?? RECENT_STICKER_GROUP_ID;
}

async function moveActiveGroup(direction: 'up' | 'down') {
  if (isActiveRecentGroup.value || activeGroupIndex.value < 0) return;
  const moved = await store.moveStickerGroup(currentActiveGroupId.value, direction);
  if (moved) feedback.value = '分组顺序已更新。';
}

function toggleStickerSelection(stickerId: string) {
  selectedStickerIds.value = selectedStickerIds.value.includes(stickerId)
    ? selectedStickerIds.value.filter((id) => id !== stickerId)
    : [...selectedStickerIds.value, stickerId];
  feedback.value = '';
}

function toggleSelectAll() {
  selectedStickerIds.value = allVisibleSelected.value ? [] : filteredStickers.value.map((sticker) => sticker.id);
  feedback.value = '';
}

async function moveSelectedStickers() {
  if (!selectedStickerIds.value.length || !moveTargetGroupId.value) return;
  const movedCount = await store.moveStickersToGroup(selectedStickerIds.value, moveTargetGroupId.value);
  if (!movedCount) return;
  selectedStickerIds.value = [];
  feedback.value = `已移动 ${movedCount} 个 Sticker。`;
}

async function deleteSelectedStickers() {
  const selectedCount = selectedStickerIds.value.length;
  if (!selectedCount || !window.confirm(`删除已选中的 ${selectedCount} 个 Sticker？`)) return;
  const deletedCount = await store.deleteStickers(selectedStickerIds.value);
  if (!deletedCount) return;
  selectedStickerIds.value = [];
  selectedStickerId.value = '';
  feedback.value = `已删除 ${deletedCount} 个 Sticker。`;
}

async function importDrafts(drafts: ReturnType<typeof parseStickerImportText>) {
  if (!drafts.length) {
    feedback.value = '没有识别到可导入的图片链接。';
    return;
  }
  const created = await store.importStickers(drafts, targetImportGroupIds.value);
  feedback.value = created.length ? `已导入 ${created.length} 个 Stickers。` : '没有新增 Stickers。';
}

async function importFromText() {
  if (!importText.value.trim()) return;
  importing.value = true;
  try {
    await importDrafts(parseStickerImportText(importText.value, 'url'));
    importText.value = '';
  } finally {
    importing.value = false;
  }
}

async function importFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (!files.length) return;
  importing.value = true;
  try {
    const drafts = [];
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        drafts.push(createImageFileStickerDraft(file));
        continue;
      }
      const text = await readStickerImportFile(file);
      drafts.push(...parseStickerImportText(text, sourceTypeForFile(file)));
    }
    await importDrafts(drafts);
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '文件导入失败。';
  } finally {
    importing.value = false;
    input.value = '';
  }
}

async function saveSelectedSticker() {
  if (!selectedSticker.value) return;
  await store.saveSticker({
    ...selectedSticker.value,
    description: draftDescription.value.trim(),
    imageUrl: draftImageUrl.value.trim(),
    groupIds: draftGroupId.value ? [draftGroupId.value] : targetImportGroupIds.value
  });
  feedback.value = 'Sticker 已保存。';
}

async function deleteSelectedSticker() {
  if (!selectedSticker.value || !window.confirm(`删除 Sticker“${selectedSticker.value.description}”？`)) return;
  const deletedId = selectedSticker.value.id;
  await store.deleteSticker(deletedId);
  selectedStickerId.value = '';
  feedback.value = 'Sticker 已删除。';
}
</script>

<style scoped>
.sticker-sheet {
  position: relative;
  display: grid;
  align-content: start;
  align-items: start;
  gap: 8px;
  min-width: 0;
  color: #211f22;
  container-type: inline-size;
}

.sticker-sheet-modal {
  display: flex;
  flex-direction: column;
  align-content: stretch;
  align-items: stretch;
  min-height: 0;
}

.sticker-sheet-modal .sticker-head,
.sticker-sheet-modal .group-tabs {
  flex: 0 0 auto;
}

.sticker-head,
.group-tabs,
.sticker-grid,
.empty-stickers {
  width: 100%;
  min-width: 0;
}

.sticker-head,
.editor-head,
.group-editor {
  display: flex;
  align-items: center;
}

.sticker-head,
.editor-head {
  justify-content: space-between;
  gap: 8px;
}

.sticker-head {
  min-height: 30px;
}

.sticker-head strong {
  flex: 1 1 auto;
  min-width: 0;
  color: #8c848c;
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
}

.head-search-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  height: 30px;
  padding: 0 3px 0 8px;
  border-radius: 10px;
  background: rgba(244, 245, 247, 0.96);
}

.head-search-row > svg {
  justify-self: center;
  color: #8c848c;
}

.head-search-row input {
  min-width: 0;
  min-height: 0;
  border: 0;
  background: transparent;
  padding: 0;
  color: #211f22;
  font-size: 12px;
  font-weight: 800;
  outline: none;
}

.head-search-row input::placeholder {
  color: #9c969d;
}

.head-search-row .icon-action {
  background: transparent;
}

.head-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 3px;
}

.close-button,
.head-icon,
.icon-action {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  color: #211f22;
}

.close-button,
.head-icon {
  background: transparent;
}

.head-icon.active {
  background: #111111;
  color: #ffffff;
}

.file-head {
  position: relative;
}

.icon-action {
  background: rgba(255, 255, 255, 0.78);
}

.icon-action.danger {
  color: var(--danger);
}

.icon-action:disabled {
  opacity: 0.35;
}

.file-head input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.tool-popover {
  position: absolute;
  top: 34px;
  left: 0;
  right: 0;
  z-index: 4;
  display: grid;
  gap: 6px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 36px rgba(37, 34, 40, 0.14);
  backdrop-filter: blur(18px);
}

.group-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.group-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  max-width: min(220px, 70vw);
  min-height: 26px;
  padding: 0 7px 0 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #68616b;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.group-pill span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-pill.active {
  background: #111111;
  color: #ffffff;
}

.group-pill small {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  min-width: 17px;
  min-height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.12);
  color: #4f4850;
  font-size: 10px;
  line-height: 1;
  text-align: center;
  opacity: 0.78;
}

.group-pill.active small {
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
  opacity: 0.9;
}

.sticker-sheet-modal .group-pill {
  max-width: min(160px, 48vw);
  padding: 0 11px;
}

.sticker-sheet-modal .group-tabs {
  min-height: 28px;
  padding-bottom: 2px;
}

.sticker-sheet-modal .group-pill small {
  display: none;
}

.group-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px 28px;
  gap: 5px;
}

.group-editor input,
.import-row textarea,
.search-row input,
.field-stack input,
.batch-action-row select,
.editor-fields input,
.editor-actions select {
  min-height: 28px;
  border-radius: 9px;
  background: rgba(244, 245, 247, 0.96);
  padding: 5px 8px;
  font-size: 11px;
}

.manage-bar {
  display: grid;
  gap: 8px;
  padding: 8px;
  border-radius: 16px;
  background: rgba(17, 17, 17, 0.035);
}

.manage-choice-row,
.group-action-grid,
.batch-action-row,
.editor-actions {
  display: grid;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.manage-choice-row {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.manage-choice,
.text-action,
.link-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  border-radius: 12px;
  font-weight: 900;
}

.manage-choice {
  display: grid;
  justify-items: start;
  gap: 3px;
  min-height: 50px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.76);
  color: #211f22;
  text-align: left;
}

.manage-choice.active {
  background: #111111;
  color: #ffffff;
}

.manage-choice:disabled {
  opacity: 0.48;
}

.manage-choice span,
.manage-choice small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manage-choice span {
  font-size: 12px;
}

.manage-choice small {
  opacity: 0.68;
  font-size: 10px;
}

.manage-panel {
  display: grid;
  gap: 8px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.64);
}

.field-stack {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.field-stack span,
.batch-head span {
  color: #77717a;
  font-size: 10px;
  font-weight: 900;
}

.group-action-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.batch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.batch-action-row {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.batch-action-row select,
.editor-actions select {
  width: 100%;
  min-width: 0;
  color: #24262a;
  font-weight: 800;
}

.text-action,
.link-action {
  gap: 4px;
  min-height: 32px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.86);
  color: #211f22;
  font-size: 11px;
  white-space: nowrap;
}

.text-action.danger {
  color: var(--danger);
}

.text-action.compact {
  min-height: 28px;
  padding: 0 8px;
}

.text-action:disabled,
.link-action:disabled {
  opacity: 0.38;
}

.link-action {
  min-height: 28px;
  background: transparent;
  color: #111111;
  padding-inline: 4px;
}

.sticker-editor,
.empty-stickers {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.sticker-editor {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  gap: 7px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -12px 34px rgba(36, 34, 40, 0.14);
  backdrop-filter: blur(18px);
}

.sticker-sheet.is-managing .sticker-editor {
  position: static;
  box-shadow: none;
}

.editor-head strong {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  white-space: nowrap;
}

.editor-fields {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.editor-fields input {
  min-height: 32px;
  border-radius: 9px;
  background: #f1f2f4;
  padding: 6px 9px;
  font-size: 12px;
}

.editor-actions {
  grid-template-columns: minmax(0, 1fr) auto;
}

.import-row,
.search-row {
  display: grid;
  gap: 5px;
  align-items: stretch;
}

.import-row {
  grid-template-columns: minmax(0, 1fr) 28px;
}

.search-row {
  grid-template-columns: 24px minmax(0, 1fr) 28px;
  align-items: center;
}

.search-row > svg {
  justify-self: center;
  color: #8c848c;
}

.import-row textarea {
  height: 32px;
  min-height: 32px;
  resize: vertical;
}

.mini-action,
.save-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 !important;
  padding-inline: 0 !important;
  border-radius: 9px;
  background: #211f22;
  color: #ffffff;
  font-weight: 900;
}

.mini-action {
  width: 28px;
}

.mini-action.text-action {
  width: auto;
  padding-inline: 8px !important;
  color: #211f22;
  background: rgba(255, 255, 255, 0.8);
  font-size: 11px;
}

.sticker-sheet .mini-action {
  min-height: 28px !important;
  padding: 0 !important;
  padding-inline: 0 !important;
}

.feedback {
  margin: 0;
  color: #69626d;
  font-size: 11px;
  line-height: 1.45;
}

.sticker-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: start;
  gap: 8px;
  padding-bottom: 0;
}

.sticker-tile {
  display: grid;
  position: relative;
  align-content: start;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid transparent;
  text-align: left;
}

.manage-tile {
  cursor: pointer;
}

.manage-tile.selectable {
  cursor: cell;
}

.sticker-tile.selected,
.sticker-tile.checked {
  border-color: rgba(17, 17, 17, 0.14);
  box-shadow: 0 10px 24px rgba(17, 17, 17, 0.08);
}

.tile-check {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
}

.tile-check input {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.tile-check span {
  display: block;
  width: 18px;
  height: 18px;
  min-height: 0;
  border: 1.5px solid rgba(17, 17, 17, 0.2);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.92);
}

.tile-check input:checked + span {
  border-color: #111111;
  background: #111111;
}

.sticker-tile:disabled {
  cursor: default;
  opacity: 0.45;
}

.sticker-tile img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  object-fit: contain;
  background: transparent;
}

.sticker-tile > span {
  color: #39343a;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  min-height: 30px;
  overflow: hidden;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@container (max-width: 340px) {
  .group-action-grid,
  .batch-action-row {
    grid-template-columns: 1fr;
  }
}

.sticker-sheet-modal .sticker-grid {
  --modal-grid-width: min(calc(100vw - var(--safe-left) - var(--safe-right) - 44px), 424px);
  --modal-grid-column: calc((var(--modal-grid-width) - 24px) / 5);
  flex: 1 1 auto;
  min-height: 0;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  max-height: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
  -webkit-overflow-scrolling: touch;
}

.sticker-sheet-modal .empty-stickers {
  flex: 1 1 auto;
  min-height: 0;
}

.sticker-sheet-modal .sticker-tile {
  gap: 5px;
  padding: 6px;
  border-radius: 13px;
}

.sticker-sheet-modal .sticker-tile img {
  border-radius: 10px;
}

.sticker-sheet-modal .sticker-tile > span {
  min-height: 30px;
  font-size: 8px;
  line-height: 1.25;
  -webkit-line-clamp: 3;
}

.empty-stickers {
  place-items: center;
  min-height: 220px;
  color: #8e8890;
}

.empty-stickers strong {
  font-size: 18px;
  color: #4f4850;
}
</style>