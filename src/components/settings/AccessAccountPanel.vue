<template>
  <section class="access-card">
    <header>
      <div>
        <span>Access</span>
        <h3>QQ 访问账号</h3>
      </div>
      <strong v-if="session">{{ maskQq(session.qq) }}</strong>
    </header>

    <p v-if="!enabled" class="muted disabled-note">当前开发环境未启用 QQ 访问控制；线上登录后会在这里显示账号与设备。</p>
    <p v-else-if="loading" class="muted">正在读取登录设备…</p>
    <p v-else-if="feedback" class="feedback" :class="{ error: feedbackError }">{{ feedback }}</p>

    <div v-if="session" class="device-list">
      <article v-for="device in devices" :key="device.id">
        <div>
          <strong>{{ device.label || '未命名设备' }} <em v-if="device.current">当前</em></strong>
          <span>最近使用 {{ formatTime(device.lastSeenAt) }}</span>
        </div>
        <button type="button" :disabled="busyId === device.id" @click="removeDevice(device)">
          {{ device.current ? '退出' : '移除' }}
        </button>
      </article>
    </div>

    <button v-if="enabled && session" class="logout" type="button" @click="logoutAccessSession">退出当前账号</button>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchAccessDevices, fetchAccessSession, isAccessControlEnabled, logoutAccessSession, revokeAccessDevice, type AccessDevice, type AccessSession } from '@/services/access';

const enabled = isAccessControlEnabled();
const loading = ref(enabled);
const session = ref<AccessSession | null>(null);
const devices = ref<AccessDevice[]>([]);
const feedback = ref('');
const feedbackError = ref(false);
const busyId = ref('');

function maskQq(qq: string) {
  if (qq.length < 7) return qq;
  return `${qq.slice(0, 3)}****${qq.slice(-3)}`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

async function loadAccount() {
  if (!enabled) return;
  loading.value = true;
  try {
    [session.value, devices.value] = await Promise.all([fetchAccessSession(), fetchAccessDevices()]);
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '无法读取访问账号。';
    feedbackError.value = true;
  } finally {
    loading.value = false;
  }
}

async function removeDevice(device: AccessDevice) {
  if (!window.confirm(device.current ? '确定退出当前设备吗？' : `确定移除“${device.label || '未命名设备'}”吗？`)) return;
  busyId.value = device.id;
  try {
    await revokeAccessDevice(device.id);
    if (device.current) {
      await logoutAccessSession();
      return;
    }
    await loadAccount();
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '移除设备失败。';
    feedbackError.value = true;
  } finally {
    busyId.value = '';
  }
}

onMounted(() => void loadAccount());
</script>

<style scoped>
.access-card { display: grid; gap: 14px; padding: 18px; border: 1px solid rgba(17, 132, 67, .1); border-radius: 20px; background: linear-gradient(145deg, #f4fbf6, #eef7f1); }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
header span { color: #159653; font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
header h3 { margin: 3px 0 0; font-size: 18px; }
header > strong { padding: 6px 9px; border-radius: 999px; background: #fff; color: #287249; font-size: 12px; }
.device-list { display: grid; gap: 8px; }
article { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 12px; border-radius: 14px; background: rgba(255,255,255,.84); }
article > div { display: grid; gap: 3px; min-width: 0; }
article strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
article span { color: #738078; font-size: 11px; }
article em { padding: 2px 5px; border-radius: 999px; background: #dff5e7; color: #128044; font-size: 9px; font-style: normal; }
article button, .logout { min-height: 34px; padding: 0 11px; border-radius: 11px; background: #e8f2ec; color: #246240; font-size: 12px; font-weight: 800; }
.logout { min-height: 42px; background: #fff; color: #9c3b3b; }
.muted, .feedback { margin: 0; color: #748178; font-size: 12px; }
.disabled-note { padding: 14px; border-radius: 14px; background: rgba(255,255,255,.72); line-height: 1.6; }
.feedback.error { color: #b63e3e; }
</style>