<template>
  <section class="screen home-page">
    <header class="top-bar">
      <div></div>
      <div class="icon-row">
        <button class="icon-button" type="button" aria-label="收藏">
          <Bookmark :size="24" />
        </button>
        <button class="icon-button" type="button" aria-label="通知">
          <Bell :size="24" />
        </button>
        <button class="icon-button" type="button" aria-label="添加好友" @click="openAddFriendPage">
          <UserPlus :size="24" />
        </button>
        <button class="icon-button" type="button" aria-label="设置" @click="openSettingsPage">
          <Settings :size="24" />
        </button>
      </div>
    </header>

    <div class="home-content">
      <UserProfilePanel :user="store.user" @open="openProfilePage" />

      <label class="search-box">
        <Search :size="21" />
        <input placeholder="Search" />
        <ScanLine :size="21" />
      </label>

      <ServiceGrid :open-stickers="openStickers" :open-world-books="openWorldBookPage" :open-all="openServicesPage" />

      <section>
        <div class="section-heading">
          <span>Groups</span>
          <ChevronUp :size="18" class="muted" />
        </div>
        <div class="list-row">
          <div class="round-icon"><UsersRound :size="26" /></div>
          <div class="row-main">
            <div class="row-title">Create a group</div>
            <div class="row-subtitle">Gather your friends in a group chat.</div>
          </div>
        </div>
      </section>

      <section>
        <div class="section-heading">
          <span>Friends {{ friendRows.length }}</span>
          <ChevronUp :size="18" class="muted" />
        </div>
        <button v-for="row in friendRows" :key="row.character.id" class="list-row friend-row" type="button" @click="openCharacterChat(row.conversation.id)">
          <img class="avatar" :src="row.character.avatar" :alt="getCharacterDisplayName(row.character)" />
          <div class="row-main">
            <div class="row-title">{{ getCharacterDisplayName(row.character) }}</div>
            <div class="row-subtitle">{{ row.character.signature }}</div>
          </div>
          <i v-if="row.conversation.unreadCount" class="friend-unread" aria-hidden="true"></i>
        </button>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Bell, Bookmark, ChevronUp, ScanLine, Search, Settings, UserPlus, UsersRound } from 'lucide-vue-next';
import ServiceGrid from '@/components/home/ServiceGrid.vue';
import UserProfilePanel from '@/components/home/UserProfilePanel.vue';
import { useAppStore } from '@/stores/appStore';
import { getCharacterDisplayName } from '@/utils/character';

const store = useAppStore();
const router = useRouter();
const friendRows = computed(() =>
  store.charactersForActiveUser.flatMap((character) => {
    const conversation = store.conversationsForActiveUser.find((item) => item.charId === character.id);
    if (!conversation) return [];
    return [{ character, conversation }];
  })
);

function openCharacterChat(conversationId: string) {
  void router.push({ name: 'chat-room', params: { id: conversationId } });
}

function openProfilePage() {
  void router.push({ name: 'account' });
}

function openSettingsPage() {
  void router.push({ name: 'settings' });
}

function openServicesPage() {
  void router.push({ name: 'services' });
}

function openStickers() {
  void router.push({ name: 'stickers' });
}

function openWorldBookPage() {
  void router.push({ name: 'world-book' });
}

function openAddFriendPage() {
  void router.push({ name: 'add-friend', query: { from: 'home' } });
}
</script>

<style scoped>
.home-page {
  background: #ffffff;
}

.home-content {
  font-size: 13px;
}

.home-content :deep(.profile-panel) {
  gap: 10px;
  padding: 12px 16px 10px;
}

.home-content :deep(.profile-panel h1) {
  font-size: 20px;
}

.home-content :deep(.profile-panel p) {
  margin: 3px 0 5px;
  font-size: 12px;
}

.home-content :deep(.profile-avatar) {
  width: 54px;
  height: 54px;
}

.home-content .search-box {
  gap: 6px;
  height: 34px;
  margin: 2px 16px 8px;
  padding: 0 10px;
  font-size: 13px;
}

.home-content .search-box svg {
  width: 16px;
  height: 16px;
}

.home-content :deep(.section-heading) {
  padding: 11px 16px 6px;
  font-size: 13px;
}

.home-content :deep(.section-heading svg) {
  width: 16px;
  height: 16px;
}

.home-content :deep(.see-all) {
  font-size: 12px;
}

.home-content :deep(.service-grid) {
  gap: 4px;
  padding: 2px 12px 16px;
}

.home-content :deep(.service-item) {
  gap: 5px;
  min-height: 56px;
  font-size: 10px;
}

.home-content :deep(.service-item svg) {
  width: 24px;
  height: 24px;
}

.home-content :deep(.list-row) {
  gap: 9px;
  min-height: 56px;
  padding: 6px 16px;
}

.home-content :deep(.avatar) {
  width: 40px;
  height: 40px;
}

.home-content :deep(.row-title) {
  font-size: 14px;
}

.home-content :deep(.row-subtitle) {
  margin-top: 2px;
  font-size: 12px;
}

.round-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--link-green);
  color: #ffffff;
}

.round-icon svg {
  width: 20px;
  height: 20px;
}

.friend-row {
  width: 100%;
  text-align: left;
}

.friend-unread {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-left: auto;
  border-radius: 50%;
  background: #ff405a;
}
</style>