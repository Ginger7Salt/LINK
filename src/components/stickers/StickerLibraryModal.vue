<template>
  <div v-if="modelValue" class="sticker-keyboard-layer">
    <section ref="panelRef" class="sticker-keyboard-panel" role="region" aria-label="Stickers">
      <StickerLibraryPanel
        :conversation-id="conversationId"
        :disabled="disabled"
        :recommendation-query="recommendationQuery"
        :recommended-stickers="recommendedStickers"
        :quote="quote"
        :show-toolbar-actions="false"
        show-manage-action
        presentation="modal"
        @close="close"
        @manage="openStickersPage"
        @sent="emit('sent')"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import StickerLibraryPanel from '@/components/stickers/StickerLibraryPanel.vue';
import type { ChatMessageQuote, Sticker } from '@/types/domain';

const props = defineProps<{
  modelValue: boolean;
  conversationId?: string;
  disabled?: boolean;
  recommendationQuery?: string;
  recommendedStickers?: Sticker[];
  quote?: ChatMessageQuote | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'panelHeightChange': [height: number];
  sent: [];
}>();

const router = useRouter();
const panelRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

function handleOutsidePointer(event: PointerEvent) {
  const target = event.target;
  if (target instanceof Node && !panelRef.value?.contains(target)) close();
}

function emitPanelHeight() {
  emit('panelHeightChange', props.modelValue ? Math.ceil(panelRef.value?.getBoundingClientRect().height ?? 0) : 0);
}

function startPanelObserver() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (!panelRef.value) return;
  resizeObserver = new ResizeObserver(emitPanelHeight);
  resizeObserver.observe(panelRef.value);
  document.addEventListener('pointerdown', handleOutsidePointer, true);
  emitPanelHeight();
}

function stopPanelObserver() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  document.removeEventListener('pointerdown', handleOutsidePointer, true);
  emit('panelHeightChange', 0);
}

function close() {
  emit('update:modelValue', false);
}

function openStickersPage() {
  close();
  void router.push({ name: 'stickers' });
}

watch(() => props.modelValue, async (open) => {
  if (!open) {
    stopPanelObserver();
    return;
  }
  await nextTick();
  startPanelObserver();
}, { immediate: true, flush: 'post' });

onBeforeUnmount(stopPanelObserver);
</script>

<style scoped>
.sticker-keyboard-layer {
  --sticker-keyboard-panel-height: var(--sticker-panel-height);
  position: relative;
  z-index: 11;
  flex: 0 0 var(--sticker-keyboard-panel-height);
  display: flex;
  width: 100%;
  min-height: 0;
  height: var(--sticker-keyboard-panel-height);
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
}

.sticker-keyboard-panel {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 9px calc(8px + var(--safe-right)) 9px calc(8px + var(--safe-left));
  overflow: hidden;
  border-top: 1px solid rgba(20, 20, 20, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 252, 253, 0.98), rgba(247, 249, 252, 0.98));
  box-shadow: 0 -10px 36px rgba(39, 35, 43, 0.12);
  animation: sticker-keyboard-enter 180ms ease-out;
}

.sticker-keyboard-panel :deep(.sticker-sheet-modal) {
  height: 100%;
  min-height: 0;
}

@keyframes sticker-keyboard-enter {
  from {
    transform: translate3d(0, 100%, 0);
  }
  to {
    transform: translate3d(0, 0, 0);
  }
}

</style>
