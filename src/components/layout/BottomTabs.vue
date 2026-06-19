<template>
  <nav class="bottom-tabs" aria-label="主导航">
    <RouterLink v-for="tab in tabs" :key="tab.name" :to="tab.to" custom v-slot="{ href, navigate, isExactActive }">
      <a :href="href" class="tab-item" :class="{ active: isExactActive }" :aria-current="isExactActive ? 'page' : undefined" @click="navigate">
        <span class="icon-wrap">
          <component :is="tab.icon" :active="isExactActive" class="tab-icon" />
          <i v-if="tab.hasUnread" class="badge" aria-hidden="true"></i>
        </span>
        <span class="tab-label">{{ tab.label }}</span>
      </a>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from 'vue';
import { useAppStore } from '@/stores/appStore';

const store = useAppStore();

const iconProps = {
  active: {
    type: Boolean,
    default: false
  }
};

const svgAttrs = {
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg'
};

const HomeTabIcon = defineComponent({
  name: 'HomeTabIcon',
  props: iconProps,
  setup(props) {
    return () =>
      props.active
        ? h('svg', svgAttrs, [
            h('path', {
              d: 'M4.6 9.8 12 4l7.4 5.8v8.55c0 .91-.74 1.65-1.65 1.65H6.25c-.91 0-1.65-.74-1.65-1.65Z',
              fill: 'currentColor'
            }),
            h('path', {
              d: 'M10.7 13.6h2.6V20h-2.6z',
              fill: '#ffffff'
            })
          ])
        : h('svg', svgAttrs, [
            h('path', {
              d: 'M5 10.25 12 4.65l7 5.6v8.15c0 .88-.72 1.6-1.6 1.6H6.6c-.88 0-1.6-.72-1.6-1.6Z',
              stroke: 'currentColor',
              strokeWidth: 1.95,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            })
          ]);
  }
});

const ChatsTabIcon = defineComponent({
  name: 'ChatsTabIcon',
  props: iconProps,
  setup(props) {
    return () =>
      props.active
        ? h('svg', svgAttrs, [
            h('path', {
              d: 'M12 4.2c4.97 0 8.5 3.06 8.5 7.48 0 4.48-3.6 7.62-8.5 7.62-.98 0-1.95-.13-2.87-.4l-3.46 1.56 1.05-3.02c-1.53-1.24-2.42-3.24-2.42-5.76 0-4.42 3.52-7.48 8.7-7.48Z',
              fill: 'currentColor'
            }),
            h('circle', { cx: 8.95, cy: 11.65, r: 1.08, fill: '#ffffff' }),
            h('circle', { cx: 12, cy: 11.65, r: 1.08, fill: '#ffffff' }),
            h('circle', { cx: 15.05, cy: 11.65, r: 1.08, fill: '#ffffff' })
          ])
        : h('svg', svgAttrs, [
            h('path', {
              d: 'M12 4c5.02 0 8.65 3.18 8.65 7.78S17.02 19.55 12 19.55c-1.16 0-2.3-.17-3.33-.5l-3.34 1.6 1.03-3.19C5.02 16.12 4 14.08 4 11.78 4 7.18 6.98 4 12 4Z',
              stroke: 'currentColor',
              strokeWidth: 2.2,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }),
            h('circle', { cx: 9, cy: 11.8, r: 1.05, fill: 'currentColor' }),
            h('circle', { cx: 12, cy: 11.8, r: 1.05, fill: 'currentColor' }),
            h('circle', { cx: 15, cy: 11.8, r: 1.05, fill: 'currentColor' })
          ]);
  }
});

const VoomTabIcon = defineComponent({
  name: 'VoomTabIcon',
  props: iconProps,
  setup(props) {
    return () =>
      props.active
        ? h('svg', svgAttrs, [
            h('path', {
              d: 'M7.1 4.5a4.58 4.58 0 0 1 4.53 0l5.14 2.96a4.56 4.56 0 0 1 0 7.88l-5.14 2.96a4.58 4.58 0 0 1-4.53 0 4.52 4.52 0 0 1-2.35-3.95V8.45A4.52 4.52 0 0 1 7.1 4.5Z',
              fill: 'currentColor'
            }),
            h('path', {
              d: 'm10.08 8.92 4.26 2.46a.72.72 0 0 1 0 1.24l-4.26 2.45a.72.72 0 0 1-1.08-.62V9.54a.72.72 0 0 1 1.08-.62Z',
              fill: '#ffffff'
            })
          ])
        : h('svg', svgAttrs, [
            h('path', {
              d: 'M7.15 4.55a4.55 4.55 0 0 1 4.47 0l5.1 2.9a4.58 4.58 0 0 1 0 7.95l-5.1 2.9a4.55 4.55 0 0 1-4.47 0 4.58 4.58 0 0 1-2.32-3.98V8.53a4.58 4.58 0 0 1 2.32-3.98Z',
              stroke: 'currentColor',
              strokeWidth: 2.25,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }),
            h('path', {
              d: 'm10.2 8.95 4.05 2.34a.83.83 0 0 1 0 1.43l-4.05 2.33a.83.83 0 0 1-1.24-.72V9.67a.83.83 0 0 1 1.24-.72Z',
              fill: 'currentColor'
            })
          ]);
  }
});

const MusicTabIcon = defineComponent({
  name: 'MusicTabIcon',
  props: iconProps,
  setup(props) {
    return () =>
      props.active
        ? h('svg', svgAttrs, [
            h('ellipse', {
              cx: 9.2,
              cy: 17.15,
              rx: 3.2,
              ry: 2.65,
              transform: 'rotate(-22 9.2 17.15)',
              fill: 'currentColor'
            }),
            h('path', {
              d: 'M12.55 15.35V5.65l6.1-1.4v3.1l-4.05.93v7.07',
              stroke: 'currentColor',
              strokeWidth: 2.85,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }),
            h('path', {
              d: 'M12.6 5.9c1.35.5 2.75.6 4.12.3 1-.22 1.65-.52 1.93-.67',
              stroke: 'currentColor',
              strokeWidth: 2.1,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }),
            h('ellipse', {
              cx: 9.2,
              cy: 17.15,
              rx: 1.18,
              ry: 0.98,
              transform: 'rotate(-22 9.2 17.15)',
              fill: '#ffffff'
            }),
            h('path', {
              d: 'M15.15 7.75c.98.22 1.8.16 2.43-.03',
              stroke: '#ffffff',
              strokeWidth: 1.5,
              strokeLinecap: 'round'
            })
          ])
        : h('svg', svgAttrs, [
            h('ellipse', {
              cx: 9.2,
              cy: 17.15,
              rx: 2.6,
              ry: 2.12,
              transform: 'rotate(-22 9.2 17.15)',
              stroke: 'currentColor',
              strokeWidth: 2.05
            }),
            h('path', {
              d: 'M12.55 15.35V5.65l6.1-1.4v3.1l-4.05.93v7.07',
              stroke: 'currentColor',
              strokeWidth: 2.2,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }),
            h('path', {
              d: 'M12.6 5.9c1.35.5 2.75.6 4.12.3 1-.22 1.65-.52 1.93-.67',
              stroke: 'currentColor',
              strokeWidth: 1.7,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            })
          ]);
  }
});

const FanficTabIcon = defineComponent({
  name: 'FanficTabIcon',
  props: iconProps,
  setup(props) {
    return () =>
      props.active
        ? h('svg', svgAttrs, [
            h('path', {
              d: 'M7 4.2h9.85A2.15 2.15 0 0 1 19 6.35v13.1a.7.7 0 0 1-1.1.57l-2.25-1.56-2.25 1.56a.7.7 0 0 1-.8 0l-2.25-1.56-2.25 1.56a.7.7 0 0 1-1.1-.57V6.35A2.15 2.15 0 0 1 7 4.2Z',
              fill: 'currentColor'
            }),
            h('path', {
              d: 'M10.1 4.85v13.85',
              stroke: '#ffffff',
              strokeWidth: 2.05,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }),
            h('path', {
              d: 'M12.85 8.35h3.25',
              stroke: '#ffffff',
              strokeWidth: 1.85,
              strokeLinecap: 'round'
            }),
            h('path', {
              d: 'M12.85 11.2h3.25',
              stroke: '#ffffff',
              strokeWidth: 1.85,
              strokeLinecap: 'round'
            })
          ])
        : h('svg', svgAttrs, [
            h('path', {
              d: 'M7 4.2h9.85A2.15 2.15 0 0 1 19 6.35v13.1a.7.7 0 0 1-1.1.57l-2.25-1.56-2.25 1.56a.7.7 0 0 1-.8 0l-2.25-1.56-2.25 1.56a.7.7 0 0 1-1.1-.57V6.35A2.15 2.15 0 0 1 7 4.2Z',
              stroke: 'currentColor',
              strokeWidth: 2.1,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }),
            h('path', {
              d: 'M10.1 4.85v13.85',
              stroke: 'currentColor',
              strokeWidth: 2.05,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }),
            h('path', {
              d: 'M12.85 8.35h3.25',
              stroke: 'currentColor',
              strokeWidth: 1.85,
              strokeLinecap: 'round'
            }),
            h('path', {
              d: 'M12.85 11.2h3.25',
              stroke: 'currentColor',
              strokeWidth: 1.85,
              strokeLinecap: 'round'
            })
          ]);
  }
});

const voomTabHasUnread = computed(() => {
  const activeUserId = store.user?.id ?? '';
  if (!activeUserId) return false;

  const activeCharacterIds = new Set(store.charactersForActiveUser.map((character) => character.id));
  if (!activeCharacterIds.size) return false;

  const readAtByCharacter = store.settings?.voomReadAtByUser[activeUserId] ?? {};
  return store.sortedVoomPosts.some((post) => {
    if (post.authorType === 'user' || !post.charId || !activeCharacterIds.has(post.charId)) return false;
    return post.createdAt > (readAtByCharacter[post.charId] ?? 0);
  });
});

const tabs = computed(() => [
  { name: 'home', label: 'Home', to: '/home', icon: HomeTabIcon, hasUnread: false },
  { name: 'chats', label: 'Chats', to: '/chats', icon: ChatsTabIcon, hasUnread: store.unreadConversationCount > 0 },
  { name: 'voom', label: 'VOOM', to: '/voom', icon: VoomTabIcon, hasUnread: voomTabHasUnread.value },
  { name: 'music', label: 'Music', to: '/music', icon: MusicTabIcon, hasUnread: false },
  { name: 'fanfic', label: 'Fanfic', to: '/fanfic', icon: FanficTabIcon, hasUnread: false }
]);
</script>

<style scoped>
.bottom-tabs {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  height: calc(var(--tab-height) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  border-top: 1px solid rgba(17, 17, 17, 0.08);
  background: #ffffff;
}

.tab-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 100%;
  color: #111111;
  font-size: 10px;
}

.icon-wrap {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 27px;
}

.tab-icon {
  width: 27px;
  height: 27px;
}

.tab-label {
  line-height: 1;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.tab-item.active .tab-label {
  font-weight: 800;
}

.badge {
  position: absolute;
  top: 1px;
  right: 2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff405a;
  box-shadow: 0 0 0 2px #ffffff;
}
</style>