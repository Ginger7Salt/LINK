<template>
  <section class="profile-homepage-viewer">
    <div :class="['profile-homepage-stage', { custom: activeHomepageIsCustom }]">
  <section v-if="activeHomepageIsCustom" class="custom-profile-theme-root" :data-profile-theme-scope="profileThemeScopeId" v-html="activeHomepageHtml"></section>

  <section v-else class="character-sheet">
    <header class="profile-topbar">
      <div class="account-title">
        <strong>{{ characterRealName }}</strong>
        <CheckCircle2 :size="16" />
      </div>
      <div class="top-actions">
        <button class="icon-button" type="button" aria-label="查看历史资料" @click="openHistory">
          <MoreHorizontal :size="21" />
        </button>
        <button class="icon-button" type="button" aria-label="修改资料卡" @click="openEditor">
          <Pencil :size="18" />
        </button>
      </div>
    </header>

    <main class="profile-scroll">
      <section class="profile-overview">
        <div class="avatar-ring">
          <img :src="displayAvatar" :alt="characterRealName" />
        </div>
        <div class="profile-stats" aria-label="角色主页数据">
          <div v-for="stat in socialStats" :key="stat.label" class="profile-stat">
            <strong>{{ stat.value }}</strong>
            <span>{{ stat.label }}</span>
          </div>
        </div>
      </section>

      <section class="profile-bio">
        <span>@{{ character.nickname }}</span>
        <p>{{ signatureText }}</p>
      </section>

      <section class="profile-buttons" aria-label="角色操作">
        <button type="button" class="follow-button">
          <span>Following</span>
          <ChevronDown :size="14" />
        </button>
        <button type="button" class="message-button">Message</button>
        <button type="button" class="add-button" aria-label="添加关系">
          <UserPlus :size="17" />
        </button>
      </section>

      <section class="highlight-row" aria-label="最新 Voom 图片">
        <article v-for="item in highlightItems" :key="item.id" class="highlight-item">
          <div class="highlight-cover">
            <img :src="item.image" :alt="item.title" />
          </div>
          <span>{{ item.title }}</span>
        </article>
      </section>

      <section class="profile-menu" aria-label="主页信息">
        <article class="mood-row profile-theme-card" :data-profile-theme-scope="profileThemeScopeId">
          <p v-for="line in profileThemeLines" :key="line" class="profile-theme-line">{{ line }}</p>
        </article>

      </section>
    </main>

    <div v-if="isEditing" class="editor-overlay">
      <form class="editor-card" @submit.prevent="saveEditor">
        <div class="panel-head">
          <div>
            <strong>编辑主页</strong>
            <p>网名和签名会写入历史资料。</p>
          </div>
          <button class="icon-button soft" type="button" aria-label="关闭编辑" @click="cancelEditor">
            <X :size="18" />
          </button>
        </div>

        <label class="editor-field">
          <span>角色网名</span>
          <input v-model="editorForm.nickname" type="text" />
        </label>

        <label class="editor-field">
          <span>个性签名</span>
          <textarea v-model="editorForm.signature" rows="3"></textarea>
        </label>

        <div class="editor-avatar-row">
          <img :src="editorForm.avatar || displayAvatar" alt="头像预览" />
          <div class="editor-avatar-actions">
            <label class="editor-field compact">
              <span>头像 URL</span>
              <input v-model="editorForm.avatar" type="text" placeholder="https://..." />
            </label>
            <label class="upload-button">
              <input type="file" accept="image/*" @change="readAvatar" />
              <span>本地选择</span>
            </label>
          </div>
        </div>

        <section class="editor-highlight-section" aria-label="主页展示图">
          <div class="editor-section-title">
            <span>展示图</span>
          </div>
          <div class="editor-highlight-grid">
            <article v-for="(highlight, index) in editorForm.highlights" :key="highlight.id" class="editor-highlight-item">
              <img :src="highlight.image || displayAvatar" :alt="`${highlight.title} 预览`" />
              <span>{{ highlight.title }}</span>
              <label class="mini-upload-button">
                <input type="file" accept="image/*" @change="readHighlightImage(index, $event)" />
                <span>选择</span>
              </label>
            </article>
          </div>
        </section>

        <div class="editor-actions">
          <button type="button" class="secondary-action" @click="cancelEditor">取消</button>
          <button type="submit" class="primary-action">保存</button>
        </div>
      </form>
    </div>

    <div v-if="showHistory" class="history-drawer" @click.self="closeHistory">
      <section class="history-panel">
        <div class="panel-head">
          <div>
            <strong>历史资料</strong>
            <p>{{ profileHistoryItems.length }} 条变更</p>
          </div>
          <button class="icon-button soft" type="button" aria-label="关闭历史资料" @click="closeHistory">
            <X :size="18" />
          </button>
        </div>

        <div v-if="profileHistoryItems.length" class="history-toolbar">
          <span>变更记录</span>
          <button type="button" @click="confirmClearHistory = true">全部删除</button>
        </div>

        <div v-if="confirmClearHistory" class="inline-confirm">
          <p>删除全部历史资料？当前主页内容不会变。</p>
          <div>
            <button type="button" @click="confirmClearHistory = false">取消</button>
            <button type="button" class="danger" @click="clearAllHistory">确认删除</button>
          </div>
        </div>

        <div class="history-scroll">
          <article v-for="item in profileHistoryItems" :key="item.id" class="history-item">
            <div class="history-meta">
              <span>{{ item.label }}</span>
              <div class="history-meta-actions">
                <time>{{ item.time }}</time>
                <button type="button" class="delete-entry-button" aria-label="删除这条历史资料" @click="deleteHistoryEntry(item.id)">
                  <X :size="14" />
                </button>
              </div>
            </div>
            <div class="history-change" :class="{ 'mood-change': item.field === 'mood' }">
              <template v-if="item.field === 'mood'">
                <p>{{ item.nextValue || '空白' }}</p>
              </template>
              <template v-else>
                <p>{{ item.previousValue || '空白' }}</p>
                <b>→</b>
                <p>{{ item.nextValue || '空白' }}</p>
              </template>
            </div>
          </article>

          <div v-if="!profileHistoryItems.length" class="history-empty">还没有资料更改记录</div>
        </div>
      </section>
    </div>

    <AvatarCropperModal v-model="showAvatarEditor" :src="avatarEditorSource" @confirm="applyEditedAvatar" />
  </section>
    </div>

    <nav class="profile-homepage-switcher" aria-label="角色主页历史切换">
      <button type="button" :disabled="!canViewOlderHomepage" aria-label="查看上一个主页" @click="viewOlderHomepage">
        <ChevronLeft :size="20" stroke-width="2.4" />
      </button>
      <button type="button" :disabled="!canViewNewerHomepage" aria-label="查看下一个主页" @click="viewNewerHomepage">
        <ChevronRight :size="20" stroke-width="2.4" />
      </button>
    </nav>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, UserPlus, X } from 'lucide-vue-next';
import AvatarCropperModal from '@/components/image/AvatarCropperModal.vue';
import type { CharacterProfile, CharacterProfileHistoryEntry, ProfileHomepageRecord, VisualProfileHighlight, VoomPost } from '@/types/domain';
import { normalizeCharacterMindStateLines } from '@/utils/character';
import { readImageFileFromInput } from '@/utils/imageFile';
import { createProfileHighlightItems, createProfileHighlightSlots } from '@/utils/profileHighlights';
import { createVisualProfile, getCharacterVisualProfile, normalizeVisualProfile, toCharacterVisualProfile } from '@/utils/profile';
import { renderProfileThemeHtml, scopeProfileThemeCss } from '@/utils/profileThemes';

const profileHistoryTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const profileHistoryFieldLabels: Record<CharacterProfileHistoryEntry['field'], string> = {
  nickname: '网名',
  signature: '个性签名',
  mood: 'Mood'
};

const props = defineProps<{
  character: CharacterProfile;
  homepages: ProfileHomepageRecord[];
  posts: VoomPost[];
}>();

const emit = defineEmits<{
  save: [character: CharacterProfile];
  'delete-history-entry': [entryId: string];
  'clear-history': [];
}>();

const isEditing = ref(false);
const showHistory = ref(false);
const showAvatarEditor = ref(false);
const avatarEditorSource = ref('');
const confirmClearHistory = ref(false);
const activeHomepageIndex = ref(0);

const editorForm = reactive<{
  nickname: string;
  signature: string;
  avatar: string;
  highlights: VisualProfileHighlight[];
}>({
  nickname: '',
  signature: '',
  avatar: '',
  highlights: []
});

const visualProfile = computed(() => getCharacterVisualProfile(props.character) ?? createVisualProfile(props.character));
const characterRealName = computed(() => props.character.name || props.character.nickname);
const displayAvatar = computed(() => props.character.avatar);
const signatureText = computed(() => props.character.signature || '雨に濡れた跡を辿る');

const characterPosts = computed(() => props.posts
  .filter((post) => post.authorType !== 'user' && post.charId === props.character.id)
  .slice()
  .sort((a, b) => b.createdAt - a.createdAt));

const moodLines = computed(() => {
  const lines = normalizeCharacterMindStateLines(props.character.mindState?.lines);
  return lines.length ? lines : [signatureText.value];
});

const profileThemeLines = computed(() => moodLines.value);
const hasCustomProfileTheme = computed(() => Boolean(
  props.character.mindState?.profileThemeId
  && props.character.mindState?.profileThemeName !== 'Mood'
  && String(props.character.mindState?.profileThemeContent ?? '').trim()
));
const customProfileThemeHtml = computed(() => props.character.mindState?.profileThemeHtml
  || renderProfileThemeHtml(props.character.mindState?.profileThemeContent ?? '', ''));
const homepageTimeline = computed(() => {
  const currentMindState = props.character.mindState;
  const records = props.homepages
    .filter((homepage) => homepage.charId === props.character.id)
    .slice()
    .sort((first, second) => (second.updatedAt || second.createdAt) - (first.updatedAt || first.createdAt));
  const currentRecordIndex = hasCustomProfileTheme.value
    ? records.findIndex((homepage) => Boolean(
      (currentMindState?.sourceReplyBatchId && homepage.replyBatchId === currentMindState.sourceReplyBatchId)
      || (homepage.themeId === currentMindState?.profileThemeId
        && homepage.html === customProfileThemeHtml.value
        && homepage.content === currentMindState?.profileThemeContent)
    ))
    : -1;
  if (currentRecordIndex >= 0) records.splice(currentRecordIndex, 1);

  return [
    {
      id: 'current',
      kind: hasCustomProfileTheme.value ? 'custom' as const : 'base' as const,
      label: hasCustomProfileTheme.value ? `当前 · ${currentMindState?.profileThemeName || '自定义主页'}` : '当前主页',
      html: customProfileThemeHtml.value,
      css: currentMindState?.profileThemeCss ?? ''
    },
    ...records.map((homepage) => ({
      id: homepage.id,
      kind: 'custom' as const,
      label: `${homepage.themeName} · ${formatProfileHistoryTime(homepage.updatedAt || homepage.createdAt)}`,
      html: homepage.html || renderProfileThemeHtml(homepage.content, ''),
      css: homepage.css
    })),
    ...(hasCustomProfileTheme.value ? [{
      id: 'base',
      kind: 'base' as const,
      label: '基础主页',
      html: '',
      css: ''
    }] : [])
  ];
});
const activeHomepage = computed(() => homepageTimeline.value[activeHomepageIndex.value] ?? homepageTimeline.value[0]);
const activeHomepageIsCustom = computed(() => activeHomepage.value?.kind === 'custom');
const activeHomepageHtml = computed(() => activeHomepage.value?.html ?? '');
const canViewOlderHomepage = computed(() => activeHomepageIndex.value < homepageTimeline.value.length - 1);
const canViewNewerHomepage = computed(() => activeHomepageIndex.value > 0);
const profileThemeScopeId = computed(() => `profile-theme-${props.character.id}-${activeHomepage.value?.id ?? 'current'}`.replace(/[^a-zA-Z0-9_-]/g, '-'));
const profileThemeScopedCss = computed(() => scopeProfileThemeCss(activeHomepage.value?.css ?? '', profileThemeScopeId.value));
let profileThemeStyleElement: HTMLStyleElement | null = null;

watch(profileThemeScopedCss, (css) => {
  if (typeof document === 'undefined') return;
  if (!css) {
    profileThemeStyleElement?.remove();
    profileThemeStyleElement = null;
    return;
  }
  if (!profileThemeStyleElement) {
    profileThemeStyleElement = document.createElement('style');
    profileThemeStyleElement.dataset.linkProfileThemeScope = profileThemeScopeId.value;
    document.head.appendChild(profileThemeStyleElement);
  }
  profileThemeStyleElement.textContent = css;
}, { immediate: true });

watch(() => props.character.id, () => {
  activeHomepageIndex.value = 0;
});

watch(() => homepageTimeline.value.length, (length) => {
  activeHomepageIndex.value = Math.min(activeHomepageIndex.value, Math.max(0, length - 1));
});

onUnmounted(() => {
  profileThemeStyleElement?.remove();
});

const socialStats = computed(() => {
  const stats = visualProfile.value.stats;
  return [
    { value: formatStatValue(characterPosts.value.length), label: normalizeStatLabel(stats.postsLabel, 'posts') },
    { value: formatStatValue(stats.followers), label: normalizeStatLabel(stats.followersLabel, 'followers') },
    { value: formatStatValue(stats.following), label: normalizeStatLabel(stats.followingLabel, 'following') }
  ];
});

const highlightItems = computed(() => createProfileHighlightItems(characterPosts.value, visualProfile.value.highlights));

const profileHistoryItems = computed(() => (props.character.profileHistory ?? [])
  .slice()
  .sort((a, b) => b.createdAt - a.createdAt)
  .map((entry) => ({
    ...entry,
    label: profileHistoryFieldLabels[entry.field],
    time: formatProfileHistoryTime(entry.createdAt)
  })));

function formatStatValue(value: string | number) {
  if (typeof value === 'string') return value;
  if (value >= 10000) return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}K`;
  return new Intl.NumberFormat('en-US').format(value);
}

function normalizeStatLabel(value: string | undefined, fallback: string) {
  return (value || fallback).toLowerCase();
}

function formatProfileHistoryTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '未知时间';
  return profileHistoryTimeFormatter.format(timestamp);
}

function viewOlderHomepage() {
  if (!canViewOlderHomepage.value) return;
  activeHomepageIndex.value += 1;
}

function viewNewerHomepage() {
  if (!canViewNewerHomepage.value) return;
  activeHomepageIndex.value -= 1;
}

function openEditor() {
  showHistory.value = false;
  editorForm.nickname = props.character.nickname || props.character.name || '';
  editorForm.signature = props.character.signature || '';
  editorForm.avatar = props.character.avatar || '';
  editorForm.highlights = createProfileHighlightSlots(visualProfile.value.highlights);
  isEditing.value = true;
}

function cancelEditor() {
  isEditing.value = false;
}

function openHistory() {
  isEditing.value = false;
  confirmClearHistory.value = false;
  showHistory.value = true;
}

function closeHistory() {
  confirmClearHistory.value = false;
  showHistory.value = false;
}

async function readAvatar(event: Event) {
  const image = await readImageFileFromInput(event);
  if (!image) return;
  avatarEditorSource.value = image;
  showAvatarEditor.value = true;
}

function applyEditedAvatar(value: string) {
  editorForm.avatar = value;
}

async function readHighlightImage(index: number, event: Event) {
  const image = await readImageFileFromInput(event);
  if (!image || !editorForm.highlights[index]) return;
  editorForm.highlights[index] = {
    ...editorForm.highlights[index],
    image
  };
}

function deleteHistoryEntry(entryId: string) {
  emit('delete-history-entry', entryId);
}

function clearAllHistory() {
  emit('clear-history');
  confirmClearHistory.value = false;
}

function saveEditor() {
  const profile = visualProfile.value;
  const nextNickname = editorForm.nickname.trim() || props.character.nickname || props.character.name;
  const nextSignature = editorForm.signature.trim();
  const nextAvatar = editorForm.avatar.trim() || props.character.avatar;
  const nextHighlights = createProfileHighlightSlots(editorForm.highlights);

  emit('save', {
    ...props.character,
    nickname: nextNickname,
    avatar: nextAvatar,
    signature: nextSignature,
    subtitle: nextSignature || props.character.subtitle,
    profile: toCharacterVisualProfile(normalizeVisualProfile({
      ...profile,
      nickname: nextNickname,
      avatar: nextAvatar,
      bio: nextSignature,
      highlights: nextHighlights,
      avatarBorderColor: '#ffffff',
      textColor: '#111111'
    }, {
      ...props.character,
      nickname: nextNickname,
      avatar: nextAvatar,
      signature: nextSignature
    }))
  });

  isEditing.value = false;
}
</script>

<style scoped>
.profile-homepage-viewer {
  position: relative;
  width: 100%;
  min-height: 0;
  overflow: visible;
}

.profile-homepage-stage {
  width: 100%;
  max-height: min(640px, calc(var(--app-height) - var(--safe-top) - var(--safe-bottom) - 142px));
  min-height: 0;
  overflow: auto;
  padding: 14px;
  border-radius: 26px;
  background: #ffffff;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.profile-homepage-stage.custom {
  padding: 0;
}

.profile-homepage-switcher {
  position: absolute;
  right: 4px;
  bottom: -54px;
  left: 4px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.profile-homepage-switcher button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: #171717;
  pointer-events: auto;
}

.profile-homepage-switcher button:disabled {
  color: #c7c9ca;
  background: transparent;
}

:global(.modal-panel-profile-ins .modal-body:has(.profile-homepage-viewer)) {
  overflow: visible;
  padding: 0 !important;
}

:global(.modal-panel-profile-ins:has(.profile-homepage-viewer)) {
  overflow: visible;
  background: transparent;
  box-shadow: none;
}

:global(.modal-backdrop-profile-ins:has(.profile-homepage-viewer)) {
  padding-bottom: max(74px, calc(62px + var(--safe-bottom)));
}

.character-sheet {
  --profile-accent: #ff9db7;
  position: relative;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  border-radius: 26px;
  background: #ffffff;
  color: #111111;
  container-type: inline-size;
}

.profile-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 12px 12px 8px;
}

.account-title {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.account-title strong {
  overflow: hidden;
  font-size: 18px;
  font-weight: 900;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-title svg {
  flex: 0 0 auto;
  color: #1e8fff;
}

.top-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
}

.icon-button,
.follow-button,
.message-button,
.add-button,
.history-toolbar button,
.inline-confirm button,
.secondary-action,
.primary-action {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 34px !important;
  height: 34px !important;
  min-height: 34px !important;
  padding: 0 !important;
  border-radius: 999px !important;
  background: transparent;
  color: #111111;
}

.icon-button.soft {
  background: transparent;
}

.profile-scroll {
  display: grid;
  gap: 15px;
  padding: 4px 12px 16px;
}

.custom-profile-theme-root {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: auto;
  background: transparent;
  color: #111111;
  container-type: inline-size;
}

.custom-profile-theme-root :deep(*) {
  box-sizing: border-box;
  max-width: 100%;
}

.custom-profile-theme-root :deep(img),
.custom-profile-theme-root :deep(video) {
  max-width: 100%;
  height: auto;
}

.custom-profile-theme-root :deep(.profile-theme-line) {
  margin: 0;
  color: #333333;
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

:global(.modal-panel-profile-ins .modal-body:has(.custom-profile-theme-root)) {
  padding: 0 !important;
}

.profile-overview {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}

.avatar-ring {
  display: grid;
  place-items: center;
  width: 86px;
  height: 86px;
  aspect-ratio: 1;
  padding: 3px;
  overflow: hidden;
  border: 2px solid #dddddd;
  border-radius: 999px;
  background: #ffffff;
}

.avatar-ring img {
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  border: 0;
  border-radius: 50%;
  clip-path: circle(50% at 50% 50%);
  object-fit: cover;
}

.profile-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.profile-stat {
  min-width: 0;
  text-align: center;
}

.profile-stat strong,
.profile-stat span,
.profile-bio span,
.profile-bio p,
.highlight-item span,
.mood-row p,
.panel-head strong,
.panel-head p,
.history-toolbar span,
.history-meta span,
.history-meta time,
.history-change p,
.history-change b,
.inline-confirm p {
  margin: 0;
}

.profile-stat strong {
  display: block;
  overflow: hidden;
  font-size: 18px;
  font-weight: 900;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-stat span {
  display: block;
  margin-top: 3px;
  color: #111111;
  font-size: 12px;
  line-height: 1.05;
}

.profile-bio {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.profile-bio span {
  color: #111111;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
}

.profile-bio p {
  color: #444444;
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.profile-buttons {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 42px;
  gap: 8px;
}

.follow-button,
.message-button,
.add-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 38px !important;
  padding: 0 12px !important;
  border-radius: 12px !important;
  background: #f1f1f1;
  color: #111111;
  font-size: 14px !important;
  font-weight: 900;
  line-height: 1 !important;
}

.follow-button {
  gap: 4px;
}

.add-button {
  padding: 0 !important;
}

.highlight-row {
  display: flex;
  gap: 18px;
  min-width: 0;
  overflow-x: auto;
  padding: 2px 0 4px;
  scrollbar-width: none;
}

.highlight-row::-webkit-scrollbar {
  display: none;
}

.highlight-item {
  display: grid;
  flex: 0 0 62px;
  justify-items: center;
  gap: 6px;
  min-width: 0;
}

.highlight-cover {
  width: 62px;
  height: 62px;
  padding: 3px;
  border: 2px solid #dedede;
  border-radius: 999px;
  background: #ffffff;
}

.highlight-cover img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.highlight-item span {
  max-width: 70px;
  overflow: hidden;
  color: #8b8b8b;
  font-size: 12px;
  line-height: 1;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-menu {
  display: grid;
  border-top: 1px solid #eeeeee;
}

.mood-row {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 13px 0;
}

.mood-row p {
  color: #333333;
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.editor-overlay,
.history-drawer {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(255, 255, 255, 0.88);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.editor-overlay {
  overflow-y: auto;
  padding: 12px;
}

.editor-card,
.history-panel {
  display: grid;
  gap: 14px;
  width: 100%;
  border: 1px solid #eeeeee;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.12);
}

.editor-card {
  padding: 14px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.panel-head strong {
  display: block;
  font-size: 18px;
  font-weight: 900;
  line-height: 1.1;
}

.panel-head p {
  margin-top: 5px;
  color: #777777;
  font-size: 12px;
  line-height: 1.35;
}

.editor-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.editor-field span {
  color: #777777;
  font-size: 11px;
  font-weight: 800;
}

.editor-field input,
.editor-field textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid #dddddd;
  border-radius: 12px;
  background: #ffffff;
  color: #111111;
  font: inherit;
  font-size: var(--ios-control-font-size, 16px);
  outline: none;
}

.editor-field input {
  min-height: 40px;
  padding: 8px 10px;
}

.editor-field textarea {
  min-height: 78px;
  resize: vertical;
  padding: 10px;
  line-height: 1.5;
}

.editor-avatar-row {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.editor-avatar-row img {
  width: 74px;
  height: 74px;
  border-radius: 999px;
  object-fit: cover;
}

.editor-avatar-actions {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.editor-highlight-section {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.editor-section-title span,
.editor-highlight-item > span {
  color: #777777;
  font-size: 11px;
  font-weight: 800;
}

.editor-highlight-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.editor-highlight-item {
  display: grid;
  justify-items: center;
  gap: 6px;
  min-width: 0;
}

.editor-highlight-item img {
  width: 52px;
  height: 52px;
  border: 2px solid #dedede;
  border-radius: 999px;
  object-fit: cover;
}

.mini-upload-button {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 30px;
  border-radius: 10px;
  background: #f1f1f1;
  color: #111111;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}

.mini-upload-button input {
  display: none;
}

.upload-button {
  display: grid;
  place-items: center;
  min-height: 36px;
  border-radius: 12px;
  background: #f1f1f1;
  color: #111111;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.upload-button input {
  display: none;
}

.editor-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.secondary-action,
.primary-action {
  min-height: 40px !important;
  border-radius: 12px !important;
  font-size: 13px !important;
  font-weight: 900;
}

.secondary-action {
  background: #f1f1f1;
  color: #111111;
}

.primary-action {
  background: #111111;
  color: #ffffff;
}

.history-panel {
  grid-template-rows: auto auto auto minmax(0, 1fr);
  max-height: calc(100% - 24px);
  min-height: 0;
  padding: 14px;
  border-radius: 22px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.12);
}

.history-drawer {
  overflow-y: auto;
  padding: 12px;
}

.history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.history-toolbar span {
  color: #777777;
  font-size: 12px;
  font-weight: 800;
}

.history-toolbar button {
  min-height: 32px !important;
  padding: 0 12px !important;
  border-radius: 999px !important;
  background: #fff0f2;
  color: #d2364a;
  font-size: 12px !important;
  font-weight: 900;
}

.inline-confirm {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  background: #fff0f2;
}

.inline-confirm p {
  color: #444444;
  font-size: 12px;
  line-height: 1.4;
}

.inline-confirm div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.inline-confirm button {
  width: 100%;
  min-height: 30px !important;
  padding: 0 10px !important;
  border-radius: 999px !important;
  background: #f1f1f1;
  color: #111111;
  font-size: 11px !important;
  font-weight: 900;
}

.inline-confirm button.danger {
  background: #d2364a;
  color: #ffffff;
}

.history-scroll {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.history-item {
  display: grid;
  gap: 9px;
  padding: 12px;
  border: 1px solid #eeeeee;
  border-radius: 16px;
  background: #ffffff;
}

.history-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.history-meta-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
}

.history-meta span,
.history-meta time {
  color: #777777;
  font-size: 11px;
  font-weight: 900;
}

.history-change {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.history-change p {
  color: #333333;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.history-change b {
  color: #999999;
  font-size: 13px;
  line-height: 1;
}

.delete-entry-button {
  display: grid;
  place-items: center;
  width: 24px !important;
  height: 24px !important;
  min-height: 24px !important;
  padding: 0 !important;
  border: 0;
  border-radius: 999px !important;
  background: transparent;
  color: #9a9a9a;
  cursor: pointer;
}

.delete-entry-button:active {
  background: #f1f1f1;
  color: #111111;
}

.history-empty {
  display: grid;
  min-height: 150px;
  place-items: center;
  color: #777777;
  font-size: 13px;
  font-weight: 800;
}

@container (max-width: 300px) {
  .profile-overview {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 12px;
  }

  .avatar-ring {
    width: 76px;
    height: 76px;
  }

  .profile-stat strong {
    font-size: 16px;
  }

  .profile-stat span {
    font-size: 11px;
  }

  .profile-buttons {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 38px;
    gap: 6px;
  }

  .follow-button,
  .message-button,
  .add-button {
    min-height: 34px !important;
    padding: 0 8px !important;
    font-size: 12px !important;
  }
}
</style>