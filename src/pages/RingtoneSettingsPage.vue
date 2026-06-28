<template>
  <section class="screen no-tabs ringtone-page">
    <header class="top-bar ringtone-topbar">
      <button class="ringtone-title-button" type="button" aria-label="返回首页" @click="goBack">
        <h1 class="top-title">Ringtones</h1>
      </button>
      <span class="header-chip">Audio</span>
    </header>

    <main class="ringtone-main">
      <section class="ringtone-panel">
        <section class="global-section" aria-label="全局铃声">
          <div class="section-heading-row">
            <span>Global</span>
            <b>{{ ringtoneEventTypes.length }}</b>
          </div>
          <div class="ringtone-grid">
            <article v-for="eventType in ringtoneEventTypes" :key="eventType" class="ringtone-card">
              <RingtoneCardIcon :event-type="eventType" />
              <div class="ringtone-copy">
                <strong>{{ eventMeta[eventType].label }}</strong>
                <span>{{ globalRingtone(eventType).name }}</span>
                <small>{{ formatAssetMeta(globalRingtone(eventType)) }}</small>
              </div>
              <div class="ringtone-actions">
                <label class="icon-action" :aria-label="`导入${eventMeta[eventType].label}`" :title="`导入${eventMeta[eventType].label}`">
                  <Upload :size="16" />
                  <input type="file" :accept="audioAccept" @change="importRingtone('global', eventType, $event)" />
                </label>
                <button class="icon-action" type="button" :aria-label="`恢复默认${eventMeta[eventType].label}`" :title="`恢复默认${eventMeta[eventType].label}`" @click="resetGlobal(eventType)">
                  <RotateCcw :size="16" />
                </button>
              </div>
              <audio class="audio-preview" controls preload="metadata" :src="globalRingtone(eventType).url"></audio>
            </article>
          </div>
        </section>

        <section class="character-section" aria-label="角色铃声">
          <div class="section-heading-row">
            <span>Characters</span>
            <b>{{ store.characters.length }}</b>
          </div>

          <section v-if="!store.ready" class="empty-panel">
            <LoaderCircle :size="18" class="spin" />
            <p>正在加载铃声...</p>
          </section>

          <section v-else-if="!store.characters.length" class="empty-panel">
            <Music2 :size="20" />
            <p>暂无角色</p>
          </section>

          <article v-for="character in store.characters" v-else :key="character.id" class="character-row">
            <header class="character-head">
              <img class="avatar" :src="character.avatar" :alt="getCharacterDisplayName(character)" />
              <div>
                <strong>{{ getCharacterDisplayName(character) }}</strong>
                <span>{{ character.id }}</span>
              </div>
            </header>

            <div class="character-ringtones">
              <section v-for="eventType in ringtoneEventTypes" :key="eventType" class="mini-ringtone">
                <div class="mini-ringtone-head">
                  <RingtoneCardIcon :event-type="eventType" />
                  <div>
                    <strong>{{ eventMeta[eventType].shortLabel }}</strong>
                    <span>{{ characterAssetLabel(character.id, eventType) }}</span>
                  </div>
                </div>
                <div class="mini-actions">
                  <label class="icon-action" :aria-label="`导入${getCharacterDisplayName(character)}的${eventMeta[eventType].label}`" :title="`导入${eventMeta[eventType].label}`">
                    <Upload :size="15" />
                    <input type="file" :accept="audioAccept" @change="importRingtone('character', eventType, $event, character.id)" />
                  </label>
                  <button class="icon-action" type="button" :disabled="!characterRingtone(character.id, eventType)" :aria-label="`继承全局${eventMeta[eventType].label}`" :title="`继承全局${eventMeta[eventType].label}`" @click="resetCharacter(character.id, eventType)">
                    <Undo2 :size="15" />
                  </button>
                </div>
                <audio class="audio-preview compact" controls preload="metadata" :src="effectiveRingtone(character.id, eventType).url"></audio>
              </section>
            </div>
          </article>
        </section>

        <p v-if="importError" class="import-error">{{ importError }}</p>
      </section>
    </main>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, type PropType } from 'vue';
import { useRouter } from 'vue-router';
import { LoaderCircle, MessageCircle, Music2, RadioTower, RotateCcw, Undo2, Upload } from 'lucide-vue-next';
import { useAppStore } from '@/stores/appStore';
import type { AppRingtoneSettings, RingtoneAsset, RingtoneEventType } from '@/types/domain';
import { getCharacterDisplayName } from '@/utils/character';
import { createId } from '@/utils/id';
import { createDefaultRingtoneSettings, normalizeAppSettings, normalizeRingtoneSettings, ringtoneEventTypes } from '@/utils/settings';

type RingtoneScope = 'global' | 'character';

const audioAccept = 'audio/*,.mp3,.mpeg,.mpga,.m4a,.aac,.wav,.wave,.ogg,.oga,.opus,.webm,.flac,.caf,.aif,.aiff';
const supportedAudioExtensions = ['mp3', 'mpeg', 'mpga', 'm4a', 'aac', 'wav', 'wave', 'ogg', 'oga', 'opus', 'webm', 'flac', 'caf', 'aif', 'aiff'];
const mimeByExtension: Record<string, string> = {
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac',
  caf: 'audio/x-caf',
  aif: 'audio/aiff',
  aiff: 'audio/aiff'
};

const eventMeta = {
  voom: { label: 'Voom 发布', shortLabel: 'Voom' },
  message: { label: '消息发送', shortLabel: 'Message' }
} satisfies Record<RingtoneEventType, { label: string; shortLabel: string }>;

const RingtoneCardIcon = defineComponent({
  props: {
    eventType: {
      type: String as PropType<RingtoneEventType>,
      required: true
    }
  },
  setup(props) {
    return () => h('span', { class: ['ringtone-mark', `ringtone-mark--${props.eventType}`] }, [
      h(props.eventType === 'voom' ? RadioTower : MessageCircle, { size: 18, strokeWidth: 2.2 })
    ]);
  }
});

const router = useRouter();
const store = useAppStore();
const importError = ref('');

const ringtoneSettings = computed(() => normalizeRingtoneSettings(store.settings?.ringtoneSettings));

onMounted(() => {
  void store.hydrate();
});

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  void router.push({ name: 'home' });
}

function cloneAsset(asset: RingtoneAsset): RingtoneAsset {
  return { ...asset };
}

function cloneRingtoneSettings(settings: AppRingtoneSettings): AppRingtoneSettings {
  return {
    global: {
      voom: cloneAsset(settings.global.voom),
      message: cloneAsset(settings.global.message)
    },
    characters: Object.fromEntries(Object.entries(settings.characters).map(([characterId, entry]) => [
      characterId,
      {
        characterId: entry.characterId,
        ...(entry.voom ? { voom: cloneAsset(entry.voom) } : {}),
        ...(entry.message ? { message: cloneAsset(entry.message) } : {})
      }
    ]))
  };
}

function globalRingtone(eventType: RingtoneEventType) {
  return ringtoneSettings.value.global[eventType];
}

function characterRingtone(characterId: string, eventType: RingtoneEventType) {
  return ringtoneSettings.value.characters[characterId]?.[eventType] ?? null;
}

function effectiveRingtone(characterId: string, eventType: RingtoneEventType) {
  return characterRingtone(characterId, eventType) ?? globalRingtone(eventType);
}

function characterAssetLabel(characterId: string, eventType: RingtoneEventType) {
  const customAsset = characterRingtone(characterId, eventType);
  return customAsset ? customAsset.name : '继承全局';
}

function formatAssetMeta(asset: RingtoneAsset) {
  if (asset.source === 'default') return 'Default';
  if (!asset.size) return asset.mimeType || 'Audio';
  const size = asset.size >= 1024 * 1024
    ? `${(asset.size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(asset.size / 1024))} KB`;
  return `${asset.mimeType || 'Audio'} · ${size}`;
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? '';
}

function inferMimeType(file: File) {
  return file.type || mimeByExtension[getFileExtension(file.name)] || 'audio/mpeg';
}

function isSupportedAudioFile(file: File) {
  if (file.type.startsWith('audio/')) return true;
  return supportedAudioExtensions.includes(getFileExtension(file.name));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('读取音频失败')));
    reader.readAsDataURL(file);
  });
}

async function createImportedRingtoneAsset(file: File): Promise<RingtoneAsset> {
  if (!isSupportedAudioFile(file)) throw new Error('请选择 MP3、M4A、AAC、WAV、OGG、WEBM 或 FLAC 音频。');
  return {
    id: createId('ringtone'),
    name: file.name || '自定义铃声',
    url: await readFileAsDataUrl(file),
    mimeType: inferMimeType(file),
    size: file.size,
    source: 'imported',
    updatedAt: Date.now()
  };
}

async function saveRingtoneSettings(nextRingtoneSettings: AppRingtoneSettings) {
  const currentSettings = normalizeAppSettings(store.settings);
  await store.saveSettings({
    ...currentSettings,
    ringtoneSettings: normalizeRingtoneSettings(nextRingtoneSettings)
  });
}

async function importRingtone(scope: RingtoneScope, eventType: RingtoneEventType, event: Event, characterId = '') {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';
  if (!file) return;

  try {
    importError.value = '';
    const asset = await createImportedRingtoneAsset(file);
    const nextRingtoneSettings = cloneRingtoneSettings(ringtoneSettings.value);
    if (scope === 'global') {
      nextRingtoneSettings.global[eventType] = asset;
    } else if (characterId) {
      nextRingtoneSettings.characters[characterId] = {
        ...(nextRingtoneSettings.characters[characterId] ?? { characterId }),
        characterId,
        [eventType]: asset
      };
    }
    await saveRingtoneSettings(nextRingtoneSettings);
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '导入音频失败';
  }
}

async function resetGlobal(eventType: RingtoneEventType) {
  const nextRingtoneSettings = cloneRingtoneSettings(ringtoneSettings.value);
  nextRingtoneSettings.global[eventType] = createDefaultRingtoneSettings().global[eventType];
  await saveRingtoneSettings(nextRingtoneSettings);
}

async function resetCharacter(characterId: string, eventType: RingtoneEventType) {
  const nextRingtoneSettings = cloneRingtoneSettings(ringtoneSettings.value);
  const nextCharacterSettings = nextRingtoneSettings.characters[characterId];
  if (!nextCharacterSettings) return;

  delete nextCharacterSettings[eventType];
  if (!nextCharacterSettings.voom && !nextCharacterSettings.message) delete nextRingtoneSettings.characters[characterId];
  await saveRingtoneSettings(nextRingtoneSettings);
}
</script>

<style scoped>
.ringtone-page {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-bottom: 0;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 8% 0%, rgba(255, 218, 227, 0.54), transparent 30%),
    radial-gradient(circle at 94% 10%, rgba(6, 199, 85, 0.14), transparent 28%),
    linear-gradient(180deg, #fbfcfb 0%, #f5f7f6 52%, #edf3f1 100%);
}

.ringtone-topbar {
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  min-width: 0;
  background: rgba(251, 252, 251, 0.9);
  backdrop-filter: blur(18px);
}

.ringtone-title-button {
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
  margin-right: auto;
  padding: 0;
  color: inherit;
}

.ringtone-title-button .top-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92);
  color: rgba(17, 17, 17, 0.54);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}

.ringtone-main {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 10px calc(16px + var(--safe-right)) calc(22px + var(--safe-bottom)) calc(16px + var(--safe-left));
}

.ringtone-panel {
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: 16px;
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 32px rgba(16, 24, 20, 0.06);
  container-type: inline-size;
}

.global-section,
.character-section {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.character-section {
  margin-top: 2px;
}

.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 0 2px;
  color: #64736a;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-heading-row b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(241, 243, 246, 0.96);
  color: #79808a;
  font-size: 10px;
  font-weight: 900;
}

.ringtone-grid,
.character-ringtones {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.ringtone-card,
.mini-ringtone,
.empty-panel {
  min-width: 0;
  border: 1px solid rgba(17, 17, 17, 0.04);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 249, 252, 0.96));
  box-shadow: 0 12px 30px rgba(26, 30, 38, 0.05);
  overflow: hidden;
}

.ringtone-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: 24px;
}

.ringtone-mark {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 16px;
  color: #111111;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.04);
}

.ringtone-mark--voom {
  background:
    radial-gradient(circle at top right, rgba(255, 221, 232, 0.9), transparent 34%),
    linear-gradient(135deg, #fff8fb, #f1f6fb 56%, #eef8f1);
}

.ringtone-mark--message {
  background:
    radial-gradient(circle at top left, rgba(215, 231, 255, 0.86), transparent 34%),
    linear-gradient(135deg, #f8fbff, #edf2fb 56%, #eef8f1);
}

.ringtone-copy,
.mini-ringtone-head > div,
.character-head > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.ringtone-copy strong,
.mini-ringtone-head strong,
.character-head strong {
  overflow: hidden;
  color: #191b1f;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ringtone-copy span,
.mini-ringtone-head span,
.character-head span {
  overflow: hidden;
  color: #767d86;
  font-size: 11px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ringtone-copy small {
  color: #9aa1a9;
  font-size: 10px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ringtone-actions,
.mini-actions {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.ringtone-actions {
  padding: 3px;
  border-radius: 999px;
  background: rgba(244, 246, 248, 0.72);
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.035);
}

.icon-action {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  min-height: 30px;
  border-radius: 999px;
  background: transparent;
  color: #79808a;
}

.icon-action:active {
  background: rgba(255, 255, 255, 0.82);
  color: #138046;
}

.icon-action:disabled {
  color: #c2c7cc;
  background: transparent;
}

.icon-action input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.audio-preview {
  grid-column: 1 / -1;
  width: 100%;
  height: 36px;
  min-width: 0;
  border-radius: 999px;
  filter: saturate(0.9);
  accent-color: #06c755;
}

.audio-preview.compact {
  height: 34px;
}

.character-row {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 248, 251, 0.94));
  box-shadow: 0 12px 30px rgba(26, 30, 38, 0.05);
}

.character-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.character-head .avatar {
  width: 42px;
  height: 42px;
  border-radius: 16px;
}

.mini-ringtone {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 20px;
  background: rgba(244, 246, 248, 0.82);
  box-shadow: none;
}

.mini-actions .icon-action {
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.04);
}

.mini-ringtone-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mini-ringtone .ringtone-mark {
  width: 34px;
  height: 34px;
  border-radius: 14px;
}

.empty-panel {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 10px;
  min-height: 180px;
  padding: 24px 16px;
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, rgba(255, 221, 232, 0.72), transparent 34%),
    linear-gradient(135deg, #fff8fb, #f1f6fb 56%, #eef8f1);
  color: #767d86;
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}

.empty-panel > svg {
  width: 40px;
  height: 40px;
  padding: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  color: #64736a;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.05);
}

.empty-panel p {
  margin: 0;
}

.import-error {
  position: sticky;
  bottom: 8px;
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(255, 241, 244, 0.94);
  color: #b51f36;
  font-size: 12px;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px rgba(239, 68, 90, 0.08);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@container (min-width: 520px) {
  .ringtone-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 360px) {
  .ringtone-panel {
    gap: 12px;
    padding: 12px;
    border-radius: 18px;
  }

  .ringtone-card,
  .character-row {
    gap: 10px;
    padding: 11px;
    border-radius: 20px;
  }

  .ringtone-card {
    grid-template-columns: 38px minmax(0, 1fr) max-content;
  }

  .ringtone-mark,
  .character-head .avatar {
    width: 38px;
    height: 38px;
    border-radius: 14px;
  }

  .ringtone-actions {
    grid-column: auto;
    justify-self: end;
  }

  .mini-ringtone {
    gap: 8px;
    padding: 9px;
    border-radius: 18px;
  }
}

@media (max-width: 420px) {
  .ringtone-main {
    padding: 8px max(10px, var(--safe-right)) calc(18px + var(--safe-bottom)) max(10px, var(--safe-left));
  }
}
</style>