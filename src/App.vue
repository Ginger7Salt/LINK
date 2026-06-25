<template>
  <MobileShell />
  <FirstRunDisclaimer v-if="showDisclaimer" :model-value="showDisclaimer" @complete="handleDisclaimerComplete" />
  <AppModal v-model="store.configAlert.open" :title="store.configAlert.title">
    <section class="config-alert">
      <p>{{ store.configAlert.message }}</p>
    </section>
  </AppModal>
  <audio ref="musicAudioRef" class="global-music-audio" preload="metadata"></audio>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MobileShell from '@/components/layout/MobileShell.vue';
import AppModal from '@/components/common/AppModal.vue';
import FirstRunDisclaimer from '@/components/common/FirstRunDisclaimer.vue';
import { useAppStore } from '@/stores/appStore';
import { useMusicPlayerStore } from '@/stores/musicPlayerStore';

const store = useAppStore();
const musicPlayer = useMusicPlayerStore();
const musicAudioRef = ref<HTMLAudioElement | null>(null);
let githubAutoBackupTimer: number | undefined;

const showDisclaimer = computed(() => store.ready && !store.settings?.disclaimerAccepted);
const githubBackupScheduleKey = computed(() => {
  const backup = store.settings?.githubBackup;
  if (!store.ready || !backup?.enabled || !backup.token || !backup.owner || !backup.repo) return '';
  return [backup.owner, backup.repo, backup.branch, backup.path, backup.intervalMinutes].join('|');
});

function clearGitHubAutoBackupTimer() {
  if (!githubAutoBackupTimer) return;
  window.clearInterval(githubAutoBackupTimer);
  githubAutoBackupTimer = undefined;
}

function getGitHubBackupIntervalMs() {
  const minutes = Math.max(1, store.settings?.githubBackup.intervalMinutes ?? 30);
  return minutes * 60 * 1000;
}

async function runGitHubAutoBackupIfDue() {
  const backup = store.settings?.githubBackup;
  if (!backup?.enabled || !backup.token || !backup.owner || !backup.repo) return;

  const intervalMs = getGitHubBackupIntervalMs();
  if (backup.lastBackupAt && Date.now() - backup.lastBackupAt < intervalMs) return;

  try {
    await store.runGitHubBackup('auto');
  } catch {
    return;
  }
}

watch(
  githubBackupScheduleKey,
  (scheduleKey) => {
    clearGitHubAutoBackupTimer();
    if (!scheduleKey) return;

    void runGitHubAutoBackupIfDue();
    githubAutoBackupTimer = window.setInterval(() => {
      void runGitHubAutoBackupIfDue();
    }, getGitHubBackupIntervalMs());
  },
  { immediate: true }
);

onMounted(() => {
  musicPlayer.setAudioElement(musicAudioRef.value);
});

onBeforeUnmount(() => {
  clearGitHubAutoBackupTimer();
  musicPlayer.setAudioElement(null);
});

async function handleDisclaimerComplete() {
  if (!store.settings) return;
  await store.saveSettings({
    ...store.settings,
    disclaimerAccepted: true
  });
}
</script>

<style scoped>
.config-alert p {
  margin: 0;
  color: #363a40;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.global-music-audio {
  display: none;
}
</style>
