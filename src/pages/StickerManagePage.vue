<template>
  <section class="screen no-tabs sticker-manage-page">
    <header class="top-bar manage-topbar">
      <button class="manage-title-button" type="button" aria-label="返回 Stickers" @click="goBack">
        <h1 class="top-title">Sticker Manage</h1>
      </button>
    </header>

    <main class="manage-main">
      <section v-if="store.ready" class="manage-content">
        <header class="manage-hero">
          <div>
            <p>Sticker Manage</p>
            <h2>{{ activeTab === 'groups' ? '分组管理' : '贴纸图库' }}</h2>
          </div>
          <span class="counter-pill">{{ activeTab === 'groups' ? `${groups.length} 分组` : `已选 ${selectedStickerIds.length} / ${filteredStickers.length}` }}</span>
        </header>

        <section v-if="activeTab === 'groups'" class="card groups-card">
          <button class="add-group-button" type="button" @click="createGroup">
            <FolderPlus :size="18" stroke-width="2.3" />
            <span>添加分组</span>
          </button>

          <section v-if="groups.length" class="group-list">
            <article v-for="(group, groupIndex) in groups" :key="group.id" class="group-row">
              <input :value="groupDrafts[group.id] ?? group.name" aria-label="分组名称" @input="updateGroupDraft(group.id, ($event.target as HTMLInputElement).value)" />
              <span class="row-count">{{ countForGroup(group.id) }}</span>
              <div class="row-icons" aria-label="分组排序与删除">
                <button type="button" :disabled="groupIndex === 0" aria-label="上移分组" @click="moveGroup(group.id, 'up')">
                  <ArrowUp :size="16" />
                </button>
                <button type="button" :disabled="groupIndex === groups.length - 1" aria-label="下移分组" @click="moveGroup(group.id, 'down')">
                  <ArrowDown :size="16" />
                </button>
                <button class="danger" type="button" aria-label="删除分组" @click="deleteGroup(group.id)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </article>
          </section>
          <section v-else class="empty-card">暂无自定义分组。</section>
        </section>

        <section v-else class="card sticker-card">
          <nav class="group-tabs" aria-label="贴纸分组">
            <button
              v-for="group in groupTabs"
              :key="group.id"
              class="group-pill"
              :class="{ active: activeGroupId === group.id }"
              type="button"
              @click="setActiveGroup(group.id)"
            >
              <span>{{ group.name }}</span>
              <small>{{ group.count }}</small>
            </button>
          </nav>

          <section class="toolbar-row">
            <button type="button" :disabled="!filteredStickers.length" @click="toggleSelectAll">{{ allSelected ? '取消' : '全选' }}</button>
            <button class="danger" type="button" :disabled="!selectedStickerIds.length" @click="deleteSelected">删除</button>
            <select v-model="moveTargetGroupId" aria-label="移动到分组" :disabled="!groups.length">
              <option value="">移动到</option>
              <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
            <button type="button" :disabled="!selectedStickerIds.length || !moveTargetGroupId" @click="moveSelected">移动</button>
          </section>

          <section v-if="filteredStickers.length" class="sticker-list">
            <article v-for="sticker in filteredStickers" :key="sticker.id" class="sticker-row">
              <label class="select-box" aria-label="选择贴纸">
                <input :checked="selectedStickerIds.includes(sticker.id)" type="checkbox" @change="toggleSticker(sticker.id)" />
                <span></span>
              </label>
              <img :src="sticker.imageUrl" :alt="sticker.description" />
              <div class="sticker-fields">
                <input :value="stickerDrafts[sticker.id]?.description ?? sticker.description" aria-label="文字描述" @input="updateStickerDraft(sticker.id, 'description', ($event.target as HTMLInputElement).value)" />
                <div class="field-action-row">
                  <select :value="stickerDrafts[sticker.id]?.groupId ?? sticker.groupIds[0] ?? ''" aria-label="所属分组" @change="updateStickerDraft(sticker.id, 'groupId', ($event.target as HTMLSelectElement).value)">
                    <option value="">未分组</option>
                    <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
                  </select>
                  <button class="delete-row" type="button" aria-label="删除贴纸" @click="deleteSticker(sticker.id)">删除</button>
                </div>
              </div>
            </article>
          </section>
          <section v-else class="empty-card">当前分组暂无贴纸。</section>
        </section>

        <p v-if="feedback" class="feedback">{{ feedback }}</p>
      </section>
      <section v-else class="loading-card">正在整理贴纸管理台...</section>
    </main>

    <nav class="manage-tabs" aria-label="Sticker Manage tabs">
      <button type="button" :class="{ active: activeTab === 'groups' }" @click="activeTab = 'groups'">
        <Folder :size="24" stroke-width="2.2" />
        <span>分组</span>
      </button>
      <button type="button" :class="{ active: activeTab === 'stickers' }" @click="activeTab = 'stickers'">
        <ImagePlus :size="24" stroke-width="2.2" />
        <span>贴纸</span>
      </button>
    </nav>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowDown, ArrowUp, Folder, FolderPlus, ImagePlus, Trash2 } from 'lucide-vue-next';
import { useAppStore } from '@/stores/appStore';
import type { Sticker } from '@/types/domain';
import { RECENT_STICKER_GROUP_ID, RECENT_STICKER_GROUP_NAME } from '@/utils/stickers';

type ActiveTab = 'groups' | 'stickers';
type StickerDraftField = 'description' | 'groupId';

const router = useRouter();
const store = useAppStore();
const activeTab = ref<ActiveTab>('stickers');
const activeGroupId = ref(RECENT_STICKER_GROUP_ID);
const selectedStickerIds = ref<string[]>([]);
const moveTargetGroupId = ref('');
const groupDrafts = ref<Record<string, string>>({});
const stickerDrafts = ref<Record<string, { description: string; groupId: string }>>({});
const feedback = ref('');
const groupSaveTimers = new Map<string, number>();
const stickerSaveTimers = new Map<string, number>();

const groups = computed(() => store.sortedStickerGroups ?? []);
const allStickers = computed(() => store.sortedStickers ?? []);
const filteredStickers = computed(() => store.stickersForGroup(activeGroupId.value));
const groupTabs = computed(() => [{
    id: RECENT_STICKER_GROUP_ID,
    name: RECENT_STICKER_GROUP_NAME,
    count: store.recentStickers.length
  },
  ...groups.value.map((group) => ({
    id: group.id,
    name: group.name,
    count: countForGroup(group.id)
  }))]
);
const allSelected = computed(() => Boolean(filteredStickers.value.length) && filteredStickers.value.every((sticker) => selectedStickerIds.value.includes(sticker.id)));

onMounted(() => {
  void store.hydrate();
});

onBeforeUnmount(() => {
  groupSaveTimers.forEach((timer, groupId) => {
    window.clearTimeout(timer);
    void saveGroupDraft(groupId);
  });
  stickerSaveTimers.forEach((timer, stickerId) => {
    window.clearTimeout(timer);
    void saveStickerDraft(stickerId);
  });
});

watch(
  groups,
  (nextGroups) => {
    groupDrafts.value = Object.fromEntries(nextGroups.map((group) => [group.id, groupDrafts.value[group.id] ?? group.name]));
    if (activeGroupId.value !== RECENT_STICKER_GROUP_ID && !nextGroups.some((group) => group.id === activeGroupId.value)) activeGroupId.value = RECENT_STICKER_GROUP_ID;
    if (!nextGroups.some((group) => group.id === moveTargetGroupId.value)) moveTargetGroupId.value = '';
  },
  { immediate: true }
);

watch(
  filteredStickers,
  (nextStickers) => {
    const visibleIds = new Set(nextStickers.map((sticker) => sticker.id));
    selectedStickerIds.value = selectedStickerIds.value.filter((id) => visibleIds.has(id));
    stickerDrafts.value = Object.fromEntries(nextStickers.map((sticker) => [sticker.id, stickerDrafts.value[sticker.id] ?? createStickerDraft(sticker)]));
  },
  { immediate: true }
);

function goBack() {
  void router.push({ name: 'stickers' });
}

function countForGroup(groupId: string) {
  return allStickers.value.filter((sticker) => sticker.groupIds[0] === groupId).length;
}

function createStickerDraft(sticker: Sticker) {
  return {
    description: sticker.description,
    groupId: sticker.groupIds[0] ?? ''
  };
}

function setActiveGroup(groupId: string) {
  activeGroupId.value = groupId;
  selectedStickerIds.value = [];
  moveTargetGroupId.value = '';
  feedback.value = '';
}

async function createGroup() {
  const baseName = '新分组';
  const names = new Set([...groups.value.map((group) => group.name.trim().toLocaleLowerCase()), RECENT_STICKER_GROUP_NAME.toLocaleLowerCase()]);
  let name = baseName;
  for (let index = 2; names.has(name.toLocaleLowerCase()); index += 1) name = `${baseName} ${index}`;
  const group = await store.addStickerGroup(name);
  if (!group) return;
  groupDrafts.value = { ...groupDrafts.value, [group.id]: group.name };
  activeGroupId.value = group.id;
  activeTab.value = 'groups';
  feedback.value = `已添加分组“${group.name}”。`;
}

function updateGroupDraft(groupId: string, value: string) {
  groupDrafts.value = { ...groupDrafts.value, [groupId]: value };
  const existingTimer = groupSaveTimers.get(groupId);
  if (existingTimer) window.clearTimeout(existingTimer);
  groupSaveTimers.set(groupId, window.setTimeout(() => void saveGroupDraft(groupId), 500));
}

async function saveGroupDraft(groupId: string) {
  const group = groups.value.find((item) => item.id === groupId);
  const name = groupDrafts.value[groupId]?.trim() ?? '';
  if (!group || !name || name === group.name) return;
  await store.saveStickerGroup({ ...group, name });
  feedback.value = '分组已自动保存。';
}

async function moveGroup(groupId: string, direction: 'up' | 'down') {
  const moved = await store.moveStickerGroup(groupId, direction);
  if (moved) feedback.value = '分组顺序已更新。';
}

async function deleteGroup(groupId: string) {
  const group = groups.value.find((item) => item.id === groupId);
  if (!group || !window.confirm(`删除分组“${group.name}”？分组内贴纸会保留。`)) return;
  const deleted = await store.deleteStickerGroup(groupId);
  if (deleted) feedback.value = '分组已删除。';
}

function toggleSticker(stickerId: string) {
  selectedStickerIds.value = selectedStickerIds.value.includes(stickerId)
    ? selectedStickerIds.value.filter((id) => id !== stickerId)
    : [...selectedStickerIds.value, stickerId];
}

function toggleSelectAll() {
  selectedStickerIds.value = allSelected.value ? [] : filteredStickers.value.map((sticker) => sticker.id);
}

function updateStickerDraft(stickerId: string, field: StickerDraftField, value: string) {
  const sticker = allStickers.value.find((item) => item.id === stickerId);
  if (!sticker) return;
  const currentDraft = stickerDrafts.value[stickerId] ?? createStickerDraft(sticker);
  stickerDrafts.value = {
    ...stickerDrafts.value,
    [stickerId]: { ...currentDraft, [field]: value }
  };
  const existingTimer = stickerSaveTimers.get(stickerId);
  if (existingTimer) window.clearTimeout(existingTimer);
  stickerSaveTimers.set(stickerId, window.setTimeout(() => void saveStickerDraft(stickerId), field === 'groupId' ? 0 : 500));
}

async function saveStickerDraft(stickerId: string) {
  const sticker = allStickers.value.find((item) => item.id === stickerId);
  const draft = stickerDrafts.value[stickerId];
  if (!sticker || !draft) return;
  const description = draft.description.trim();
  if (!description) return;
  const groupIds = draft.groupId ? [draft.groupId] : sticker.groupIds;
  if (description === sticker.description && groupIds[0] === sticker.groupIds[0]) return;
  await store.saveSticker({ ...sticker, description, groupIds });
  feedback.value = '贴纸已自动保存。';
}

async function moveSelected() {
  if (!selectedStickerIds.value.length || !moveTargetGroupId.value) return;
  const movedCount = await store.moveStickersToGroup(selectedStickerIds.value, moveTargetGroupId.value);
  if (!movedCount) return;
  selectedStickerIds.value = [];
  feedback.value = `已移动 ${movedCount} 个贴纸。`;
}

async function deleteSelected() {
  const selectedCount = selectedStickerIds.value.length;
  if (!selectedCount || !window.confirm(`删除选中的 ${selectedCount} 个贴纸？`)) return;
  const deletedCount = await store.deleteStickers(selectedStickerIds.value);
  if (!deletedCount) return;
  selectedStickerIds.value = [];
  feedback.value = `已删除 ${deletedCount} 个贴纸。`;
}

async function deleteSticker(stickerId: string) {
  const sticker = allStickers.value.find((item) => item.id === stickerId);
  if (!sticker || !window.confirm(`删除贴纸“${sticker.description}”？`)) return;
  await store.deleteSticker(stickerId);
  selectedStickerIds.value = selectedStickerIds.value.filter((id) => id !== stickerId);
  feedback.value = '贴纸已删除。';
}
</script>

<style scoped>
.sticker-manage-page {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-bottom: 0;
  overflow-x: hidden;
  background:
    radial-gradient(circle at top left, rgba(6, 199, 85, 0.14), transparent 36%),
    linear-gradient(180deg, #fafcfb, #f4f6f5 56%, #eef2f1);
}

.manage-topbar {
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(18px);
}

.manage-title-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  flex: 0 1 auto;
  min-width: 0;
  margin-right: auto;
  padding: 0;
  color: inherit;
}

.manage-title-button .top-title {
  margin: 0;
  text-align: left;
}

.manage-main {
  flex: 1;
  min-width: 0;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 10px 16px 18px;
}

.manage-content {
  container-type: inline-size;
  display: grid;
  gap: 12px;
  min-width: 0;
  width: 100%;
  padding: 16px;
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 32px rgba(16, 24, 20, 0.06);
}

.manage-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.manage-hero p {
  margin: 0 0 4px;
  color: #7e8681;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.manage-hero h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #202421;
  font-size: 20px;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.counter-pill,
.row-count {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.06);
  color: #68716b;
  font-weight: 900;
  white-space: nowrap;
}

.counter-pill {
  align-self: start;
  justify-self: end;
  max-width: 128px;
  overflow: hidden;
  padding: 8px 12px;
  font-size: 12px;
  text-overflow: ellipsis;
}

.card {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 18px;
  background: rgba(250, 252, 251, 0.72);
}

.group-tabs {
  display: flex;
  gap: 6px;
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
  justify-content: center;
  gap: 6px;
  flex: 0 0 auto;
  max-width: min(210px, 70cqw);
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: #f0f3f1;
  color: #4f5752;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.group-pill.active {
  background: #111111;
  color: #ffffff;
}

.group-pill span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-pill small {
  flex: 0 0 auto;
  opacity: 0.72;
}

.toolbar-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
}

.toolbar-row button,
.toolbar-row select,
.add-group-button,
.group-row input,
.sticker-fields input,
.sticker-fields select,
.delete-row {
  min-width: 0;
  min-height: 36px;
  border-radius: 12px;
  background: #f0f3f1;
  color: #202421;
  padding: 0 10px;
  font-size: 13px;
  line-height: 1;
}

.toolbar-row button,
.add-group-button,
.delete-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  overflow: hidden;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-row select,
.sticker-fields select {
  width: 100%;
  text-overflow: ellipsis;
}

.toolbar-row button:disabled,
.toolbar-row select:disabled,
.group-row button:disabled {
  color: #a1a8a4;
  opacity: 0.58;
}

.danger,
.delete-row {
  color: #b03756 !important;
}

.sticker-list,
.group-list {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.sticker-row {
  display: grid;
  grid-template-columns: 26px 78px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.select-box {
  position: relative;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
}

.select-box input {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.select-box span {
  display: block;
  width: 22px;
  height: 22px;
  border: 2px solid rgba(17, 17, 17, 0.18);
  border-radius: 8px;
  background: #ffffff;
}

.select-box input:checked + span {
  border-color: #111111;
  background: #111111;
}

.sticker-row img {
  width: 78px;
  height: 78px;
  border-radius: 14px;
  object-fit: contain;
  background: #ffffff;
}

.sticker-fields {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.field-action-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px;
  gap: 6px;
  min-width: 0;
}

.sticker-fields input,
.sticker-fields select {
  width: 100%;
}

.group-row {
  display: grid;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.row-count {
  padding: 6px 10px;
  font-size: 11px;
}

.add-group-button {
  justify-self: start;
  max-width: 100%;
  padding-inline: 12px;
}

.group-row {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.row-icons {
  display: inline-grid;
  grid-template-columns: repeat(3, 34px);
  gap: 4px;
}

.row-icons button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: #f0f3f1;
  color: #202421;
}

.empty-card,
.loading-card {
  display: grid;
  place-items: center;
  min-height: 180px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  color: #747d78;
  font-size: 13px;
}

.feedback {
  margin: 0;
  padding: 0 2px;
  color: #126332;
  font-size: 12px;
  font-weight: 800;
}

.manage-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 8px calc(12px + var(--safe-right)) calc(10px + var(--safe-bottom)) calc(12px + var(--safe-left));
  border-top: 1px solid rgba(17, 17, 17, 0.05);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
}

.manage-tabs button {
  display: grid;
  justify-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 48px;
  padding: 6px 4px;
  border-radius: 14px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
}

.manage-tabs button.active {
  background: #eef8f1;
  color: #111111;
}

.manage-tabs svg {
  width: 20px;
  height: 20px;
}

.manage-tabs span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@container (min-width: 430px) {
  .card {
    padding: 14px;
  }

  .sticker-row {
    grid-template-columns: 30px 96px minmax(0, 1fr);
    gap: 12px;
  }

  .sticker-row img {
    width: 96px;
    height: 96px;
  }

  .field-action-row {
    grid-template-columns: minmax(0, 1fr) 72px;
    gap: 8px;
  }
}

@container (max-width: 330px) {
  .counter-pill {
    max-width: 100%;
  }

  .sticker-row {
    grid-template-columns: 24px 66px minmax(0, 1fr);
    gap: 8px;
  }

  .sticker-row img {
    width: 66px;
    height: 66px;
  }

  .field-action-row {
    grid-template-columns: minmax(0, 1fr) 50px;
  }

  .group-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .row-count {
    display: none;
  }
}

@media (max-width: 360px) {
  .manage-topbar {
    gap: 8px;
  }

  .manage-main {
    padding: 8px 10px 14px;
  }

  .manage-content {
    padding: 10px;
    border-radius: 18px;
  }
}

@media (pointer: coarse) {
  .toolbar-row button,
  .toolbar-row select,
  .add-group-button,
  .group-row input,
  .sticker-fields input,
  .sticker-fields select,
  .delete-row {
    font-size: var(--ios-control-font-size, 16px);
  }
}
</style>