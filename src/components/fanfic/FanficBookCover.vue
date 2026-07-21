<template>
  <figure class="fanfic-cover" :class="[`size-${size}`, { procedural: isProcedural }]">
    <img :src="book.coverImage" :alt="`${book.title}封面`" />
    <span v-if="!isProcedural" class="cover-shade"></span>
    <figcaption v-if="!isProcedural">
      <small>{{ book.tags[0] || book.genre }}</small>
      <strong>{{ book.title }}</strong>
      <span>{{ book.authorName }} · 著</span>
    </figcaption>
    <em v-if="showStatus">{{ statusLabel }}</em>
  </figure>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FanficBook } from '@/types/domain';

const props = withDefaults(defineProps<{
  book: FanficBook;
  size?: 'small' | 'medium' | 'large';
  showStatus?: boolean;
}>(), {
  size: 'medium',
  showStatus: false
});

const isProcedural = computed(() => props.book.coverImage.startsWith('data:image/svg+xml'));
const statusLabel = computed(() => props.book.status === 'completed' ? '已完结' : props.book.status === 'paused' ? '待续写' : '连载中');
</script>

<style scoped>
.fanfic-cover {
  position: relative;
  width: 100%;
  margin: 0;
  overflow: hidden;
  border-radius: 20px;
  background: linear-gradient(145deg, #f3e3df, #dde9e1);
  box-shadow: 0 18px 42px rgba(53, 44, 45, 0.14), inset 0 0 0 1px rgba(255, 255, 255, 0.7);
  isolation: isolate;
}

.size-small { aspect-ratio: 2 / 3; border-radius: 14px; }
.size-medium { aspect-ratio: 2 / 3; }
.size-large { aspect-ratio: 2 / 3; border-radius: 28px; }

img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(14, 13, 13, 0.02) 30%, rgba(20, 16, 18, 0.72));
}

figcaption {
  position: absolute;
  right: 16px;
  bottom: 18px;
  left: 16px;
  z-index: 2;
  display: grid;
  gap: 6px;
  color: #ffffff;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.3);
}

figcaption small {
  font-size: 9px;
  font-style: normal;
  font-weight: 850;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

figcaption strong {
  font-family: Georgia, "Songti SC", serif;
  font-size: clamp(18px, 6vw, 29px);
  line-height: 1.16;
}

figcaption span {
  font-size: 10px;
  letter-spacing: 0.08em;
}

em {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #4e4749;
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  backdrop-filter: blur(12px);
}
</style>