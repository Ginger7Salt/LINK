<template>
  <button class="topic-card" :class="{ selected, compact }" type="button" @click="$emit('select', topic.id)">
    <span class="topic-card-top">
      <small>{{ sourceLabel }}</small>
      <Check v-if="selected" :size="15" stroke-width="3" />
      <Sparkles v-else :size="14" />
    </span>
    <strong>{{ topic.title }}</strong>
    <p>{{ topic.hook }}</p>
    <span class="topic-tags">
      <em v-for="tag in topic.tags.slice(0, compact ? 2 : 4)" :key="tag"># {{ tag }}</em>
    </span>
  </button>
</template>

<script setup lang="ts">
import { Check, Sparkles } from 'lucide-vue-next';
import { computed } from 'vue';
import type { FanficTopic } from '@/types/domain';

const props = withDefaults(defineProps<{ topic: FanficTopic; selected?: boolean; compact?: boolean }>(), {
  selected: false,
  compact: false
});

defineEmits<{ select: [topicId: string] }>();

const sourceLabel = computed(() => props.topic.source === 'trend'
  ? 'NOW TRENDING'
  : props.topic.source === 'built-in' && props.topic.categoryLabel
    ? `${props.topic.categoryLabel} · ${props.topic.subcategory}`
    : props.topic.source === 'built-in'
      ? 'ORIGINAL IDEA'
      : 'YOUR IDEA');
</script>

<style scoped>
.topic-card {
  display: grid;
  align-content: start;
  gap: 8px;
  width: 100%;
  min-height: 184px;
  padding: 16px;
  border: 1px solid rgba(78, 67, 69, 0.06);
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(255, 252, 249, 0.98), rgba(243, 238, 232, 0.9));
  color: #302b2d;
  text-align: left;
  box-shadow: 0 12px 28px rgba(61, 52, 54, 0.055);
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.topic-card:nth-child(3n + 2) { background: linear-gradient(145deg, #f8f2f4, #eee2e5); }
.topic-card:nth-child(3n + 3) { background: linear-gradient(145deg, #f2f7f2, #e1eadf); }
.topic-card.selected { border-color: rgba(64, 97, 73, 0.42); box-shadow: 0 15px 34px rgba(64, 97, 73, 0.13); transform: translateY(-2px); }
.topic-card.compact { min-width: 230px; min-height: 158px; }

.topic-card-top { display: flex; align-items: center; justify-content: space-between; color: #7a6d70; }
.topic-card-top small { overflow: hidden; font-size: 8px; font-weight: 900; letter-spacing: 0.08em; text-overflow: ellipsis; white-space: nowrap; }
.topic-card strong { font-family: Georgia, "Songti SC", serif; font-size: 18px; line-height: 1.2; }
.topic-card p { display: -webkit-box; margin: 0; overflow: hidden; color: #736b6d; font-size: 11px; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.topic-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: auto; }
.topic-tags em { padding: 4px 7px; border-radius: 999px; background: rgba(255, 255, 255, 0.62); color: #85777a; font-size: 8px; font-style: normal; font-weight: 750; }
</style>