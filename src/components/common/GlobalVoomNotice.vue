<template>
  <div v-if="activePost" class="voom-notice-backdrop" role="dialog" aria-modal="true" @click.self="closeVoomNotice">
    <section class="voom-notice-sheet">
      <button class="voom-notice-close" type="button" aria-label="关闭 VOOM 提醒" @click="closeVoomNotice">
        <X :size="18" />
      </button>
      <span>VOOM notice</span>
      <h2>{{ voomNoticeTitle }}</h2>
      <p class="voom-notice-body">{{ voomNoticeBody }}</p>
      <figure class="voom-notice-visual" :class="{ mock: !voomNoticeImage }">
        <img v-if="voomNoticeImage" :src="voomNoticeImage" :alt="voomNoticeImageDescription" />
        <figcaption v-else>{{ voomNoticeImageDescription }}</figcaption>
      </figure>
      <section v-if="voomNoticeComments.length" class="voom-notice-comments" aria-label="VOOM 全部评论">
        <p v-for="comment in voomNoticeComments" :key="comment.id">
          <strong>{{ comment.authorName }}</strong>
          <template v-if="voomNoticeReplyTargetName(comment.parentId)">
            <em>回复</em>
            <strong>{{ voomNoticeReplyTargetName(comment.parentId) }}</strong>
          </template>
          <span>{{ voomCommentDisplayContent(comment) }}</span>
        </p>
      </section>
      <section v-else class="voom-notice-comments empty" aria-label="VOOM 全部评论">
        <p><span>还没有评论</span></p>
      </section>
      <button type="button" @click="openVoomPage">去 VOOM 看看</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { X } from 'lucide-vue-next';
import { useAppStore } from '@/stores/appStore';
import { playRingtone } from '@/services/ringtone';
import type { VoomComment, VoomPost } from '@/types/domain';
import { formatContentWithChineseTranslation } from '@/utils/translation';
import { stripVoomCommentReplyPrefix } from '@/utils/voom';

const seenStorageKey = 'link:global-voom-notices:seen-posts';

const store = useAppStore();
const router = useRouter();
const activePost = ref<VoomPost | null>(null);
const seenPostIds = ref<Set<string>>(new Set());
const initialized = ref(false);

const characterVoomPosts = computed(() => store.sortedVoomPosts.filter((post) => post.authorType !== 'user'));
const voomNoticeTitle = computed(() => activePost.value ? `${activePost.value.authorName} 发布了 VOOM` : 'VOOM 有新动态');
const voomNoticeBody = computed(() => activePost.value ? formatContentWithChineseTranslation(activePost.value.content, activePost.value.contentTranslation) : '');
const voomNoticeImage = computed(() => activePost.value?.image?.trim() || '');
const voomNoticeImageDescription = computed(() => activePost.value?.imageDescription?.trim() || '配图描述暂未保存。');
const voomNoticeComments = computed(() => activePost.value?.comments ?? []);

function loadSeenPostIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(seenStorageKey) || '[]');
    seenPostIds.value = new Set(Array.isArray(parsed) ? parsed.map((id) => String(id)) : []);
  } catch {
    seenPostIds.value = new Set();
  }
}

function persistSeenPostIds() {
  localStorage.setItem(seenStorageKey, JSON.stringify([...seenPostIds.value]));
}

function markCurrentPostsSeen() {
  seenPostIds.value = new Set([...seenPostIds.value, ...characterVoomPosts.value.map((post) => post.id)]);
  persistSeenPostIds();
}

function showNextVoomNotice() {
  if (activePost.value) return;
  const nextPost = characterVoomPosts.value.find((post) => !seenPostIds.value.has(post.id));
  if (nextPost) {
    activePost.value = nextPost;
    void playRingtone(store.settings, 'voom', nextPost.charId);
  }
}

function closeVoomNotice() {
  if (activePost.value) {
    seenPostIds.value = new Set([...seenPostIds.value, activePost.value.id]);
    persistSeenPostIds();
  }
  activePost.value = null;
  showNextVoomNotice();
}

function openVoomPage() {
  closeVoomNotice();
  void router.push('/voom');
}

function voomNoticeReplyTargetName(parentId?: string) {
  if (!parentId) return '';
  return voomNoticeComments.value.find((comment) => comment.id === parentId)?.authorName ?? '';
}

function voomCommentDisplayContent(comment: VoomComment) {
  const targetName = voomNoticeReplyTargetName(comment.parentId);
  return formatContentWithChineseTranslation(
    stripVoomCommentReplyPrefix(comment.content, targetName),
    comment.contentTranslation ? stripVoomCommentReplyPrefix(comment.contentTranslation, targetName) : comment.contentTranslation
  );
}

watch(
  () => [store.ready, characterVoomPosts.value.map((post) => post.id).join('|')],
  ([ready]) => {
    if (!ready) return;
    if (!initialized.value) {
      loadSeenPostIds();
      markCurrentPostsSeen();
      initialized.value = true;
      return;
    }
    showNextVoomNotice();
  },
  { immediate: true }
);
</script>

<style scoped>
.voom-notice-backdrop {
  position: fixed;
  inset: 0;
  z-index: 75;
  display: grid;
  place-items: end center;
  padding: 18px calc(14px + var(--safe-right)) calc(18px + var(--safe-bottom)) calc(14px + var(--safe-left));
  background: rgba(37, 34, 38, 0.22);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}

.voom-notice-sheet {
  position: relative;
  display: grid;
  gap: 8px;
  width: min(100%, 440px);
  max-height: min(82vh, 640px);
  overflow-y: auto;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 64px rgba(49, 35, 46, 0.2);
}

.voom-notice-close {
  position: absolute;
  top: 10px;
  right: 10px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: transparent;
  color: #302a30;
}

.voom-notice-sheet > span {
  color: #b28b99;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.voom-notice-sheet h2 {
  margin: 0;
  padding-right: 34px;
  color: #211d21;
  font-size: 18px;
  font-weight: 900;
  line-height: 1.25;
}

.voom-notice-body {
  max-height: 180px;
  margin: 0;
  overflow-y: auto;
  color: #4d454c;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.voom-notice-visual {
  width: min(56vw, 216px);
  max-width: 100%;
  margin: 2px 0 4px;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 8px;
  background: #eff1f3;
}

.voom-notice-visual img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.voom-notice-visual.mock {
  display: grid;
  place-items: center;
  padding: 16px;
  border: 1px solid #eef0f2;
  background: #ffffff;
}

.voom-notice-visual figcaption {
  margin: 0;
  color: #222222;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.55;
  text-align: center;
  white-space: pre-wrap;
}

.voom-notice-comments {
  display: grid;
  gap: 7px;
  padding: 10px;
  border-radius: 8px;
  background: rgba(38, 33, 38, 0.04);
}

.voom-notice-comments p {
  margin: 0;
  color: #4d454c;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.voom-notice-comments strong {
  margin-right: 4px;
  color: #211d21;
  font-weight: 900;
}

.voom-notice-comments em {
  margin-right: 4px;
  color: #9b8f97;
  font-style: normal;
  font-weight: 800;
}

.voom-notice-comments.empty p {
  color: #91878f;
  font-weight: 800;
}

.voom-notice-sheet > button:last-child {
  min-height: 38px;
  border-radius: 8px;
  background: #262126;
  color: #ffffff;
  font-size: 13px;
  font-weight: 900;
}
</style>