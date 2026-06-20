<template>
  <section class="tts-config">
    <header class="tts-header">
      <div>
        <p>MiniMax TTS</p>
        <h2>角色语音生成</h2>
      </div>
    </header>

    <label class="field secret-field">
      <span>API Key</span>
      <input v-model="draft.ttsMinimax.apiKey" autocomplete="off" placeholder="MiniMax API Key" type="password" />
    </label>

    <div class="tts-grid tts-grid-two">
      <label class="field">
        <span>Group ID</span>
        <input v-model="draft.ttsMinimax.groupId" autocomplete="off" placeholder="MiniMax Group ID" />
      </label>

      <label class="field">
        <span>Voice ID</span>
        <input v-model="draft.ttsMinimax.voiceId" placeholder="male-qn-qingse" />
      </label>
    </div>

    <label class="field">
      <span>API URL</span>
      <input v-model="draft.ttsMinimax.apiUrl" placeholder="https://api.minimax.io/v1/t2a_v2" />
    </label>

    <label class="field">
      <span>模型</span>
      <input v-model="draft.ttsMinimax.model" list="minimax-tts-models" placeholder="speech-02-hd" />
      <datalist id="minimax-tts-models">
        <option value="speech-02-hd" />
        <option value="speech-02-turbo" />
        <option value="speech-01-hd" />
        <option value="speech-01-turbo" />
      </datalist>
    </label>

    <div class="tts-grid tts-grid-three">
      <label class="field compact-field">
        <span>语速</span>
        <input v-model.number="draft.ttsMinimax.speed" max="2" min="0.5" step="0.1" type="number" />
      </label>

      <label class="field compact-field">
        <span>音量</span>
        <input v-model.number="draft.ttsMinimax.volume" max="10" min="0.1" step="0.1" type="number" />
      </label>

      <label class="field compact-field">
        <span>音调</span>
        <input v-model.number="draft.ttsMinimax.pitch" max="12" min="-12" step="1" type="number" />
      </label>
    </div>

    <div class="tts-grid tts-grid-two">
      <label class="field">
        <span>音频格式</span>
        <select v-model="draft.ttsMinimax.audioFormat">
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
          <option value="pcm">PCM</option>
        </select>
      </label>

      <label class="field">
        <span>声道</span>
        <select v-model.number="draft.ttsMinimax.channel">
          <option :value="1">单声道</option>
          <option :value="2">双声道</option>
        </select>
      </label>
    </div>

    <div class="tts-grid tts-grid-two">
      <label class="field compact-field">
        <span>采样率</span>
        <input v-model.number="draft.ttsMinimax.sampleRate" min="8000" step="1000" type="number" />
      </label>

      <label class="field compact-field">
        <span>比特率</span>
        <input v-model.number="draft.ttsMinimax.bitrate" min="16000" step="1000" type="number" />
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { AppSettings } from '@/types/domain';
import { normalizeAppSettings } from '@/utils/settings';

const props = defineProps<{
  settings: AppSettings;
}>();

const emit = defineEmits<{
  save: [settings: AppSettings];
}>();

const syncing = ref(false);
let saveTimer: number | undefined;

function createDraft(settings: AppSettings) {
  return normalizeAppSettings({
    ...settings,
    ttsMinimax: { ...settings.ttsMinimax }
  });
}

const draft = reactive(createDraft(props.settings));

watch(
  () => props.settings,
  (nextSettings) => {
    syncing.value = true;
    Object.assign(draft, createDraft(nextSettings));
    window.setTimeout(() => {
      syncing.value = false;
    });
  },
  { deep: true }
);

function buildNextSettings() {
  return normalizeAppSettings({
    ...draft,
    ttsEnabled: draft.ttsMinimax.enabled,
    ttsVoice: draft.ttsMinimax.voiceId,
    ttsMinimax: { ...draft.ttsMinimax }
  });
}

function scheduleSave() {
  if (syncing.value) return;
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    emit('save', buildNextSettings());
    saveTimer = undefined;
  }, 450);
}

watch(
  () => draft.ttsMinimax,
  scheduleSave,
  { deep: true }
);

onBeforeUnmount(() => {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
});
</script>

<style scoped>
.tts-config {
  display: grid;
  gap: clamp(10px, 3.1vw, 12px);
  min-width: 0;
}

.tts-header {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 4px 0 2px;
}

.tts-header > div {
  min-width: 0;
}

.tts-header p {
  margin: 0 0 3px;
  color: #64736a;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tts-header h2 {
  margin: 0;
  color: #171717;
  font-size: 18px;
  line-height: 1.15;
}

.field {
  display: grid;
  gap: clamp(5px, 1.8vw, 6px);
  min-width: 0;
}

.field span {
  color: #626971;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.field input,
.field select {
  width: 100%;
  min-width: 0;
  min-height: clamp(40px, 11vw, 42px);
  border: 0;
  border-radius: clamp(9px, 2.8vw, 10px);
  padding: 0 clamp(9px, 3vw, 12px);
  background: #eff1f3;
  color: #14171a;
  font: inherit;
  font-size: 13px;
  font-weight: 760;
  outline: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field input:focus,
.field select:focus {
  box-shadow: 0 0 0 2px rgba(6, 199, 85, 0.18);
}

.secret-field input {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.tts-grid {
  display: grid;
  gap: clamp(7px, 2.6vw, 10px);
  min-width: 0;
}

.tts-grid-two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.tts-grid-three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.compact-field input {
  padding-inline: clamp(8px, 2.6vw, 10px);
}

@media (max-width: 430px) {
  .tts-header {
    align-items: start;
  }

  .tts-grid-three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(6px, 2.2vw, 7px);
  }
}
</style>