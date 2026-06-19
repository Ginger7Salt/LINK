<template>
  <section class="user-profile-sheet">
    <section class="sheet-cover" :style="coverStyle">
      <div class="cover-overlay"></div>
      <button class="edit-button" type="button" @click="openEditor">修改</button>
    </section>

    <section class="profile-panel" :class="{ editing: isEditing }">
      <div v-if="isEditing" class="editor-overlay">
        <form class="editor-card" @submit.prevent="saveEditor">
          <div class="editor-head">
            <strong>修改我的主页</strong>
            <p>可调整背景图、头像、网名、个性签名和三项统计显示。</p>
          </div>

          <label class="editor-field">
            <span>背景图 URL</span>
            <input v-model="editorForm.backgroundImage" type="text" placeholder="https://..." />
          </label>

          <label class="editor-field">
            <span>头像 URL</span>
            <input v-model="editorForm.avatar" type="text" placeholder="https://..." />
          </label>

          <label class="editor-upload">
            <input type="file" accept="image/*" @change="readAvatar" />
            <span>本地选择头像</span>
          </label>

          <label class="editor-field">
            <span>网名</span>
            <input v-model="editorForm.nickname" type="text" required />
          </label>

          <label class="editor-field">
            <span>个性签名</span>
            <textarea v-model="editorForm.signature" rows="2" />
          </label>

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

      <div class="panel-top">
        <div class="avatar-wrap">
          <img class="sheet-avatar" :src="displayAvatar" :alt="displayName" />
        </div>
      </div>

      <div class="sheet-copy">
        <strong>{{ displayName }}</strong>
        <span class="handle">@{{ displayHandle }}</span>
        <p>{{ displayBio }}</p>
      </div>

      <div class="stats-row">
        <article v-for="item in statsItems" :key="item.label" class="stat-card">
          <strong>{{ item.value }}</strong>
          <span>{{ item.label }}</span>
        </article>
      </div>

      <section class="gallery-section">
        <div class="section-head">
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

    <AvatarCropperModal v-model="showAvatarEditor" :src="avatarEditorSource" @confirm="applyEditedAvatar" />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import AvatarCropperModal from '@/components/image/AvatarCropperModal.vue';
import type { UserProfile, VoomPost } from '@/types/domain';
import { readImageFileFromInput } from '@/utils/imageFile';
import { createVisualProfile, getVisualProfile, normalizeVisualProfile } from '@/utils/profile';

const props = defineProps<{
  user: UserProfile;
  posts: VoomPost[];
}>();

const emit = defineEmits<{
  save: [user: UserProfile];
}>();

const isEditing = ref(false);
const showAvatarEditor = ref(false);
const avatarEditorSource = ref('');
const editorForm = reactive({
  backgroundImage: '',
  avatar: '',
  nickname: '',
  signature: '',
  posts: '',
  followers: '',
  following: ''
});

const visualProfile = computed(() => getVisualProfile(props.user) ?? createVisualProfile(props.user));
const coverStyle = computed(() => ({ backgroundImage: `url(${visualProfile.value.backgroundImage})` }));
const displayHandle = computed(() => visualProfile.value.handle.replace(/^@/, '') || props.user.id);
const displayName = computed(() => props.user.nickname || visualProfile.value.nickname || props.user.name);
const displayAvatar = computed(() => visualProfile.value.avatar || props.user.avatar);
const displayBio = computed(() => props.user.signature || visualProfile.value.bio);
const recentPosts = computed(() => props.posts
  .filter((post) => post.userId === props.user.id && (post.authorType === 'user' || !post.charId))
  .slice(0, 3));

const statsItems = computed(() => {
  const stats = visualProfile.value.stats;
  return [
    { label: stats.postsLabel ?? 'Posts', value: formatCompactStat(stats.posts) },
    { label: stats.followersLabel ?? 'Followers', value: stats.followers },
    { label: stats.followingLabel ?? 'Following', value: formatCompactStat(stats.following) }
  ];
});

const galleryTiles = computed(() => {
  return Array.from({ length: 3 }, (_, index) => {
    const post = recentPosts.value[index];
    return {
      id: post?.id ?? `empty-voom-${index + 1}`,
      caption: post?.imageDescription || post?.content || '暂无 VOOM',
      image: post?.image ?? '',
      empty: !post
    };
  });
});

function formatCompactStat(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value).toLowerCase();
}

function openEditor() {
  const profile = visualProfile.value;
  editorForm.backgroundImage = profile.backgroundImage ?? '';
  editorForm.avatar = profile.avatar || props.user.avatar || '';
  editorForm.nickname = props.user.nickname || profile.nickname || props.user.name || '';
  editorForm.signature = props.user.signature || profile.bio || '';
  editorForm.posts = String(profile.stats.posts ?? 0);
  editorForm.followers = profile.stats.followers ?? '';
  editorForm.following = String(profile.stats.following ?? 0);
  isEditing.value = true;
}

function cancelEditor() {
  isEditing.value = false;
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
  const nextPosts = Number.parseInt(editorForm.posts, 10);
  const nextFollowing = Number.parseInt(editorForm.following, 10);
  const nextNickname = editorForm.nickname.trim() || props.user.nickname || props.user.name;
  const nextAvatar = editorForm.avatar.trim() || props.user.avatar || profile.avatar;
  const nextSignature = editorForm.signature.trim() || props.user.signature || profile.bio;

  emit('save', {
    ...props.user,
    nickname: nextNickname,
    avatar: nextAvatar,
    signature: nextSignature,
    profile: normalizeVisualProfile({
      ...profile,
      nickname: nextNickname,
      avatar: nextAvatar,
      bio: nextSignature,
      backgroundImage: editorForm.backgroundImage.trim() || profile.backgroundImage,
      stats: {
        ...profile.stats,
        posts: Number.isFinite(nextPosts) ? nextPosts : profile.stats.posts,
        followers: editorForm.followers.trim() || profile.stats.followers,
        following: Number.isFinite(nextFollowing) ? nextFollowing : profile.stats.following,
        postsLabel: profile.stats.postsLabel,
        followersLabel: profile.stats.followersLabel,
        followingLabel: profile.stats.followingLabel
      }
    }, {
      ...props.user,
      nickname: nextNickname,
      avatar: nextAvatar,
      signature: nextSignature
    })
  });
  isEditing.value = false;
}
</script>

<style scoped>
.user-profile-sheet {
  display: grid;
  gap: 0;
  color: #f5f3f1;
  border-radius: 34px;
  overflow: hidden;
  background: #090c0f;
}

.sheet-cover {
  position: relative;
  min-height: 206px;
  background-color: #1b1f26;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.cover-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(10, 11, 16, 0.12), rgba(10, 11, 16, 0.4) 42%, rgba(6, 8, 12, 0.96));
}

.edit-button {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(10, 12, 15, 0.54);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: #f5f3f1;
  font-size: 12px;
  font-weight: 700;
  backdrop-filter: blur(12px);
}

.profile-panel {
  position: relative;
  margin-top: -74px;
  z-index: 1;
  padding: 0 20px 22px;
}

.profile-panel.editing {
  min-height: 468px;
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
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 24px;
  background: rgba(16, 18, 22, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 44px rgba(0, 0, 0, 0.34);
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
  gap: 8px;
}

.editor-field span {
  color: rgba(245, 243, 241, 0.7);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.editor-field input,
.editor-field textarea {
  width: 100%;
  min-height: 40px;
  padding: 9px 12px;
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

.editor-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.editor-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.editor-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(245, 243, 241, 0.88);
  font-size: 12px;
  font-weight: 800;
}

.editor-upload input {
  display: none;
}

.editor-secondary,
.editor-primary {
  height: 38px;
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
  align-items: flex-end;
}

.avatar-wrap {
  position: relative;
  width: 96px;
  height: 96px;
}

.sheet-avatar {
  width: 100%;
  height: 100%;
  border-radius: 32px;
  object-fit: cover;
  border: 3px solid #090c0f;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.42);
}

.sheet-copy {
  display: grid;
  gap: 6px;
  margin-top: 16px;
}

.sheet-copy strong {
  font-size: 24px;
  font-weight: 900;
  line-height: 1;
}

.handle {
  color: rgba(245, 243, 241, 0.48);
  font-size: 12px;
}

.sheet-copy p {
  margin: 0;
  color: rgba(245, 243, 241, 0.78);
  font-size: 14px;
  line-height: 1.7;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.stat-card {
  display: grid;
  gap: 6px;
}

.stat-card strong,
.stat-card span,
.section-head h3,
.gallery-copy span {
  margin: 0;
}

.stat-card strong {
  font-size: 21px;
  font-weight: 800;
}

.stat-card span {
  color: rgba(245, 243, 241, 0.44);
  font-size: 11px;
}

.gallery-section {
  margin-top: 24px;
}

.section-head h3 {
  font-size: 18px;
  font-weight: 800;
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
  color: rgba(245, 243, 241, 0.74);
  font-size: 10px;
  line-height: 1.45;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

@media (max-width: 360px) {
  .profile-panel {
    padding: 0 16px 18px;
  }

  .editor-grid {
    grid-template-columns: 1fr;
  }

  .stats-row,
  .gallery-grid {
    gap: 8px;
  }
}
</style>