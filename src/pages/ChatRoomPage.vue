<template>
  <section v-if="conversation && character" class="screen no-tabs chat-room">
    <ChatHeader
      :character="character"
      mode="online"
      @offline="showOfflineConfirm = true"
      @open-menu="openChatSettings"
    />

    <main ref="messageListRef" class="message-list" :style="messageListStyle" @scroll="handleMessageListScroll">
      <div v-if="hasEarlierMessages" class="history-loader">上滑加载更早消息</div>
      <MessageBubble
        v-for="(message, index) in onlineMessages"
        :key="message.id"
        :message="message"
        :character="character"
        :appearance="chatSettings.appearance"
        :hide-avatar="shouldHideAvatar(index)"
        :profile-alert="hasUnreadMindState"
        :can-regenerate-image="canRegenerateChatImage"
        :regenerating-image="regeneratingChatImageMessageIds.includes(message.id)"
        :selection-mode="selectionMode"
        :selected="isMessageSelected(message)"
        @apply-image="applyChatImageCandidate"
        @busy-action="store.showConfigAlert"
        @long-press="openMessageActions"
        @open-profile="openCharacterProfile"
        @regenerate-image="regenerateChatImage"
        @toggle-select="toggleMessageSelection(message)"
      />
      <div v-if="store.loadingReply" class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </main>

    <section v-if="selectionMode" class="selection-toolbar">
      <button class="secondary-action" type="button" @click="cancelSelection">
        <X :size="16" />
        <span>取消</span>
      </button>
      <strong>已选 {{ selectedMessageCount }} 条</strong>
      <button class="danger-action" type="button" :disabled="!selectedMessageCount" @click="deleteSelectedMessages">
        <Trash2 :size="16" />
        <span>删除</span>
      </button>
    </section>

    <MessageComposer
      :can-send-reply="hasPendingUserMessages"
      :disabled="store.loadingReply"
      online
      placeholder="Aa"
      :quote="quoteTarget"
      @cancel-quote="quoteTarget = null"
      @prepare-focus="captureKeyboardScrollAnchor"
      @focus="startKeyboardScrollGuard"
      @blur="stopKeyboardScrollGuard"
      @capture-photo="sendCapturedPhoto"
      @open-image-panel="openImagePanel"
      @open-menu="showActionMenu = true"
      @open-stickers="showStickers = true"
      @open-voice-panel="openVoicePanel"
      @reply="sendAndReply"
      @send="sendBubble"
    />

    <input ref="localImageInputRef" class="hidden-file-input" type="file" accept="image/*" @change="sendLocalImageFromInput" />

    <AppModal v-model="showImagePanel" title="发送图片" :show-header="false" variant="ins">
      <section class="image-send-panel">
        <div class="image-panel-head">
          <div>
            <p>Image</p>
            <h3>发送图片给 {{ characterDisplayName }}</h3>
          </div>
        </div>
        <nav class="image-tabs" aria-label="图片发送方式">
          <button type="button" :class="{ active: imageSendTab === 'local' }" @click="imageSendTab = 'local'">本地图片发送</button>
          <button type="button" :class="{ active: imageSendTab === 'description' }" @click="imageSendTab = 'description'">文字描述卡片</button>
        </nav>

        <section v-if="imageSendTab === 'local'" class="local-image-tab">
          <label class="description-field local-image-hint-field">
            <span>图片补充描述（可选）</span>
            <textarea v-model="localImageHintDraft" maxlength="500" rows="3" placeholder="可以写画面重点、场景、人物或你希望 AI 理解到的细节。"></textarea>
          </label>
          <button class="local-image-button" type="button" :disabled="sendingImage" @click="localImageInputRef?.click()">
            <span>{{ sendingImage ? '处理中' : '选择本地图片' }}</span>
          </button>
          <p>图片会以真实图片发送，支持后续模型识图。</p>
        </section>

        <section v-else class="description-image-tab">
          <figure class="description-preview">
            <figcaption>{{ imageDescriptionDraft.trim() || '写一段画面描述，发送后会显示成模拟图片卡片。' }}</figcaption>
          </figure>
          <label class="description-field">
            <span>图片描述</span>
            <textarea v-model="imageDescriptionDraft" maxlength="500" rows="5" placeholder="例如：傍晚便利店门口的自拍，玻璃上有暖色灯光反射，手里拿着一瓶冰咖啡。"></textarea>
          </label>
          <button class="description-send-button" type="button" :disabled="sendingImage || !imageDescriptionDraft.trim()" @click="sendDescriptionImage">
            {{ sendingImage ? '发送中' : '发送描述卡片' }}
          </button>
        </section>
      </section>
    </AppModal>

    <AppModal v-model="showVoicePanel" title="发送语音" :show-header="false" variant="ins">
      <section class="voice-send-panel">
        <div class="voice-panel-head">
          <div>
            <p>Voice</p>
            <h3>发送语音给 {{ characterDisplayName }}</h3>
          </div>
        </div>
        <nav class="voice-tabs" aria-label="语音发送方式">
          <button type="button" :disabled="recordingVoice" :class="{ active: voiceSendTab === 'record' }" @click="voiceSendTab = 'record'">录音语音</button>
          <button type="button" :disabled="recordingVoice" :class="{ active: voiceSendTab === 'text' }" @click="voiceSendTab = 'text'">文字语音</button>
        </nav>

        <section v-if="voiceSendTab === 'record'" class="voice-record-tab">
          <div class="voice-recorder-card" :class="{ recording: recordingVoice, ready: recordedVoiceDraft }">
            <strong>{{ voiceRecordStatus }}</strong>
            <span>{{ formatVoiceDuration(recordedVoiceSeconds) }}</span>
            <div class="voice-preview-wave" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>
          <label class="voice-text-field">
            <span>语音内容</span>
            <textarea v-model="voiceTranscriptDraft" maxlength="500" rows="4" placeholder="输入这条语音要表达的内容"></textarea>
          </label>
          <div class="voice-actions">
            <button v-if="!recordingVoice" class="voice-secondary" type="button" :disabled="store.loadingReply" @click="startVoiceRecording">
              {{ recordedVoiceDraft ? '重录' : '开始录音' }}
            </button>
            <button v-else class="voice-secondary voice-secondary--stop" type="button" @click="stopVoiceRecording">停止</button>
            <button class="voice-primary" type="button" :disabled="!recordedVoiceDraft || !voiceTranscriptDraft.trim() || store.loadingReply || recordingVoice" @click="sendRecordedVoice">发送语音</button>
          </div>
        </section>

        <section v-else class="voice-text-tab">
          <div class="voice-text-preview">
            <div class="voice-preview-wave" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <strong>{{ formatVoiceDuration(textVoiceDuration) }}</strong>
          </div>
          <label class="voice-text-field">
            <span>语音内容</span>
            <textarea v-model="voiceTextDraft" maxlength="500" rows="5" placeholder="输入要作为语音发送的内容"></textarea>
          </label>
          <button class="voice-primary" type="button" :disabled="!voiceTextDraft.trim() || store.loadingReply" @click="sendTextVoice">发送语音</button>
        </section>
      </section>
    </AppModal>

    <AppModal v-model="showActionMenu" title="更多操作" :show-header="false" variant="ins">
      <section class="action-menu">
        <button type="button" @click="openUserProfile">
          <UserRound :size="20" />
          <span>我的主页</span>
        </button>
        <button type="button" @click="openCharacterProfile">
          <ContactRound :size="20" />
          <span>角色主页</span>
        </button>
        <button class="danger-menu-action" type="button" @click="openDeleteFriendConfirm">
          <UserMinus :size="20" />
          <span>删除好友</span>
        </button>
        <button class="danger-menu-action" type="button" @click="openClearHistoryConfirm">
          <ArchiveX :size="20" />
          <span>清空记忆</span>
        </button>
        <button type="button" @click="openLocationPanel">
          <MapPin :size="20" />
          <span>发送定位</span>
        </button>
        <button type="button" @click="openModelSwitch">
          <SlidersHorizontal :size="20" />
          <span>模型切换</span>
        </button>
        <button type="button" :class="{ busy: store.loadingReply }" :aria-disabled="store.loadingReply" @click="regenerateReply">
          <RefreshCw :size="20" />
          <span>重新回复</span>
        </button>
        <button type="button" @click="openGobangPlaceholder">
          <Grid3X3 :size="20" />
          <span>五子棋</span>
        </button>
        <button type="button" :class="{ busy: generatingVoom }" :aria-disabled="generatingVoom" @click="generateVoomPost">
          <Sparkles :size="20" />
          <span>{{ generatingVoom ? '生成中' : '生成 VOOM' }}</span>
        </button>
      </section>
    </AppModal>

    <AppModal v-model="showLocationPanel" title="发送定位" :show-header="false" variant="ins">
      <section class="location-send-panel">
        <div class="location-panel-head">
          <div>
            <p>Location</p>
            <h3>发送定位给 {{ characterDisplayName }}</h3>
          </div>
        </div>

        <div class="location-preview-card">
          <span aria-hidden="true"><MapPin :size="24" /></span>
          <div>
            <strong>{{ locationNameDraft.trim() || '地点名称' }}</strong>
            <small>{{ locationAddressDraft.trim() || '详细地址可留空' }}</small>
            <em>{{ locationDistanceDraft.trim() || `距离 ${characterDisplayName} 多远` }}</em>
          </div>
        </div>

        <label class="location-field">
          <span>地理位置</span>
          <input v-model="locationNameDraft" maxlength="80" placeholder="例如：市图书馆三楼自习区" />
        </label>
        <label class="location-field">
          <span>详细地址（可选）</span>
          <input v-model="locationAddressDraft" maxlength="140" placeholder="例如：XX路 88 号 / 北门附近" />
        </label>
        <label class="location-field">
          <span>距离角色的位置</span>
          <input v-model="locationDistanceDraft" maxlength="60" placeholder="例如：约 2.4 公里 / 步行 12 分钟" />
        </label>

        <div class="location-actions">
          <button class="secondary-action" type="button" @click="showLocationPanel = false">取消</button>
          <button class="primary-action" type="button" :disabled="!canSendLocation || store.loadingReply" @click="sendLocationMessage">发送定位</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showMessageMenu" title="消息操作" :show-header="false" variant="ins">
      <section class="message-action-menu">
        <button type="button" @click="copyActiveMessage">
          <Copy :size="19" />
          <span>复制</span>
        </button>
        <button type="button" @click="deleteActiveMessage">
          <Trash2 :size="19" />
          <span>删除</span>
        </button>
        <button type="button" @click="startSelectionFromActive">
          <CheckSquare :size="19" />
          <span>多选</span>
        </button>
        <button type="button" :disabled="!canRecallActiveMessage" @click="recallActiveMessage">
          <RotateCcw :size="19" />
          <span>撤回</span>
        </button>
        <button type="button" :disabled="!canQuoteActiveMessage" @click="quoteActiveMessage">
          <Quote :size="19" />
          <span>引用</span>
        </button>
        <button type="button" :disabled="!canEditActiveMessage" @click="openEditActiveMessage">
          <Pencil :size="19" />
          <span>编辑</span>
        </button>
      </section>
    </AppModal>

    <AppModal v-model="showEditModal" title="编辑消息" variant="ins">
      <section class="edit-message-sheet">
        <textarea v-model="editDraft" rows="5" placeholder="编辑消息内容"></textarea>
        <div class="edit-actions">
          <button class="secondary-action" type="button" @click="showEditModal = false">取消</button>
          <button class="primary-action" type="button" :disabled="!editDraft.trim()" @click="saveEditedMessage">保存</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showDeleteConfirm" title="确认删除" :show-header="false" variant="ins">
      <section class="delete-confirm-sheet">
        <h3>删除消息？</h3>
        <p>删除后 AI 不会再读取这部分信息。</p>
        <div class="delete-confirm-actions">
          <button class="secondary-action" type="button" @click="cancelDeleteConfirm">取消</button>
          <button class="danger-action" type="button" @click="confirmDeleteMessages">删除</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showDeleteFriendConfirm" title="确认删除" :show-header="false" variant="ins">
      <section class="delete-confirm-sheet">
        <h3>删除好友？</h3>
        <p>会同时删除与 {{ characterDisplayName }} 的聊天记录、线下 RP、关联 VOOM，以及角色当前绑定的所有局部世界书，删除后不可恢复。</p>
        <div class="delete-confirm-actions">
          <button class="secondary-action" type="button" :disabled="deletingFriend" @click="showDeleteFriendConfirm = false">取消</button>
          <button class="danger-action" type="button" :disabled="deletingFriend" @click="confirmDeleteFriend">{{ deletingFriend ? '删除中' : '删除好友' }}</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showClearHistoryConfirm" title="确认清空" :show-header="false" variant="ins">
      <section class="delete-confirm-sheet">
        <h3>清空 {{ characterDisplayName }} 的记忆？</h3>
        <p>会删除该角色的线上聊天、线下 RP、VOOM 关联、记忆手册、主页展示资料和心境状态；好友、聊天设置、角色基础资料和绑定局部世界书都会保留。</p>
        <div class="delete-confirm-actions">
          <button class="secondary-action" type="button" :disabled="clearingHistory" @click="showClearHistoryConfirm = false">取消</button>
          <button class="danger-action" type="button" :disabled="clearingHistory" @click="confirmClearHistory">{{ clearingHistory ? '清空中' : '确认清空' }}</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showOfflineConfirm" title="进入线下模式" :show-header="false" variant="ins">
      <section class="offline-confirm">
        <h3>进入线下模式？</h3>
        <p>将切换到线下模式，开启长篇小说式对话。</p>
        <div class="offline-confirm-actions">
          <button class="secondary-action" type="button" @click="showOfflineConfirm = false">取消</button>
          <button class="primary-action" type="button" @click="enterOffline">进入</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showUserProfile" title="我的主页" :show-header="false" variant="profile-ins">
      <UserProfileSheet v-if="boundUser" :user="boundUser" :posts="store.sortedVoomPosts" @save="saveUserProfile" />
    </AppModal>

    <AppModal v-model="showProfile" title="角色主页" :show-header="false" variant="profile-ins">
      <CharacterProfileSheet v-if="character" :character="character" :posts="store.sortedVoomPosts" @save="saveCharacterProfile" />
    </AppModal>
    <StickerLibraryModal v-model="showStickers" :conversation-id="props.id" />
    <ChatModelSwitchPanel v-model="showModelSwitch" :conversation-id="props.id" />
  </section>
  <section v-else class="screen no-tabs empty-state">会话不存在</section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArchiveX, CheckSquare, ContactRound, Copy, Grid3X3, MapPin, Pencil, Quote, RefreshCw, RotateCcw, SlidersHorizontal, Sparkles, Trash2, UserMinus, UserRound, X } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import ChatHeader from '@/components/chat/ChatHeader.vue';
import ChatModelSwitchPanel from '@/components/chat/ChatModelSwitchPanel.vue';
import CharacterProfileSheet from '@/components/chat/CharacterProfileSheet.vue';
import MessageBubble from '@/components/chat/MessageBubble.vue';
import MessageComposer from '@/components/chat/MessageComposer.vue';
import UserProfileSheet from '@/components/chat/UserProfileSheet.vue';
import StickerLibraryModal from '@/components/stickers/StickerLibraryModal.vue';
import { useAppStore } from '@/stores/appStore';
import type { CharacterProfile, ChatImageAttachment, ChatLocationAttachment, ChatMessage, ChatMessageQuote, ChatVoiceAttachment, UserProfile } from '@/types/domain';
import { readChatImageFile } from '@/utils/imageFile';
import { useKeyboardScrollGuard } from '@/utils/keyboardScrollGuard';
import { getSelectedImageModelOption } from '@/utils/settings';
import { isVoomNarrationMessage, mergeVoomLikeMessages } from '@/utils/voomMessages';

const props = defineProps<{
  id: string;
}>();

const store = useAppStore();
const router = useRouter();
const showProfile = ref(false);
const showUserProfile = ref(false);
const showActionMenu = ref(false);
const showModelSwitch = ref(false);
const showOfflineConfirm = ref(false);
const showStickers = ref(false);
const showImagePanel = ref(false);
const showVoicePanel = ref(false);
const showLocationPanel = ref(false);
const showMessageMenu = ref(false);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);
const showDeleteFriendConfirm = ref(false);
const showClearHistoryConfirm = ref(false);
const generatingVoom = ref(false);
const deletingFriend = ref(false);
const clearingHistory = ref(false);
const regeneratingChatImageMessageIds = ref<string[]>([]);
const messageListRef = ref<HTMLElement | null>(null);
const localImageInputRef = ref<HTMLInputElement | null>(null);
const activeMessage = ref<ChatMessage | null>(null);
const selectionMode = ref(false);
const selectedMessageIds = ref<string[]>([]);
const quoteTarget = ref<ChatMessageQuote | null>(null);
const editDraft = ref('');
const pendingDeleteIds = ref<string[]>([]);
const pendingDeleteFromSelection = ref(false);
const visibleMessageLimit = ref(60);
const loadingEarlierMessages = ref(false);
const imageSendTab = ref<'local' | 'description'>('local');
const localImageHintDraft = ref('');
const imageDescriptionDraft = ref('');
const sendingImage = ref(false);
const voiceSendTab = ref<'record' | 'text'>('record');
const voiceTranscriptDraft = ref('');
const voiceTextDraft = ref('');
const locationNameDraft = ref('');
const locationAddressDraft = ref('');
const locationDistanceDraft = ref('');
const recordedVoiceDraft = ref<Pick<ChatVoiceAttachment, 'audioUrl' | 'duration' | 'mimeType'> | null>(null);
const recordingVoice = ref(false);
const recordingStartedAt = ref(0);
const recordingElapsed = ref(0);
let voiceRecorder: MediaRecorder | null = null;
let voiceStream: MediaStream | null = null;
let voiceChunks: Blob[] = [];
let voiceTimer: number | undefined;
let discardRecording = false;

const initialMessageLimit = 60;
const messageLoadStep = 30;
const topLoadThreshold = 48;

const conversation = computed(() => store.conversationById(props.id));
const character = computed(() => (conversation.value ? store.characterById(conversation.value.charId) : undefined));
const characterDisplayName = computed(() => character.value?.nickname || character.value?.name || '该好友');
const boundUser = computed(() => (character.value ? store.userById(character.value.boundUserId) : null));
const chatSettings = computed(() => store.settingsForConversation(props.id));
const allOnlineMessages = computed(() => {
  const messages = store.messagesForConversation(props.id).filter((message) => message.mode === 'online');
  const displayMessages = chatSettings.value.appearance.hideVoomNarration
    ? messages.filter((message) => !isVoomNarrationMessage(message))
    : messages;
  return mergeVoomLikeMessages(displayMessages);
});
const onlineMessages = computed(() => allOnlineMessages.value.slice(Math.max(0, allOnlineMessages.value.length - visibleMessageLimit.value)));
const hasEarlierMessages = computed(() => visibleMessageLimit.value < allOnlineMessages.value.length);

function shouldHideAvatar(index: number) {
  if (!chatSettings.value.appearance.showOnlyFirstAvatarInReply) return false;
  const message = onlineMessages.value[index];
  const previousMessage = onlineMessages.value[index - 1];
  return message?.sender === 'char' && previousMessage?.sender === 'char';
}

const messageListStyle = computed(() => ({
  backgroundColor: chatSettings.value.appearance.backgroundColor,
  backgroundImage: chatSettings.value.appearance.backgroundImage ? `url(${chatSettings.value.appearance.backgroundImage})` : 'none'
}));
const hasPendingUserMessages = computed(() => {
  const lastMessage = allOnlineMessages.value[allOnlineMessages.value.length - 1];
  return lastMessage?.sender === 'user';
});
const selectedMessageCount = computed(() => selectedMessageIds.value.length);
const hasUnreadMindState = computed(() => Boolean(character.value?.mindState?.lines.length
  && character.value.mindState.updatedAt > character.value.mindState.readAt));
const activeMessageIsSynthetic = computed(() => Boolean(activeMessage.value?.id.includes('__')));
const canRecallActiveMessage = computed(() => Boolean(activeMessage.value && activeMessage.value.sender === 'user' && !activeMessageIsSynthetic.value));
const canQuoteActiveMessage = computed(() => Boolean(activeMessage.value && activeMessage.value.sender === 'char' && !activeMessageIsSynthetic.value));
const canEditActiveMessage = computed(() => Boolean(activeMessage.value && !activeMessageIsSynthetic.value));
const canRegenerateChatImage = computed(() => Boolean(getSelectedImageModelOption(store.settings, 'onlineChat')));
const recordedVoiceSeconds = computed(() => recordingVoice.value
  ? Math.max(1, Math.round(recordingElapsed.value))
  : recordedVoiceDraft.value?.duration ?? 0);
const textVoiceDuration = computed(() => estimateVoiceDuration(voiceTextDraft.value));
const voiceRecordStatus = computed(() => {
  if (recordingVoice.value) return '正在录音';
  if (recordedVoiceDraft.value) return '录音已就绪';
  return '等待录音';
});
const canSendLocation = computed(() => Boolean(locationNameDraft.value.trim() && locationDistanceDraft.value.trim()));
const { captureKeyboardScrollAnchor, releaseKeyboardScrollGuard, startKeyboardScrollGuard, stopKeyboardScrollGuard } = useKeyboardScrollGuard(messageListRef);

async function syncConversationState(id: string) {
  await store.markConversationRead(id);
  const currentConversation = store.conversationById(id);
  if (currentConversation?.activeMode !== 'online') {
    await store.updateConversationMode(id, 'online');
  }
}

async function scrollMessagesToBottom() {
  await nextTick();
  const messageList = messageListRef.value;
  if (!messageList) return;
  messageList.scrollTop = messageList.scrollHeight;
}

function resetMessageWindow() {
  visibleMessageLimit.value = initialMessageLimit;
}

async function loadEarlierMessages() {
  const messageList = messageListRef.value;
  if (!messageList || !hasEarlierMessages.value || loadingEarlierMessages.value) return;
  loadingEarlierMessages.value = true;
  const previousScrollHeight = messageList.scrollHeight;
  const previousScrollTop = messageList.scrollTop;
  visibleMessageLimit.value = Math.min(allOnlineMessages.value.length, visibleMessageLimit.value + messageLoadStep);
  await nextTick();
  messageList.scrollTop = messageList.scrollHeight - previousScrollHeight + previousScrollTop;
  loadingEarlierMessages.value = false;
}

function handleMessageListScroll() {
  if ((messageListRef.value?.scrollTop ?? 0) > topLoadThreshold) return;
  void loadEarlierMessages();
}

onMounted(async () => {
  await store.hydrate();
  await syncConversationState(props.id);
  resetMessageWindow();
  await scrollMessagesToBottom();
});

watch(() => props.id, (id) => {
  void (async () => {
    resetMessageWindow();
    await syncConversationState(id);
    await scrollMessagesToBottom();
  })();
});

watch(() => [allOnlineMessages.value.length, store.loadingReply], () => {
  void scrollMessagesToBottom();
}, {
  flush: 'post'
});

watch(showVoicePanel, (open) => {
  if (!open) resetVoicePanel();
});

async function sendBubble(content: string) {
  releaseKeyboardScrollGuard();
  await store.appendUserMessage(props.id, content, quoteTarget.value);
  quoteTarget.value = null;
}

async function sendAndReply(content: string) {
  releaseKeyboardScrollGuard();
  if (content.trim()) {
    await store.appendUserMessage(props.id, content, quoteTarget.value);
    quoteTarget.value = null;
  }
  await store.requestRoleplayReply(props.id);
}

function openImagePanel() {
  imageSendTab.value = 'local';
  showImagePanel.value = true;
}

async function appendImageMessage(image: ChatImageAttachment, content: string) {
  releaseKeyboardScrollGuard();
  const userMessage = await store.appendUserImageMessage(props.id, content, image, quoteTarget.value);
  if (!userMessage) return;
  quoteTarget.value = null;
}

async function sendImageFile(file: File, kind: 'photo' | 'local') {
  if (sendingImage.value || store.loadingReply) return;
  sendingImage.value = true;
  try {
    const image = await readChatImageFile(file);
    const isPhoto = kind === 'photo';
    const description = isPhoto ? '相机照片' : '本地图片';
    await appendImageMessage({
      kind,
      description,
      aiHint: kind === 'local' ? localImageHintDraft.value.trim() || undefined : undefined,
      url: image.dataUrl,
      fileName: file.name,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height
    }, '[图片]');
    if (kind === 'local') localImageHintDraft.value = '';
    showImagePanel.value = false;
  } catch (error) {
    store.showConfigAlert(error instanceof Error ? error.message : '图片读取失败。', '无法发送图片');
  } finally {
    sendingImage.value = false;
  }
}

async function sendCapturedPhoto(file: File) {
  await sendImageFile(file, 'photo');
}

async function sendLocalImageFromInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file?.type.startsWith('image/')) return;
  await sendImageFile(file, 'local');
}

async function sendDescriptionImage() {
  const description = imageDescriptionDraft.value.trim();
  if (!description || sendingImage.value || store.loadingReply) return;
  sendingImage.value = true;
  try {
    await appendImageMessage({
      kind: 'description',
      description
    }, `[图片描述卡片] ${description}`);
    imageDescriptionDraft.value = '';
    showImagePanel.value = false;
  } finally {
    sendingImage.value = false;
  }
}

function estimateVoiceDuration(content: string) {
  const textLength = content.trim().length;
  return Math.max(1, Math.min(60, Math.ceil(textLength / 4)));
}

function formatVoiceDuration(seconds: number) {
  if (!seconds) return '0"';
  return `${Math.max(1, Math.round(seconds))}"`;
}

function openVoicePanel() {
  voiceSendTab.value = 'record';
  showVoicePanel.value = true;
}

function openLocationPanel() {
  showActionMenu.value = false;
  locationNameDraft.value = '';
  locationAddressDraft.value = '';
  locationDistanceDraft.value = '';
  showLocationPanel.value = true;
}

async function appendLocationMessage(location: ChatLocationAttachment) {
  releaseKeyboardScrollGuard();
  const userMessage = await store.appendUserLocationMessage(props.id, location, quoteTarget.value);
  if (!userMessage) return;
  quoteTarget.value = null;
  await scrollMessagesToBottom();
}

async function sendLocationMessage() {
  const name = locationNameDraft.value.trim();
  const distance = locationDistanceDraft.value.trim();
  if (!name || !distance || store.loadingReply) return;
  await appendLocationMessage({
    name,
    address: locationAddressDraft.value.trim() || undefined,
    distance
  });
  showLocationPanel.value = false;
}

function getPreferredAudioMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
}

function cleanupVoiceRecorder() {
  if (voiceTimer !== undefined) {
    window.clearInterval(voiceTimer);
    voiceTimer = undefined;
  }
  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
  voiceRecorder = null;
  voiceChunks = [];
  recordingVoice.value = false;
  recordingStartedAt.value = 0;
  recordingElapsed.value = 0;
}

function abortVoiceRecording() {
  discardRecording = true;
  if (voiceRecorder) {
    if (voiceRecorder.state !== 'inactive') voiceRecorder.stop();
    return;
  }
  cleanupVoiceRecorder();
  discardRecording = false;
}

function resetVoicePanel() {
  abortVoiceRecording();
  voiceSendTab.value = 'record';
  voiceTranscriptDraft.value = '';
  voiceTextDraft.value = '';
  recordedVoiceDraft.value = null;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('语音读取失败。'));
    reader.readAsDataURL(blob);
  });
}

async function finalizeVoiceRecording(recorder: MediaRecorder) {
  const shouldDiscard = discardRecording;
  discardRecording = false;
  const chunks = [...voiceChunks];
  const duration = Math.max(1, Math.round((Date.now() - recordingStartedAt.value) / 1000) || Math.round(recordingElapsed.value));
  const mimeType = recorder.mimeType || chunks[0]?.type || 'audio/webm';
  cleanupVoiceRecorder();
  if (shouldDiscard) return;
  if (!chunks.length) {
    store.showConfigAlert('没有录到可发送的语音。', '录音为空');
    return;
  }

  try {
    const blob = new Blob(chunks, { type: mimeType });
    recordedVoiceDraft.value = {
      audioUrl: await blobToDataUrl(blob),
      duration,
      mimeType: blob.type || mimeType
    };
  } catch (error) {
    store.showConfigAlert(error instanceof Error ? error.message : '语音读取失败。', '无法读取语音');
  }
}

async function startVoiceRecording() {
  if (recordingVoice.value || store.loadingReply) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showVoicePanel.value = false;
    store.showConfigAlert('当前浏览器不支持录音。', '无法录音');
    return;
  }

  try {
    recordedVoiceDraft.value = null;
    recordingElapsed.value = 0;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredMimeType = getPreferredAudioMimeType();
    const recorder = preferredMimeType
      ? new MediaRecorder(stream, { mimeType: preferredMimeType })
      : new MediaRecorder(stream);
    voiceStream = stream;
    voiceRecorder = recorder;
    voiceChunks = [];
    discardRecording = false;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) voiceChunks.push(event.data);
    };
    recorder.onstop = () => {
      void finalizeVoiceRecording(recorder);
    };
    recordingStartedAt.value = Date.now();
    recordingVoice.value = true;
    voiceTimer = window.setInterval(() => {
      recordingElapsed.value = (Date.now() - recordingStartedAt.value) / 1000;
    }, 200);
    recorder.start();
  } catch (error) {
    cleanupVoiceRecorder();
    showVoicePanel.value = false;
    store.showConfigAlert(error instanceof Error ? error.message : '请允许浏览器访问麦克风。', '无法录音');
  }
}

function stopVoiceRecording() {
  if (!voiceRecorder || voiceRecorder.state === 'inactive') return;
  recordingElapsed.value = (Date.now() - recordingStartedAt.value) / 1000;
  voiceRecorder.stop();
}

async function appendVoiceMessage(voice: ChatVoiceAttachment) {
  releaseKeyboardScrollGuard();
  const userMessage = await store.appendUserVoiceMessage(props.id, voice, quoteTarget.value);
  if (!userMessage) return;
  quoteTarget.value = null;
  await scrollMessagesToBottom();
}

async function sendRecordedVoice() {
  const draft = recordedVoiceDraft.value;
  const transcript = voiceTranscriptDraft.value.trim();
  if (!draft?.audioUrl || !transcript || recordingVoice.value || store.loadingReply) return;
  await appendVoiceMessage({
    source: 'recorded',
    transcript,
    duration: draft.duration,
    audioUrl: draft.audioUrl,
    mimeType: draft.mimeType
  });
  showVoicePanel.value = false;
}

async function sendTextVoice() {
  const transcript = voiceTextDraft.value.trim();
  if (!transcript || store.loadingReply) return;
  await appendVoiceMessage({
    source: 'text',
    transcript,
    duration: estimateVoiceDuration(transcript)
  });
  showVoicePanel.value = false;
}

async function regenerateChatImage(messageId: string, description: string) {
  if (regeneratingChatImageMessageIds.value.includes(messageId)) {
    store.showConfigAlert('正在重新生成聊天图片，请等待当前生成完成。', '正在生成');
    return;
  }
  regeneratingChatImageMessageIds.value = [...regeneratingChatImageMessageIds.value, messageId];
  try {
    await store.regenerateChatMessageImage(messageId, description);
  } finally {
    regeneratingChatImageMessageIds.value = regeneratingChatImageMessageIds.value.filter((id) => id !== messageId);
  }
}

async function applyChatImageCandidate(messageId: string, candidateId: string) {
  await store.applyChatMessageImageCandidate(messageId, candidateId);
}

function messageIdsForAction(message: ChatMessage) {
  return message.id.split('__').map((id) => id.trim()).filter(Boolean);
}

function messageActionText(message: ChatMessage) {
  if (message.sticker) return `[Sticker] ${message.sticker.description}`;
  if (message.image) return `[图片] ${message.image.description}`;
  if (message.voice) return `[语音] ${message.voice.transcript}`;
  if (message.location) return `[定位] ${[message.location.name, message.location.address, message.location.distance].filter(Boolean).join(' · ')}`;
  return message.content;
}

function editableMessageText(message: ChatMessage) {
  if (message.voice) return message.voice.transcript;
  if (message.location) return message.location.name;
  return message.sticker?.description ?? message.image?.description ?? message.content;
}

function isMessageSelected(message: ChatMessage) {
  const selectedIds = new Set(selectedMessageIds.value);
  const ids = messageIdsForAction(message);
  return ids.length > 0 && ids.every((id) => selectedIds.has(id));
}

function toggleMessageSelection(message: ChatMessage) {
  const ids = messageIdsForAction(message);
  const selectedIds = new Set(selectedMessageIds.value);
  const allSelected = ids.every((id) => selectedIds.has(id));
  for (const id of ids) {
    if (allSelected) selectedIds.delete(id);
    else selectedIds.add(id);
  }
  selectedMessageIds.value = [...selectedIds];
}

function openMessageActions(message: ChatMessage) {
  activeMessage.value = message;
  showMessageMenu.value = true;
}

function cancelSelection() {
  selectionMode.value = false;
  selectedMessageIds.value = [];
}

function clearQuoteIfMessagesRemoved(messageIds: string[]) {
  if (quoteTarget.value && messageIds.includes(quoteTarget.value.messageId)) quoteTarget.value = null;
}

async function copyActiveMessage() {
  const message = activeMessage.value;
  if (!message) return;
  try {
    await navigator.clipboard.writeText(messageActionText(message));
    store.showConfigAlert('已复制消息内容。', '已复制');
  } catch {
    store.showConfigAlert('当前浏览器不允许写入剪贴板。', '复制失败');
  } finally {
    showMessageMenu.value = false;
  }
}

async function deleteActiveMessage() {
  const message = activeMessage.value;
  if (!message) return;
  pendingDeleteIds.value = messageIdsForAction(message);
  pendingDeleteFromSelection.value = false;
  showMessageMenu.value = false;
  showDeleteConfirm.value = true;
}

function startSelectionFromActive() {
  const message = activeMessage.value;
  if (message) selectedMessageIds.value = messageIdsForAction(message);
  selectionMode.value = true;
  showMessageMenu.value = false;
}

async function deleteSelectedMessages() {
  const ids = [...selectedMessageIds.value];
  if (!ids.length) return;
  pendingDeleteIds.value = ids;
  pendingDeleteFromSelection.value = true;
  showDeleteConfirm.value = true;
}

function cancelDeleteConfirm() {
  pendingDeleteIds.value = [];
  pendingDeleteFromSelection.value = false;
  showDeleteConfirm.value = false;
}

async function confirmDeleteMessages() {
  const ids = [...pendingDeleteIds.value];
  if (!ids.length) {
    cancelDeleteConfirm();
    return;
  }
  await store.deleteMessages(ids);
  clearQuoteIfMessagesRemoved(ids);
  if (pendingDeleteFromSelection.value) cancelSelection();
  cancelDeleteConfirm();
}

async function recallActiveMessage() {
  const message = activeMessage.value;
  if (!message || !canRecallActiveMessage.value) return;
  await store.recallMessage(message.id, { actor: 'user' });
  clearQuoteIfMessagesRemoved([message.id]);
  showMessageMenu.value = false;
}

function quoteActiveMessage() {
  const message = activeMessage.value;
  if (!message || !canQuoteActiveMessage.value) return;
  quoteTarget.value = store.createMessageQuoteSnapshot(message);
  showMessageMenu.value = false;
}

function openEditActiveMessage() {
  const message = activeMessage.value;
  if (!message || !canEditActiveMessage.value) return;
  editDraft.value = editableMessageText(message);
  showMessageMenu.value = false;
  showEditModal.value = true;
}

async function saveEditedMessage() {
  const message = activeMessage.value;
  if (!message || !editDraft.value.trim()) return;
  await store.updateMessageContent(message.id, editDraft.value);
  showEditModal.value = false;
}

function openUserProfile() {
  showActionMenu.value = false;
  showUserProfile.value = true;
}

async function openCharacterProfile() {
  showActionMenu.value = false;
  showProfile.value = true;
  if (character.value) await store.markCharacterMindStateRead(character.value.id);
}

function openModelSwitch() {
  showActionMenu.value = false;
  showModelSwitch.value = true;
}

function openDeleteFriendConfirm() {
  showActionMenu.value = false;
  showDeleteFriendConfirm.value = true;
}

function openClearHistoryConfirm() {
  showActionMenu.value = false;
  showClearHistoryConfirm.value = true;
}

async function confirmDeleteFriend() {
  const currentCharacter = character.value;
  if (!currentCharacter || deletingFriend.value) return;
  deletingFriend.value = true;
  try {
    await store.deleteCharacterProfile(currentCharacter.id);
    showDeleteFriendConfirm.value = false;
    store.showConfigAlert('已删除好友。', '删除完成');
    await router.replace({ name: 'chats' });
  } finally {
    deletingFriend.value = false;
  }
}

async function confirmClearHistory() {
  const currentCharacter = character.value;
  if (!currentCharacter || clearingHistory.value) return;
  clearingHistory.value = true;
  try {
    const cleared = await store.clearCharacterHistory(currentCharacter.id);
    showClearHistoryConfirm.value = false;
    if (cleared) {
      quoteTarget.value = null;
      cancelSelection();
      store.showConfigAlert('已清空该角色记忆，好友状态已回到初始。', '清空完成');
      await store.updateConversationMode(props.id, 'online');
      await router.replace({ name: 'chat-room', params: { id: props.id } });
      await scrollMessagesToBottom();
    }
  } finally {
    clearingHistory.value = false;
  }
}

function openChatSettings() {
  void router.push({ name: 'chat-settings', params: { id: props.id } });
}

async function regenerateReply() {
  if (store.loadingReply) {
    store.showConfigAlert('正在生成回复，请等待当前生成完成。', '正在生成');
    return;
  }
  showActionMenu.value = false;
  await store.regenerateLatestReply(props.id);
}

function openGobangPlaceholder() {
  showActionMenu.value = false;
  store.showConfigAlert('五子棋功能开发中。', '五子棋');
}

async function generateVoomPost() {
  if (generatingVoom.value) {
    store.showConfigAlert('正在生成 VOOM，请等待当前生成完成。', '正在生成');
    return;
  }
  showActionMenu.value = false;
  generatingVoom.value = true;
  try {
    const post = await store.createMomentFromConversation(props.id);
    if (post) store.showConfigAlert('已生成该角色的一条 VOOM。', '生成完成');
  } catch (error) {
    store.showConfigAlert(error instanceof Error ? error.message : 'VOOM 生成失败。', '无法生成 VOOM');
  } finally {
    generatingVoom.value = false;
  }
}

async function saveUserProfile(user: UserProfile) {
  await store.saveUserProfile(user);
}

async function saveCharacterProfile(nextCharacter: CharacterProfile) {
  await store.saveCharacter(nextCharacter);
}

async function enterOffline() {
  showOfflineConfirm.value = false;
  await store.updateConversationMode(props.id, 'offline');
  await router.push(`/offline/${props.id}`);
}

onBeforeUnmount(abortVoiceRecording);
</script>

<style scoped>
.chat-room {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 0;
  background: #ffffff;
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px 10px calc(8px + var(--keyboard-inset));
  background-position: center;
  background-size: cover;
  -webkit-overflow-scrolling: touch;
  overflow-anchor: none;
  scroll-padding-bottom: calc(8px + var(--keyboard-inset));
}

.history-loader {
  margin: 3px auto 9px;
  width: fit-content;
  max-width: 100%;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(245, 246, 248, 0.92);
  color: #7b828a;
  font-size: 12px;
  line-height: 1.2;
}

.hidden-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.image-send-panel {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
  container-type: inline-size;
}

.image-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.image-panel-head > div {
  min-width: 0;
}

.image-panel-head p {
  margin: 0 0 3px;
  color: #8a6672;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.image-panel-head h3 {
  margin: 0;
  color: #211f24;
  font-size: 16px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.image-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.74);
}

.image-tabs button {
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  border-radius: 8px;
  color: #59606a;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.image-tabs button.active {
  background: #ffffff;
  color: #171717;
  box-shadow: 0 1px 8px rgba(37, 31, 37, 0.08);
}

.local-image-tab,
.description-image-tab {
  display: grid;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}

.local-image-button {
  display: grid;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 46px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #eff1f3;
  color: #2d333a;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.local-image-tab p {
  margin: 0;
  color: #737983;
  font-size: 12px;
  line-height: 1.45;
}

.description-preview {
  display: grid;
  place-items: center;
  width: min(100%, 220px);
  min-width: 0;
  margin: 0 auto;
  aspect-ratio: 1 / 1;
  padding: 20px;
  overflow: hidden;
  border: 1px solid #edf0f2;
  border-radius: 18px;
  background: #ffffff;
  color: #222222;
  box-shadow: 0 8px 26px rgba(37, 31, 37, 0.08);
}

.description-preview figcaption {
  max-width: 100%;
  max-height: 100%;
  overflow: auto;
  margin: 0;
  font-size: 13px;
  font-weight: 820;
  line-height: 1.65;
  text-align: center;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-overflow-scrolling: touch;
}

.description-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.description-field span {
  color: #686b70;
  font-size: 12px;
  font-weight: 900;
}

.description-field textarea {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 112px;
  max-height: min(34dvh, 180px);
  resize: none;
  overflow: auto;
  border: 1px solid #edf0f2;
  border-radius: 10px;
  padding: 10px;
  background: #ffffff;
  color: #171717;
  font: inherit;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-overflow-scrolling: touch;
}

.local-image-hint-field textarea {
  min-height: 78px;
}

.description-send-button {
  min-width: 0;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 10px;
  background: #eff1f3;
  color: #2d333a;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.voice-send-panel {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
  container-type: inline-size;
}

.location-send-panel {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.location-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.location-panel-head > div {
  min-width: 0;
}

.location-panel-head p {
  margin: 0 0 3px;
  color: #60646b;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.location-panel-head h3 {
  margin: 0;
  color: #211f24;
  font-size: 16px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.location-preview-card {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  min-width: 0;
  overflow: hidden;
  border-radius: 14px;
  background: #ffffff;
  color: #202329;
  box-shadow: 0 8px 26px rgba(37, 31, 37, 0.08);
}

.location-preview-card > span {
  display: grid;
  place-items: center;
  min-height: 76px;
  background: linear-gradient(135deg, #f0f1f3, #e3e5e8);
  color: #30343a;
}

.location-preview-card div {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
  padding: 11px 12px;
}

.location-preview-card strong,
.location-preview-card small,
.location-preview-card em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-preview-card strong {
  font-size: 14px;
  font-weight: 900;
  line-height: 1.25;
}

.location-preview-card small {
  color: #68717a;
  font-size: 12px;
  font-weight: 760;
}

.location-preview-card em {
  color: #30343a;
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}

.location-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.location-field span {
  color: #686b70;
  font-size: 12px;
  font-weight: 900;
}

.location-field input {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  border: 1px solid #edf0f2;
  border-radius: 10px;
  padding: 0 10px;
  background: #ffffff;
  color: #171717;
  font: inherit;
}

.location-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.location-actions button {
  min-height: 40px;
}

.location-actions .primary-action {
  background: #d8dce0;
  color: #202329;
}

.location-actions .primary-action:disabled {
  background: #eceef1;
  color: #9ba1a8;
}

.voice-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.voice-panel-head > div {
  min-width: 0;
}

.voice-panel-head p {
  margin: 0 0 3px;
  color: #3c6f63;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.voice-panel-head h3 {
  margin: 0;
  color: #211f24;
  font-size: 16px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.voice-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.74);
}

.voice-tabs button {
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  border-radius: 8px;
  color: #59606a;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.voice-tabs button.active {
  background: #ffffff;
  color: #171717;
  box-shadow: 0 1px 8px rgba(37, 31, 37, 0.08);
}

.voice-tabs button:disabled {
  opacity: 0.52;
  cursor: default;
}

.voice-record-tab,
.voice-text-tab {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.voice-recorder-card,
.voice-text-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 54px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f4f6f5;
  color: #27342f;
}

.voice-recorder-card.recording {
  background: #e9f8ef;
  color: #0a6231;
}

.voice-recorder-card.ready {
  background: #eef6f1;
}

.voice-recorder-card strong,
.voice-text-preview strong {
  min-width: 0;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.voice-recorder-card > span {
  font-size: 12px;
  font-weight: 850;
  opacity: 0.68;
}

.voice-preview-wave {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 3px;
  min-height: 18px;
}

.voice-preview-wave span {
  width: 3px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.62;
}

.voice-preview-wave span:nth-child(1) { height: 8px; }
.voice-preview-wave span:nth-child(2) { height: 14px; }
.voice-preview-wave span:nth-child(3) { height: 18px; }
.voice-preview-wave span:nth-child(4) { height: 12px; }
.voice-preview-wave span:nth-child(5) { height: 16px; }

.voice-text-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.voice-text-field span {
  color: #686b70;
  font-size: 12px;
  font-weight: 900;
}

.voice-text-field textarea {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 98px;
  max-height: min(34dvh, 170px);
  resize: none;
  overflow: auto;
  border: 1px solid #edf0f2;
  border-radius: 10px;
  padding: 10px;
  background: #ffffff;
  color: #171717;
  font: inherit;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-overflow-scrolling: touch;
}

.voice-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.voice-secondary,
.voice-primary {
  min-width: 0;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.voice-secondary {
  background: #eef1f2;
  color: #20272d;
}

.voice-secondary--stop {
  background: #1f2f28;
  color: #ffffff;
}

.voice-primary {
  background: #eff1f3;
  color: #2d333a;
}

.voice-secondary:disabled,
.voice-primary:disabled {
  opacity: 0.45;
  cursor: default;
}

@container (max-width: 320px) {
  .image-send-panel {
    gap: 10px;
  }

  .description-preview {
    width: min(100%, 190px);
    padding: 16px;
    border-radius: 16px;
  }

  .description-preview figcaption {
    font-size: 12px;
    line-height: 1.55;
  }

  .description-field textarea {
    min-height: 96px;
  }
}

@media (max-width: 360px) {
  .image-send-panel {
    gap: 10px;
  }

  .description-preview {
    width: min(100%, 190px);
    padding: 16px;
    border-radius: 16px;
  }

  .description-preview figcaption {
    font-size: 12px;
    line-height: 1.55;
  }

  .description-field textarea {
    min-height: 96px;
  }
}

@media (max-height: 700px) {
  .image-send-panel {
    gap: 10px;
  }

  .description-preview {
    width: min(100%, 180px);
    padding: 16px;
  }

  .description-field textarea {
    min-height: 92px;
    max-height: 28dvh;
  }
}

.local-image-button:disabled,
.description-send-button:disabled {
  opacity: 0.45;
  cursor: default;
}

.typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin: 7px 0 7px 38px;
  padding: 8px 11px;
  border-radius: 15px;
  background: #ffffff;
}

.typing-indicator span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #9da1a6;
  animation: typing 0.9s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.12s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.24s;
}

.selection-toolbar {
  position: relative;
  z-index: 13;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px calc(10px + var(--safe-right)) 8px calc(10px + var(--safe-left));
  border-top: 1px solid rgba(20, 20, 20, 0.08);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  transform: translate3d(0, calc(0px - var(--keyboard-inset)), 0);
  will-change: transform;
}

.selection-toolbar strong {
  overflow: hidden;
  color: #2b3036;
  font-size: 13px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  font-weight: 800;
}

.selection-toolbar button:disabled {
  opacity: 0.45;
}

.action-menu {
  display: grid;
  gap: 8px;
}

.message-action-menu {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.message-action-menu button {
  display: grid;
  place-items: center;
  gap: 6px;
  min-height: 68px;
  padding: 8px 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: #202329;
  font-size: 12px;
  font-weight: 800;
}

.message-action-menu button:active {
  background: rgba(6, 199, 85, 0.12);
}

.message-action-menu button:disabled {
  opacity: 0.38;
}

.message-action-menu svg {
  color: #141414;
}

.edit-message-sheet {
  display: grid;
  gap: 10px;
}

.edit-message-sheet textarea {
  width: 100%;
  min-height: 112px;
  resize: vertical;
  border: 1px solid rgba(20, 20, 20, 0.08);
  border-radius: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.86);
  color: #202329;
  font: inherit;
  line-height: 1.5;
}

.edit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.edit-actions button {
  min-height: 38px;
}

.edit-actions .primary-action {
  background: #d7dbe0;
  color: #22262c;
}

.edit-actions .primary-action:disabled {
  background: #e6e8eb;
  color: #9a9fa6;
}

.delete-confirm-sheet {
  display: grid;
  gap: 10px;
  color: #202329;
}

.delete-confirm-sheet h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
}

.delete-confirm-sheet p {
  margin: 0;
  color: #646a72;
  font-size: 13px;
  line-height: 1.45;
}

.delete-confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.delete-confirm-actions button {
  min-height: 38px;
}

.action-menu button {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: #202329;
  font-size: 15px;
  font-weight: 800;
  text-align: left;
}

.action-menu button:active {
  background: rgba(6, 199, 85, 0.12);
}

.action-menu button:disabled,
.action-menu button.busy {
  opacity: 0.5;
}

.action-menu button.busy {
  cursor: progress;
}

.action-menu .danger-menu-action {
  color: #e5484d;
}

.action-menu svg {
  flex: 0 0 auto;
  color: #141414;
}

.action-menu .danger-menu-action svg {
  color: #e5484d;
}

.offline-confirm {
  display: grid;
  gap: 12px;
  color: #202329;
}

.offline-confirm h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
}

.offline-confirm p {
  margin: 0;
  color: #62666d;
  font-size: 14px;
  line-height: 1.55;
}

.offline-confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 4px;
}

.offline-confirm-actions button {
  min-height: 42px;
}

@keyframes typing {
  0%, 100% { transform: translateY(0); opacity: 0.45; }
  50% { transform: translateY(-3px); opacity: 1; }
}
</style>