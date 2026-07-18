<template>
  <section class="backup-card webdav-card">
    <header class="card-head">
      <div>
        <span class="card-kicker">Encrypted WebDAV</span>
        <h3>自有云盘备份</h3>
      </div>
      <span class="status-badge" :class="statusClass">{{ statusLabel }}</span>
    </header>

    <p class="security-note">备份在当前设备完成 AES-256-GCM 加密后再上传；服务器不保存云盘账号、恢复密钥或备份文件。</p>

    <label class="field">
      <span>WebDAV 文件夹地址</span>
      <input v-model="urlDraft" type="url" autocomplete="url" placeholder="https://dav.example.com/remote.php/dav/files/name/BabyLink/" @change="() => saveDraft()" />
    </label>

    <div class="field-grid">
      <label class="field">
        <span>账号</span>
        <input v-model="usernameDraft" autocomplete="username" placeholder="username" @change="() => saveDraft()" />
      </label>
      <label class="field">
        <span>应用密码</span>
        <input v-model="passwordDraft" type="password" autocomplete="new-password" placeholder="WebDAV 应用密码" @change="() => saveDraft()" />
      </label>
    </div>

    <div class="field-grid">
      <label class="field">
        <span>备份文件</span>
        <input v-model="pathDraft" placeholder="babylink-backup.enc.json" @change="() => saveDraft()" />
      </label>
      <label class="field">
        <span>间隔分钟</span>
        <input v-model.number="intervalDraft" type="number" min="5" max="1440" step="5" @change="() => saveDraft()" />
      </label>
    </div>

    <label class="field">
      <span>恢复密钥</span>
      <div class="field-with-action">
        <input v-model="recoveryKeyDraft" type="password" autocomplete="off" placeholder="生成后请离线保存" @change="() => saveDraft()" />
        <button class="icon-action key-action" type="button" aria-label="生成恢复密钥" @click="generateRecoveryKey">生成</button>
      </div>
    </label>
    <p class="card-note">忘记恢复密钥后任何人都无法解密云端备份，包括管理员。生成后请复制到密码管理器。</p>

    <label class="toggle-card">
      <input type="checkbox" :checked="enabledDraft" @change="toggleAutoBackup" />
      <div>
        <strong>应用运行时自动备份</strong>
        <span>{{ enabledDraft ? `每 ${normalizedInterval()} 分钟检查一次` : '关闭' }}</span>
      </div>
    </label>

    <div class="action-row webdav-actions">
      <button class="secondary-action" type="button" :disabled="Boolean(busy)" @click="testConnection">测试连接</button>
      <button class="secondary-action" type="button" :disabled="Boolean(busy)" @click="restoreBackup">恢复云端</button>
      <button class="primary-action" type="button" :disabled="Boolean(busy)" @click="backupNow">立即加密备份</button>
    </div>

    <p v-if="feedback" class="feedback" :class="feedbackKind">{{ feedback }}</p>
    <p v-else-if="webDavSettings.lastBackupError" class="feedback error">{{ webDavSettings.lastBackupError }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { createBackupRecoveryKey } from '@/services/encryptedBackup';
import { downloadEncryptedWebDavBackup, testWebDavConnection, uploadEncryptedWebDavBackup } from '@/services/webDavBackup';
import { useAppStore } from '@/stores/appStore';
import type { AppSettings, WebDavBackupSettings } from '@/types/domain';
import { parseLinkBackupFileText } from '@/utils/backup';

const props = defineProps<{ settings: AppSettings }>();
const store = useAppStore();
const urlDraft = ref('');
const usernameDraft = ref('');
const passwordDraft = ref('');
const pathDraft = ref('babylink-backup.enc.json');
const recoveryKeyDraft = ref('');
const intervalDraft = ref(30);
const enabledDraft = ref(false);
const busy = ref('');
const feedback = ref('');
const feedbackKind = ref<'success' | 'error'>('success');

const webDavSettings = computed(() => props.settings.webDavBackup);
const statusClass = computed(() => webDavSettings.value.lastBackupStatus === 'failed' ? 'failed' : webDavSettings.value.lastBackupStatus === 'running' ? 'running' : webDavSettings.value.lastBackupAt ? 'success' : 'idle');
const statusLabel = computed(() => {
  if (webDavSettings.value.lastBackupStatus === 'running') return '备份中';
  if (webDavSettings.value.lastBackupStatus === 'failed') return '失败';
  if (webDavSettings.value.lastBackupAt) return new Date(webDavSettings.value.lastBackupAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  return enabledDraft.value ? '已开启' : '未开启';
});

watch(() => props.settings.webDavBackup, (settings) => {
  urlDraft.value = settings.url;
  usernameDraft.value = settings.username;
  passwordDraft.value = settings.password;
  pathDraft.value = settings.path;
  recoveryKeyDraft.value = settings.recoveryKey;
  intervalDraft.value = settings.intervalMinutes;
  enabledDraft.value = settings.enabled;
}, { immediate: true, deep: true });

function normalizedInterval() {
  return Math.min(1440, Math.max(5, Math.round(Number(intervalDraft.value) || 30)));
}

function buildDraft(overrides: Partial<WebDavBackupSettings> = {}): WebDavBackupSettings {
  return {
    ...(store.settings?.webDavBackup ?? props.settings.webDavBackup),
    enabled: enabledDraft.value,
    url: urlDraft.value.trim(),
    username: usernameDraft.value.trim(),
    password: passwordDraft.value,
    path: pathDraft.value.trim().replace(/^\/+/, '') || 'babylink-backup.enc.json',
    recoveryKey: recoveryKeyDraft.value.trim(),
    intervalMinutes: normalizedInterval(),
    ...overrides
  };
}

async function saveDraft(overrides: Partial<WebDavBackupSettings> = {}) {
  const current = store.settings ?? props.settings;
  await store.saveSettings({ ...current, webDavBackup: buildDraft(overrides) });
}

function setFeedback(message: string, kind: 'success' | 'error' = 'success') {
  feedback.value = message;
  feedbackKind.value = kind;
}

async function generateRecoveryKey() {
  if (recoveryKeyDraft.value && !window.confirm('重新生成会导致旧备份无法使用新密钥解密，确定继续吗？')) return;
  recoveryKeyDraft.value = createBackupRecoveryKey();
  await saveDraft();
  await navigator.clipboard.writeText(recoveryKeyDraft.value).catch(() => undefined);
  setFeedback('恢复密钥已生成并尝试复制，请立即保存到密码管理器。');
}

async function toggleAutoBackup(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  if (checked && (!urlDraft.value.trim() || !usernameDraft.value.trim() || !passwordDraft.value || !recoveryKeyDraft.value.trim())) {
    (event.target as HTMLInputElement).checked = false;
    setFeedback('请先填写 WebDAV 配置并生成恢复密钥。', 'error');
    return;
  }
  enabledDraft.value = checked;
  await saveDraft({ enabled: checked });
  setFeedback(checked ? '自动加密备份已开启。' : '自动备份已关闭。');
}

async function testConnection() {
  busy.value = 'test';
  feedback.value = '';
  try {
    await saveDraft();
    await testWebDavConnection(buildDraft());
    setFeedback('WebDAV 连接成功。');
  } catch (error) {
    setFeedback(error instanceof Error ? error.message : 'WebDAV 连接失败。', 'error');
  } finally {
    busy.value = '';
  }
}

async function backupNow() {
  busy.value = 'backup';
  feedback.value = '';
  await saveDraft({ lastBackupStatus: 'running', lastBackupError: '' });
  try {
    setFeedback('正在整理本地数据并加密…');
    const backup = await store.createBackupFile((label, percent) => setFeedback(`${label} ${Math.round(percent)}%`));
    await uploadEncryptedWebDavBackup(buildDraft(), backup);
    await saveDraft({ lastBackupAt: Date.now(), latestRemoteBackupAt: backup.exportedAt, lastBackupStatus: 'success', lastBackupError: '' });
    setFeedback('端到端加密备份已上传，最近 10 个历史版本会自动保留。');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WebDAV 备份失败。';
    await saveDraft({ lastBackupStatus: 'failed', lastBackupError: message });
    setFeedback(message, 'error');
  } finally {
    busy.value = '';
  }
}

async function restoreBackup() {
  if (!window.confirm('恢复会替换当前设备的本地数据，确定继续吗？')) return;
  busy.value = 'restore';
  feedback.value = '';
  try {
    setFeedback('正在下载并解密云端备份…');
    const backup = parseLinkBackupFileText(await downloadEncryptedWebDavBackup(buildDraft()));
    await store.importBackupSnapshot(backup.snapshot, {
      onProgress: (label, percent) => setFeedback(`${label} ${Math.round(percent)}%`)
    });
    await saveDraft({ latestRemoteBackupAt: backup.exportedAt, lastBackupStatus: 'success', lastBackupError: '' });
    setFeedback('云端加密备份已恢复。');
  } catch (error) {
    const message = error instanceof Error ? error.message : '云端恢复失败。';
    setFeedback(message, 'error');
  } finally {
    busy.value = '';
  }
}
</script>

<style scoped>
.webdav-card { display: grid; gap: 12px; padding: 14px; border: 1px solid rgba(24, 156, 82, .12); border-radius: 14px; background: linear-gradient(160deg, rgba(246,253,248,.98), rgba(238,248,242,.96)); }
.card-head, .field-with-action, .toggle-card { display: flex; align-items: center; }
.card-head { justify-content: space-between; gap: 12px; }
.card-kicker { display: block; margin-bottom: 3px; color: var(--muted); font-size: 10px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
.card-head h3 { margin: 0; font-size: 17px; }
.status-badge { max-width: 108px; padding: 6px 9px; border-radius: 999px; background: rgba(17,17,17,.08); color: #3d433f; font-size: 11px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-badge.success { background: #dff5e6; color: #136c36; }
.status-badge.failed { background: #ffe1e1; color: #a82424; }
.status-badge.running { background: #e4ecff; color: #315ab6; }
.security-note { margin: 0; padding: 11px 12px; border-radius: 14px; background: rgba(21,156,82,.08); color: #3f6850; font-size: 12px; line-height: 1.6; }
.field { display: grid; gap: 6px; min-width: 0; }
.field > span, .toggle-card span { color: var(--muted); font-size: 12px; font-weight: 800; }
.field input { min-width: 0; width: 100%; min-height: 40px; padding: 11px 12px; border-radius: 12px; background: rgba(255,255,255,.86); color: #161917; font-size: 13px; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.field-with-action { gap: 8px; min-width: 0; }
.icon-action { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; border-radius: 12px; background: #111; color: #fff; }
.key-action { width: auto; min-width: 50px; padding: 0 10px; font-size: 11px; font-weight: 850; }
.card-note { margin: 0; color: var(--muted); font-size: 11px; font-weight: 800; line-height: 1.4; }
.toggle-card { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,.78); }
.toggle-card input { width: 18px; height: 18px; }
.toggle-card strong { font-size: 13px; }
.action-row { display: grid; gap: 8px; min-width: 0; }
.webdav-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.primary-action, .secondary-action { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-width: 0; min-height: 38px; padding: 0 9px; border-radius: 12px; font-size: 12px; font-weight: 900; white-space: nowrap; }
.primary-action { background: #111; color: #fff; }
.secondary-action { background: rgba(255,255,255,.84); color: #202321; }
.primary-action:disabled, .secondary-action:disabled { opacity: .52; }
.feedback { margin: 0; color: #136c36; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.feedback.error { color: #a82424; }
@media (max-width: 380px) { .webdav-actions, .field-grid { grid-template-columns: 1fr; } }
</style>