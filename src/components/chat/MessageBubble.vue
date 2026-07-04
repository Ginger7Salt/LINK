<template>
  <article :data-message-id="message.id" :class="['message-row', message.sender, { selecting: selectionMode, selected, 'hide-avatar': hideAvatar, 'profile-alert': showProfileAlert }]">
    <button v-if="selectionMode" class="selection-dot" type="button" :aria-pressed="selected" @click.stop="emit('toggle-select')">
      <span></span>
    </button>
    <button v-if="showAvatarButton" class="avatar-button" type="button" :aria-hidden="hideAvatar" :tabindex="hideAvatar ? -1 : 0" @click.stop="handleAvatarClick">
      <img class="avatar mini" :src="avatarSource" :alt="avatarAlt" />
    </button>
    <div class="bubble-wrap">
      <span v-if="canQuote" class="swipe-quote-cue" :class="{ visible: swipeOffset > 0, ready: swipeQuoteReady }" aria-hidden="true">
        <Quote :size="16" />
      </span>
      <div
        class="bubble-stack"
        :class="{ swiping: swipeOffset > 0, 'quote-ready': swipeQuoteReady }"
        :style="swipeStyle"
        @click.capture="suppressClickAfterSwipe"
        @click="handleBubbleClick"
        @contextmenu.prevent="emitLongPress"
        @pointercancel="handlePointerCancel"
        @pointerdown="handlePointerDown"
        @pointerleave="handlePointerLeave"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
      >
        <div class="bubble" :class="{ narration: message.displayStyle === 'narration', sticker: message.sticker, image: message.image, voice: message.voice, location: message.location, transfer: message.transfer, transferReceipt: message.transfer && linePayIsReceipt, theaterLink: message.theaterLink, offlineInvitation: message.offlineInvitation }" :style="bubbleStyle">
          <template v-if="message.sticker">
            <img class="sticker-image" :src="getStickerDisplayImageUrl(message.sticker)" :alt="message.sticker.description" />
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
            <section class="line-location-card" aria-label="定位消息">
              <span class="line-location-map" aria-hidden="true">
                <span class="line-map-road line-map-road-1"></span>
                <span class="line-map-road line-map-road-2"></span>
                <span class="line-map-road line-map-road-3"></span>
                <span class="line-map-road line-map-road-4"></span>
                <span class="line-map-block line-map-block-1"></span>
                <span class="line-map-block line-map-block-2"></span>
                <span class="line-map-block line-map-block-3"></span>
                <span class="line-map-label line-map-label-top">{{ lineLocationMapLabel }}</span>
                <span class="line-map-label line-map-label-mid">{{ message.location.name }}</span>
                <span class="line-map-pin line-map-pin-main"></span>
                <span class="line-map-pin line-map-pin-secondary"></span>
                <span class="line-map-google"><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></span>
              </span>
              <span class="line-location-body">
                <span class="line-location-kicker">Location</span>
                <strong>{{ lineLocationName }}</strong>
                <span class="line-location-detail-address">{{ lineLocationAddress }}</span>
              </span>
              <span class="line-location-footer">
                <span class="line-location-footer-mark" aria-hidden="true"></span>
                <span>{{ lineLocationDistanceLabel }}</span>
                <span class="line-location-chevron" aria-hidden="true"></span>
              </span>
            </section>
          </template>
          <template v-else-if="message.transfer">
            <section v-if="linePayIsReceipt" class="transfer-receipt-card" :class="`transfer-receipt-card--${linePayStatus}`" aria-label="转账回执">
              <span class="transfer-receipt-icon" aria-hidden="true">{{ linePayReceiptIcon }}</span>
              <span class="transfer-receipt-copy">
                <strong>{{ linePayReceiptTitle }}</strong>
                <small>{{ linePayReceiptMeta }}</small>
              </span>
            </section>
            <section v-else-if="linePayStatus !== 'pending'" class="transfer-settled-card" :class="`transfer-settled-card--${linePayStatus}`" aria-label="转账状态">
              <span class="transfer-settled-icon" aria-hidden="true">{{ linePaySettledIcon }}</span>
              <span class="transfer-settled-copy">
                <small>{{ linePayDirectionLabel }}</small>
                <strong>{{ linePaySettledTitle }}</strong>
                <span>¥{{ linePayAmount }}</span>
              </span>
              <span class="transfer-settled-chip">{{ linePayStatusText }}</span>
            </section>
            <section v-else class="transfer-request-card" :class="{ 'transfer-request-card--actionable': canRespondTransferCard }" aria-label="转账消息">
              <span class="transfer-request-head">
                <span class="transfer-request-brand">
                  <span class="transfer-request-mark" aria-hidden="true">¥</span>
                  <span>LINK Pay</span>
                </span>
                <span class="transfer-request-chip">{{ linePayPendingChip }}</span>
              </span>
              <span class="transfer-request-main">
                <small>{{ linePayDirectionLabel }}</small>
                <strong>¥{{ linePayAmount }}</strong>
                <span>{{ linePayRequestSubtext }}</span>
              </span>
              <span v-if="showTransferRequestNoteRow" class="transfer-request-note">{{ linePayRequestNoteText }}</span>
              <span v-if="canRespondTransferCard" class="transfer-request-actions" @pointerdown.stop @pointerup.stop>
                <button class="transfer-request-action transfer-request-action--reject" type="button" @click.stop="emit('reject-transfer')">拒绝</button>
                <button class="transfer-request-action transfer-request-action--accept" type="button" @click.stop="emit('accept-transfer')">接收</button>
              </span>
            </section>
          </template>
          <template v-else-if="message.theaterLink">
            <section class="line-website-card" aria-label="网站链接">
              <span class="line-website-thumb" aria-hidden="true">
                <Globe2 :size="22" stroke-width="2.4" />
              </span>
              <span class="line-website-body">
                <span class="line-website-kicker">Website Link</span>
                <strong>{{ message.theaterLink.title }}</strong>
                <small>{{ message.theaterLink.summary }}</small>
                <em>{{ message.theaterLink.url }}</em>
              </span>
            </section>
          </template>
          <template v-else-if="message.offlineInvitation">
            <section class="offline-invitation-message" :class="`offline-invitation-message--${message.offlineInvitation.status}`" aria-label="线下模块邀请">
              <div class="offline-invitation-copy">
                <span>发起线下邀约</span>
                <strong>{{ offlineInvitationStatusLabel }}</strong>
                <small>{{ offlineInvitationDetail }}</small>
              </div>
              <div v-if="message.offlineInvitation.status === 'pending'" class="offline-invitation-actions">
                <button type="button" @click.stop="emit('reject-offline-invitation')">
                  <X :size="14" />
                  <span>拒绝</span>
                </button>
                <button type="button" @click.stop="emit('accept-offline-invitation')">
                  <DoorOpen :size="14" />
                  <span>接受</span>
                </button>
              </div>
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
import { DoorOpen, Globe2, LoaderCircle, Pause, Play, Quote, X } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import type { CharacterProfile, ChatAppearanceSettings, ChatImageCandidate, ChatMessage, UserProfile } from '@/types/domain';
import { useAppStore } from '@/stores/appStore';
import { getCharacterDisplayName } from '@/utils/character';
import { formatChatTime } from '@/utils/time';
import { defaultConversationSettings } from '@/utils/memory';
import { defaultProfileAvatar } from '@/utils/profile';
import { getStickerDisplayImageUrl } from '@/utils/stickers';
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
  canQuote?: boolean;
}>(), {
  appearance: () => defaultConversationSettings.appearance,
  canRegenerateImage: false,
  canQuote: false,
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
  'quote-message': [message: ChatMessage];
  'accept-offline-invitation': [];
  'reject-offline-invitation': [];
  'accept-transfer': [];
  'reject-transfer': [];
}>();

const store = useAppStore();

let longPressTimer: number | undefined;
let longPressStart: { x: number; y: number } | null = null;
let longPressTriggered = false;
let swipeStart: { x: number; y: number; pointerId: number } | null = null;
let swipeTracking = false;
let suppressNextClick = false;
const showImageModal = ref(false);
const imageFlipped = ref(false);
const imageDescriptionDraft = ref('');
const selectedCandidateId = ref('');
const brokenImageSources = ref<string[]>([]);
const playingVoice = ref(false);
const showVoiceTranscript = ref(true);
const voiceLoading = ref(false);
const swipeOffset = ref(0);
let activeVoiceAudio: HTMLAudioElement | null = null;

const swipeTriggerDistance = 54;
const swipeMaxDistance = 74;

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
  && !props.message.theaterLink
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
const userAvatar = computed(() => {
  const currentUser = props.user ?? store.user;
  return currentUser?.avatar || defaultProfileAvatar;
});
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
          ? `${props.message.quote.transfer.responseToMessageId ? '转账回执 ' : ''}¥${props.message.quote.transfer.amount}`
          : props.message.quote?.theaterLink
            ? props.message.quote.theaterLink.title
  : props.message.quote?.content ?? '');
const quoteThumbnail = computed(() => props.message.quote?.sticker?.imageUrl ?? props.message.quote?.image?.url ?? '');
const quoteAuthorLabel = computed(() => (props.message.quote?.authorName ? `${props.message.quote.authorName}：` : ''));

const bubbleStyle = computed(() => {
  if (props.message.sticker || props.message.image || props.message.location || props.message.transfer || props.message.theaterLink || props.message.offlineInvitation) return {};
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
const lineLocationName = computed(() => props.message.location?.name.trim() || '地点名称');
const lineLocationAddress = computed(() => props.message.location?.address?.trim() || '未填写详细地址');
const lineLocationDistanceLabel = computed(() => {
  const distance = props.message.location?.distance.trim() || '未知';
  return props.message.sender === 'user' ? `距离对方 ${distance}` : `距离你 ${distance}`;
});
const lineLocationMapLabel = computed(() => {
  const address = props.message.location?.address?.trim() || lineLocationName.value;
  const match = address.match(/([^市区县]+(?:街|路|巷|道)\d*[^\s,，。]*)/);
  return match?.[1] || lineLocationName.value;
});
const linePayAmount = computed(() => props.message.transfer?.amount || '0.00');
const linePayStatus = computed(() => props.message.transfer?.status ?? 'pending');
const linePayIsReceipt = computed(() => Boolean(props.message.transfer?.responseToMessageId));
const linePayOriginalTransferMessage = computed(() => {
  const sourceMessageId = props.message.transfer?.responseToMessageId;
  if (!sourceMessageId) return null;
  return store.messages.find((message) => message.id === sourceMessageId && message.transfer && !message.transfer.responseToMessageId) ?? null;
});
const linePayOriginalSender = computed(() => {
  if (!linePayIsReceipt.value) return props.message.sender;
  return linePayOriginalTransferMessage.value?.sender ?? (props.message.sender === 'user' ? 'char' : 'user');
});
const linePayStatusText = computed(() => ({
  pending: '待确认',
  accepted: '已接收',
  rejected: '已拒绝'
}[linePayStatus.value]));
const linePayDirectionLabel = computed(() => (props.message.sender === 'user' ? '转账给对方' : '对方向你转账'));
const linePayCounterpartyText = computed(() => (props.message.sender === 'user' ? characterDisplayName.value : `来自 ${characterDisplayName.value}`));
const linePayPendingChip = computed(() => (props.message.sender === 'user' ? '等待确认' : '待处理'));
const linePaySettledIcon = computed(() => (linePayStatus.value === 'accepted' ? '✓' : '×'));
const linePaySettledTitle = computed(() => {
  if (linePayStatus.value === 'accepted') return props.message.sender === 'user' ? '对方已收款' : '你已收款';
  return props.message.sender === 'user' ? '对方已拒收' : '你已拒收';
});
const linePayReceiptIcon = computed(() => (linePayStatus.value === 'accepted' ? '✓' : '×'));
const linePayReceiptTitle = computed(() => {
  if (linePayStatus.value === 'accepted') return `${linePayOriginalSender.value === 'char' ? '你已收款' : '对方已收款'} ¥${linePayAmount.value}`;
  if (linePayStatus.value === 'rejected') return `${linePayOriginalSender.value === 'char' ? '你已拒收' : '对方已拒收'} ¥${linePayAmount.value}`;
  return `${linePayStatusText.value} ¥${linePayAmount.value}`;
});
const linePayReceiptMeta = computed(() => {
  return linePayOriginalSender.value === 'char'
    ? `${characterDisplayName.value} 发来的转账`
    : '你发出的转账';
});
const linePayNote = computed(() => props.message.transfer?.note?.trim() || '');
const blankTransferRequestLine = '\u00a0';
const linePayRequestSubtext = computed(() => (props.message.sender === 'user' ? linePayNote.value || blankTransferRequestLine : linePayCounterpartyText.value));
const showTransferRequestNoteRow = computed(() => props.message.sender === 'user' || Boolean(linePayNote.value));
const linePayRequestNoteText = computed(() => (props.message.sender === 'user' ? blankTransferRequestLine : linePayNote.value));
const canRespondTransferCard = computed(() => props.message.sender === 'char' && !linePayIsReceipt.value && linePayStatus.value === 'pending');
const offlineInvitationStatusLabel = computed(() => ({
  pending: '要进入线下模式继续这一幕吗？',
  accepted: '已进入线下模块',
  rejected: '已保持线上网聊'
}[props.message.offlineInvitation?.status ?? 'pending']));
const offlineInvitationDetail = computed(() => ({
  pending: '接受后会切到线下页面，并自动生成新的章节。',
  accepted: '新的故事篇章会在线下页面继续生成。',
  rejected: '继续在线上聊天。'
}[props.message.offlineInvitation?.status ?? 'pending']));
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
const swipeQuoteReady = computed(() => swipeOffset.value >= swipeTriggerDistance);
const swipeStyle = computed(() => ({
  '--swipe-quote-offset': `${0 - swipeOffset.value}px`
}));

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

function resetSwipe() {
  swipeStart = null;
  swipeTracking = false;
  swipeOffset.value = 0;
}

function canStartSwipe(event: PointerEvent) {
  return props.canQuote && !props.selectionMode && event.button === 0 && event.isPrimary !== false;
}

function handlePointerDown(event: PointerEvent) {
  if (canStartSwipe(event)) {
    swipeStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    swipeTracking = false;
    swipeOffset.value = 0;
  }
  startLongPress(event);
}

function handlePointerMove(event: PointerEvent) {
  if (!swipeStart || event.pointerId !== swipeStart.pointerId) {
    trackPointerMove(event);
    return;
  }

  const deltaX = event.clientX - swipeStart.x;
  const deltaY = event.clientY - swipeStart.y;
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (!swipeTracking) {
    if (verticalDistance > 12 && verticalDistance > horizontalDistance) {
      resetSwipe();
      trackPointerMove(event);
      return;
    }
    if (deltaX < -10 && horizontalDistance > verticalDistance * 1.15) {
      swipeTracking = true;
      clearLongPressTimer();
    }
  }

  if (!swipeTracking) {
    trackPointerMove(event);
    return;
  }

  swipeOffset.value = Math.min(swipeMaxDistance, Math.max(0, 0 - deltaX));
  event.preventDefault();
  event.stopPropagation();
}

function handlePointerUp(event: PointerEvent) {
  if (!swipeTracking) {
    cancelLongPress();
    resetSwipe();
    return;
  }

  const shouldQuote = swipeQuoteReady.value;
  event.preventDefault();
  event.stopPropagation();
  resetSwipe();
  cancelLongPress();
  if (!shouldQuote) return;
  suppressNextClick = true;
  emit('quote-message', props.message);
  window.setTimeout(() => {
    suppressNextClick = false;
  }, 120);
}

function handlePointerCancel() {
  cancelLongPress();
  resetSwipe();
}

function handlePointerLeave() {
  if (swipeTracking) return;
  cancelLongPress();
  resetSwipe();
}

function suppressClickAfterSwipe(event: MouseEvent) {
  if (!suppressNextClick) return;
  suppressNextClick = false;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
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
  else if (props.message.location || props.message.transfer || props.message.theaterLink) emit('open-card-detail', props.message);
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
  position: relative;
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
  transform: translate3d(var(--swipe-quote-offset, 0), 0, 0);
  transition: transform 0.18s ease;
}

.bubble-stack.swiping {
  user-select: none;
  transition: none;
}

.swipe-quote-cue {
  position: absolute;
  right: -34px;
  top: 50%;
  z-index: 0;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #7a828b;
  opacity: 0;
  transform: translate3d(-8px, -50%, 0) scale(0.88);
  transition: opacity 0.16s ease, transform 0.16s ease, color 0.16s ease;
  pointer-events: none;
  box-shadow: 0 6px 18px rgba(17, 20, 24, 0.12);
}

.swipe-quote-cue.visible,
.swipe-quote-cue.ready {
  opacity: 1;
  transform: translate3d(0, -50%, 0) scale(1);
}

.swipe-quote-cue.ready {
  color: var(--link-green);
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

.bubble.location,
.bubble.transfer,
.bubble.theaterLink {
  padding: 0;
  overflow: hidden;
  border-radius: 10px;
  color: #111111;
  box-shadow: none;
}

.bubble.location {
  width: min(202px, 59vw);
  min-width: min(182px, 53vw);
  background: transparent;
  border: 0;
}

.bubble.transfer {
  width: min(212px, 62vw);
  min-width: min(187px, 53vw);
  background: #ffffff;
  border: 0;
  box-shadow: 0 9px 22px rgba(22, 27, 33, 0.08);
}

.bubble.theaterLink {
  width: min(222px, 64vw);
  min-width: min(189px, 55vw);
  background: #ffffff;
  border: 0;
  box-shadow: 0 9px 22px rgba(22, 27, 33, 0.08);
}

.bubble.transferReceipt {
  width: min(176px, 52vw);
  min-width: min(149px, 45vw);
}

.bubble.offlineInvitation {
  min-width: min(248px, 74vw);
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
.message-row.char .bubble.transfer,
.message-row.user .bubble.theaterLink,
.message-row.char .bubble.theaterLink,
.message-row.char .bubble.offlineInvitation,
.message-row.system .bubble.offlineInvitation {
  color: #111111;
}

.message-row.user .bubble.transfer,
.message-row.char .bubble.transfer,
.message-row.user .bubble.theaterLink,
.message-row.char .bubble.theaterLink {
  background: #ffffff;
}

.message-row.user .bubble.transferReceipt,
.message-row.char .bubble.transferReceipt {
  background: transparent;
  box-shadow: none;
}

.offline-invitation-message {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px;
}

.offline-invitation-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.offline-invitation-copy span {
  color: #69717b;
  font-size: 11px;
  font-weight: 860;
}

.offline-invitation-copy strong {
  color: #202329;
  font-size: 13px;
  font-weight: 930;
  line-height: 1.28;
}

.offline-invitation-copy small {
  color: #69717b;
  font-size: 11px;
  font-weight: 720;
  line-height: 1.36;
}

.offline-invitation-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.offline-invitation-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  border: 0;
  border-radius: 10px;
  background: #f0f2f5;
  color: #333943;
  font-size: 12px;
  font-weight: 860;
}

.offline-invitation-actions button:last-child {
  background: #dfe3e8;
  color: #202329;
}

.line-location-card {
  display: grid;
  grid-template-rows: 76px auto 25px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: inherit;
  background: #ffffff;
  color: #111111;
}

.line-location-map {
  position: relative;
  min-width: 0;
  min-height: 76px;
  overflow: hidden;
  background:
    linear-gradient(112deg, transparent 0 54%, rgba(216, 219, 222, 0.7) 55% 100%),
    linear-gradient(22deg, rgba(205, 231, 215, 0.72) 0 26%, transparent 27% 100%),
    linear-gradient(164deg, rgba(255, 255, 255, 0.94) 0 7%, transparent 8% 100%),
    #f0f1f3;
}

.line-location-map::after {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, transparent 54%, rgba(255, 255, 255, 0.1));
  content: '';
  pointer-events: none;
}

.line-map-road {
  position: absolute;
  display: block;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 0 0 1px rgba(222, 225, 229, 0.86);
}

.line-map-road-1 {
  left: -15px;
  top: 17px;
  width: 128px;
  height: 8px;
  transform: rotate(-27deg);
}

.line-map-road-2 {
  right: -12px;
  top: 22px;
  width: 111px;
  height: 8px;
  transform: rotate(12deg);
}

.line-map-road-3 {
  left: 40px;
  top: 42px;
  width: 114px;
  height: 8px;
  transform: rotate(-38deg);
}

.line-map-road-4 {
  left: 104px;
  top: 31px;
  width: 97px;
  height: 8px;
  transform: rotate(82deg);
}

.line-map-block {
  position: absolute;
  display: block;
  border: 1px solid rgba(222, 225, 229, 0.9);
  border-radius: 3px;
  background: rgba(246, 247, 248, 0.88);
}

.line-map-block-1 {
  left: 10px;
  top: 4px;
  width: 45px;
  height: 25px;
  transform: rotate(14deg);
}

.line-map-block-2 {
  right: 13px;
  top: 3px;
  width: 55px;
  height: 27px;
  transform: rotate(-6deg);
}

.line-map-block-3 {
  right: 5px;
  bottom: 6px;
  width: 55px;
  height: 26px;
  transform: rotate(-18deg);
}

.line-map-label {
  position: absolute;
  z-index: 2;
  max-width: 81px;
  overflow: hidden;
  color: rgba(70, 74, 82, 0.76);
  font-size: 9px;
  font-weight: 580;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.88);
}

.line-map-label-top {
  right: 23px;
  top: 9px;
}

.line-map-label-mid {
  left: 50%;
  top: 53px;
  max-width: 140px;
  padding: 1px 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  font-weight: 700;
  line-height: 1.15;
  text-align: center;
  transform: translateX(-50%);
}

.line-map-pin {
  position: absolute;
  z-index: 3;
  display: block;
  width: 17px;
  height: 17px;
  border-radius: 50% 50% 50% 0;
  background: #ef4c43;
  transform: rotate(-45deg);
  box-shadow: 0 1px 4px rgba(17, 17, 17, 0.2);
}

.line-map-pin::after {
  position: absolute;
  left: 5px;
  top: 5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffffff;
  content: '';
}

.line-map-pin-main {
  left: 50%;
  top: 38px;
  transform: translate(-50%, -50%) rotate(-45deg);
}

.line-map-pin-secondary {
  right: 15px;
  bottom: 10px;
  width: 15px;
  height: 15px;
  background: #5f7180;
}

.line-map-pin-secondary::after {
  left: 4px;
  top: 4px;
  width: 7px;
  height: 7px;
}

.line-map-google {
  position: absolute;
  left: 7px;
  bottom: 6px;
  z-index: 4;
  display: inline-flex;
  align-items: baseline;
  font-family: Arial, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 1;
}

.line-map-google span:nth-child(1),
.line-map-google span:nth-child(4) {
  color: #4285f4;
}

.line-map-google span:nth-child(2),
.line-map-google span:nth-child(6) {
  color: #db4437;
}

.line-map-google span:nth-child(3) {
  color: #f4b400;
}

.line-map-google span:nth-child(5) {
  color: #0f9d58;
}

.line-location-body {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 6px 7px 7px;
  border-bottom: 1px solid #eeeeee;
  background: #ffffff;
}

.line-location-kicker {
  color: #04a64b;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.05;
  text-transform: uppercase;
}

.line-location-body strong {
  min-width: 0;
  color: #101010;
  font-size: 11px;
  font-weight: 930;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.line-location-detail-address {
  min-width: 0;
  color: #6b7078;
  font-size: 9px;
  font-weight: 560;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.line-location-footer {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 5px;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 24px;
  padding: 0 6px;
  background: #ffffff;
  color: #5f6670;
  font-size: 9px;
  font-weight: 820;
}

.line-location-footer > span:nth-child(2) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-location-footer-mark {
  position: relative;
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 50% 50% 50% 0;
  background: #04c755;
  transform: rotate(-45deg);
}

.line-location-footer-mark::after {
  position: absolute;
  left: 3px;
  top: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ffffff;
  content: '';
}

.line-location-chevron {
  width: 5px;
  height: 5px;
  border-top: 2px solid #c6c6c6;
  border-right: 2px solid #c6c6c6;
  transform: rotate(45deg);
}

.line-website-card {
  display: grid;
  grid-template-columns: 39px minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(12, 20, 28, 0.08);
  border-radius: inherit;
  background: #ffffff;
  color: #111111;
  cursor: pointer;
}

.line-website-thumb {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  border-radius: 8px;
  background: linear-gradient(135deg, #effaf3, #edf3ff);
  color: #04a64b;
}

.line-website-thumb svg {
  width: 18px;
  height: 18px;
}

.line-website-body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.line-website-kicker {
  color: #04a64b;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.05;
  text-transform: uppercase;
}

.line-website-body strong,
.line-website-body small,
.line-website-body em {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-website-body strong {
  color: #101010;
  font-size: 11px;
  font-weight: 930;
  line-height: 1.25;
  white-space: nowrap;
}

.line-website-body small {
  display: -webkit-box;
  color: #5f6670;
  font-size: 9px;
  font-weight: 650;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.line-website-body em {
  color: #8d949c;
  font-size: 9px;
  font-style: normal;
  font-weight: 760;
  line-height: 1.2;
  white-space: nowrap;
}

.transfer-request-card,
.transfer-settled-card,
.transfer-receipt-card {
  min-width: 0;
  overflow: hidden;
  border-radius: inherit;
  background: #ffffff;
  color: #111111;
}

.transfer-request-card {
  display: grid;
  border: 1px solid rgba(12, 20, 28, 0.08);
}

.transfer-request-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  min-width: 0;
  padding: 8px 9px 6px;
}

.transfer-request-brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: #22272d;
  font-size: 10px;
  font-weight: 920;
  line-height: 1;
}

.transfer-request-mark {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: #04c755;
  color: #ffffff;
  font-size: 10px;
  font-weight: 950;
}

.transfer-request-chip {
  flex: 0 0 auto;
  padding: 3px 6px;
  border-radius: 999px;
  background: #effaf3;
  color: #05883f;
  font-size: 9px;
  font-weight: 900;
  line-height: 1;
}

.transfer-request-main {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 9px 11px;
  background:
    linear-gradient(135deg, rgba(4, 199, 85, 0.16), rgba(4, 199, 85, 0.04) 72%),
    #f8fffa;
}

.transfer-request-main small {
  color: #168447;
  font-size: 9px;
  font-weight: 920;
  line-height: 1;
}

.transfer-request-main strong {
  min-width: 0;
  color: #101713;
  font-size: 26px;
  font-weight: 950;
  letter-spacing: 0;
  line-height: 1;
  overflow-wrap: anywhere;
}

.transfer-request-main span {
  min-width: 0;
  color: #44504a;
  font-size: 10px;
  font-weight: 760;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.transfer-request-note {
  min-width: 0;
  padding: 7px 9px 0;
  color: #737983;
  font-size: 10px;
  font-weight: 680;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.transfer-request-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  min-width: 0;
  padding: 8px 9px 9px;
}

.transfer-request-action {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 28px;
  border: 0;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 930;
  line-height: 1;
}

.transfer-request-action--reject {
  background: #f0f1f3;
  color: #24272d;
}

.transfer-request-action--accept {
  background: #04c755;
  color: #ffffff;
  box-shadow: 0 8px 16px rgba(4, 199, 85, 0.2);
}

.transfer-settled-card {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  min-height: 63px;
  padding: 8px;
  border: 1px solid rgba(12, 20, 28, 0.08);
}

.transfer-settled-icon,
.transfer-receipt-icon {
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-weight: 950;
  line-height: 1;
}

.transfer-settled-icon {
  width: 28px;
  height: 28px;
  background: #effaf3;
  color: #04a64b;
  font-size: 14px;
}

.transfer-settled-card--rejected .transfer-settled-icon {
  background: #f2f3f5;
  color: #7b828c;
}

.transfer-settled-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.transfer-settled-copy small,
.transfer-receipt-copy small {
  min-width: 0;
  color: #7a818a;
  font-size: 9px;
  font-weight: 720;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-settled-copy strong,
.transfer-receipt-copy strong {
  min-width: 0;
  color: #161a1f;
  font-size: 12px;
  font-weight: 920;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-settled-copy span {
  color: #2d3339;
  font-size: 11px;
  font-weight: 840;
  line-height: 1;
}

.transfer-settled-chip {
  align-self: start;
  padding: 3px 6px;
  border-radius: 999px;
  background: #effaf3;
  color: #05883f;
  font-size: 9px;
  font-weight: 900;
  line-height: 1;
}

.transfer-settled-card--rejected .transfer-settled-chip {
  background: #f2f3f5;
  color: #6a737d;
}

.transfer-receipt-card {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-height: 43px;
  padding: 7px;
  border: 1px solid rgba(12, 20, 28, 0.07);
  background: #ffffff;
  box-shadow: none;
}

.transfer-receipt-card--accepted {
  border-color: rgba(4, 199, 85, 0.18);
  background: #f1fff5;
}

.transfer-receipt-card--rejected {
  border-color: rgba(129, 139, 151, 0.18);
  background: #f5f6f8;
}

.transfer-receipt-icon {
  width: 22px;
  height: 22px;
  background: #effaf3;
  color: #04a64b;
  font-size: 12px;
}

.transfer-receipt-card--rejected .transfer-receipt-icon {
  background: #f2f3f5;
  color: #7b828c;
}

.transfer-receipt-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
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