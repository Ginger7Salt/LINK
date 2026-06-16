<template>
  <section v-if="conversation && character" class="screen no-tabs chat-room">
    <ChatHeader
      :character="character"
      mode="online"
      @offline="showOfflineConfirm = true"
      @open-menu="openChatSettings"
    />

    <main ref="messageListRef" class="message-list" :style="messageListStyle">
      <MessageBubble
        v-for="(message, index) in onlineMessages"
        :key="message.id"
        :message="message"
        :character="character"
        :appearance="chatSettings.appearance"
        :hide-avatar="shouldHideAvatar(index)"
        :profile-alert="hasUnreadMindState"
        :selection-mode="selectionMode"
        :selected="isMessageSelected(message)"
        @long-press="openMessageActions"
        @open-profile="openCharacterProfile"
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
      @open-menu="showActionMenu = true"
      @open-stickers="showStickers = true"
      @reply="sendAndReply"
      @send="sendBubble"
    />

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
        <button type="button" @click="openModelSwitch">
          <SlidersHorizontal :size="20" />
          <span>模型切换</span>
        </button>
        <button type="button" :disabled="store.loadingReply" @click="regenerateReply">
          <RefreshCw :size="20" />
          <span>重新回复</span>
        </button>
        <button type="button" @click="openGobangPlaceholder">
          <Grid3X3 :size="20" />
          <span>五子棋</span>
        </button>
        <button type="button" :disabled="generatingVoom" @click="generateVoomPost">
          <Sparkles :size="20" />
          <span>{{ generatingVoom ? '生成中' : '生成 VOOM' }}</span>
        </button>
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
        <p>会删除该角色的线上聊天、线下 RP、VOOM 关联、记忆手册、主页展示资料、心境状态和当前绑定的局部世界书，好友会保留并回到刚添加时的初始状态。</p>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArchiveX, CheckSquare, ContactRound, Copy, Grid3X3, Pencil, Quote, RefreshCw, RotateCcw, SlidersHorizontal, Sparkles, Trash2, UserMinus, UserRound, X } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import ChatHeader from '@/components/chat/ChatHeader.vue';
import ChatModelSwitchPanel from '@/components/chat/ChatModelSwitchPanel.vue';
import CharacterProfileSheet from '@/components/chat/CharacterProfileSheet.vue';
import MessageBubble from '@/components/chat/MessageBubble.vue';
import MessageComposer from '@/components/chat/MessageComposer.vue';
import UserProfileSheet from '@/components/chat/UserProfileSheet.vue';
import StickerLibraryModal from '@/components/stickers/StickerLibraryModal.vue';
import { useAppStore } from '@/stores/appStore';
import type { CharacterProfile, ChatMessage, ChatMessageQuote, UserProfile } from '@/types/domain';
import { useKeyboardScrollGuard } from '@/utils/keyboardScrollGuard';
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
const showMessageMenu = ref(false);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);
const showDeleteFriendConfirm = ref(false);
const showClearHistoryConfirm = ref(false);
const generatingVoom = ref(false);
const deletingFriend = ref(false);
const clearingHistory = ref(false);
const messageListRef = ref<HTMLElement | null>(null);
const activeMessage = ref<ChatMessage | null>(null);
const selectionMode = ref(false);
const selectedMessageIds = ref<string[]>([]);
const quoteTarget = ref<ChatMessageQuote | null>(null);
const editDraft = ref('');
const pendingDeleteIds = ref<string[]>([]);
const pendingDeleteFromSelection = ref(false);

const conversation = computed(() => store.conversationById(props.id));
const character = computed(() => (conversation.value ? store.characterById(conversation.value.charId) : undefined));
const characterDisplayName = computed(() => character.value?.nickname || character.value?.name || '该好友');
const boundUser = computed(() => (character.value ? store.userById(character.value.boundUserId) : null));
const chatSettings = computed(() => store.settingsForConversation(props.id));
const onlineMessages = computed(() => {
  const messages = store.visibleMessagesForConversation(props.id).filter((message) => message.mode === 'online');
  const displayMessages = chatSettings.value.appearance.hideVoomNarration
    ? messages.filter((message) => !isVoomNarrationMessage(message))
    : messages;
  return mergeVoomLikeMessages(displayMessages);
});

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
  const lastMessage = onlineMessages.value[onlineMessages.value.length - 1];
  return lastMessage?.sender === 'user';
});
const selectedMessageCount = computed(() => selectedMessageIds.value.length);
const hasUnreadMindState = computed(() => Boolean(character.value?.mindState?.lines.length
  && character.value.mindState.updatedAt > character.value.mindState.readAt));
const activeMessageIsSynthetic = computed(() => Boolean(activeMessage.value?.id.includes('__')));
const canRecallActiveMessage = computed(() => Boolean(activeMessage.value && activeMessage.value.sender === 'user' && !activeMessageIsSynthetic.value));
const canQuoteActiveMessage = computed(() => Boolean(activeMessage.value && activeMessage.value.sender === 'char' && !activeMessageIsSynthetic.value));
const canEditActiveMessage = computed(() => Boolean(activeMessage.value && !activeMessageIsSynthetic.value));
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

onMounted(async () => {
  await store.hydrate();
  await syncConversationState(props.id);
  await scrollMessagesToBottom();
});

watch(() => props.id, (id) => {
  void (async () => {
    await syncConversationState(id);
    await scrollMessagesToBottom();
  })();
});

watch(() => [onlineMessages.value.length, store.loadingReply], () => {
  void scrollMessagesToBottom();
}, {
  flush: 'post'
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

function messageIdsForAction(message: ChatMessage) {
  return message.id.split('__').map((id) => id.trim()).filter(Boolean);
}

function messageActionText(message: ChatMessage) {
  return message.sticker ? `[Sticker] ${message.sticker.description}` : message.content;
}

function editableMessageText(message: ChatMessage) {
  return message.sticker?.description ?? message.content;
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
  showActionMenu.value = false;
  await store.regenerateLatestReply(props.id);
}

function openGobangPlaceholder() {
  showActionMenu.value = false;
  store.showConfigAlert('五子棋功能开发中。', '五子棋');
}

async function generateVoomPost() {
  if (generatingVoom.value) return;
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

.action-menu button:disabled {
  opacity: 0.5;
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