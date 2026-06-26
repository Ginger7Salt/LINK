<template>
  <section class="character-sheet" :class="{ flipped: isFlipped }" :style="sheetStyle">
    <div v-if="!isEditing && !isFlipped" class="sheet-actions">
      <button class="sheet-icon-button edit-button" type="button" aria-label="修改资料卡" @click.stop="openEditor">
        <Pencil :size="18" />
      </button>
    </div>

    <div v-if="isEditing" class="editor-overlay">
      <form class="editor-card" @submit.prevent="saveEditor">
        <div class="editor-head">
          <strong>修改资料卡</strong>
          <p>可调整背景图、头像、文字颜色、头像外框和三项统计显示。</p>
        </div>

        <div class="editor-section">
          <label class="editor-field">
            <span>背景图 URL</span>
            <input v-model="editorForm.backgroundImage" type="text" placeholder="https://..." />
          </label>

          <label class="editor-upload">
            <input type="file" accept="image/*" @change="readBackground" />
            <span>本地选择</span>
          </label>
        </div>

        <div class="editor-section">
          <label class="editor-field">
            <span>头像 URL</span>
            <input v-model="editorForm.avatar" type="text" placeholder="https://..." />
          </label>

          <label class="editor-upload">
            <input type="file" accept="image/*" @change="readAvatar" />
            <span>本地选择</span>
          </label>
        </div>

        <div class="editor-color-grid">
          <label class="editor-field editor-color-field">
            <span>资料卡文字颜色</span>
            <input v-model="editorForm.textColor" type="color" />
          </label>

          <label class="editor-field editor-color-field">
            <span>头像外框颜色</span>
            <input v-model="editorForm.avatarBorderColor" type="color" />
          </label>
        </div>

        <div class="editor-grid">
          <label class="editor-field">
            <span>Posts</span>
            <input v-model="editorForm.posts" type="text" />
          </label>
          <label class="editor-field">
            <span>Followers</span>
            <input v-model="editorForm.followers" type="text" />
          </label>
          <label class="editor-field">
            <span>Following</span>
            <input v-model="editorForm.following" type="text" />
          </label>
        </div>

        <div class="editor-actions">
          <button type="button" class="editor-secondary" @click="cancelEditor">取消</button>
          <button type="submit" class="editor-primary">保存</button>
        </div>
      </form>
    </div>

    <div
      class="sheet-flipper"
      role="button"
      tabindex="0"
      :aria-label="isFlipped ? '返回资料卡' : '查看历史资料'"
      @pointerdown="startFlipGesture"
      @pointermove="trackFlipGesture"
      @pointerup="finishFlipGesture"
      @pointercancel="cancelFlipGesture"
      @keydown.enter.prevent="toggleFlip"
      @keydown.space.prevent="toggleFlip"
    >
      <div class="sheet-face sheet-face-front">
        <section class="sheet-cover"></section>

        <section class="profile-panel" :class="{ editing: isEditing }">
          <div class="panel-top">
            <div class="avatar-wrap">
              <img class="sheet-avatar" :src="displayAvatar" :alt="character.nickname" />
            </div>
            <div class="profile-summary">
              <div class="sheet-copy">
                <strong>{{ character.nickname }}</strong>
              </div>

              <div class="stats-row">
                <article v-for="item in statsItems" :key="item.label" class="stat-card">
                  <strong>{{ item.value }}</strong>
                  <span>{{ item.label }}</span>
                </article>
              </div>
            </div>
          </div>

          <div class="sheet-bio">
            <p>{{ character.signature }}</p>
          </div>

          <section class="gallery-section">
            <div class="section-head">
              <h3>Mood</h3>
            </div>

            <div class="mind-state-card">
              <p v-for="line in mindStateLines" :key="line">{{ line }}</p>
            </div>

            <div class="section-head section-head-voom">
              <h3>Voom</h3>
            </div>

            <div class="gallery-grid">
              <article v-for="tile in galleryTiles" :key="tile.id" class="gallery-card" :class="{ mock: !tile.image, empty: tile.empty }">
                <img v-if="tile.image" :src="tile.image" :alt="tile.caption || 'Voom image'" />
                <div v-if="!tile.image && tile.caption" class="gallery-copy">
                  <span>{{ tile.caption }}</span>
                </div>
              </article>
            </div>
          </section>
        </section>
      </div>

      <section class="sheet-face sheet-face-back" aria-label="历史资料">
        <div class="timeline-head">
          <strong>历史资料</strong>
        </div>

        <div class="timeline-scroll">
          <div v-if="profileHistoryItems.length" class="timeline-list">
            <article v-for="item in profileHistoryItems" :key="item.id" class="timeline-item">
              <div class="timeline-point"></div>
              <div class="timeline-content">
                <div class="timeline-meta">
                  <span>{{ item.label }}</span>
                  <time>{{ item.time }}</time>
                </div>
                <div class="timeline-change">
                  <p>{{ item.previousValue || '空白' }}</p>
                  <b>→</b>
                  <p>{{ item.nextValue || '空白' }}</p>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="timeline-empty">还没有资料更改记录</div>
        </div>
      </section>
    </div>

    <AvatarCropperModal v-model="showAvatarEditor" :src="avatarEditorSource" @confirm="applyEditedAvatar" />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Pencil } from 'lucide-vue-next';
import AvatarCropperModal from '@/components/image/AvatarCropperModal.vue';
import type { CharacterProfile, CharacterProfileHistoryEntry, VoomPost } from '@/types/domain';
import { readImageFileFromInput } from '@/utils/imageFile';
import { createVisualProfile, getCharacterVisualProfile, normalizeVisualProfile } from '@/utils/profile';

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
  posts: VoomPost[];
}>();

const emit = defineEmits<{
  save: [character: CharacterProfile];
}>();

const isEditing = ref(false);
const isFlipped = ref(false);
const showAvatarEditor = ref(false);
const avatarEditorSource = ref('');
let flipGestureStart: { x: number; y: number } | null = null;
let flipGestureMoved = false;
const flipGestureMoveThreshold = 10;

const recentPosts = computed(() => props.posts
  .filter((post) => post.charId === props.character.id || post.visibleCharacterIds?.includes(props.character.id))
  .slice(0, 3));
const visualProfile = computed(() => getCharacterVisualProfile(props.character) ?? createVisualProfile(props.character));

const editorForm = reactive({
  backgroundImage: '',
  avatar: '',
  textColor: '#f5f3f1',
  avatarBorderColor: '#090c0f',
  posts: '',
  followers: '',
  following: ''
});

const displayAvatar = computed(() => visualProfile.value?.avatar || props.character.avatar);
const sheetBackgroundImage = computed(() => visualProfile.value?.backgroundImage || displayAvatar.value);
const sheetStyle = computed(() => ({
  color: visualProfile.value?.textColor || '#f5f3f1',
  '--avatar-border-color': visualProfile.value?.avatarBorderColor || '#090c0f',
  backgroundImage: `linear-gradient(180deg, rgba(10, 11, 16, 0.08), rgba(10, 11, 16, 0.5) 58%, rgba(6, 8, 12, 0.94)), url(${JSON.stringify(sheetBackgroundImage.value)})`
}));

const statsItems = computed(() => {
  const stats = visualProfile.value?.stats;
  return [
    { label: stats?.postsLabel ?? 'Posts', value: formatCompactStat(stats?.posts ?? recentPosts.value.length) },
    { label: stats?.followersLabel ?? 'Followers', value: stats?.followers ?? '14.2K' },
    { label: stats?.followingLabel ?? 'Following', value: String(stats?.following ?? 56) }
  ];
});

const mindStateLines = computed(() => {
  const lines = props.character.mindState?.lines ?? [];
  if (lines.length) return lines;
  return [props.character.signature || '还没有新的状态。'];
});

const galleryTiles = computed(() => {
  return Array.from({ length: 3 }, (_, index) => {
    const post = recentPosts.value[index];
    return {
      id: post?.id ?? `empty-voom-${index + 1}`,
      caption: post?.imageDescription || post?.content || '',
      image: post?.image ?? '',
      empty: !post
    };
  });
});

const profileHistoryItems = computed(() => (props.character.profileHistory ?? [])
  .slice()
  .sort((a, b) => b.createdAt - a.createdAt)
  .map((entry) => ({
    ...entry,
    label: profileHistoryFieldLabels[entry.field],
    time: formatProfileHistoryTime(entry.createdAt)
  })));

function formatProfileHistoryTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '未知时间';
  return profileHistoryTimeFormatter.format(timestamp);
}

function formatCompactStat(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value).toLowerCase();
}

function openEditor() {
  const profile = visualProfile.value;
  isFlipped.value = false;
  editorForm.backgroundImage = profile?.backgroundImage ?? '';
  editorForm.avatar = profile?.avatar || props.character.avatar || '';
  editorForm.textColor = profile?.textColor || '#f5f3f1';
  editorForm.avatarBorderColor = profile?.avatarBorderColor || '#090c0f';
  editorForm.posts = String(profile?.stats.posts ?? 0);
  editorForm.followers = profile?.stats.followers ?? '';
  editorForm.following = String(profile?.stats.following ?? 0);
  isEditing.value = true;
}

function toggleFlip() {
  isFlipped.value = !isFlipped.value;
}

function startFlipGesture(event: PointerEvent) {
  if (isEditing.value || (event.pointerType === 'mouse' && event.button !== 0)) return;
  flipGestureStart = { x: event.clientX, y: event.clientY };
  flipGestureMoved = false;
}

function trackFlipGesture(event: PointerEvent) {
  if (!flipGestureStart) return;
  const movedX = Math.abs(event.clientX - flipGestureStart.x);
  const movedY = Math.abs(event.clientY - flipGestureStart.y);
  if (movedX > flipGestureMoveThreshold || movedY > flipGestureMoveThreshold) {
    flipGestureMoved = true;
  }
}

function finishFlipGesture() {
  if (flipGestureStart && !flipGestureMoved) toggleFlip();
  cancelFlipGesture();
}

function cancelFlipGesture() {
  flipGestureStart = null;
  flipGestureMoved = false;
}

function cancelEditor() {
  isEditing.value = false;
}

async function readBackground(event: Event) {
  const image = await readImageFileFromInput(event);
  if (!image) return;
  editorForm.backgroundImage = image;
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

function saveEditor() {
  const profile = visualProfile.value;
  if (!profile) return;

  const nextPosts = Number.parseInt(editorForm.posts, 10);
  const nextAvatar = editorForm.avatar.trim() || props.character.avatar || profile.avatar;

  emit('save', {
    ...props.character,
    avatar: nextAvatar,
    profile: normalizeVisualProfile({
      ...profile,
      avatar: nextAvatar,
      backgroundImage: editorForm.backgroundImage.trim() || profile.backgroundImage,
      textColor: editorForm.textColor.trim() || profile.textColor,
      avatarBorderColor: editorForm.avatarBorderColor.trim() || profile.avatarBorderColor,
      stats: {
        ...profile.stats,
        posts: Number.isFinite(nextPosts) ? nextPosts : profile.stats.posts,
        followers: editorForm.followers.trim() || profile.stats.followers,
        following: editorForm.following.trim() || profile.stats.following,
        postsLabel: profile.stats.postsLabel,
        followersLabel: profile.stats.followersLabel,
        followingLabel: profile.stats.followingLabel
      }
    }, {
      ...props.character,
      avatar: nextAvatar
    })
  });

  isEditing.value = false;
}
</script>

<style scoped>
.character-sheet {
  position: relative;
  display: grid;
  gap: 0;
  border-radius: 34px;
  overflow: hidden;
  perspective: 1200px;
  background-color: #090c0f;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.sheet-flipper {
  position: relative;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
  transition: transform 0.48s cubic-bezier(0.2, 0.72, 0.2, 1);
  cursor: pointer;
  touch-action: manipulation;
}

.character-sheet.flipped .sheet-flipper {
  transform: rotateY(180deg);
}

.sheet-face {
  min-height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.sheet-face-front {
  position: relative;
}

.sheet-face-back {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
  overflow: hidden;
  padding: 52px 20px 24px;
  transform: rotateY(180deg);
  background: linear-gradient(180deg, rgba(8, 10, 14, 0.72), rgba(8, 10, 14, 0.96));
  color: currentColor;
  touch-action: pan-y;
}

.sheet-cover {
  position: relative;
  min-height: 206px;
  background: transparent;
}

.sheet-actions {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 6;
  display: flex;
  gap: 2px;
}

.character-sheet .sheet-icon-button {
  display: grid;
  place-items: center;
  width: 30px !important;
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 !important;
  padding-inline: 0 !important;
  padding-block: 0 !important;
  border: 0;
  border-radius: 999px !important;
  background: transparent;
  color: #f5f3f1;
  filter: drop-shadow(0 2px 7px rgba(0, 0, 0, 0.45));
}

.character-sheet .sheet-icon-button svg {
  width: 18px;
  height: 18px;
}

.profile-panel {
  position: relative;
  margin-top: -74px;
  z-index: 1;
  padding: 0 20px 22px;
}

.profile-panel.editing {
  min-height: min(600px, calc(100dvh - var(--safe-top) - var(--safe-bottom) - 112px));
  min-height: min(600px, calc(var(--app-height) - var(--safe-top) - var(--safe-bottom) - 112px));
}

.editor-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  padding: 12px 0 18px;
  background: rgba(6, 8, 11, 0.58);
  backdrop-filter: blur(14px);
}

.editor-card {
  width: 100%;
  max-height: 100%;
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 24px;
  background: rgba(16, 18, 22, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f5f3f1;
  overflow-y: auto;
  overscroll-behavior: contain;
  box-shadow: 0 24px 44px rgba(0, 0, 0, 0.34);
  container-type: inline-size;
}

.editor-head strong {
  display: block;
  font-size: 16px;
  font-weight: 800;
}

.editor-head p {
  margin: 6px 0 0;
  color: rgba(245, 243, 241, 0.56);
  font-size: 12px;
  line-height: 1.5;
}

.editor-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.editor-field span {
  color: rgba(245, 243, 241, 0.7);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}

.editor-field input,
.editor-field textarea {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  color: #f5f3f1;
  font: inherit;
  outline: none;
}

.editor-field textarea {
  resize: vertical;
  line-height: 1.5;
}

.editor-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(92px, 0.44fr);
  align-items: end;
  gap: 6px;
  min-width: 0;
}

.editor-color-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
}

.editor-color-field input {
  padding: 4px;
}

.editor-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 8px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(245, 243, 241, 0.88);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
}

.editor-upload span {
  min-width: 0;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}

.editor-upload input {
  display: none;
}

.editor-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.editor-grid .editor-field span {
  font-size: 9px;
}

.editor-grid .editor-field input {
  padding-inline: 8px;
}

.editor-actions {
  position: sticky;
  bottom: -10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 2px -2px -2px;
  padding-top: 6px;
  background: linear-gradient(180deg, rgba(16, 18, 22, 0), rgba(16, 18, 22, 0.96) 34%);
}

.editor-secondary,
.editor-primary {
  height: 38px;
  width: 100%;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.editor-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(245, 243, 241, 0.78);
}

.editor-primary {
  background: #f6f4f2;
  color: #111317;
}

.panel-top {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-wrap {
  position: relative;
  flex: 0 0 auto;
  width: 92px;
  height: 92px;
}

.sheet-avatar {
  width: 100%;
  height: 100%;
  border-radius: 32px;
  object-fit: cover;
  border: 3px solid var(--avatar-border-color, #090c0f);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.42);
}

.status-dot {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 3px solid #090c0f;
  background: #1ec773;
  box-shadow: 0 0 0 4px rgba(30, 199, 115, 0.18);
}

.profile-summary {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 14px;
  padding-top: 8px;
}

.sheet-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.sheet-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 22px;
  font-weight: 900;
  line-height: 1;
}

.handle {
  color: currentColor;
  font-size: 12px;
  opacity: 0.48;
}

.sheet-bio {
  margin-top: 14px;
}

.sheet-bio p {
  margin: 0;
  color: currentColor;
  font-size: 14px;
  line-height: 1.7;
  opacity: 0.78;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.stat-card {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 0 !important;
  border-radius: 0 !important;
  text-align: center;
}

.stat-card strong,
.stat-card span,
.section-head h3,
.gallery-copy span {
  margin: 0;
}

.stat-card strong {
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
}

.stat-card span {
  color: currentColor;
  font-size: 10px;
  line-height: 1.1;
  opacity: 0.44;
  white-space: nowrap;
}

.gallery-section {
  margin-top: 22px;
}

.section-head h3 {
  font-size: 17px;
  font-weight: 800;
}

.section-head-voom {
  margin-top: 20px;
}

.mind-state-card {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding: 2px 0;
}

.mind-state-card p {
  margin: 0;
  color: currentColor;
  font-size: 12px;
  line-height: 1.55;
  opacity: 0.72;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
  min-width: 0;
}

.gallery-card {
  position: relative;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(19, 22, 28, 0.98), rgba(9, 11, 16, 0.98));
}

.gallery-card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-card.mock {
  display: grid;
  place-items: center;
  background:
    linear-gradient(180deg, rgba(36, 40, 49, 0.98), rgba(10, 12, 18, 0.98));
}

.gallery-card.empty {
  opacity: 0.72;
}

.gallery-copy {
  position: absolute;
  bottom: 10px;
  left: 10px;
  right: 10px;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  text-align: right;
}

.gallery-card.mock .gallery-copy {
  position: static;
  padding: 10px;
  text-align: center;
}

.gallery-copy span {
  color: currentColor;
  font-size: 10px;
  line-height: 1.45;
  opacity: 0.74;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
}

.timeline-head {
  display: grid;
  gap: 6px;
}

.timeline-head strong {
  font-size: 21px;
  font-weight: 900;
  line-height: 1;
}

.timeline-list {
  position: relative;
  display: grid;
  gap: 12px;
  min-width: 0;
  padding-bottom: 6px;
}

.timeline-scroll {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  scrollbar-width: none;
}

.timeline-scroll::-webkit-scrollbar {
  display: none;
}

.timeline-list::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 5px;
  width: 1px;
  background: rgba(245, 243, 241, 0.24);
  content: '';
}

.timeline-item {
  position: relative;
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
}

.timeline-point {
  position: relative;
  z-index: 1;
  width: 11px;
  height: 11px;
  margin-top: 5px;
  border: 2px solid rgba(245, 243, 241, 0.86);
  border-radius: 999px;
  background: rgba(9, 12, 16, 0.96);
}

.timeline-content {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}

.timeline-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.timeline-meta span,
.timeline-meta time {
  color: currentColor;
  font-size: 11px;
  font-weight: 800;
  opacity: 0.7;
}

.timeline-meta time {
  flex: 0 0 auto;
  opacity: 0.48;
}

.timeline-change {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.timeline-change p,
.timeline-change b,
.timeline-empty {
  margin: 0;
}

.timeline-change p {
  min-width: 0;
  color: currentColor;
  font-size: 12px;
  line-height: 1.55;
  opacity: 0.82;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.timeline-change b {
  color: currentColor;
  font-size: 12px;
  line-height: 1;
  opacity: 0.5;
}

.timeline-empty {
  display: grid;
  min-height: 210px;
  place-items: center;
  color: currentColor;
  font-size: 13px;
  font-weight: 800;
  opacity: 0.62;
}

@media (max-width: 360px) {
  .profile-panel {
    padding: 0 16px 18px;
  }

  .panel-top {
    gap: 12px;
  }

  .avatar-wrap {
    width: 82px;
    height: 82px;
  }

  .sheet-copy strong {
    font-size: 19px;
  }

  .stat-card strong {
    font-size: 16px;
  }

  .stats-row,
  .gallery-grid {
    gap: 8px;
  }

}
</style>