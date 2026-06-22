<template>
  <main class="mobile-shell">
    <RouterView v-slot="{ Component, route }">
      <component :is="Component" :key="route.fullPath" />
    </RouterView>
    <BottomTabs v-if="showTabs" />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import BottomTabs from './BottomTabs.vue';
import { useAppStore } from '@/stores/appStore';

const route = useRoute();
const store = useAppStore();

const showTabs = computed(() => !['chat-room', 'offline-room', 'chat-settings', 'offline-chat-settings', 'account', 'add-friend', 'services', 'settings', 'image-module-settings', 'image-gallery', 'stickers', 'stickers-manage', 'world-book', 'world-book-new', 'world-book-edit'].includes(String(route.name)));

onMounted(() => {
  void store.hydrate();
});
</script>

<style scoped>
.mobile-shell {
  position: relative;
  width: 100%;
  min-height: var(--app-height);
  height: var(--app-height);
  padding-right: var(--safe-right);
  padding-left: var(--safe-left);
  overflow: hidden;
  background: #ffffff;
}
</style>