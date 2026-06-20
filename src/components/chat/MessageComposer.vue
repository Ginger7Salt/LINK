<template>
  <form :class="['composer', { 'composer--online': online, 'composer--text-mode': textMode }]" @submit.prevent="submit">
    <div v-if="quote" class="composer-quote">
      <div>
        <strong>{{ quote.authorName }}</strong>
        <span>{{ quoteContent }}</span>
      </div>
      <button class="quote-cancel" type="button" aria-label="取消引用" @click="$emit('cancel-quote')">
        <X :size="15" />
      </button>
    </div>
    <button v-if="!textMode" class="icon-button" type="button" aria-label="添加" @click="$emit('open-menu')">
      <Plus :size="27" />
    </button>
    <input ref="cameraInputRef" class="visually-hidden-input" type="file" accept="image/*" capture="environment" @change="handleCameraFile" />
    <button v-if="!textMode" class="icon-button" type="button" aria-label="相机" :disabled="disabled" @click="openCameraInput">
      <Camera :size="23" />
    </button>
    <button v-if="online && !textMode" class="icon-button" type="button" aria-label="图片" :disabled="disabled" @click="$emit('open-image-panel')">
      <ImageIcon :size="23" />
    </button>
    <label class="composer-input">
      <input
        v-model="text"
        :placeholder="placeholder"
        :disabled="disabled"
        @pointerdown="emit('prepare-focus')"
        @touchstart.passive="emit('prepare-focus')"
        @focus="handleFocus"
        @blur="handleBlur"
      />
      <button v-if="!textMode" class="sticker-button" type="button" aria-label="Stickers" @click.stop="$emit('open-stickers')">
        <Smile :size="online ? 20 : 21" />
      </button>
    </label>
    <template v-if="online && textMode">
      <button class="text-action text-action--send" type="button" :disabled="disabled || !text.trim()" @pointerdown.prevent="keepTextMode" @click="submit">发送</button>
      <button class="text-action text-action--reply" type="button" :disabled="disabled || (!text.trim() && !canSendReply)" @pointerdown.prevent="keepTextMode" @click="submitAndReply">回复</button>
    </template>
    <button v-else-if="online" class="voice-button" type="button" :disabled="disabled" aria-label="发送语音" @click="$emit('open-voice-panel')">
      <Mic :size="22" />
    </button>
    <button v-else class="send-button" type="button" :disabled="disabled || !text.trim()" aria-label="发送" @click="pressSendButton">
    </button>
  </form>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Camera, Image as ImageIcon, Mic, Plus, Smile, X } from 'lucide-vue-next';
import type { ChatMessageQuote } from '@/types/domain';

const props = defineProps<{
  canSendReply?: boolean;
  disabled?: boolean;
  online?: boolean;
  placeholder?: string;
  quote?: ChatMessageQuote | null;
}>();

const emit = defineEmits<{
  'cancel-quote': [];
  'capture-photo': [file: File];
  blur: [];
  focus: [];
  'prepare-focus': [];
  'open-image-panel': [];
  'open-menu': [];
  'open-stickers': [];
  'open-voice-panel': [];
  reply: [content: string];
  send: [content: string];
}>();

const text = ref('');
const inputFocused = ref(false);
const cameraInputRef = ref<HTMLInputElement | null>(null);
let blurTimer: number | undefined;
const textMode = computed(() => Boolean(props.online && inputFocused.value));
const quoteContent = computed(() => {
  if (props.quote?.sticker) return `[Sticker] ${props.quote.sticker.description}`;
  if (props.quote?.image) return `[图片] ${props.quote.image.description}`;
  if (props.quote?.voice) return `[语音] ${props.quote.voice.transcript}`;
  if (props.quote?.location) return `[定位] ${props.quote.location.name}`;
  return props.quote?.content ?? '';
});

function clearBlurTimer() {
  if (blurTimer === undefined) return;
  window.clearTimeout(blurTimer);
  blurTimer = undefined;
}

function keepTextMode() {
  clearBlurTimer();
}

function handleFocus() {
  clearBlurTimer();
  inputFocused.value = true;
  emit('focus');
}

function handleBlur() {
  emit('blur');
  clearBlurTimer();
  blurTimer = window.setTimeout(() => {
    inputFocused.value = false;
    blurTimer = undefined;
  }, 120);
}

function submit() {
  const content = text.value.trim();
  if (!content) return;
  emit('send', content);
  text.value = '';
}

function submitAndReply() {
  const content = text.value.trim();
  if (content) text.value = '';
  emit('reply', content);
}

function pressSendButton() {
  if (props.online) {
    submitAndReply();
    return;
  }
  submit();
}

function openCameraInput() {
  cameraInputRef.value?.click();
}

function handleCameraFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file?.type.startsWith('image/')) emit('capture-photo', file);
}

onBeforeUnmount(clearBlurTimer);
</script>

<style scoped>
.composer {
  position: relative;
  z-index: 12;
  display: grid;
  grid-template-columns: 32px 32px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 3px;
  min-height: calc(52px + var(--safe-bottom));
  padding: 6px calc(8px + var(--safe-right)) calc(6px + var(--safe-bottom)) calc(8px + var(--safe-left));
  background: rgba(255, 255, 255, 0.98);
  transform: translate3d(0, calc(0px - var(--keyboard-inset)), 0);
  will-change: transform;
}

.visually-hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.icon-button:disabled {
  opacity: 0.45;
  cursor: default;
}

.composer-quote {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 7px 8px;
  border-radius: 9px;
  background: #f2f3f4;
  color: #4d535a;
}

.composer-quote div {
  display: grid;
  flex: 1 1 auto;
  gap: 2px;
  min-width: 0;
}

.composer-quote strong,
.composer-quote span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-quote strong {
  font-size: 11px;
  line-height: 1.15;
}

.composer-quote span {
  font-size: 12px;
  line-height: 1.2;
}

.quote-cancel {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  margin-left: auto;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #626971;
}

.quote-cancel:active {
  background: rgba(0, 0, 0, 0.06);
}

.composer-input {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border-radius: 17px;
  background: #f0f1f2;
  color: #777b80;
}

.composer-input svg {
  width: 19px;
  height: 19px;
}

.sticker-button {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #777b80;
}

.sticker-button:active {
  background: rgba(0, 0, 0, 0.06);
}

.send-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 14px;
  background: var(--link-green);
  color: #ffffff;
}

.voice-button {
  display: grid;
  place-items: center;
  width: var(--top-icon-button-width);
  height: var(--top-icon-button-height);
  border-radius: 8px;
  background: transparent;
  color: #141414;
}

.voice-button svg {
  width: var(--top-icon-size);
  height: var(--top-icon-size);
}

.send-button:disabled {
  background: #d6d8db;
}

.voice-button:disabled {
  opacity: 0.45;
  cursor: default;
}

.composer--online {
  grid-template-columns: 32px 32px 32px minmax(0, 1fr) 30px;
}

.composer--online .composer-input {
  font-size: 14px;
}

.composer--online .sticker-button svg {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
}

.composer--text-mode {
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 6px;
}

.composer--text-mode .composer-input {
  height: 36px;
  border-radius: 18px;
  font-size: 14px;
}

.text-action {
  min-width: 44px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  color: #2d333a;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.2;
  white-space: nowrap;
}

.text-action--send {
  background: #eff1f3;
}

.text-action--reply {
  background: #eff1f3;
  color: #2d333a;
}

.text-action:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>