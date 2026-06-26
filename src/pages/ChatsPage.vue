<template>
  <section class="screen chats-page">
    <header class="top-bar chats-top">
      <div class="online-title">
        <h1 class="top-title">Online</h1>
      </div>
      <div class="icon-row">
        <button class="icon-button" type="button" aria-label="排序">
          <ListChecks :size="20" />
        </button>
        <button class="icon-button" type="button" aria-label="相册">
          <Images :size="20" />
        </button>
        <button class="icon-button" type="button" aria-label="新建" @click="openAddFriendPage">
          <Plus :size="20" />
        </button>
      </div>
    </header>

    <div class="chats-content">
      <label class="search-box">
        <Search :size="21" />
        <input placeholder="Search" />
        <ScanLine :size="21" />
      </label>

      <nav class="chat-filter" aria-label="聊天分类" role="tablist">
        <button
          v-for="tab in filterTabs"
          :key="tab.value"
          :class="{ active: activeFilter === tab.value }"
          :aria-selected="activeFilter === tab.value"
          role="tab"
          type="button"
          @click="activeFilter = tab.value"
        >
          {{ tab.label }}
        </button>
      </nav>

      <ConversationListItem
        v-for="row in visibleRows"
        :key="row.id"
        :conversation="row.conversation"
        :character="row.character"
        :last-message="row.lastMessage"
      />
      <div v-if="!visibleRows.length" class="empty-list">{{ emptyText }}</div>
    </div>

  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Images, ListChecks, Plus, ScanLine, Search } from 'lucide-vue-next';
import ConversationListItem from '@/components/chat/ConversationListItem.vue';
import { useAppStore } from '@/stores/appStore';
import type { CharacterProfile, ChatMessage, Conversation } from '@/types/domain';

type ChatFilter = 'chats' | 'group' | 'friends' | 'all';

interface ChatListRow {
  id: string;
  type: 'friend' | 'group';
  conversation: Conversation;
  character: CharacterProfile;
  lastMessage?: ChatMessage;
}

const store = useAppStore();
const router = useRouter();
const activeFilter = ref<ChatFilter>('chats');

const filterTabs: Array<{ label: string; value: ChatFilter }> = [
  { label: 'Chats', value: 'chats' },
  { label: 'Group', value: 'group' },
  { label: 'Friends', value: 'friends' },
  { label: 'All', value: 'all' }
];

const friendRows = computed<ChatListRow[]>(() =>
  store.characters.flatMap((character) => {
    const conversation = store.conversations.find((item) => item.charId === character.id && item.userId === character.boundUserId);
    if (!conversation) return [];
    return [
      {
        id: `friend_${character.id}`,
        type: 'friend',
        conversation,
        character,
        lastMessage: store.lastMessageForConversation(conversation.id)
      }
    ];
  })
);

const chatRows = computed<ChatListRow[]>(() =>
  [...store.conversations].sort((a, b) => b.updatedAt - a.updatedAt).flatMap((conversation) => {
    const character = store.characterById(conversation.charId);
    const lastMessage = store.lastMessageForConversation(conversation.id);
    if (!character || !lastMessage) return [];
    return [{ id: `chat_${conversation.id}`, type: 'friend', conversation, character, lastMessage }];
  })
);

const groupRows = computed<ChatListRow[]>(() => []);
const allRows = computed<ChatListRow[]>(() => {
  const activeConversationIds = new Set(chatRows.value.map((row) => row.conversation.id));
  return [
    ...chatRows.value,
    ...friendRows.value.filter((row) => !activeConversationIds.has(row.conversation.id)),
    ...groupRows.value
  ];
});

const visibleRows = computed(() => {
  if (activeFilter.value === 'group') return groupRows.value;
  if (activeFilter.value === 'friends') return friendRows.value;
  if (activeFilter.value === 'all') return allRows.value;
  return chatRows.value;
});

const emptyText = computed(() => {
  if (activeFilter.value === 'group') return '群组功能即将加入';
  if (activeFilter.value === 'chats') return '还没有对话记录';
  if (activeFilter.value === 'friends') return '还没有添加好友';
  return '还没有好友或群组';
});

function openAddFriendPage() {
  void router.push({ name: 'add-friend', query: { from: 'chats' } });
}
</script>

<style scoped>
.chats-page {
  --top-icon-size: 20px;
  --top-icon-button-width: 26px;
  --top-icon-button-height: 30px;
  --top-icon-gap: 1px;
}

.online-title {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chats-content {
  font-size: 13px;
}

.chats-content .search-box {
  gap: 6px;
  height: 34px;
  margin: 2px 16px 8px;
  padding: 0 10px;
  font-size: 13px;
}

.chats-content .search-box svg {
  width: 16px;
  height: 16px;
}

.chat-filter {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: start;
  justify-items: stretch;
  height: 50px;
  padding: 6px 22px;
}

.chat-filter button {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 30px;
  padding: 0;
  color: #939599;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.chat-filter button.active {
  color: #111111;
}

.chat-filter button.active::after {
  content: '';
  position: absolute;
  right: 18px;
  bottom: 0;
  left: 18px;
  height: 3px;
  border-radius: 3px;
  background: #222222;
}

.chats-content :deep(.conversation-row) {
  gap: 11px;
  min-height: 66px;
  padding: 6px 22px;
}

.chats-content :deep(.avatar) {
  width: 40px;
  height: 40px;
}

.chats-content :deep(.conversation-top strong) {
  font-size: 15px;
}

.chats-content :deep(.conversation-top time) {
  font-size: 11px;
}

.chats-content :deep(.conversation-bottom) {
  margin-top: 2px;
  font-size: 12px;
}

.chats-content :deep(.conversation-bottom i) {
  width: 8px;
  height: 8px;
}

.empty-list {
  padding: 28px 22px;
  color: #939599;
  font-size: 12px;
  text-align: center;
}

</style>