<template>
  <section class="image-console">
    <nav class="module-tabs" aria-label="生图模块切换">
      <button
        v-for="module in modules"
        :key="module.id"
        class="module-tab"
        :class="{ active: activeModule === module.id }"
        type="button"
        @click="setActiveModule(module.id)"
      >
        <span class="module-tab-label">{{ module.title }}</span>
      </button>
    </nav>

    <section class="module-list">
      <article v-for="module in visibleModules" :key="module.id" class="module-card">
        <div class="module-preview-shell">
          <img v-if="module.preview && !isBrokenPreview(module.preview)" class="module-preview" :src="module.preview" :alt="module.title" @error="markBrokenPreview(module.preview)" />
          <div v-else class="module-preview module-preview-placeholder" :class="`placeholder-${module.id}`">
            <span>{{ module.placeholder }}</span>
          </div>
          <span class="module-badge" :class="module.connected ? 'connected' : 'muted'">
            {{ module.connected ? 'Connected' : 'Need setup' }}
          </span>
        </div>

        <div class="module-copy">
          <div class="module-copy-top">
            <div>
              <p class="module-kicker">{{ module.kicker }}</p>
              <strong>{{ module.title }}</strong>
            </div>
            <small>{{ module.summary }}</small>
          </div>

          <p class="module-description">{{ module.description }}</p>

          <div class="module-actions">
            <button class="primary-action action-pill" type="button" @click="openGallery(module.id)">
              图片仓库
            </button>
            <button class="secondary-action action-pill" type="button" @click="openModule(module.id)">配置模块</button>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { AppSettings, ImageModuleId } from '@/types/domain';
import { getResolvedOpenAiImageConfig, normalizeAppSettings } from '@/utils/settings';

const props = defineProps<{
  settings: AppSettings;
}>();

const emit = defineEmits<{
  save: [settings: AppSettings];
}>();

const router = useRouter();
const draft = ref<AppSettings>(normalizeAppSettings(props.settings));
const activeModule = ref<ImageModuleId>('openai');
const brokenPreviewUrls = ref<string[]>([]);

watch(
  () => props.settings,
  (nextSettings) => {
    draft.value = normalizeAppSettings(nextSettings);
  },
  { deep: true }
);

const modules = computed(() => {
  const openAiResolved = getResolvedOpenAiImageConfig(draft.value);
  const openAiConnected = Boolean(openAiResolved.endpoint.trim() && openAiResolved.apiKey.trim() && openAiResolved.model.trim());
  const novelAiConnected = Boolean(draft.value.imageNovelAi.apiKey.trim() && draft.value.imageNovelAi.model.trim());
  const pollinationsConnected = Boolean(draft.value.imagePollinations.apiKey.trim() && draft.value.imagePollinations.model.trim());

  return [
    {
      id: 'openai' as ImageModuleId,
      kicker: 'OpenAI Images',
      title: 'OpenAI',
      description: '连接 OpenAI 兼容图片接口',
      summary: draft.value.imageOpenAi.activeVendorId
        ? `默认 ${draft.value.imageOpenAi.vendors.find((vendor) => vendor.id === draft.value.imageOpenAi.activeVendorId)?.name || '供应商'}`
        : '未选择供应商',
      placeholder: 'OpenAI',
      preview: draft.value.imageOpenAi.lastImageUrl,
      connected: openAiConnected
    },
    {
      id: 'novelai' as ImageModuleId,
      kicker: 'NovelAI',
      title: 'NovelAI',
      description: '连接 NovelAI 图片接口',
      summary: `${draft.value.imageNovelAi.model} / ${draft.value.imageNovelAi.steps} steps`,
      placeholder: 'NAI',
      preview: draft.value.imageNovelAi.lastImageUrl,
      connected: novelAiConnected
    },
    {
      id: 'pollinations' as ImageModuleId,
      kicker: 'Pollinations',
      title: 'Pollinations',
      description: '连接 Pollinations 图片接口',
      summary: `${draft.value.imagePollinations.model} / ${draft.value.imagePollinations.width}x${draft.value.imagePollinations.height}`,
      placeholder: 'PO',
      preview: draft.value.imagePollinations.lastImageUrl,
      connected: pollinationsConnected
    }
  ];
});

const visibleModules = computed(() => modules.value.filter((module) => module.id === activeModule.value));

function openModule(moduleId: ImageModuleId) {
  void router.push({ name: 'image-module-settings', params: { module: moduleId } });
}

function openGallery(moduleId: ImageModuleId) {
  void router.push({ name: 'image-gallery', params: { module: moduleId } });
}

function setActiveModule(moduleId: ImageModuleId) {
  activeModule.value = moduleId;
}

function isBrokenPreview(imageUrl: string | undefined) {
  return Boolean(imageUrl && brokenPreviewUrls.value.includes(imageUrl));
}

function markBrokenPreview(imageUrl: string | undefined) {
  if (!imageUrl || brokenPreviewUrls.value.includes(imageUrl)) return;
  brokenPreviewUrls.value = [...brokenPreviewUrls.value, imageUrl];
}

function submitSettings() {
  emit('save', normalizeAppSettings(draft.value));
}

defineExpose({
  submitSettings
});

</script>

<style scoped>
.image-console {
  display: grid;
  gap: 16px;
  min-width: 0;
  padding-bottom: calc(10px + var(--safe-bottom));
  container-type: inline-size;
}

.module-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
}

.module-tab {
  display: inline-grid;
  align-items: center;
  justify-items: center;
  min-width: 0;
  min-height: 42px;
  padding: 10px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #6f7079;
  text-align: center;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.05);
}

.module-tab-label {
  max-width: 100%;
  color: inherit;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
}

.module-tab.active {
  background: linear-gradient(180deg, #111111, #2c2f39);
  color: rgba(255, 255, 255, 0.76);
  box-shadow: 0 18px 34px rgba(26, 30, 38, 0.12);
}

.module-list {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding-bottom: 96px;
}

.module-card {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 14px;
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 248, 252, 0.96));
  box-shadow: 0 16px 34px rgba(26, 30, 38, 0.06);
}

.module-preview-shell {
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 220px;
  border-radius: 20px;
  background: #f3f4f6;
}

.module-preview {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.module-preview-placeholder {
  display: grid;
  place-items: center;
  min-height: 220px;
  color: rgba(41, 35, 42, 0.74);
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', 'Songti SC', serif;
  font-size: 30px;
  letter-spacing: 0.14em;
}

.placeholder-openai {
  background:
    radial-gradient(circle at top right, rgba(255, 221, 232, 0.84), transparent 24%),
    linear-gradient(135deg, #fff8fb, #f1f6fb 55%, #eef1f8);
}

.placeholder-novelai {
  background:
    radial-gradient(circle at top left, rgba(244, 221, 198, 0.82), transparent 24%),
    linear-gradient(135deg, #fff7f0, #f6efe8 56%, #eee8e2);
}

.placeholder-pollinations {
  background:
    radial-gradient(circle at top, rgba(215, 231, 255, 0.86), transparent 24%),
    linear-gradient(135deg, #f8fbff, #edf2fb 56%, #f4f0ff);
}

.module-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  backdrop-filter: blur(12px);
}

.module-badge.connected {
  background: rgba(231, 248, 236, 0.96);
  color: #138046;
}

.module-badge.muted {
  background: rgba(241, 243, 246, 0.96);
  color: #79808a;
}

.module-copy {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.module-copy-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.module-copy-top > div {
  min-width: 0;
}

.module-kicker {
  margin: 0;
  color: #9d7a86;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.module-copy strong {
  display: block;
  margin-top: 4px;
  color: #231f25;
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', 'Songti SC', serif;
  font-size: 24px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.module-copy-top small {
  flex: 0 1 auto;
  min-width: 0;
  color: #76737b;
  font-size: 11px;
  font-weight: 700;
  text-align: right;
  overflow-wrap: anywhere;
}

.module-description,
.module-feedback {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.module-feedback.error {
  color: #cf425a;
}

.module-feedback.success {
  color: #26774e;
}

.module-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: nowrap;
}

.module-actions .action-pill {
  flex: 1 1 0;
  min-width: 0;
  padding-inline: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.module-actions .primary-action {
  background: var(--soft);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--hairline);
}

.action-pill {
  min-height: 40px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

@container (min-width: 620px) {
  .module-card {
    grid-template-columns: minmax(0, 250px) minmax(0, 1fr);
    align-items: center;
  }

  .module-preview-shell,
  .module-preview-placeholder {
    min-height: 260px;
  }
}
</style>