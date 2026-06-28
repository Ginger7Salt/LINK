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
        <section class="keepalive-section" aria-label="保活通知">
          <div class="section-heading-row">
            <span>Keep Alive</span>
            <b>{{ keepAliveModeLabel }}</b>
          </div>

          <article class="keepalive-card" :class="{ 'is-active': keepAliveStatus.enabled }">
            <div class="keepalive-head">
              <div class="keepalive-identity">
                <span class="keepalive-mark">
                  <BatteryCharging :size="18" />
                </span>
                <div class="keepalive-copy">
                  <strong>保活与通知</strong>
                  <span>{{ keepAliveSummary }}</span>
                </div>
              </div>
              <button class="keepalive-power" type="button" :aria-label="keepAliveStatus.enabled ? '关闭保活' : '开启保活'" :title="keepAliveStatus.enabled ? '关闭保活' : '开启保活'" @click="toggleKeepAlive">
                <Power :size="18" />
              </button>
            </div>

            <div class="keepalive-signal">
              <span :class="['keepalive-dot', { active: keepAliveStatus.enabled }]" aria-hidden="true"></span>
              <strong>{{ keepAliveSignal }}</strong>
              <small>{{ keepAlivePlatformLabel }}</small>
            </div>

            <div class="keepalive-states" aria-label="保活状态">
              <span :class="['keepalive-state', { active: keepAliveStatus.silentAudioActive || keepAliveStatus.webAudioActive }]">
                <VolumeX :size="13" />
                <b>Audio</b>
                <small>{{ audioStateLabel }}</small>
              </span>
              <span :class="['keepalive-state', { active: keepAliveStatus.notificationPermission === 'granted', warn: keepAliveStatus.notificationPermission === 'denied' }]">
                <BellRing :size="13" />
                <b>Notify</b>
                <small>{{ notificationStateLabel }}</small>
              </span>
              <span :class="['keepalive-state', { active: keepAliveStatus.wakeLockActive, muted: !keepAliveStatus.wakeLockSupported }]">
                <ShieldCheck :size="13" />
                <b>Wake</b>
                <small>{{ wakeStateLabel }}</small>
              </span>
            </div>

            <button v-if="canRequestNotificationPermission" class="keepalive-auth" type="button" @click="authorizeNotifications">
              <BellRing :size="14" />
              <span>授权通知</span>
            </button>

            <div class="keepalive-options">
              <label :class="['keepalive-option', { active: keepAliveSettings.silentAudio }]">
                <input type="checkbox" :checked="keepAliveSettings.silentAudio" @change="updateKeepAliveOption('silentAudio', $event)" />
                <span>静音音频</span>
                <i aria-hidden="true"></i>
              </label>
              <label :class="['keepalive-option', { active: keepAliveSettings.notifications }]">
                <input type="checkbox" :checked="keepAliveSettings.notifications" @change="updateKeepAliveOption('notifications', $event)" />
                <span>角色通知</span>
                <i aria-hidden="true"></i>
              </label>
              <label :class="['keepalive-option', { active: keepAliveSettings.wakeLock }]">
                <input type="checkbox" :checked="keepAliveSettings.wakeLock" @change="updateKeepAliveOption('wakeLock', $event)" />
                <span>亮屏守护</span>
                <i aria-hidden="true"></i>
              </label>
            </div>

            <p v-if="keepAliveAlert" class="keepalive-note">{{ keepAliveAlert }}</p>
          </article>
        </section>

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
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType } from 'vue';
import { useRouter } from 'vue-router';
import { BatteryCharging, BellRing, LoaderCircle, MessageCircle, Music2, Power, RadioTower, RotateCcw, ShieldCheck, Undo2, Upload, VolumeX } from 'lucide-vue-next';
import { getKeepAliveStatus, requestKeepAliveNotificationPermission, startKeepAlive, stopKeepAlive, subscribeKeepAliveStatus, type KeepAliveRuntimeStatus } from '@/services/keepAlive';
import { useAppStore } from '@/stores/appStore';
import type { AppKeepAliveSettings, AppRingtoneSettings, RingtoneAsset, RingtoneEventType } from '@/types/domain';
import { getCharacterDisplayName } from '@/utils/character';
import { createId } from '@/utils/id';
import { createDefaultRingtoneSettings, normalizeAppSettings, normalizeKeepAliveSettings, normalizeRingtoneSettings, ringtoneEventTypes } from '@/utils/settings';

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
const notificationAuthMessage = ref('');
const keepAliveStatus = ref<KeepAliveRuntimeStatus>(getKeepAliveStatus());
let unsubscribeKeepAliveStatus: (() => void) | null = null;

const keepAliveSettings = computed(() => normalizeKeepAliveSettings(store.settings?.keepAlive));
const ringtoneSettings = computed(() => normalizeRingtoneSettings(store.settings?.ringtoneSettings));
const keepAliveModeLabel = computed(() => keepAliveStatus.value.enabled ? 'Active' : 'Ready');
const keepAliveSummary = computed(() => {
  if (!keepAliveStatus.value.enabled) return '静音音频、系统通知与心跳恢复';
  if (keepAliveStatus.value.silentAudioActive || keepAliveStatus.value.webAudioActive) return '音频通道已保持，通知会自动合并';
  return '等待一次触摸恢复音频通道';
});
const keepAliveSignal = computed(() => {
  if (!keepAliveStatus.value.enabled) return '未开启';
  if (keepAliveStatus.value.silentAudioActive || keepAliveStatus.value.webAudioActive) return '运行中';
  return '待恢复';
});
const keepAlivePlatformLabel = computed(() => {
  const platformLabel = keepAliveStatus.value.platform === 'ios' ? 'iOS' : keepAliveStatus.value.platform === 'android' ? 'Android' : 'Desktop';
  return keepAliveStatus.value.standalone ? `${platformLabel} PWA` : platformLabel;
});
const audioStateLabel = computed(() => keepAliveStatus.value.silentAudioActive || keepAliveStatus.value.webAudioActive ? '运行' : keepAliveSettings.value.silentAudio ? '待机' : '关闭');
const notificationStateLabel = computed(() => {
  if (!keepAliveStatus.value.notificationSupported) return '不支持';
  if (keepAliveStatus.value.notificationPermission === 'granted') return '允许';
  if (keepAliveStatus.value.notificationPermission === 'denied') return '拒绝';
  return '待授权';
});
const wakeStateLabel = computed(() => {
  if (!keepAliveStatus.value.wakeLockSupported) return '受限';
  if (keepAliveStatus.value.wakeLockActive) return '运行';
  return keepAliveSettings.value.wakeLock ? '待机' : '关闭';
});
const canRequestNotificationPermission = computed(() => keepAliveSettings.value.notifications
  && keepAliveStatus.value.notificationSupported
  && keepAliveStatus.value.notificationPermission === 'default');
const keepAliveAlert = computed(() => {
  if (notificationAuthMessage.value) return notificationAuthMessage.value;
  if (keepAliveStatus.value.lastError) return keepAliveStatus.value.lastError;
  if (keepAliveStatus.value.platform === 'ios' && !keepAliveStatus.value.standalone) return 'iOS 浏览器模式下，后台通知与音频会更容易被系统收紧。';
  if (keepAliveStatus.value.platform === 'android' && !keepAliveStatus.value.wakeLockSupported) return '当前 Android WebView 未开放亮屏守护，保活会使用音频与通知。';
  if (keepAliveStatus.value.notificationPermission === 'denied') return '系统通知权限已拒绝，角色事件仍会播放铃声。';
  return '';
});

onMounted(() => {
  void store.hydrate();
  unsubscribeKeepAliveStatus = subscribeKeepAliveStatus((nextStatus) => {
    keepAliveStatus.value = nextStatus;
  });
});

onBeforeUnmount(() => {
  unsubscribeKeepAliveStatus?.();
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

async function saveKeepAliveSettings(nextKeepAliveSettings: AppKeepAliveSettings, requestNotifications = false) {
  const currentSettings = normalizeAppSettings(store.settings);
  const normalizedKeepAlive = normalizeKeepAliveSettings(nextKeepAliveSettings);
  await store.saveSettings({
    ...currentSettings,
    keepAlive: normalizedKeepAlive
  });
  if (normalizedKeepAlive.enabled) await startKeepAlive(normalizedKeepAlive, { requestNotifications });
  else stopKeepAlive();
}

async function toggleKeepAlive() {
  const nextEnabled = !keepAliveSettings.value.enabled;
  await saveKeepAliveSettings({ ...keepAliveSettings.value, enabled: nextEnabled }, nextEnabled && keepAliveSettings.value.notifications);
}

async function updateKeepAliveOption(option: keyof Pick<AppKeepAliveSettings, 'silentAudio' | 'notifications' | 'wakeLock'>, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  if (option === 'notifications') notificationAuthMessage.value = '';
  await saveKeepAliveSettings({ ...keepAliveSettings.value, [option]: checked }, option === 'notifications' && checked && keepAliveSettings.value.enabled);
}

async function authorizeNotifications() {
  notificationAuthMessage.value = '正在请求通知权限...';
  const permission = await requestKeepAliveNotificationPermission();
  if (permission === 'granted') notificationAuthMessage.value = '通知已授权，角色消息和 VOOM 会通过系统通知提醒。';
  else if (permission === 'denied') notificationAuthMessage.value = '通知权限已被拒绝，请在浏览器或系统设置里手动允许。';
  else if (permission === 'unsupported') notificationAuthMessage.value = '当前浏览器不支持网页通知。';
  else notificationAuthMessage.value = '浏览器没有弹出授权窗口，请检查地址栏权限、系统通知设置，或安装为 PWA 后再试。';
  if (keepAliveSettings.value.enabled) await startKeepAlive(keepAliveSettings.value);
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
.keepalive-section,
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
.keepalive-card,
.mini-ringtone,
.empty-panel {
  min-width: 0;
  border: 1px solid rgba(17, 17, 17, 0.04);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 249, 252, 0.96));
  box-shadow: 0 12px 30px rgba(26, 30, 38, 0.05);
  overflow: hidden;
}

.keepalive-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 34px rgba(24, 31, 28, 0.055);
}

.keepalive-card.is-active {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 252, 250, 0.96));
}

.keepalive-head,
.keepalive-identity {
  display: flex;
  align-items: center;
  min-width: 0;
}

.keepalive-head {
  justify-content: space-between;
  gap: 14px;
}

.keepalive-identity {
  gap: 11px;
  min-width: 0;
}

.keepalive-mark {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: #f4f7f5;
  color: #1d2923;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.045);
}

.keepalive-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.keepalive-copy strong {
  overflow: hidden;
  color: #171a1d;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keepalive-copy span {
  overflow: hidden;
  color: #7a8280;
  font-size: 11px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keepalive-power {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  min-height: 40px;
  border-radius: 14px;
  background: #f3f5f4;
  color: #717a76;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.045);
}

.keepalive-card.is-active .keepalive-power {
  background: #141a17;
  color: #ffffff;
  box-shadow: 0 10px 22px rgba(20, 26, 23, 0.16);
}

.keepalive-signal {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 16px;
  background: #f7f8f7;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.035);
}

.keepalive-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #c9cfcc;
}

.keepalive-dot.active {
  background: #06c755;
  box-shadow: 0 0 0 4px rgba(6, 199, 85, 0.12);
}

.keepalive-signal strong {
  overflow: hidden;
  color: #202522;
  font-size: 12px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keepalive-signal small {
  color: #848b88;
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
}

.keepalive-states,
.keepalive-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.keepalive-state {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 6px;
  row-gap: 3px;
  min-width: 0;
  min-height: 50px;
  padding: 9px 10px;
  border-radius: 16px;
  background: #f5f6f5;
  color: #737b77;
  line-height: 1;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.035);
}

.keepalive-state svg {
  grid-row: 1 / span 2;
}

.keepalive-state b {
  overflow: hidden;
  color: #272d2a;
  font-size: 10px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keepalive-state small {
  overflow: hidden;
  color: #8c938f;
  font-size: 10px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keepalive-state.active {
  background: #eef8f2;
  color: #138046;
}

.keepalive-state.warn {
  background: #fff3f5;
  color: #b51f36;
}

.keepalive-state.muted {
  color: #b0b7b3;
}

.keepalive-auth {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-height: 38px;
  border-radius: 999px;
  background: #141a17;
  color: #ffffff;
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 10px 22px rgba(20, 26, 23, 0.14);
}

.keepalive-auth:active {
  transform: translateY(1px);
}

.keepalive-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  min-height: 38px;
  padding: 0 10px 0 12px;
  border-radius: 999px;
  background: #f7f8f7;
  color: #6f7773;
  font-size: 11px;
  font-weight: 900;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.035);
}

.keepalive-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.keepalive-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keepalive-option i {
  position: relative;
  flex: 0 0 auto;
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: #dfe4e1;
}

.keepalive-option i::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(17, 17, 17, 0.12);
  content: '';
  transition: transform 0.16s ease;
}

.keepalive-option.active {
  background: #eef8f2;
  color: #138046;
}

.keepalive-option.active i {
  background: #06c755;
}

.keepalive-option.active i::after {
  transform: translateX(12px);
}

.keepalive-note {
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f7f8f7;
  color: #737b77;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
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
  .keepalive-card,
  .character-row {
    gap: 10px;
    padding: 11px;
    border-radius: 20px;
  }

  .ringtone-card {
    grid-template-columns: 38px minmax(0, 1fr) max-content;
  }

  .ringtone-mark,
  .keepalive-mark,
  .character-head .avatar {
    width: 38px;
    height: 38px;
    border-radius: 14px;
  }

  .keepalive-power {
    width: 36px;
    height: 36px;
    min-height: 36px;
    border-radius: 14px;
  }

  .keepalive-signal {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .keepalive-signal small {
    grid-column: 2;
  }

  .keepalive-options,
  .keepalive-states {
    grid-template-columns: 1fr;
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