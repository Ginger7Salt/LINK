<template>
  <article class="voom-post">
    <header>
      <div class="author-row">
        <img class="avatar" :src="post.authorAvatar" :alt="resolvedAuthorName" />
        <div>
          <strong>{{ resolvedAuthorName }}</strong>
          <time>{{ formatRelativeDate(post.createdAt) }}</time>
        </div>
      </div>
      <div class="header-actions">
        <button
          class="header-action"
          type="button"
          :aria-label="replyingThread ? '正在生成评论回复' : 'AI 回复评论区'"
          :title="replyingThread ? '正在生成评论回复' : 'AI 回复评论区'"
          :disabled="replyingThread"
          @click="emit('reply-thread', post.id)"
        >
          <LoaderCircle v-if="replyingThread" class="loading-icon" :size="18" />
          <BotMessageSquare v-else :size="18" />
        </button>
        <button class="header-action delete-action" type="button" aria-label="删除 VOOM 动态" title="删除 VOOM 动态" @click="emit('delete-post', post.id)">
          <X :size="18" />
        </button>
      </div>
    </header>
    <p>{{ postDisplayContent }}</p>
    <figure class="post-visual" :class="{ mock: !post.image || isBrokenImageSource(post.image) }" :style="visualStyle" @click="openVisualModal">
      <img v-if="post.image && !isBrokenImageSource(post.image)" :src="post.image" :alt="post.imageDescription || post.content" @error="markBrokenImageSource(post.image)" />
      <figcaption v-else>{{ visualDescription }}</figcaption>
    </figure>
    <footer>
      <span v-if="post.likes.length" ref="likeSummaryRef" class="likes-summary">{{ displayedLikeSummary }}</span>
      <span v-else class="likes-summary">还没有点赞</span>
      <span v-if="post.likes.length" ref="likeMeasureRef" class="likes-measure" aria-hidden="true">{{ fullLikeSummary }}</span>
      <div class="post-actions">
        <button class="action-button" :class="{ active: likedByMe }" type="button" aria-label="点赞" @click="emit('toggle-like', post.id)">
          <Heart :size="17" />
        </button>
        <button class="action-button" type="button" aria-label="评论" @click="openCommentComposer()">
          <MessageCircle :size="17" />
        </button>
      </div>
    </footer>
    <div v-if="post.comments.length" class="comments">
      <p v-for="comment in post.comments" :key="comment.id">
        <button class="comment-line" type="button" @click="openCommentComposer(comment.id)">
          <strong>{{ comment.authorName }}</strong>
          <template v-if="replyTargetName(comment.parentId)">
            <em>回复</em>
            <strong>{{ replyTargetName(comment.parentId) }}</strong>
          </template>
          <span>{{ commentDisplayContent(comment) }}</span>
        </button>
      </p>
    </div>
    <form v-if="showComposer" ref="composerRef" class="comment-composer" @submit.prevent="submitComment">
      <input v-model="commentDraft" :placeholder="commentPlaceholder" />
      <button type="submit" :disabled="!commentDraft.trim()">发送</button>
    </form>

    <AppModal v-model="showVisualModal" title="VOOM 配图" variant="ins">
      <section class="visual-viewer" :class="{ flipped: visualFlipped }" :style="visualStyle">
        <button class="visual-flip-card" type="button" @click="toggleVisualFlip">
          <span class="visual-face visual-image-face">
            <img v-if="modalImageSrc && !isBrokenImageSource(modalImageSrc)" :src="modalImageSrc" :alt="selectedVisualDescription" @error="markBrokenImageSource(modalImageSrc)" />
            <span v-else>{{ selectedVisualDescription }}</span>
          </span>
          <span class="visual-face visual-text-face">
            <span>{{ descriptionDraft || selectedVisualDescription }}</span>
          </span>
        </button>

        <div v-if="visualCandidates.length" class="visual-history" aria-label="VOOM 配图历史">
          <button
            v-for="(candidate, index) in visualCandidates"
            :key="candidate.id"
            class="visual-thumb"
            :class="{ active: candidate.id === selectedCandidateId }"
            type="button"
            :aria-label="`查看配图 ${index + 1}`"
            @click="selectCandidate(candidate.id)"
          >
            <img :src="candidate.image" :alt="candidate.description || 'VOOM 配图'" @error="markBrokenImageSource(candidate.image)" />
          </button>
        </div>

        <label v-if="canRegenerateImage" class="visual-description-field">
          <span>Description</span>
          <textarea v-model="descriptionDraft" maxlength="500" placeholder="修改配图描述后重新生成。"></textarea>
        </label>

        <div class="visual-actions">
          <button class="visual-secondary" type="button" @click="toggleVisualFlip">翻转</button>
          <button v-if="visualCandidates.length" class="visual-secondary" type="button" :disabled="regeneratingImage || !canApplySelectedCandidate" @click="applySelectedCandidate">应用</button>
          <button
            v-if="canRegenerateImage"
            class="visual-primary"
            type="button"
            :class="{ busy: regeneratingImage }"
            :aria-disabled="regeneratingImage"
            :disabled="regeneratingImage || !descriptionDraft.trim()"
            @click="regenerateImage"
          >
            <LoaderCircle v-if="regeneratingImage" class="loading-icon" :size="15" />
            <span>{{ regeneratingImage ? '生成中' : '重新生成' }}</span>
          </button>
        </div>
      </section>
    </AppModal>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { BotMessageSquare, Heart, LoaderCircle, MessageCircle, X } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import type { VoomPost } from '@/types/domain';
import { formatRelativeDate } from '@/utils/time';
import { formatContentWithChineseTranslation } from '@/utils/translation';

const props = defineProps<{
  post: VoomPost;
  authorName?: string;
  currentUserName?: string;
  canRegenerateImage?: boolean;
  regeneratingImage?: boolean;
  replyingThread?: boolean;
}>();

const emit = defineEmits<{
  'toggle-like': [postId: string];
  comment: [postId: string, content: string, parentId?: string];
  'reply-thread': [postId: string];
  'regenerate-image': [postId: string, description: string];
  'apply-image': [postId: string, candidateId: string];
  'busy-action': [message: string, title: string];
  'delete-post': [postId: string];
}>();

const showComposer = ref(false);
const commentDraft = ref('');
const replyParentId = ref('');
const showVisualModal = ref(false);
const visualFlipped = ref(false);
const descriptionDraft = ref('');
const selectedCandidateId = ref('');
const brokenImageSources = ref<string[]>([]);
const lastCandidateCount = ref(0);
const busyReminderShown = ref(false);
const composerRef = ref<HTMLElement | null>(null);
const likeSummaryRef = ref<HTMLElement | null>(null);
const likeMeasureRef = ref<HTMLElement | null>(null);
const compactLikeSummary = ref(false);
let likeResizeObserver: ResizeObserver | undefined;
let likeMeasureFrame = 0;

const resolvedAuthorName = computed(() => props.authorName || props.post.authorName);
const likedByMe = computed(() => Boolean(props.currentUserName && props.post.likes.includes(props.currentUserName)));
const replyTarget = computed(() => props.post.comments.find((comment) => comment.id === replyParentId.value));
const commentPlaceholder = computed(() => replyTarget.value ? `回复 ${replyTarget.value.authorName}` : '评论这条 VOOM');
const visualDescription = computed(() => props.post.imageDescription || '配图描述暂未保存。');
const visualCandidates = computed(() => {
  const candidates = [...(props.post.imageCandidates ?? [])].filter((candidate) => candidate.image && candidate.image !== '/load.jpg' && !isBrokenImageSource(candidate.image));
  if (props.post.image && props.post.image !== '/load.jpg' && !candidates.some((candidate) => candidate.image === props.post.image)) {
    candidates.unshift({
      id: `${props.post.id}-current-image`,
      image: props.post.image,
      description: props.post.imageDescription || props.post.content,
      provider: props.post.imageProvider || 'local',
      createdAt: props.post.createdAt
    });
  }
  return candidates;
});
const selectedCandidate = computed(() => visualCandidates.value.find((candidate) => candidate.id === selectedCandidateId.value) ?? visualCandidates.value.find((candidate) => candidate.image === props.post.image));
const selectedVisualDescription = computed(() => selectedCandidate.value?.description || visualDescription.value);
const modalImageSrc = computed(() => props.post.image === '/load.jpg' ? '/load.jpg' : selectedCandidate.value?.image || props.post.image || '/load.jpg');
const canApplySelectedCandidate = computed(() => Boolean(selectedCandidate.value && selectedCandidate.value.image !== props.post.image && !selectedCandidate.value.id.endsWith('-current-image')));
const visualAspectRatio = computed(() => {
  const size = selectedCandidate.value?.size || props.post.imageCandidates?.find((candidate) => candidate.image === props.post.image)?.size || '';
  const [width, height] = size.split('x').map((value) => Number.parseInt(value, 10));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? `${width} / ${height}` : '1 / 1';
});
const visualStyle = computed(() => ({ '--voom-image-ratio': visualAspectRatio.value }));
const postDisplayContent = computed(() => formatContentWithChineseTranslation(props.post.content, props.post.contentTranslation));
const fullLikeSummary = computed(() => props.post.likes.length ? `${props.post.likes.join('、')} 赞了` : '还没有点赞');
const shortLikeSummary = computed(() => {
  const firstLike = props.post.likes[0];
  if (!firstLike) return '还没有点赞';
  return props.post.likes.length > 1 ? `${firstLike} 等${props.post.likes.length}人赞过` : `${firstLike} 赞过`;
});
const displayedLikeSummary = computed(() => compactLikeSummary.value ? shortLikeSummary.value : fullLikeSummary.value);

function commentDisplayContent(comment: VoomPost['comments'][number]) {
  return formatContentWithChineseTranslation(comment.content, comment.contentTranslation);
}

function openCommentComposer(parentId = '') {
  replyParentId.value = parentId;
  showComposer.value = true;
  window.setTimeout(() => {
    document.addEventListener('pointerdown', handleOutsidePointerDown);
  });
}

function openVisualModal() {
  descriptionDraft.value = visualDescription.value;
  lastCandidateCount.value = visualCandidates.value.length;
  selectedCandidateId.value = visualCandidates.value.find((candidate) => candidate.image === props.post.image)?.id ?? visualCandidates.value[0]?.id ?? '';
  visualFlipped.value = !props.post.image;
  showVisualModal.value = true;
}

function selectCandidate(candidateId: string) {
  selectedCandidateId.value = candidateId;
  visualFlipped.value = false;
}

function applySelectedCandidate() {
  if (props.regeneratingImage) {
    emit('busy-action', '正在重新生成 VOOM 配图，请等待当前生成完成。', '正在生成');
    return;
  }
  if (!selectedCandidate.value || !canApplySelectedCandidate.value) return;
  emit('apply-image', props.post.id, selectedCandidate.value.id);
}

function toggleVisualFlip() {
  visualFlipped.value = !visualFlipped.value;
}

function isBrokenImageSource(source: string | undefined) {
  return Boolean(source && brokenImageSources.value.includes(source));
}

function markBrokenImageSource(source: string | undefined) {
  if (!source || brokenImageSources.value.includes(source)) return;
  brokenImageSources.value = [...brokenImageSources.value, source];
}

function regenerateImage() {
  const description = descriptionDraft.value.trim();
  if (props.regeneratingImage) {
    if (!busyReminderShown.value) {
      busyReminderShown.value = true;
      emit('busy-action', '正在重新生成 VOOM 配图，请等待当前生成完成。', '正在生成');
    }
    return;
  }
  if (!description) return;
  emit('regenerate-image', props.post.id, description);
  visualFlipped.value = false;
}

watch(() => props.regeneratingImage, (isRegenerating) => {
  if (!isRegenerating) busyReminderShown.value = false;
});

function submitComment() {
  const content = commentDraft.value.trim();
  if (!content) return;
  emit('comment', props.post.id, content, replyParentId.value || undefined);
  commentDraft.value = '';
  replyParentId.value = '';
  showComposer.value = false;
  removeOutsideListener();
}

function replyTargetName(parentId?: string) {
  if (!parentId) return '';
  return props.post.comments.find((comment) => comment.id === parentId)?.authorName ?? '';
}

function closeCommentComposer() {
  showComposer.value = false;
  replyParentId.value = '';
  removeOutsideListener();
}

function handleOutsidePointerDown(event: PointerEvent) {
  const target = event.target;
  if (target instanceof Node && composerRef.value?.contains(target)) return;
  closeCommentComposer();
}

function removeOutsideListener() {
  document.removeEventListener('pointerdown', handleOutsidePointerDown);
}

function scheduleLikeSummaryMeasure() {
  if (likeMeasureFrame) window.cancelAnimationFrame(likeMeasureFrame);
  likeMeasureFrame = window.requestAnimationFrame(() => {
    likeMeasureFrame = 0;
    void nextTick(updateLikeSummaryMode);
  });
}

function updateLikeSummaryMode() {
  const summaryEl = likeSummaryRef.value;
  const measureEl = likeMeasureRef.value;
  if (!summaryEl || !measureEl || !props.post.likes.length) {
    compactLikeSummary.value = false;
    return;
  }

  compactLikeSummary.value = measureEl.scrollWidth > summaryEl.clientWidth;
}

watch(fullLikeSummary, scheduleLikeSummaryMeasure, { immediate: true });

watch(() => visualCandidates.value.length, (count, previousCount) => {
  if (!showVisualModal.value) {
    lastCandidateCount.value = count;
    return;
  }
  if (count > previousCount && count > lastCandidateCount.value) {
    selectedCandidateId.value = visualCandidates.value[count - 1]?.id ?? selectedCandidateId.value;
    visualFlipped.value = false;
  }
  lastCandidateCount.value = count;
});
watch(() => props.post.image, () => {
  if (!showVisualModal.value) return;
  selectedCandidateId.value = visualCandidates.value.find((candidate) => candidate.image === props.post.image)?.id ?? '';
  visualFlipped.value = false;
});

onMounted(() => {
  if (likeSummaryRef.value) {
    likeResizeObserver = new ResizeObserver(scheduleLikeSummaryMeasure);
    likeResizeObserver.observe(likeSummaryRef.value);
  }
  scheduleLikeSummaryMeasure();
});

onBeforeUnmount(() => {
  removeOutsideListener();
  if (likeMeasureFrame) window.cancelAnimationFrame(likeMeasureFrame);
  likeResizeObserver?.disconnect();
});
</script>

<style scoped>
.voom-post {
  padding: 14px 16px;
  background: #ffffff;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.author-row div {
  display: grid;
  gap: 2px;
}

.author-row strong {
  font-size: 15px;
}

.header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.header-action,
.action-button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: transparent;
  color: #4b4f55;
}

.header-action:active,
.action-button:active {
  background: transparent;
  color: var(--link-green);
}

.header-action:disabled {
  color: var(--link-green);
  cursor: progress;
}

.delete-action {
  color: #8b929a;
}

.delete-action:active {
  color: var(--danger);
}

.loading-icon {
  animation: voom-spin 0.8s linear infinite;
}

@keyframes voom-spin {
  to {
    transform: rotate(360deg);
  }
}

.action-button.active {
  background: transparent;
  color: var(--link-green);
}

time {
  color: var(--muted);
  font-size: 11px;
}

.voom-post > p {
  margin: 10px 0;
  color: #171717;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.post-visual {
  position: relative;
  width: min(56vw, 216px);
  max-width: 100%;
  margin: 10px 0 12px;
  aspect-ratio: var(--voom-image-ratio, 1 / 1);
  overflow: hidden;
  border-radius: 18px;
  background: #eff1f3;
  cursor: zoom-in;
}

.post-visual img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.post-visual.mock {
  display: grid;
  place-items: center;
  padding: 18px;
  border: 1px solid #eef0f2;
  background: #ffffff;
}

.post-visual figcaption {
  max-width: 100%;
  margin: 0;
  padding: 0;
  color: #222222;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
  text-align: center;
}

.visual-viewer {
  display: grid;
  gap: 12px;
}

.visual-flip-card {
  position: relative;
  width: 100%;
  aspect-ratio: var(--voom-image-ratio, 1 / 1);
  padding: 0;
  border-radius: 18px;
  background: transparent;
  perspective: 1000px;
}

.visual-history {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.visual-thumb {
  flex: 0 0 54px;
  width: 54px;
  height: 54px;
  padding: 2px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: #f1f3f5;
}

.visual-thumb.active {
  border-color: #171717;
  background: #ffffff;
}

.visual-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 7px;
  object-fit: cover;
}

.visual-face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid #edf0f2;
  border-radius: 18px;
  background: #ffffff;
  backface-visibility: hidden;
  transition: transform 0.28s ease;
}

.visual-image-face {
  transform: rotateY(0deg);
}

.visual-text-face {
  padding: 20px;
  transform: rotateY(180deg);
  color: #222222;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.65;
  text-align: center;
  white-space: pre-wrap;
}

.visual-viewer.flipped .visual-image-face {
  transform: rotateY(180deg);
}

.visual-viewer.flipped .visual-text-face {
  transform: rotateY(360deg);
}

.visual-image-face img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #f4f5f6;
}

.visual-description-field {
  display: grid;
  gap: 6px;
}

.visual-description-field > span {
  color: #686b70;
  font-size: 12px;
  font-weight: 900;
}

.visual-description-field textarea {
  min-height: 86px;
  padding: 10px;
  border: 1px solid #edf0f2;
  border-radius: 8px;
  background: #ffffff;
  color: #171717;
  line-height: 1.55;
  resize: vertical;
}

.visual-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 10px;
}

.visual-actions:has(.visual-secondary:only-child) {
  grid-template-columns: 1fr;
}

.visual-secondary,
.visual-primary {
  display: inline-grid;
  grid-auto-flow: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  border-radius: 8px;
  font-weight: 900;
}

.visual-secondary {
  background: #f1f3f5;
  color: #4f555c;
}

.visual-primary {
  background: #171717;
  color: #ffffff;
}

.visual-primary:disabled,
.visual-primary.busy {
  cursor: progress;
  opacity: 0.68;
}

footer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 12px;
}

.likes-summary {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.likes-measure {
  position: absolute;
  left: 0;
  bottom: 0;
  max-width: none;
  overflow: hidden;
  visibility: hidden;
  white-space: nowrap;
  pointer-events: none;
}

.post-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.post-actions svg,
.header-action svg {
  width: 16px;
  height: 16px;
}

.comments {
  display: grid;
  gap: 3px;
  margin-top: 8px;
  padding: 8px;
  border-radius: 8px;
  background: var(--soft);
}

.comments p {
  margin: 0;
  color: #4b4f55;
  font-size: 12px;
  line-height: 1.45;
}

.comment-line {
  display: inline;
  padding: 0;
  color: inherit;
  text-align: left;
}

.comment-line strong {
  margin-right: 4px;
  color: #30343a;
}

.comment-line em {
  margin-right: 4px;
  color: #7b8087;
  font-style: normal;
}

.comment-composer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.comment-composer input {
  height: 34px;
  padding: 0 11px;
  border-radius: 8px;
  background: var(--soft);
  color: #222222;
}

.comment-composer button {
  flex: 0 0 auto;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--link-green);
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
}

.comment-composer button:disabled {
  background: #d6d8db;
}
</style>