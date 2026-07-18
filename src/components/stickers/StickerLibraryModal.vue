<template>
  <Teleport to="body">
    <div v-if="modelValue" class="sticker-keyboard-layer">
      <button class="sticker-keyboard-dismiss" type="button" aria-label="关闭 Stickers" @click="close"></button>
      <section ref="panelRef" class="sticker-keyboard-panel" role="dialog" aria-label="Stickers">
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
  </Teleport>
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

function emitPanelHeight() {
  emit('panelHeightChange', props.modelValue ? Math.ceil(panelRef.value?.getBoundingClientRect().height ?? 0) : 0);
}

function startPanelObserver() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (!panelRef.value) return;
  resizeObserver = new ResizeObserver(emitPanelHeight);
  resizeObserver.observe(panelRef.value);
  emitPanelHeight();
}

function stopPanelObserver() {
  resizeObserver?.disconnect();
  resizeObserver = null;
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
  --sticker-keyboard-panel-height: clamp(286px, 42vh, 388px);
  position: fixed;
  inset: var(--visual-viewport-offset-top) 0 auto;
  z-index: 11;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: var(--visual-viewport-height);
  pointer-events: none;
}

.sticker-keyboard-dismiss {
  position: absolute;
  inset: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
}

.sticker-keyboard-panel {
  position: relative;
  z-index: 1;
  width: min(100%, 414px);
  height: var(--sticker-keyboard-panel-height);
  max-height: calc(var(--visual-viewport-height) - var(--safe-top) - 76px);
  padding: 9px calc(8px + var(--safe-right)) calc(9px + var(--safe-bottom)) calc(8px + var(--safe-left));
  overflow: hidden;
  border-top: 1px solid rgba(20, 20, 20, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 252, 253, 0.98), rgba(247, 249, 252, 0.98));
  box-shadow: 0 -10px 36px rgba(39, 35, 43, 0.12);
  pointer-events: auto;
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

@media (min-width: 640px) {
  .sticker-keyboard-panel {
    border-radius: 18px 18px 0 0;
  }
}
</style>
