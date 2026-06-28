<template>
  <section class="screen no-tabs favorites-page">
    <header class="top-bar favorites-topbar">
      <button class="favorites-title-button" type="button" aria-label="返回首页" @click="goBack">
        <ChevronLeft :size="21" />
        <h1 class="top-title">收藏</h1>
      </button>
      <span class="favorite-count">{{ favoriteItems.length }}</span>
    </header>

    <main class="favorites-main">
      <section v-if="!store.ready" class="empty-favorites-card">
        <LoaderCircle :size="18" class="spin" />
        <p>正在整理收藏...</p>
      </section>

      <section v-else-if="!favoriteItems.length" class="empty-favorites-card">
        <Bookmark :size="22" />
        <h2>还没有收藏</h2>
        <p>在聊天里长按消息气泡、图片、Stickers、转账或定位，点收藏后会出现在这里。</p>
      </section>

      <section v-else class="favorite-timeline" aria-label="收藏时间线">
        <article v-for="item in favoriteItems" :key="item.id" class="favorite-card" :class="`favorite-card--${item.kind}`">
          <header class="favorite-card-head">
            <img v-if="item.authorAvatar" class="favorite-avatar" :src="item.authorAvatar" :alt="item.authorName" />
            <span v-else class="favorite-avatar favorite-avatar--empty">{{ item.authorName.slice(0, 1) }}</span>
            <div>
              <strong>{{ item.authorName }}</strong>
              <span>{{ cardMeta(item) }}</span>
            </div>
            <button class="favorite-delete-button" type="button" aria-label="删除收藏" @click="deleteFavorite(item.id)">
              <Trash2 :size="16" />
            </button>
          </header>

          <figure v-if="item.message.image" class="favorite-image-card">
            <img v-if="item.message.image.url" :src="item.message.image.url" :alt="item.message.image.description" />
            <figcaption>{{ item.message.image.description }}</figcaption>
          </figure>

          <figure v-else-if="item.message.sticker" class="favorite-sticker-card">
            <img :src="item.message.sticker.imageUrl" :alt="item.message.sticker.description" />
            <figcaption>{{ item.message.sticker.description }}</figcaption>
          </figure>

          <section v-else-if="item.message.location" class="favorite-location-card">
            <MapPin :size="22" />
            <div>
              <strong>{{ item.message.location.name }}</strong>
              <span v-if="item.message.location.address">{{ item.message.location.address }}</span>
              <small>{{ item.message.location.distance }}</small>
            </div>
          </section>

          <section v-else-if="item.message.transfer" class="favorite-transfer-card">
            <span aria-hidden="true">¥</span>
            <div>
              <small>{{ transferStatusLabel(item) }}</small>
              <strong>¥{{ item.message.transfer.amount }}</strong>
              <em>{{ item.message.transfer.note || '无备注' }}</em>
            </div>
          </section>

          <section v-else-if="item.message.voice" class="favorite-voice-card">
            <Mic2 :size="18" />
            <div>
              <strong>{{ formatVoiceDuration(item.message.voice.duration) }}</strong>
              <p>{{ item.message.voice.transcript }}</p>
            </div>
          </section>

          <p v-else class="favorite-text" :class="{ narration: item.kind === 'narration' }">{{ item.summary }}</p>

          <footer class="favorite-card-foot">
            <span>{{ formatFavoriteTime(item.favoritedAt) }}</span>
            <button type="button" @click="openConversation(item)">查看聊天</button>
          </footer>
        </article>
      </section>
    </main>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Bookmark, ChevronLeft, LoaderCircle, MapPin, Mic2, Trash2 } from 'lucide-vue-next';
import { useAppStore } from '@/stores/appStore';
import type { FavoriteMessageRecord } from '@/types/domain';

const router = useRouter();
const store = useAppStore();

const favoriteItems = computed(() => store.sortedFavorites);

onMounted(() => {
  void store.hydrate();
});

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push({ name: 'home' });
}

function cardMeta(item: FavoriteMessageRecord) {
  const modeLabel = item.mode === 'offline' ? '线下 RP' : '线上聊天';
  const targetName = item.characterName || item.userName || 'LINK';
  return `${targetName} · ${modeLabel}`;
}

function transferStatusLabel(item: FavoriteMessageRecord) {
  const status = item.message.transfer?.status ?? 'pending';
  return ({ pending: '等待处理', accepted: '已接收', rejected: '已拒绝' } as const)[status];
}

function formatVoiceDuration(duration: number) {
  const seconds = Math.max(1, Math.round(Number(duration) || 1));
  return `${seconds}" 语音`;
}

function formatFavoriteTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(timestamp);
}

async function deleteFavorite(favoriteId: string) {
  await store.deleteFavorite(favoriteId);
}

function openConversation(item: FavoriteMessageRecord) {
  void router.push({
    name: item.mode === 'offline' ? 'offline-room' : 'chat-room',
    params: { id: item.conversationId },
    query: { focus: item.sourceMessageId }
  });
}
</script>

<style scoped>
.favorites-page {
  background: #f7f5f2;
}

.favorites-topbar {
  background: rgba(247, 245, 242, 0.92);
}

.favorites-title-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.favorite-count {
  display: inline-grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  background: #111111;
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
}

.favorites-main {
  padding: 12px 14px 26px;
}

.empty-favorites-card {
  display: grid;
  justify-items: center;
  gap: 8px;
  margin-top: 90px;
  padding: 26px 22px;
  border: 1px solid rgba(22, 22, 22, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.78);
  color: #85806f;
  text-align: center;
}

.empty-favorites-card h2,
.empty-favorites-card p {
  margin: 0;
}

.empty-favorites-card h2 {
  color: #151515;
  font-size: 18px;
}

.empty-favorites-card p {
  max-width: 260px;
  font-size: 13px;
  line-height: 1.55;
}

.favorite-timeline {
  display: grid;
  gap: 14px;
}

.favorite-card {
  overflow: hidden;
  border: 1px solid rgba(24, 22, 18, 0.07);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 24px rgba(34, 29, 20, 0.07);
}

.favorite-card-head {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 9px;
  padding: 10px 11px;
}

.favorite-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  background: #ece8e1;
}

.favorite-avatar--empty {
  display: grid;
  place-items: center;
  color: #6f6a5d;
  font-weight: 900;
}

.favorite-card-head strong,
.favorite-card-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorite-card-head strong {
  color: #161616;
  font-size: 14px;
}

.favorite-card-head span {
  margin-top: 2px;
  color: #8c887e;
  font-size: 12px;
}

.favorite-delete-button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #9b9589;
}

.favorite-delete-button:active {
  background: #f0ede7;
  color: #ef445a;
}

.favorite-image-card,
.favorite-sticker-card {
  margin: 0;
  background: #f1eee8;
}

.favorite-image-card img,
.favorite-sticker-card img {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: cover;
}

.favorite-sticker-card {
  display: grid;
  justify-items: center;
  padding: 20px 14px 12px;
}

.favorite-sticker-card img {
  width: min(58vw, 220px);
  height: min(58vw, 220px);
  object-fit: contain;
}

.favorite-image-card figcaption,
.favorite-sticker-card figcaption {
  padding: 10px 12px 0;
  color: #4f4b43;
  font-size: 13px;
  line-height: 1.5;
}

.favorite-location-card,
.favorite-transfer-card,
.favorite-voice-card,
.favorite-text {
  margin: 0 11px 4px;
  border-radius: 8px;
  background: #f4f1ec;
  color: #201f1d;
}

.favorite-location-card,
.favorite-transfer-card,
.favorite-voice-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 13px;
}

.favorite-location-card strong,
.favorite-location-card span,
.favorite-location-card small,
.favorite-transfer-card small,
.favorite-transfer-card strong,
.favorite-transfer-card em {
  display: block;
}

.favorite-location-card span,
.favorite-location-card small,
.favorite-transfer-card small,
.favorite-transfer-card em {
  margin-top: 4px;
  color: #7c776d;
  font-size: 12px;
  font-style: normal;
}

.favorite-transfer-card > span {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #111111;
  color: #ffffff;
  font-weight: 900;
}

.favorite-transfer-card strong {
  font-size: 22px;
}

.favorite-voice-card p {
  margin: 4px 0 0;
  color: #555047;
  line-height: 1.5;
}

.favorite-text {
  padding: 13px;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.favorite-text.narration {
  color: #706a60;
  font-style: italic;
}

.favorite-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 11px 11px;
  color: #928d82;
  font-size: 12px;
}

.favorite-card-foot button {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  background: #111111;
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
}

.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>