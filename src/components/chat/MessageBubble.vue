<template>
  <article :class="['message-row', message.sender, { selecting: selectionMode, selected, 'hide-avatar': hideAvatar, 'profile-alert': showProfileAlert }]">
    <button v-if="selectionMode" class="selection-dot" type="button" :aria-pressed="selected" @click.stop="emit('toggle-select')">
      <span></span>
    </button>
    <button v-if="showAvatarButton" class="avatar-button" type="button" :aria-hidden="hideAvatar" :tabindex="hideAvatar ? -1 : 0" @click.stop="handleAvatarClick">
      <img class="avatar mini" :src="avatarSource" :alt="avatarAlt" />
    </button>
    <div class="bubble-wrap">
      <div
        class="bubble-stack"
        @click="handleBubbleClick"
        @contextmenu.prevent="emitLongPress"
        @pointercancel="cancelLongPress"
        @pointerdown="startLongPress"
        @pointerleave="cancelLongPress"
        @pointermove="trackPointerMove"
        @pointerup="cancelLongPress"
      >
        <div class="bubble" :class="{ narration: message.displayStyle === 'narration', sticker: message.sticker, image: message.image, voice: message.voice, location: message.location, transfer: message.transfer }" :style="bubbleStyle">
          <template v-if="message.sticker">
            <img class="sticker-image" :src="message.sticker.imageUrl" :alt="message.sticker.description" />
          </template>
          <template v-else-if="message.image">
            <figure class="chat-image-card" :class="[`chat-image-card--${message.image.kind}`, { interactive: message.sender === 'char' }]" :style="imageCardStyle" @click="handleImageCardClick">
              <img v-if="message.image.url && !isBrokenImageSource(message.image.url)" :src="message.image.url" :alt="message.image.description" @error="markBrokenImageSource(message.image.url)" />
              <figcaption v-if="message.image.kind === 'description' || isBrokenImageSource(message.image.url)">{{ message.image.description }}</figcaption>
            </figure>
          </template>
          <template v-else-if="message.voice">
            <div class="voice-message" :class="{ playing: playingVoice, loading: voiceLoading }" :style="voiceMessageStyle" role="button" tabindex="0" :aria-label="voiceButtonLabel" :aria-expanded="showVoiceTranscript" @click.stop="toggleVoiceTranscript" @keydown.enter.prevent="toggleVoiceTranscript" @keydown.space.prevent="toggleVoiceTranscript">
              <span class="voice-wave" aria-hidden="true">
                <span v-for="bar in voiceWaveBars" :key="bar" :style="{ '--voice-bar-index': bar }"></span>
              </span>
              <span class="voice-duration">{{ voiceDurationLabel }}</span>
              <button class="voice-play-button" type="button" :aria-label="voicePlaybackLabel" :disabled="voicePlayDisabled" @click.stop="handleVoicePlayback">
                <LoaderCircle v-if="voiceLoading" class="voice-loading-icon" :size="14" />
                <Pause v-else-if="playingVoice" :size="13" fill="currentColor" />
                <Play v-else :size="13" fill="currentColor" />
              </button>
            </div>
          </template>
          <template v-else-if="message.location">
            <section class="location-message" :style="cardAccentStyle" aria-label="定位消息">
              <span class="location-map" aria-hidden="true">
                <MapPin :size="22" />
              </span>
              <span class="location-copy">
                <strong>{{ message.location.name }}</strong>
                <span v-if="message.location.address">{{ message.location.address }}</span>
                <small>{{ locationDistanceLabel }}</small>
              </span>
            </section>
          </template>
          <template v-else-if="message.transfer">
            <section class="transfer-message" :class="`transfer-message--${message.transfer.status}`" :style="cardAccentStyle" aria-label="转账消息">
              <span class="transfer-mark" aria-hidden="true"></span>
              <span class="transfer-copy">
                <span class="transfer-title">{{ transferTitle }}</span>
                <strong>¥{{ message.transfer.amount }}</strong>
                <span class="transfer-note" :aria-hidden="!message.transfer.note">{{ message.transfer.note || ' ' }}</span>
              </span>
            </section>
          </template>
          <template v-else>
            <span>{{ displayContent }}</span>
            <template v-if="showInlineTranslation">
              <span class="translation-divider" aria-hidden="true"></span>
              <span class="translation-copy">{{ displayTranslation }}</span>
            </template>
          </template>
        </div>
        <p v-if="message.voice && showVoiceTranscript" class="voice-transcript">
          <span>{{ message.voice.transcript }}</span>
          <template v-if="showVoiceTranslation">
            <span class="translation-divider" aria-hidden="true"></span>
            <span class="translation-copy">{{ displayTranslation }}</span>
          </template>
        </p>
        <div v-if="message.quote" class="quote-card">
          <p>
            <strong>{{ quoteAuthorLabel }}</strong>
            <span>{{ quoteText }}</span>
          </p>
          <img v-if="quoteThumbnail" class="quote-thumbnail" :src="quoteThumbnail" :alt="quoteText" />
        </div>
      </div>
        <div v-if="showMessageMeta" class="message-meta">
          <span v-if="showReadState" class="read-state">{{ statusLabel }}</span>
          <time v-if="showMessageTime">{{ formatChatTime(message.createdAt) }}</time>
        </div>
    </div>
  </article>

  <AppModal v-if="message.image && message.sender === 'char'" v-model="showImageModal" title="聊天图片" variant="ins">
    <section class="image-viewer" :class="{ flipped: imageFlipped }" :style="imageViewerStyle">
      <button class="image-flip-card" type="button" @click="toggleImageFlip">
        <span class="image-face image-picture-face">
          <img v-if="modalImageSrc && !isBrokenImageSource(modalImageSrc)" :src="modalImageSrc" :alt="selectedImageDescription" @error="markBrokenImageSource(modalImageSrc)" />
          <span v-else>{{ selectedImageDescription }}</span>
        </span>
        <span class="image-face image-text-face">
          <span>{{ imageDescriptionDraft || selectedImageDescription }}</span>
        </span>
      </button>

      <div v-if="imageCandidates.length" class="image-history" aria-label="聊天图片历史">
        <button
          v-for="(candidate, index) in imageCandidates"
          :key="candidate.id"
          class="image-thumb"
          :class="{ active: candidate.id === selectedCandidateId }"
          type="button"
          :aria-label="`查看图片 ${index + 1}`"
          @click="selectCandidate(candidate.id)"
        >
          <img :src="candidate.image" :alt="candidate.description || '聊天图片'" @error="markBrokenImageSource(candidate.image)" />
        </button>
      </div>

      <label v-if="canRegenerateImage" class="image-description-field">
        <span>Description</span>
        <textarea v-model="imageDescriptionDraft" maxlength="500" placeholder="修改图片描述后重新生成。"></textarea>
      </label>

      <div class="image-actions">
        <button class="image-secondary" type="button" @click="toggleImageFlip">翻转</button>
        <button v-if="imageCandidates.length" class="image-secondary" type="button" :disabled="regeneratingImage || !canApplySelectedCandidate" @click="applySelectedCandidate">应用</button>
        <button
          v-if="canRegenerateImage"
          class="image-primary"
          type="button"
          :class="{ busy: regeneratingImage }"
          :aria-disabled="regeneratingImage"
          :disabled="regeneratingImage || !imageDescriptionDraft.trim()"
          @click="regenerateImage"
        >
          <LoaderCircle v-if="regeneratingImage" class="loading-icon" :size="15" />
          <span>{{ regeneratingImage ? '生成中' : '重新生成' }}</span>
        </button>
      </div>
    </section>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { LoaderCircle, MapPin, Pause, Play } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import type { CharacterProfile, ChatAppearanceSettings, ChatImageCandidate, ChatMessage, UserProfile } from '@/types/domain';
import { useAppStore } from '@/stores/appStore';
import { getCharacterDisplayName } from '@/utils/character';
import { formatChatTime } from '@/utils/time';
import { defaultConversationSettings } from '@/utils/memory';
import { defaultProfileAvatar } from '@/utils/profile';
import { normalizeTranslationText, shouldShowChineseTranslation } from '@/utils/translation';

const props = withDefaults(defineProps<{
  message: ChatMessage;
  character: CharacterProfile;
  user?: UserProfile;
  appearance?: ChatAppearanceSettings;
  hideAvatar?: boolean;
  profileAlert?: boolean;
  canRegenerateImage?: boolean;
  regeneratingImage?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
}>(), {
  appearance: () => defaultConversationSettings.appearance,
  canRegenerateImage: false,
  hideAvatar: false,
  profileAlert: false,
  regeneratingImage: false,
  selectionMode: false,
  selected: false
});

const emit = defineEmits<{
  'open-profile': [];
  'open-user-profile': [];
  'long-press': [message: ChatMessage];
  'toggle-select': [];
  'regenerate-image': [messageId: string, description: string];
  'apply-image': [messageId: string, candidateId: string];
  'busy-action': [message: string, title: string];
  'open-card-detail': [message: ChatMessage];
}>();

const store = useAppStore();

let longPressTimer: number | undefined;
let longPressStart: { x: number; y: number } | null = null;
let longPressTriggered = false;
const showImageModal = ref(false);
const imageFlipped = ref(false);
const imageDescriptionDraft = ref('');
const selectedCandidateId = ref('');
const brokenImageSources = ref<string[]>([]);
const playingVoice = ref(false);
const showVoiceTranscript = ref(true);
const voiceLoading = ref(false);
let activeVoiceAudio: HTMLAudioElement | null = null;

function extractJsonContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function normalizeTextFragments(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeTextFragments(item));
  if (typeof value === 'string' || typeof value === 'number') {
    const content = String(value).trim();
    return content ? [content] : [];
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.content, record.text, record.message, record.reply];
    for (const candidate of candidates) {
      const fragments = normalizeTextFragments(candidate);
      if (fragments.length) return fragments;
    }
  }
  return [];
}

const displayContent = computed(() => {
  if (props.message.sender !== 'char') return props.message.content;
  try {
    const parsed = JSON.parse(extractJsonContent(props.message.content)) as Record<string, unknown>;
    const fragments = normalizeTextFragments(parsed.replies ?? parsed.reply ?? parsed.content ?? parsed.message ?? parsed.text);
    return fragments.length ? fragments.join('\n') : props.message.content;
  } catch {
    return props.message.content;
  }
});

function normalizeTranslationFragments(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeTranslationFragments(item));
  if (typeof value === 'string' || typeof value === 'number') {
    const content = normalizeTranslationText(value);
    return content ? [content] : [];
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.contentTranslation, record.translation, record.translationZh, record.chineseTranslation, record.chinese, record.zh, record.cn, record.translatedContent];
    for (const candidate of candidates) {
      const fragments = normalizeTranslationFragments(candidate);
      if (fragments.length) return fragments;
    }
  }
  return [];
}

const parsedTranslation = computed(() => {
  if (props.message.sender !== 'char') return '';
  try {
    const parsed = JSON.parse(extractJsonContent(props.message.content)) as Record<string, unknown>;
    const topLevelTranslations = normalizeTranslationFragments(
      parsed.replyTranslations
      ?? parsed.translations
      ?? parsed.translationTexts
      ?? parsed.chineseTranslations
      ?? parsed.translation
      ?? parsed.contentTranslation
    );
    if (topLevelTranslations.length) return topLevelTranslations.join('\n');
    return normalizeTranslationFragments(parsed.replies ?? parsed.reply ?? parsed.content ?? parsed.message ?? parsed.text).join('\n');
  } catch {
    return '';
  }
});

const displayTranslation = computed(() => normalizeTranslationText(props.message.translation) || parsedTranslation.value);
const showInlineTranslation = computed(() => props.message.sender === 'char'
  && props.message.mode === 'online'
  && !props.message.sticker
  && !props.message.voice
  && !props.message.location
  && shouldShowChineseTranslation(displayContent.value, displayTranslation.value));
const showVoiceTranslation = computed(() => props.message.sender === 'char'
  && props.message.mode === 'online'
  && Boolean(props.message.voice)
  && shouldShowChineseTranslation(props.message.voice?.transcript ?? '', displayTranslation.value));

const characterDisplayName = computed(() => getCharacterDisplayName(props.character));
const userDisplayName = computed(() => {
  const user = props.user ?? store.user;
  return user?.nickname || user?.name || '我';
});
const userAvatar = computed(() => (props.user ?? store.user)?.avatar || defaultProfileAvatar);
const showAvatarButton = computed(() => props.message.sender === 'char' || (props.message.sender === 'user' && props.appearance.showUserAvatar));
const avatarSource = computed(() => (props.message.sender === 'user' ? userAvatar.value : props.character.avatar));
const avatarAlt = computed(() => (props.message.sender === 'user' ? userDisplayName.value : characterDisplayName.value));
const showProfileAlert = computed(() => props.profileAlert && props.message.sender === 'char');
const quoteText = computed(() => props.message.quote?.sticker
  ? props.message.quote.sticker.description
  : props.message.quote?.image
    ? props.message.quote.image.description
    : props.message.quote?.voice
      ? props.message.quote.voice.transcript
      : props.message.quote?.location
        ? props.message.quote.location.name
        : props.message.quote?.transfer
          ? `¥${props.message.quote.transfer.amount}`
  : props.message.quote?.content ?? '');
const quoteThumbnail = computed(() => props.message.quote?.sticker?.imageUrl ?? props.message.quote?.image?.url ?? '');
const quoteAuthorLabel = computed(() => (props.message.quote?.authorName ? `${props.message.quote.authorName}：` : ''));

const bubbleStyle = computed(() => {
  if (props.message.sticker || props.message.image || props.message.location || props.message.transfer) return {};
  if (props.message.displayStyle === 'narration') {
    return {
      background: props.appearance.narrationBubbleColor,
      color: props.appearance.narrationTextColor
    };
  }
  if (props.message.sender === 'user') {
    return {
      background: props.appearance.userBubbleColor,
      color: props.appearance.userTextColor
    };
  }
  if (props.message.sender === 'char') {
    return {
      background: props.appearance.characterBubbleColor,
      color: props.appearance.characterTextColor
    };
  }
  return {};
});

const cardAccentStyle = computed(() => {
  if (props.message.sender === 'user') {
    return {
      '--message-card-accent-bg': props.appearance.userBubbleColor,
      '--message-card-accent-fg': props.appearance.userTextColor
    };
  }
  if (props.message.sender === 'char') {
    return {
      '--message-card-accent-bg': props.appearance.characterBubbleColor,
      '--message-card-accent-fg': props.appearance.characterTextColor
    };
  }
  return {};
});

const imageCardStyle = computed(() => {
  const image = props.message.image;
  if (!image?.width || !image.height) return { '--chat-image-ratio': '1 / 1' };
  return { '--chat-image-ratio': `${image.width} / ${image.height}` };
});

const imageCandidates = computed<ChatImageCandidate[]>(() => {
  const image = props.message.image;
  const candidates = [...(image?.candidates ?? [])].filter((candidate) => candidate.image && !isBrokenImageSource(candidate.image));
  if (image?.url && !candidates.some((candidate) => candidate.image === image.url)) {
    candidates.unshift({
      id: `${props.message.id}-current-image`,
      image: image.url,
      description: image.description,
      provider: image.provider || 'local',
      model: image.model,
      size: image.size,
      createdAt: props.message.createdAt
    });
  }
  return candidates;
});
const selectedCandidate = computed(() => imageCandidates.value.find((candidate) => candidate.id === selectedCandidateId.value) ?? imageCandidates.value.find((candidate) => candidate.image === props.message.image?.url));
const selectedImageDescription = computed(() => selectedCandidate.value?.description || props.message.image?.description || '图片描述暂未保存。');
const modalImageSrc = computed(() => selectedCandidate.value?.image || props.message.image?.url || '');
const canApplySelectedCandidate = computed(() => Boolean(selectedCandidate.value && selectedCandidate.value.image !== props.message.image?.url && !selectedCandidate.value.id.endsWith('-current-image')));
const imageViewerAspectRatio = computed(() => {
  const size = selectedCandidate.value?.size || props.message.image?.size || '';
  const [width, height] = size.split('x').map((value) => Number.parseInt(value, 10));
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) return `${width} / ${height}`;
  if (props.message.image?.width && props.message.image.height) return `${props.message.image.width} / ${props.message.image.height}`;
  return '1 / 1';
});
const imageViewerStyle = computed(() => ({ '--chat-viewer-ratio': imageViewerAspectRatio.value }));
const locationDistanceLabel = computed(() => (props.message.sender === 'user'
  ? `距离对方 ${props.message.location?.distance ?? ''}`
  : `距离你 ${props.message.location?.distance ?? ''}`));
const transferTitle = computed(() => (props.message.sender === 'user' ? '转账给对方' : '转账给你'));
const voiceDuration = computed(() => {
  const duration = props.message.voice?.duration ?? 0;
  if (Number.isFinite(duration) && duration > 0) return Math.max(1, Math.round(duration));
  const transcriptLength = props.message.voice?.transcript.trim().length ?? 0;
  return Math.max(1, Math.ceil(transcriptLength / 4));
});
const voiceDurationLabel = computed(() => `${voiceDuration.value}"`);
const voiceMessageStyle = computed(() => ({
  '--voice-width': `${Math.min(144, Math.max(98, 64 + voiceDuration.value * 2))}px`
}));
const voiceWaveBars = computed(() => Array.from({
  length: Math.min(18, Math.max(4, Math.ceil(voiceDuration.value / 4) + 4))
}, (_, index) => index));
const canGenerateVoiceAudio = computed(() => props.message.sender === 'char' && Boolean(props.message.voice?.transcript.trim()));
const voicePlayDisabled = computed(() => voiceLoading.value || (!props.message.voice?.audioUrl && !canGenerateVoiceAudio.value));
const voiceButtonLabel = computed(() => (showVoiceTranscript.value ? '收起语音文字' : '显示语音文字'));
const voicePlaybackLabel = computed(() => {
  if (voiceLoading.value) return '正在生成语音';
  if (playingVoice.value) return '暂停语音';
  return props.message.voice?.audioUrl ? '播放语音' : '生成并播放语音';
});

const isSystemNarration = computed(() => props.message.sender === 'system' && props.message.displayStyle === 'narration');
const showMessageTime = computed(() => props.appearance.showMessageTime && !isSystemNarration.value && !props.message.voomEventType && !props.message.voomPostId);
const showReadState = computed(() => props.appearance.showReadStatus && props.message.sender !== 'system' && !props.message.voomEventType && !props.message.voomPostId);
const showMessageMeta = computed(() => showMessageTime.value || showReadState.value);

const statusLabel = computed(() => ({
  sending: '发送中',
  sent: '已读',
  failed: '未送达'
}[props.message.status ?? 'sent']));

function clearLongPressTimer() {
  if (longPressTimer === undefined) return;
  window.clearTimeout(longPressTimer);
  longPressTimer = undefined;
}

function startLongPress(event: PointerEvent) {
  if (props.selectionMode || event.button !== 0) return;
  longPressStart = { x: event.clientX, y: event.clientY };
  longPressTriggered = false;
  clearLongPressTimer();
  longPressTimer = window.setTimeout(() => {
    longPressTriggered = true;
    emit('long-press', props.message);
  }, 520);
}

function trackPointerMove(event: PointerEvent) {
  if (!longPressStart) return;
  const moved = Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y);
  if (moved > 10) cancelLongPress();
}

function cancelLongPress() {
  clearLongPressTimer();
  longPressStart = null;
}

function handleAvatarClick() {
  if (props.hideAvatar) return;
  if (props.selectionMode) emit('toggle-select');
  else if (props.message.sender === 'user') emit('open-user-profile');
  else emit('open-profile');
}

function emitLongPress() {
  if (props.selectionMode) return;
  clearLongPressTimer();
  emit('long-press', props.message);
}

function handleBubbleClick(event: MouseEvent) {
  if (longPressTriggered) {
    longPressTriggered = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (props.selectionMode) emit('toggle-select');
  else if (props.message.location || props.message.transfer) emit('open-card-detail', props.message);
}

function stopVoicePlayback() {
  if (activeVoiceAudio) {
    activeVoiceAudio.pause();
    activeVoiceAudio.onended = null;
    activeVoiceAudio.onerror = null;
  }
  activeVoiceAudio = null;
  playingVoice.value = false;
}

function toggleVoiceTranscript() {
  if (props.selectionMode) {
    emit('toggle-select');
    return;
  }
  showVoiceTranscript.value = !showVoiceTranscript.value;
}

function playVoiceAudio(audioUrl: string) {
  stopVoicePlayback();
  const audio = new Audio(audioUrl);
  activeVoiceAudio = audio;
  playingVoice.value = true;
  audio.onended = stopVoicePlayback;
  audio.onerror = () => {
    stopVoicePlayback();
    emit('busy-action', '当前浏览器无法播放这条语音。', '播放失败');
  };
  void audio.play().catch(() => {
    stopVoicePlayback();
    emit('busy-action', '当前浏览器阻止了语音播放，请再点一次播放按钮。', '播放失败');
  });
}

async function resolveVoiceAudioUrl() {
  const audioUrl = props.message.voice?.audioUrl;
  if (audioUrl) return audioUrl;
  if (!canGenerateVoiceAudio.value) throw new Error('这条语音没有可播放的本地录音。');
  voiceLoading.value = true;
  try {
    return await store.generateMessageVoiceAudio(props.message.id);
  } finally {
    voiceLoading.value = false;
  }
}

async function handleVoicePlayback() {
  if (props.selectionMode) {
    emit('toggle-select');
    return;
  }
  if (activeVoiceAudio && !activeVoiceAudio.paused) {
    stopVoicePlayback();
    return;
  }

  try {
    playVoiceAudio(await resolveVoiceAudioUrl());
  } catch (error) {
    stopVoicePlayback();
    emit('busy-action', error instanceof Error ? error.message : '语音生成失败，请检查 TTS 配置。', '播放失败');
  }
}

function openImageModal() {
  if (!props.message.image || props.message.sender !== 'char') return;
  if (props.selectionMode) {
    emit('toggle-select');
    return;
  }
  imageDescriptionDraft.value = props.message.image.description;
  selectedCandidateId.value = imageCandidates.value.find((candidate) => candidate.image === props.message.image?.url)?.id ?? imageCandidates.value[0]?.id ?? '';
  imageFlipped.value = !props.message.image.url;
  showImageModal.value = true;
}

function handleImageCardClick(event: MouseEvent) {
  if (props.message.sender !== 'char') return;
  event.stopPropagation();
  openImageModal();
}

function selectCandidate(candidateId: string) {
  selectedCandidateId.value = candidateId;
  imageFlipped.value = false;
}

function toggleImageFlip() {
  imageFlipped.value = !imageFlipped.value;
}

function isBrokenImageSource(source: string | undefined) {
  return Boolean(source && brokenImageSources.value.includes(source));
}

function markBrokenImageSource(source: string | undefined) {
  if (!source || brokenImageSources.value.includes(source)) return;
  brokenImageSources.value = [...brokenImageSources.value, source];
}

function regenerateImage() {
  const description = imageDescriptionDraft.value.trim();
  if (!description) return;
  if (props.regeneratingImage) {
    emit('busy-action', '正在重新生成聊天图片，请等待当前生成完成。', '正在生成');
    return;
  }
  emit('regenerate-image', props.message.id, description);
  imageFlipped.value = false;
}

function applySelectedCandidate() {
  if (props.regeneratingImage) {
    emit('busy-action', '正在重新生成聊天图片，请等待当前生成完成。', '正在生成');
    return;
  }
  if (!selectedCandidate.value || !canApplySelectedCandidate.value) return;
  emit('apply-image', props.message.id, selectedCandidate.value.id);
}

watch(() => props.message.image?.url, () => {
  if (!showImageModal.value) return;
  selectedCandidateId.value = imageCandidates.value.find((candidate) => candidate.image === props.message.image?.url)?.id ?? selectedCandidateId.value;
  imageFlipped.value = false;
});

watch(() => props.message.voice?.audioUrl, stopVoicePlayback);
watch(() => props.message.id, () => {
  showVoiceTranscript.value = true;
  voiceLoading.value = false;
  stopVoicePlayback();
});

onBeforeUnmount(stopVoicePlayback);
</script>

<style scoped>
.message-row {
  position: relative;
  display: flex;
  gap: 10px;
  margin: 7px 0;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.user .avatar-button {
  order: 2;
}

.message-row.system {
  justify-content: center;
}

.message-row.selecting {
  padding-left: 30px;
}

.message-row.user.selecting {
  padding-right: 30px;
  padding-left: 0;
}

.selection-dot {
  position: absolute;
  left: 2px;
  top: 50%;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(20, 20, 20, 0.18);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.94);
}

.message-row.user .selection-dot {
  right: 2px;
  left: auto;
}

.selection-dot span {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: transparent;
}

.message-row.selected .selection-dot span {
  background: var(--link-green);
}

.avatar-button {
  position: relative;
  display: block;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  line-height: 0;
}

.message-row.profile-alert .avatar-button::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid rgba(6, 199, 85, 0.76);
  animation: profile-alert-pulse 1.8s ease-out infinite;
  pointer-events: none;
}

@keyframes profile-alert-pulse {
  0% {
    opacity: 0.72;
    transform: scale(0.94);
  }

  80%,
  100% {
    opacity: 0;
    transform: scale(1.24);
  }
}

.message-row.hide-avatar .avatar-button {
  visibility: hidden;
  pointer-events: none;
}

.mini {
  display: block;
  width: 32px;
  height: 32px;
}

.bubble-wrap {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  min-width: 0;
  max-width: min(80%, 300px);
}

.message-row.user .bubble-wrap {
  order: 1;
  flex-direction: row-reverse;
}

.bubble-stack {
  display: grid;
  gap: 6px;
  justify-items: start;
  max-width: 100%;
  min-width: 0;
  cursor: default;
  touch-action: pan-y;
  user-select: text;
}

.message-row.user .bubble-stack {
  justify-items: end;
}

.message-row.selected .bubble-stack {
  border-radius: 16px;
  outline: 2px solid rgba(6, 199, 85, 0.38);
  outline-offset: 2px;
}

.bubble {
  min-width: 32px;
  max-width: 100%;
  padding: 7px 11px;
  border-radius: 15px;
  background: #ffffff;
  color: #111111;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.4;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

.bubble > span {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.message-row.user .bubble {
  background: #5ce46f;
}

.message-row.system .bubble {
  background: rgba(0, 0, 0, 0.08);
  color: #ffffff;
  font-size: 11px;
}

.message-row.system .bubble.narration {
  background: rgba(17, 17, 17, 0.06);
  color: #5f6872;
}

.bubble.narration {
  background: rgba(255, 255, 255, 0.7);
  color: #47515a;
  font-style: italic;
}

.bubble.sticker {
  min-width: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.bubble.image {
  min-width: 0;
  padding: 0;
  border-radius: 16px;
  background: transparent;
  box-shadow: none;
}

.bubble.voice {
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(17, 17, 17, 0.05);
  box-shadow: 0 8px 24px rgba(17, 20, 24, 0.08);
}

.bubble.location {
  min-width: min(210px, 62vw);
  padding: 0;
  overflow: hidden;
  border-radius: 16px;
  background: #ffffff;
  color: #202329;
  border: 1px solid #e6e8eb;
  box-shadow: 0 8px 20px rgba(17, 20, 24, 0.06);
}

.bubble.transfer {
  min-width: min(218px, 68vw);
  padding: 0;
  overflow: hidden;
  border-radius: 16px;
  background: #ffffff;
  color: #202329;
  border: 1px solid #e6e8eb;
  box-shadow: 0 8px 20px rgba(17, 20, 24, 0.06);
}

.message-row.user .bubble.location,
.message-row.char .bubble.location,
.message-row.user .bubble.transfer,
.message-row.char .bubble.transfer {
  background: #ffffff;
  color: #202329;
}

.location-message {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  min-width: 0;
  height: 70px;
  min-height: 70px;
}

.location-map {
  display: grid;
  place-items: center;
  background: var(--message-card-accent-bg, linear-gradient(135deg, #f0f1f3, #e2e4e7));
  color: var(--message-card-accent-fg, #30343a);
}

.location-copy {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
  padding: 10px 11px;
}

.location-copy strong,
.location-copy span,
.location-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-copy strong {
  color: #202329;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
}

.location-copy span {
  color: #69717b;
  font-size: 11px;
  font-weight: 700;
}

.location-copy small {
  color: #30343a;
  font-size: 11px;
  font-weight: 860;
}

.transfer-message {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  min-width: 0;
  height: 70px;
  min-height: 70px;
}

.transfer-mark {
  display: grid;
  place-items: center;
  background: var(--message-card-accent-bg, linear-gradient(135deg, #f0f1f3, #e2e4e7));
  color: var(--message-card-accent-fg, #30343a);
}

.transfer-copy {
  display: grid;
  grid-template-rows: auto auto auto;
  align-content: center;
  gap: 2px;
  min-width: 0;
  min-height: 70px;
  padding: 8px 10px;
}

.transfer-title,
.transfer-copy strong,
.transfer-note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-title {
  color: #5f6670;
  font-size: 11px;
  font-weight: 860;
}

.transfer-copy strong {
  color: #202329;
  font-size: 15px;
  font-weight: 950;
  line-height: 1.08;
}

.transfer-note {
  color: #69717b;
  font-size: 11px;
  font-weight: 760;
}

.voice-message {
  display: grid;
  grid-template-columns: minmax(28px, 1fr) 28px 22px;
  align-items: center;
  justify-content: stretch;
  gap: 4px;
  width: min(var(--voice-width), 48vw);
  min-width: 98px;
  max-width: 144px;
  min-height: 32px;
  padding: 0 4px 0 8px;
  border-radius: 999px;
  color: inherit;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04));
  cursor: pointer;
}

.voice-message.playing .voice-wave span {
  animation: voice-wave 0.72s ease-in-out infinite;
  animation-delay: calc(var(--voice-bar-index, 0) * 0.05s);
}

.voice-wave {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.voice-wave span {
  flex: 0 0 2px;
  width: 2px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.5;
}

.voice-wave span:nth-child(6n+2) {
  height: 12px;
}

.voice-wave span:nth-child(6n+3) {
  height: 15px;
}

.voice-wave span:nth-child(6n+4) {
  height: 10px;
}

.voice-wave span:nth-child(6n+5) {
  height: 13px;
}

.voice-wave span:nth-child(6n) {
  height: 9px;
}

.voice-duration {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  min-width: 28px;
  font-size: 11px;
  font-weight: 760;
  line-height: 1;
  opacity: 0.68;
}

.voice-play-button {
  display: grid;
  place-items: center;
  width: 22px;
  min-width: 22px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.34);
  color: currentColor;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.voice-play-button:disabled {
  opacity: 0.45;
}

.voice-loading-icon {
  animation: chat-image-spin 0.8s linear infinite;
}

.voice-transcript {
  width: fit-content;
  max-width: min(100%, 260px);
  margin: -1px 0 0;
  padding: 7px 9px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.78);
  color: #59606a;
  box-shadow: 0 1px 0 rgba(17, 17, 17, 0.04);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.message-row.user .voice-transcript {
  background: rgba(255, 255, 255, 0.68);
  color: #3d4b42;
}

@keyframes voice-wave {
  0%,
  100% {
    transform: scaleY(0.78);
  }

  50% {
    transform: scaleY(1.16);
  }
}

.quote-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 5px;
  width: fit-content;
  max-width: 100%;
  min-height: 26px;
  padding: 5px 8px;
  border-radius: 8px;
  background: #f7f8f9;
  color: #a9afb6;
  box-shadow: none;
}

.quote-card p {
  min-width: 0;
  margin: 0;
  overflow: visible;
  overflow-wrap: break-word;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: clip;
  white-space: pre-wrap;
}

.quote-card strong {
  color: #9ba2aa;
  font-weight: 760;
}

.quote-card span {
  color: #aeb4bb;
}

.quote-thumbnail {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.7);
}

.translation-divider {
  display: block;
  width: 100%;
  margin: 7px 0 6px;
  border-top: 1px dashed currentColor;
  opacity: 0.3;
}

.translation-copy {
  display: block;
}

.message-row.user .bubble.sticker {
  background: transparent;
}

.sticker-image {
  display: block;
  width: auto;
  height: auto;
  max-width: min(104px, 30vw);
  max-height: min(120px, 28vh);
  border-radius: 10px;
  object-fit: scale-down;
  background: transparent;
}

.chat-image-card {
  display: grid;
  width: min(154px, 44vw);
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  border: 1px solid #edf0f2;
  border-radius: 16px;
  background: #ffffff;
  color: #222222;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

.chat-image-card.interactive {
  cursor: zoom-in;
}

.chat-image-card img {
  display: block;
  width: 100%;
  aspect-ratio: var(--chat-image-ratio, 1 / 1);
  object-fit: contain;
  background: #f4f5f6;
}

.chat-image-card figcaption {
  margin: 0;
  padding: 10px 11px;
  font-size: 12px;
  font-weight: 760;
  line-height: 1.45;
  white-space: pre-wrap;
}

.chat-image-card--description {
  aspect-ratio: 1 / 1;
  place-items: center;
  padding: 12px;
  background: #ffffff;
  transform-style: preserve-3d;
}

.chat-image-card--description figcaption {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 0;
  font-size: 11px;
  font-weight: 820;
  line-height: 1.45;
  text-align: center;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.image-viewer {
  display: grid;
  gap: 12px;
}

.image-flip-card {
  position: relative;
  width: 100%;
  aspect-ratio: var(--chat-viewer-ratio, 1 / 1);
  padding: 0;
  border-radius: 18px;
  background: transparent;
  perspective: 1000px;
}

.image-face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid #edf0f2;
  border-radius: 18px;
  background: #ffffff;
  backface-visibility: hidden;
  transition: transform 0.28s ease;
}

.image-picture-face {
  transform: rotateY(0deg);
}

.image-text-face {
  padding: 20px;
  transform: rotateY(180deg);
  color: #222222;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.65;
  text-align: center;
  white-space: pre-wrap;
}

.image-viewer.flipped .image-picture-face {
  transform: rotateY(180deg);
}

.image-viewer.flipped .image-text-face {
  transform: rotateY(360deg);
}

.image-picture-face img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #f4f5f6;
}

.image-picture-face > span {
  padding: 20px;
  color: #222222;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.65;
  text-align: center;
  white-space: pre-wrap;
}

.image-history {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.image-thumb {
  flex: 0 0 54px;
  width: 54px;
  height: 54px;
  padding: 2px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: #f1f3f5;
}

.image-thumb.active {
  border-color: #171717;
  background: #ffffff;
}

.image-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 7px;
  object-fit: cover;
}

.image-description-field {
  display: grid;
  gap: 6px;
}

.image-description-field > span {
  color: #686b70;
  font-size: 12px;
  font-weight: 900;
}

.image-description-field textarea {
  min-height: 86px;
  padding: 10px;
  border: 1px solid #edf0f2;
  border-radius: 8px;
  background: #ffffff;
  color: #171717;
  font: inherit;
  line-height: 1.55;
  resize: vertical;
}

.image-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 10px;
}

.image-secondary,
.image-primary {
  display: inline-grid;
  grid-auto-flow: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  border-radius: 10px;
  font-weight: 900;
}

.image-secondary {
  background: #ffffff;
  color: #2b3036;
}

.image-primary {
  background: #171717;
  color: #ffffff;
}

.image-secondary:disabled,
.image-primary:disabled {
  opacity: 0.45;
  cursor: default;
}

.loading-icon {
  animation: chat-image-spin 0.8s linear infinite;
}

@keyframes chat-image-spin {
  to {
    transform: rotate(360deg);
  }
}

.message-meta {
  flex: 0 0 auto;
  display: grid;
  align-content: end;
  justify-items: start;
  gap: 2px;
  min-width: 32px;
  color: rgba(20, 20, 20, 0.45);
  font-size: 10px;
  line-height: 1.15;
}

.message-row.user .message-meta {
  justify-items: end;
}

time,
.read-state {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: nowrap;
}
</style>