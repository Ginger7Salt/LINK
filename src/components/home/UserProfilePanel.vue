<template>
  <button class="profile-panel" v-if="user && visualProfile" type="button" aria-label="打开个人资料" @click="emit('open')">
    <div>
      <h1>{{ user.nickname }}</h1>
      <p>{{ user.signature }}</p>
    </div>
    <img class="profile-avatar" :src="visualProfile.avatar" :alt="visualProfile.nickname" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UserProfile } from '@/types/domain';
import { getVisualProfile } from '@/utils/profile';

const props = defineProps<{
  user: UserProfile | null;
}>();

const emit = defineEmits<{
  open: [];
}>();

const visualProfile = computed(() => getVisualProfile(props.user));
</script>

<style scoped>
.profile-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 16px 16px 14px;
  text-align: left;
}

.profile-panel:active {
  background: var(--soft);
}

h1 {
  margin: 0;
  font-size: 23px;
  font-weight: 850;
}

p {
  margin: 4px 0 6px;
  color: var(--muted);
  font-size: 13px;
}

small {
  display: block;
  color: #6b7179;
  font-size: 11px;
}

.profile-avatar {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  object-fit: cover;
}
</style>