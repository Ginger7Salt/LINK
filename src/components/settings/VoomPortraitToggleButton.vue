<template>
  <button class="voom-portrait-button" :class="{ active: requirePortrait }" type="button" :aria-label="buttonLabel" :title="buttonLabel" @click="showPanel = true">
    <UserRound :size="18" stroke-width="2.4" />
  </button>

  <AppModal v-model="showPanel" title="VOOM 人像模式" :show-header="false" variant="ins">
    <section class="voom-portrait-panel">
      <button class="portrait-toggle-card" :class="{ active: requirePortrait }" type="button" @click="togglePortraitRequirement">
        <span class="toggle-indicator" aria-hidden="true"></span>
        <span class="toggle-copy">
          <strong>VOOM 人像模式</strong>
          <small>{{ requirePortrait ? '已要求 VOOM 生图包含发布角色本人。' : '关闭后 VOOM 生图提示词保持原样。' }}</small>
        </span>
      </button>
    </section>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { UserRound } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import { useAppStore } from '@/stores/appStore';
import { normalizeAppSettings } from '@/utils/settings';

const store = useAppStore();
const showPanel = ref(false);

const requirePortrait = computed(() => store.settings?.voomImageRequirePortrait !== false);
const buttonLabel = computed(() => requirePortrait.value ? 'VOOM 人像模式：已开启' : 'VOOM 人像模式：已关闭');

async function togglePortraitRequirement() {
  if (!store.settings) return;
  await store.saveSettings(normalizeAppSettings({
    ...store.settings,
    voomImageRequirePortrait: !requirePortrait.value
  }));
}
</script>

<style scoped>
.voom-portrait-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 34px;
  width: 34px;
  min-height: 34px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: #111111;
}

.voom-portrait-button.active {
  background: transparent;
  color: #111111;
}

.voom-portrait-panel {
  display: grid;
  gap: 12px;
  padding-top: 4px;
}

.portrait-toggle-card {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(17, 17, 17, 0.05);
  border-radius: 12px;
  background: #ffffff;
  color: #202329;
  text-align: left;
}

.toggle-indicator {
  position: relative;
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: #dfe4e8;
  transition: background 0.18s ease;
}

.toggle-indicator::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(17, 17, 17, 0.18);
  content: '';
  transition: transform 0.18s ease;
}

.portrait-toggle-card.active .toggle-indicator {
  background: var(--link-green);
}

.portrait-toggle-card.active .toggle-indicator::after {
  transform: translateX(20px);
}

.toggle-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.toggle-copy strong {
  color: #202329;
  font-size: 15px;
  font-weight: 900;
}

.toggle-copy small {
  color: #697079;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
}
</style>