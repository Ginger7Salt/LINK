<template>
  <RouterLink class="conversation-row" :to="`/chats/${conversation.id}`">
    <img class="avatar" :src="character.avatar" :alt="displayName" />
    <div class="conversation-main">
      <div class="conversation-top">
        <strong>{{ displayName }}</strong>
        <time>{{ formatListTime(conversation.updatedAt) }}</time>
      </div>
      <div class="conversation-bottom">
        <span>{{ preview }}</span>
        <i v-if="conversation.unreadCount" aria-hidden="true"></i>
      </div>
    </div>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterProfile, ChatMessage, Conversation } from '@/types/domain';
import { getCharacterDisplayName } from '@/utils/character';
import { formatListTime } from '@/utils/time';

const props = defineProps<{
  conversation: Conversation;
  character: CharacterProfile;
  lastMessage?: ChatMessage;
}>();

const preview = computed(() => {
  if (props.lastMessage?.sticker) return `[Sticker] ${props.lastMessage.sticker.description}`;
  if (props.lastMessage?.image) return `[图片] ${props.lastMessage.image.description}`;
  return props.lastMessage?.content || props.character.subtitle || '开始聊天';
});
const displayName = computed(() => getCharacterDisplayName(props.character));
</script>

<style scoped>
.conversation-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 78px;
  padding: 8px 24px;
}

.conversation-main {
  min-width: 0;
  flex: 1;
}

.conversation-top,
.conversation-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.conversation-top strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 17px;
}

.conversation-top time {
  flex: 0 0 auto;
  color: #c0c2c6;
  font-size: 12px;
}

.conversation-bottom {
  margin-top: 3px;
  color: var(--muted);
}

.conversation-bottom span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-bottom i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff405a;
  flex: 0 0 auto;
}
</style>