<template>
  <button class="tts-model-button" :class="{ 'with-label': showLabel }" type="button" :aria-label="buttonLabel" :title="buttonLabel" @click="showPicker = true">
    <SlidersHorizontal :size="iconSize" stroke-width="2.4" />
    <span v-if="showLabel">{{ compactSelectedLabel }}</span>
  </button>

  <AppModal v-model="showPicker" title="TTS 模型" :show-header="false" variant="ins">
    <section class="tts-model-switch-panel form-grid">
      <label class="field model-select-field">
        <span>当前接口</span>
        <div class="model-select-shell">
          <span class="model-select-vendor">{{ activeProviderLabel }}</span>
          <select class="with-provider" :value="settings.ttsProvider" @change="updateProvider">
            <option v-for="provider in providerOptions" :key="provider.id" :value="provider.id">
              {{ provider.label }} · {{ provider.detail }}
            </option>
          </select>
        </div>
      </label>

      <template v-if="settings.ttsProvider === 'openai'">
        <label class="field model-select-field">
          <span>OpenAI 供应商</span>
          <div class="model-select-shell">
            <span class="model-select-vendor">Vendor</span>
            <select class="with-provider" :value="settings.ttsOpenAi.activeVendorId" :disabled="!openAiVendors.length" @change="updateOpenAiVendor">
              <option value="">未选择</option>
              <option v-for="vendor in openAiVendors" :key="vendor.id" :value="vendor.id">
                {{ vendor.name }}
              </option>
            </select>
          </div>
        </label>

        <label class="field model-select-field">
          <span>OpenAI 模型</span>
          <div class="model-select-shell">
            <span class="model-select-vendor">Model</span>
            <select class="with-provider" :value="selectedOpenAiModel" :disabled="!activeOpenAiModels.length" @change="updateOpenAiModel">
              <option value="">未选择</option>
              <option v-for="model in activeOpenAiModels" :key="model.id" :value="model.id">
                {{ model.nickname || model.id }}
              </option>
            </select>
          </div>
        </label>

        <label class="field model-select-field">
          <span>Voice</span>
          <div class="model-select-shell">
            <span class="model-select-vendor">Voice</span>
            <select class="with-provider" :value="settings.ttsOpenAi.voice" @change="updateOpenAiVoice">
              <option v-for="voice in openAiVoices" :key="voice" :value="voice">{{ voice }}</option>
            </select>
          </div>
        </label>
      </template>

      <template v-else-if="settings.ttsProvider === 'minimax'">
        <label class="field model-select-field">
          <span>MiniMax 模型</span>
          <div class="model-select-shell">
            <span class="model-select-vendor">Model</span>
            <select class="with-provider" :value="settings.ttsMinimax.model" @change="updateMinimaxModel">
              <option v-for="model in minimaxModels" :key="model" :value="model">{{ model }}</option>
            </select>
          </div>
        </label>

        <label class="field model-select-field">
          <span>Voice ID</span>
          <input :value="settings.ttsMinimax.voiceId" placeholder="male-qn-qingse" @input="updateMinimaxVoice" />
        </label>
      </template>

      <template v-else>
        <label class="field model-select-field">
          <span>公共语音</span>
          <div class="model-select-shell">
            <span class="model-select-vendor">Voice</span>
            <select class="with-provider" :value="settings.ttsPublic.voice" @change="updatePublicVoice">
              <option v-for="voice in publicVoices" :key="voice" :value="voice">{{ voice }}</option>
            </select>
          </div>
        </label>
      </template>

      <section class="picker-empty ready">
        <strong>当前 TTS 模型</strong>
        <p>{{ activeProviderSummary }}</p>
      </section>
    </section>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { SlidersHorizontal } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import { useAppStore } from '@/stores/appStore';
import type { AppSettings, TtsProviderType } from '@/types/domain';
import { getTtsVoiceForProvider, normalizeAppSettings } from '@/utils/settings';

withDefaults(defineProps<{
  showLabel?: boolean;
  iconSize?: number;
}>(), {
  showLabel: false,
  iconSize: 18
});

const store = useAppStore();
const showPicker = ref(false);

const providerOptions: Array<{ id: TtsProviderType; label: string; detail: string }> = [
  { id: 'minimax', label: 'MiniMax', detail: '精细参数' },
  { id: 'openai', label: 'OpenAI', detail: '多供应商' },
  { id: 'public', label: 'Public', detail: '免费接口' }
];

const openAiVoices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
const publicVoices = ['Zhiyu', 'Joanna', 'Matthew', 'Amy', 'Brian', 'Takumi', 'Mizuki'];
const minimaxModels = ['speech-02-hd', 'speech-02-turbo', 'speech-01-hd', 'speech-01-turbo'];

const settings = computed(() => normalizeAppSettings(store.settings));
const openAiVendors = computed(() => settings.value.ttsOpenAi.vendors);
const activeOpenAiVendor = computed(() => openAiVendors.value.find((vendor) => vendor.id === settings.value.ttsOpenAi.activeVendorId) ?? openAiVendors.value[0] ?? null);
const activeOpenAiModels = computed(() => activeOpenAiVendor.value?.models ?? []);
const selectedOpenAiModel = computed(() => activeOpenAiVendor.value?.models.find((model) => model.selected)?.id ?? settings.value.ttsOpenAi.model);
const activeProviderLabel = computed(() => providerOptions.find((provider) => provider.id === settings.value.ttsProvider)?.label ?? 'TTS');
const compactSelectedLabel = computed(() => activeProviderLabel.value);
const buttonLabel = computed(() => `切换 TTS 模型：${activeProviderLabel.value}`);
const activeProviderSummary = computed(() => {
  if (settings.value.ttsProvider === 'openai') {
    return activeOpenAiVendor.value
      ? `${activeOpenAiVendor.value.name} · ${selectedOpenAiModel.value || '未选择模型'}`
      : '先在 TTS 页面添加 OpenAI 兼容供应商。';
  }
  if (settings.value.ttsProvider === 'minimax') {
    return `${settings.value.ttsMinimax.model} · ${settings.value.ttsMinimax.voiceId || '未填写 Voice ID'}`;
  }
  return `${settings.value.ttsPublic.voice} · ${settings.value.ttsPublic.mimeType}`;
});

function finalizeSettings(nextSettings: AppSettings) {
  const normalized = normalizeAppSettings(nextSettings);
  normalized.ttsEnabled = true;
  normalized.ttsVoice = getTtsVoiceForProvider(normalized);
  normalized.ttsMinimax.enabled = normalized.ttsProvider === 'minimax';
  return normalized;
}

async function saveNext(nextSettings: AppSettings) {
  await store.saveSettings(finalizeSettings(nextSettings));
}

function nextBase() {
  return normalizeAppSettings(settings.value);
}

async function updateProvider(event: Event) {
  const provider = (event.target as HTMLSelectElement).value as TtsProviderType;
  await saveNext({ ...nextBase(), ttsProvider: provider });
}

async function updateOpenAiVendor(event: Event) {
  const vendorId = (event.target as HTMLSelectElement).value;
  const nextSettings = nextBase();
  const vendor = nextSettings.ttsOpenAi.vendors.find((item) => item.id === vendorId) ?? null;
  nextSettings.ttsOpenAi.activeVendorId = vendorId;
  nextSettings.ttsOpenAi.model = vendor?.models.find((model) => model.selected)?.id ?? vendor?.models[0]?.id ?? nextSettings.ttsOpenAi.model;
  await saveNext(nextSettings);
}

async function updateOpenAiModel(event: Event) {
  const modelId = (event.target as HTMLSelectElement).value;
  const nextSettings = nextBase();
  const vendor = nextSettings.ttsOpenAi.vendors.find((item) => item.id === nextSettings.ttsOpenAi.activeVendorId) ?? null;
  if (vendor) {
    vendor.models = vendor.models.map((model) => ({ ...model, selected: model.id === modelId }));
  }
  nextSettings.ttsOpenAi.model = modelId;
  await saveNext(nextSettings);
}

async function updateOpenAiVoice(event: Event) {
  const nextSettings = nextBase();
  nextSettings.ttsOpenAi.voice = (event.target as HTMLSelectElement).value;
  await saveNext(nextSettings);
}

async function updateMinimaxModel(event: Event) {
  const nextSettings = nextBase();
  nextSettings.ttsMinimax.model = (event.target as HTMLSelectElement).value;
  await saveNext(nextSettings);
}

async function updateMinimaxVoice(event: Event) {
  const nextSettings = nextBase();
  nextSettings.ttsMinimax.voiceId = (event.target as HTMLInputElement).value;
  await saveNext(nextSettings);
}

async function updatePublicVoice(event: Event) {
  const nextSettings = nextBase();
  nextSettings.ttsPublic.voice = (event.target as HTMLSelectElement).value;
  await saveNext(nextSettings);
}
</script>

<style scoped>
.tts-model-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 34px;
  width: 34px;
  min-height: 34px;
  padding: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #111111;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 800;
}

.tts-model-button.with-label {
  flex-basis: auto;
  width: auto;
  gap: 6px;
  padding: 0 10px;
}

.tts-model-button span {
  max-width: 86px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tts-model-switch-panel {
  padding-top: 4px;
}

.model-select-field select,
.model-select-field input {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  border: 0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.76);
  color: #24201e;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  outline: none;
}

.model-select-field input {
  padding-inline: 12px;
}

.model-select-shell {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 5px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
}

.model-select-vendor {
  max-width: 86px;
  overflow: hidden;
  color: #5f5a56;
  font-size: 12px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-empty {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 8px;
  background: #ffffff;
}

.picker-empty.ready {
  background: rgba(232, 248, 237, 0.9);
}

.picker-empty.muted {
  background: rgba(245, 246, 248, 0.9);
}

.picker-empty strong {
  color: #171717;
  font-size: 14px;
}

.picker-empty p {
  margin: 0;
  color: #767b82;
  font-size: 12px;
  line-height: 1.45;
}
</style>