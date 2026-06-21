<template>
  <section class="screen no-tabs image-gallery-page">
    <header class="top-bar image-gallery-topbar">
      <button class="image-gallery-title-button" type="button" aria-label="返回图片设置" @click="goBack">
        <h1 class="top-title">{{ activeMeta.galleryTitle }}</h1>
      </button>
    </header>

    <main class="image-gallery-main">
      <section class="image-gallery-panel">
        <div class="gallery-summary">
          <div>
            <p class="section-kicker">Gallery</p>
            <h2>{{ activeMeta.title }}</h2>
          </div>
          <span>{{ galleryImages.length }} 张图片</span>
        </div>

        <section v-if="galleryImages.length" class="gallery-grid">
          <article v-for="image in galleryImages" :key="image.id" class="gallery-card">
            <button class="gallery-image-button" :class="{ broken: isBrokenGalleryImage(image) }" type="button" @click="openOriginal(image)">
              <img v-if="!isBrokenGalleryImage(image)" class="gallery-image" :src="image.imageUrl" :alt="image.title || activeMeta.title" loading="lazy" @error="markBrokenGalleryImage(image)" />
              <span v-else class="gallery-image-fallback">{{ galleryFallbackText(image) }}</span>
            </button>

            <div class="gallery-copy">
              <div>
                <strong>{{ image.title || sourceLabel(image.source) }}</strong>
                <small>{{ formatGalleryTime(image.createdAt) }} · {{ image.model || '未记录模型' }}</small>
              </div>
              <p>{{ image.prompt || '未记录提示词' }}</p>
            </div>

            <div class="gallery-actions">
              <button class="gallery-action" type="button" @click="openOriginal(image)">查看</button>
              <button class="gallery-action" type="button" @click="saveImage(image)">保存</button>
              <button v-if="isBrokenGalleryImage(image) && canRepairImage(image)" class="gallery-action" type="button" :disabled="repairingImageIds.includes(image.id)" @click="repairImage(image)">{{ repairingImageIds.includes(image.id) ? '修复中' : '修复' }}</button>
              <button class="gallery-action danger" type="button" @click="deleteImage(image.id)">删除</button>
            </div>
          </article>
        </section>

        <section v-else class="empty-gallery">
          <strong>还没有图片</strong>
          <p>使用 {{ activeMeta.title }} 生成的图片会自动出现在这里。</p>
        </section>
      </section>
    </main>

    <AppModal v-model="showOriginal" title="查看" variant="ins">
      <section v-if="activeImage" class="original-sheet">
        <div class="original-frame" :class="{ broken: isBrokenGalleryImage(activeImage) }">
          <img v-if="!isBrokenGalleryImage(activeImage)" class="original-image" :src="activeImage.imageUrl" :alt="activeImage.title || activeMeta.title" @error="markBrokenGalleryImage(activeImage)" />
          <span v-else class="original-fallback">{{ galleryFallbackText(activeImage) }}</span>
        </div>
        <div class="original-actions">
          <button class="gallery-action" type="button" @click="saveImage(activeImage)">保存</button>
          <button v-if="isBrokenGalleryImage(activeImage) && canRepairImage(activeImage)" class="gallery-action" type="button" :disabled="repairingImageIds.includes(activeImage.id)" @click="repairImage(activeImage)">{{ repairingImageIds.includes(activeImage.id) ? '修复中' : '修复图片' }}</button>
          <button class="gallery-action danger" type="button" @click="deleteActiveImage">删除</button>
        </div>
      </section>
    </AppModal>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppModal from '@/components/common/AppModal.vue';
import { useAppStore } from '@/stores/appStore';
import type { GeneratedImageRecord, ImageModuleId } from '@/types/domain';

const moduleMetas = [
  { id: 'openai' as ImageModuleId, title: 'OpenAI', galleryTitle: 'OpenAI Gallery' },
  { id: 'novelai' as ImageModuleId, title: 'NovelAI', galleryTitle: 'NovelAI Gallery' },
  { id: 'pollinations' as ImageModuleId, title: 'Pollinations', galleryTitle: 'Pollinations Gallery' }
];

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const showOriginal = ref(false);
const activeImage = ref<GeneratedImageRecord | null>(null);
const brokenGalleryImageIds = ref<string[]>([]);
const repairingImageIds = ref<string[]>([]);

const activeModule = computed<ImageModuleId>(() => {
  const moduleId = String(route.params.module ?? '').trim();
  return moduleMetas.some((item) => item.id === moduleId) ? moduleId as ImageModuleId : 'openai';
});
const activeMeta = computed(() => moduleMetas.find((item) => item.id === activeModule.value) ?? moduleMetas[0]);
const galleryImages = computed(() => store.generatedImagesForProvider(activeModule.value));

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  void router.push({ name: 'settings', query: { tab: 'image' } });
}

function sourceLabel(source: GeneratedImageRecord['source']) {
  return {
    settings: '设置页生成',
    'world-book': '世界书封面',
    voom: 'VOOM 配图'
  }[source];
}

function formatGalleryTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(timestamp);
}

function openOriginal(image: GeneratedImageRecord) {
  activeImage.value = image;
  showOriginal.value = true;
}

function isBrokenGalleryImage(image: GeneratedImageRecord | null) {
  return Boolean(image && brokenGalleryImageIds.value.includes(image.id));
}

function markBrokenGalleryImage(image: GeneratedImageRecord) {
  if (brokenGalleryImageIds.value.includes(image.id)) return;
  brokenGalleryImageIds.value = [...brokenGalleryImageIds.value, image.id];
}

function galleryFallbackText(image: GeneratedImageRecord) {
  return image.title || image.prompt || sourceLabel(image.source) || activeMeta.value.title;
}

function isRemoteImageUrl(imageUrl: string) {
  return /^https?:\/\//i.test(imageUrl.trim());
}

function isDataImageUrl(imageUrl: string) {
  return /^data:image\//i.test(imageUrl.trim());
}

function canRepairImage(image: GeneratedImageRecord | null) {
  return Boolean(image && isRemoteImageUrl(image.imageUrl));
}

function createRepairDownloadUrl(imageUrl: string) {
  const trimmed = imageUrl.trim();
  if (!isRemoteImageUrl(trimmed)) return trimmed;
  if (['http:', 'https:'].includes(window.location.protocol) && (isLocalProxyHostname(window.location.hostname) || isLikelyViteProxyPort(window.location.port))) {
    return `/__image-download?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

function isLocalProxyHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized === '[::1]'
    || /^10\./.test(normalized)
    || /^192\.168\./.test(normalized)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    || /^169\.254\./.test(normalized);
}

function isLikelyViteProxyPort(port: string) {
  return port === '5173' || port === '4173';
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('图片读取失败。')));
    reader.readAsDataURL(blob);
  });
}

function inferImageMimeType(imageUrl: string) {
  const pathname = (() => {
    try {
      return new URL(imageUrl).pathname;
    } catch {
      return imageUrl;
    }
  })();
  if (/\.jpe?g$/i.test(pathname)) return 'image/jpeg';
  if (/\.gif$/i.test(pathname)) return 'image/gif';
  if (/\.webp$/i.test(pathname)) return 'image/webp';
  if (/\.avif$/i.test(pathname)) return 'image/avif';
  if (/\.svg$/i.test(pathname)) return 'image/svg+xml';
  return 'image/png';
}

async function repairImage(image: GeneratedImageRecord) {
  if (!canRepairImage(image) || repairingImageIds.value.includes(image.id)) return;
  repairingImageIds.value = [...repairingImageIds.value, image.id];
  try {
    const response = await fetch(createRepairDownloadUrl(image.imageUrl), {
      headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
    });
    if (!response.ok) throw new Error('图片下载失败。');
    const blob = await response.blob();
    const mimeType = blob.type || response.headers.get('content-type')?.split(';')[0]?.trim() || inferImageMimeType(image.imageUrl);
    if (!blob.size || !mimeType.startsWith('image/')) throw new Error('下载结果不是可用图片。');
    const dataUrl = await readBlobAsDataUrl(blob.type ? blob : new Blob([blob], { type: mimeType }));
    if (!isDataImageUrl(dataUrl)) throw new Error('图片转换失败。');
    await store.updateGeneratedImageUrl(image.id, dataUrl);
    brokenGalleryImageIds.value = brokenGalleryImageIds.value.filter((id) => id !== image.id);
    if (activeImage.value?.id === image.id) activeImage.value = store.generatedImages.find((entry) => entry.id === image.id) ?? activeImage.value;
  } catch {
    window.alert('图片修复失败：原始图片地址当前不可访问。可以保留文字记录，或删除后重新生成。');
  } finally {
    repairingImageIds.value = repairingImageIds.value.filter((id) => id !== image.id);
  }
}

function getImageExtension(imageUrl: string) {
  const mimeMatch = imageUrl.match(/^data:image\/([a-z0-9.+-]+);/i);
  if (mimeMatch) return mimeMatch[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const pathMatch = imageUrl.split('?')[0]?.match(/\.([a-z0-9]+)$/i);
  return pathMatch?.[1] || 'png';
}

function triggerImageDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function saveImage(image: GeneratedImageRecord) {
  const filename = `link-${image.provider}-${image.createdAt}.${getImageExtension(image.imageUrl)}`;

  try {
    const response = await fetch(image.imageUrl);
    if (!response.ok) throw new Error('图片下载失败。');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerImageDownload(objectUrl, filename);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  } catch {
    triggerImageDownload(image.imageUrl, filename);
  }
}

async function deleteImage(imageId: string) {
  await store.deleteGeneratedImage(imageId);
  if (activeImage.value?.id === imageId) {
    activeImage.value = null;
    showOriginal.value = false;
  }
}

async function deleteActiveImage() {
  if (!activeImage.value) return;
  await deleteImage(activeImage.value.id);
}
</script>

<style scoped>
.image-gallery-page {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background:
    radial-gradient(circle at 8% 0%, rgba(255, 218, 227, 0.54), transparent 30%),
    radial-gradient(circle at 94% 10%, rgba(6, 199, 85, 0.14), transparent 28%),
    linear-gradient(180deg, #fbfcfb 0%, #f5f7f6 52%, #edf3f1 100%);
}

.image-gallery-topbar {
  justify-content: flex-start;
  background: rgba(251, 252, 251, 0.9);
  backdrop-filter: blur(18px);
}

.image-gallery-title-button {
  display: inline-flex;
  min-width: 0;
  padding: 0;
  color: inherit;
}

.image-gallery-title-button .top-title {
  margin: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-gallery-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 10px calc(16px + var(--safe-right)) calc(22px + var(--safe-bottom)) calc(16px + var(--safe-left));
}

.image-gallery-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 32px rgba(16, 24, 20, 0.06);
}

.gallery-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.gallery-summary > div {
  min-width: 0;
}

.section-kicker {
  margin: 0;
  color: #9d7a86;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.gallery-summary h2 {
  margin: 3px 0 0;
  color: #231f25;
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', 'Songti SC', serif;
  font-size: 20px;
  line-height: 1.15;
}

.gallery-summary span {
  flex: 0 0 auto;
  color: #76737b;
  font-size: 12px;
  font-weight: 800;
}

.gallery-grid {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.gallery-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.04);
}

.gallery-image-button {
  display: grid;
  place-items: center;
  width: 100%;
  min-width: 0;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 15px;
  background: #f3f4f5;
}

.gallery-image-button.broken {
  padding: 18px;
  background: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.05);
}

.gallery-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-image-fallback,
.original-fallback {
  max-width: 100%;
  color: #232529;
  font-size: 12px;
  font-weight: 850;
  line-height: 1.55;
  text-align: center;
  overflow-wrap: anywhere;
}

.gallery-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.gallery-copy strong {
  display: block;
  color: #231f25;
  font-size: 13px;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.gallery-copy small,
.gallery-copy p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.gallery-copy p {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.gallery-actions,
.original-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
  min-width: 0;
}

.gallery-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 36px;
  padding: 7px 8px;
  border-radius: 999px;
  background: rgba(243, 244, 245, 0.92);
  color: #111111;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-action.danger {
  background: rgba(255, 237, 240, 0.94);
  color: #c74259;
}

.empty-gallery {
  display: grid;
  place-items: center;
  gap: 6px;
  min-height: 240px;
  padding: 26px 16px;
  text-align: center;
  color: var(--muted);
}

.empty-gallery strong {
  color: #232529;
  font-size: 14px;
}

.empty-gallery p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.original-sheet {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.original-frame {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 240px;
  max-height: min(68vh, 720px);
  border-radius: 16px;
  overflow: hidden;
  background: #f3f4f5;
}

.original-frame.broken {
  padding: 22px;
  background: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.05);
}

.original-image {
  display: block;
  width: 100%;
  max-height: min(68vh, 720px);
  object-fit: contain;
}

@media (min-width: 560px) {
  .gallery-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 420px) {
  .image-gallery-main {
    padding-inline: max(10px, var(--safe-left)) max(10px, var(--safe-right));
  }

  .image-gallery-panel {
    padding: 12px;
    border-radius: 18px;
  }
}

</style>
