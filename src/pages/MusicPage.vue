<template>
  <section ref="screenRef" class="screen music-page">
    <header class="top-bar music-top-bar">
      <h1 class="top-title">Music</h1>
      <div class="icon-row music-actions">
        <button class="icon-button" type="button" aria-label="播放页" @click="setMode('player')">
          <Disc3 :size="21" />
        </button>
        <button class="icon-button" type="button" aria-label="我的喜欢" @click="setMode('likes')">
          <Heart :size="21" :fill="pageMode === 'likes' ? 'currentColor' : 'none'" />
        </button>
        <button class="icon-button" type="button" aria-label="搜索" @click="openSearch">
          <Search :size="24" />
        </button>
      </div>
    </header>

    <main class="music-content" :class="{ 'player-content': pageMode === 'player' }">
      <section v-if="pageMode === 'player'" class="player-panel">
        <div class="player-stage">
          <div class="flip-card" :class="{ flipped: lyricCardFlipped }" role="button" tabindex="0" :aria-label="lyricCardFlipped ? '切回唱片' : '查看完整歌词'" @click.stop="toggleLyricCard" @keydown.enter.prevent.stop="toggleLyricCard" @keydown.space.prevent.stop="toggleLyricCard">
            <div class="flip-card-inner">
              <div class="flip-face flip-front">
                <div class="signal-caption">
                  <span>LINK FM</span>
                  <strong>{{ isPlaying ? '正在共振' : '待机巡航' }}</strong>
                </div>
                <div class="needle" :class="{ playing: isPlaying }" aria-hidden="true">
                  <span></span>
                  <i></i>
                </div>
                <div class="record" :class="{ spinning: isPlaying }">
                  <div class="grooves"></div>
                  <div class="album-art">
                    <img :src="coverImageSrc(activeTrack)" alt="" aria-hidden="true" @error="handleCoverError" />
                  </div>
                </div>
              </div>
              <div class="flip-face flip-back">
                <div class="lyrics-card-head">
                  <span>LYRICS</span>
                  <strong>{{ nowPlayingTitle }}</strong>
                  <small>{{ nowPlayingArtists }}</small>
                </div>
                <div ref="lyricScrollRef" class="full-lyrics" aria-label="完整歌词">
                  <template v-if="parsedActiveLyrics.length">
                    <p v-for="(line, index) in parsedActiveLyrics" :key="`${line.time}-${index}`" :class="{ active: index === activeLyricIndex, passed: index < activeLyricIndex }">
                      {{ line.text }}
                    </p>
                  </template>
                  <p v-else class="active">{{ activeLyricLine }}</p>
                </div>
              </div>
            </div>
          </div>

          <section class="progress-panel" aria-label="播放控制">
            <div class="progress-row">
              <span>{{ currentTimeLabel }}</span>
              <input :value="progressValue" type="range" min="0" max="100" step="0.1" aria-label="播放进度" @input="seekAudio" />
              <span>{{ durationLabel }}</span>
            </div>
            <div class="now-playing-line">
              <strong>{{ nowPlayingTitle }}</strong>
              <span>{{ nowPlayingArtists }}</span>
            </div>
            <div class="transport-row">
              <button type="button" :disabled="!activeTrack" :class="{ active: activeTrack && isFavorite(activeTrack.id) }" :aria-label="activeTrack && isFavorite(activeTrack.id) ? '从我的喜欢删除' : '加入我的喜欢'" @click="activeTrack && toggleFavorite(activeTrack)">
                <Heart :size="25" :fill="activeTrack && isFavorite(activeTrack.id) ? 'currentColor' : 'none'" />
              </button>
              <button type="button" aria-label="上一首" @click="playNeighbor(-1)">
                <SkipBack :size="31" />
              </button>
              <button class="main-play" type="button" :disabled="!activeTrack || loadingAudioTrackId === activeTrack?.id" :aria-label="isPlaying ? '暂停' : '播放'" @click="activeTrack && togglePlay(activeTrack)">
                <LoaderCircle v-if="activeTrack && loadingAudioTrackId === activeTrack.id" class="spin" :size="36" />
                <Pause v-else-if="isPlaying" :size="37" fill="currentColor" />
                <Play v-else :size="40" fill="currentColor" />
              </button>
              <button type="button" aria-label="下一首" @click="playNeighbor(1)">
                <SkipForward :size="31" />
              </button>
              <button type="button" :disabled="!activeTrack" aria-label="评论区" @click="setMode('comments')">
                <MessageCircle :size="25" />
              </button>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="pageMode === 'search'" class="content-sheet search-sheet">
        <div class="search-console">
          <div class="discover-hero">
            <div class="discover-copy">
              <span>DISCOVER</span>
              <strong>搜索你的下一首循环</strong>
              <small>{{ selectedSourceLabel }} · 搜到即可收藏，无法直连时自动寻找可播放镜像。</small>
            </div>
            <div class="discover-orbit" aria-hidden="true">
              <i></i><i></i><i></i>
            </div>
          </div>

          <div class="source-segment" aria-label="音乐源">
            <button type="button" :class="{ active: selectedSource === 'netease' }" @click="selectedSource = 'netease'">网易云</button>
            <button type="button" :class="{ active: selectedSource === 'kuwo' }" @click="selectedSource = 'kuwo'">酷我</button>
            <button type="button" :class="{ active: selectedSource === 'joox' }" @click="selectedSource = 'joox'">JOOX</button>
          </div>

          <form class="search-form" @submit.prevent="runSearch">
            <label class="search-field">
              <Search :size="18" />
              <input ref="searchInputRef" v-model="query" type="search" enterkeyhint="search" placeholder="输入歌名、歌手或专辑" />
            </label>
            <button type="submit" aria-label="执行搜索">
              <Search :size="18" />
            </button>
          </form>

          <div class="quick-grid" aria-label="搜索快捷入口">
            <span><Trophy :size="23" />排行榜</span>
            <span><UserRound :size="23" />歌手</span>
            <span><Music2 :size="23" />曲风</span>
            <span><Disc3 :size="23" />新歌</span>
          </div>
        </div>

        <p v-if="searchError" class="message error">{{ searchError }}</p>
        <div v-if="searching" class="message"><LoaderCircle class="spin" :size="18" />正在搜索</div>
        <div v-else-if="searchResults.length" class="track-list">
          <div class="result-head">
            <strong>{{ query.trim() || '搜索结果' }}</strong>
            <small>{{ searchResults.length }} 首候选</small>
          </div>
          <article v-for="track in searchResults" :key="track.id" class="track-row" :class="{ active: activeTrack?.id === track.id }">
            <button class="track-main" type="button" @click="selectTrack(track, 'player')">
              <span class="track-cover"><img :src="coverImageSrc(track)" alt="" aria-hidden="true" @error="handleCoverError" /></span>
              <span><strong>{{ track.name }}</strong><small>{{ trackArtists(track) }} · {{ track.album || '未知专辑' }}</small></span>
            </button>
            <button type="button" :aria-label="activeTrack?.id === track.id && isPlaying ? '暂停' : '播放'" @click="togglePlay(track)">
              <LoaderCircle v-if="loadingAudioTrackId === track.id" class="spin" :size="18" />
              <Pause v-else-if="activeTrack?.id === track.id && isPlaying" :size="18" />
              <Play v-else :size="18" />
            </button>
            <button type="button" :class="{ active: isFavorite(track.id) }" :aria-label="isFavorite(track.id) ? '从我的喜欢删除' : '加入我的喜欢'" @click="toggleFavorite(track)">
              <Heart :size="18" :fill="isFavorite(track.id) ? 'currentColor' : 'none'" />
            </button>
          </article>
        </div>
        <div v-else class="message">点击右上角搜索，或输入关键词找歌。</div>
      </section>

      <section v-else-if="pageMode === 'comments'" class="content-sheet comments-sheet">
        <div class="room-hero">
          <div class="room-cover">
            <img :src="coverImageSrc(activeTrack)" alt="" aria-hidden="true" @error="handleCoverError" />
          </div>
          <div class="room-copy">
            <span>LISTENING ROOM</span>
            <strong>{{ activeTrack?.name || '评论区' }}</strong>
            <small>一首歌一个评论区 · {{ activeThread?.comments.length || 0 }} 条</small>
          </div>
          <div class="room-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="comment-toolbar">
          <button type="button" :disabled="!activeTrack || generatingCommentTrackId === activeTrack.id" @click="generateThread('replace')">
            <RefreshCw :class="{ spin: activeTrack && generatingCommentTrackId === activeTrack.id }" :size="16" />{{ activeThread ? '重新生成' : '生成评论区' }}
          </button>
          <button type="button" :disabled="!activeThread || !activeTrack || generatingCommentTrackId === activeTrack.id" @click="generateThread('expand')">
            <Sparkles :size="16" />拓展评论区
          </button>
          <button type="button" :disabled="!activeThread" @click="toggleThreadExpanded">
            <ChevronUp v-if="activeThread?.expanded" :size="16" /><ChevronDown v-else :size="16" />{{ activeThread?.expanded ? '收起' : '展开' }}
          </button>
        </div>
        <p v-if="commentError" class="message error">{{ commentError }}</p>
        <div v-if="activeTrack && generatingCommentTrackId === activeTrack.id" class="message"><LoaderCircle class="spin" :size="18" />评论区生成中</div>
        <div v-else-if="visibleComments.length" class="comment-list">
          <article v-for="comment in visibleComments" :key="comment.id" class="comment-card">
            <span class="comment-avatar"><img v-if="comment.avatar" :src="comment.avatar" alt="" aria-hidden="true" /><UserRound v-else :size="18" /></span>
            <div class="comment-body">
              <div class="comment-meta"><strong>{{ comment.authorName }}</strong><small>{{ commentAuthorType(comment) }}</small></div>
              <p v-if="comment.parentId" class="reply-quote">回复 {{ parentCommentName(comment.parentId) }}：{{ parentCommentText(comment.parentId) }}</p>
              <p>{{ comment.content }}</p>
              <small v-if="comment.contentTranslation" class="translation">{{ comment.contentTranslation }}</small>
              <button type="button" @click="replyTargetId = comment.id">回复</button>
            </div>
          </article>
        </div>
        <div v-else class="empty-room">
          <MessageCircle :size="28" />
          <strong>{{ activeTrack ? '这首歌还没有听友入场' : '先选择一首歌' }}</strong>
          <span>{{ activeTrack ? '生成一组 AI 评论，或者先写下第一句。' : '从搜索页点一首歌，再回来开评论现场。' }}</span>
        </div>
        <form v-if="activeTrack" class="comment-composer" @submit.prevent="submitUserComment">
          <div v-if="replyTargetId" class="reply-target">回复 {{ parentCommentName(replyTargetId) }}<button type="button" aria-label="取消回复" @click="replyTargetId = ''"><X :size="14" /></button></div>
          <div class="composer-row"><input v-model="commentDraft" type="text" maxlength="180" placeholder="写评论或回复" /><button type="submit" :disabled="!commentDraft.trim()"><Send :size="17" /></button></div>
        </form>
      </section>

      <section v-else class="content-sheet likes-sheet">
        <div class="playlist-hero">
          <div class="like-cover">
            <span v-for="track in favoritePreviewTracks" :key="track.id"><img :src="coverImageSrc(track)" alt="" aria-hidden="true" @error="handleCoverError" /></span>
            <Heart v-if="!favoritePreviewTracks.length" :size="46" fill="currentColor" />
          </div>
          <div><span>PRIVATE MIX</span><h2>我的喜欢音乐</h2><p>{{ favoriteTracks.length }} 首 · {{ commentThreads.length }} 个独立评论区</p></div>
        </div>
        <div class="library-stats" aria-label="音乐资产">
          <span><strong>{{ favoriteTracks.length }}</strong><small>收藏歌曲</small></span>
          <span><strong>{{ commentThreads.length }}</strong><small>评论现场</small></span>
          <span><strong>{{ activeTrack ? 'ON' : 'IDLE' }}</strong><small>当前播放</small></span>
        </div>
        <div v-if="favoriteTracks.length" class="track-list">
          <article v-for="track in favoriteTracks" :key="track.id" class="track-row" :class="{ active: activeTrack?.id === track.id }">
            <button class="track-main" type="button" @click="selectTrack(track, 'player')">
              <span class="track-cover"><img :src="coverImageSrc(track)" alt="" aria-hidden="true" @error="handleCoverError" /></span>
              <span><strong>{{ track.name }}</strong><small>{{ trackArtists(track) }} · {{ track.album || '未知专辑' }}</small></span>
            </button>
            <button type="button" aria-label="播放" @click="togglePlay(track)"><Play :size="18" /></button>
            <button type="button" class="active" aria-label="从我的喜欢删除" @click="toggleFavorite(track)"><Heart :size="18" fill="currentColor" /></button>
          </article>
        </div>
        <div v-else class="message">加入喜欢的歌曲会保存在这里。</div>
      </section>
    </main>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ChevronDown, ChevronUp, Disc3, Heart, LoaderCircle, MessageCircle, Music2, Pause, Play, RefreshCw, Search, Send, SkipBack, SkipForward, Sparkles, Trophy, UserRound, X } from 'lucide-vue-next';
import { deleteEntity, getDb, putEntity } from '@/data/db';
import { generateMusicCommentThread, hasTextGenerationConfig } from '@/services/ai';
import { fetchMusicAudioUrl, fetchMusicCoverUrl, fetchMusicLyricText, mergeMusicTrack, searchMusicTracks } from '@/services/music';
import { useAppStore } from '@/stores/appStore';
import { useMusicPlayerStore } from '@/stores/musicPlayerStore';
import type { MusicComment, MusicCommentThread, MusicSource, MusicTrack } from '@/types/domain';
import { createId } from '@/utils/id';

type MusicPageMode = 'player' | 'search' | 'comments' | 'likes';

const store = useAppStore();
const musicPlayer = useMusicPlayerStore();
const pageMode = ref<MusicPageMode>('player');
const query = ref('');
const selectedSource = ref<MusicSource>('netease');
const fallbackCoverUrl = '/link-icon.png';
const searchResults = ref<MusicTrack[]>([]);
const favoriteTracks = ref<MusicTrack[]>([]);
const commentThreads = ref<MusicCommentThread[]>([]);
const sourceLabels: Partial<Record<MusicSource, string>> = { netease: '网易云', kuwo: '酷我', joox: 'JOOX' };
const searching = ref(false);
const searchError = ref('');
const commentError = ref('');
const loadingLyricTrackId = ref('');
const generatingCommentTrackId = ref('');
const commentDraft = ref('');
const replyTargetId = ref('');
const lyricCardFlipped = ref(false);
const screenRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const lyricScrollRef = ref<HTMLElement | null>(null);
const lyricTextByTrackId = ref<Record<string, string>>({});

const activeTrackId = computed({
  get: () => musicPlayer.activeTrackId,
  set: (trackId: string) => {
    if (!trackId) {
      musicPlayer.setCurrentTrack(null);
      return;
    }
    const track = findTrack(trackId);
    if (track) musicPlayer.setCurrentTrack(track);
  }
});
const loadingAudioTrackId = computed(() => musicPlayer.loadingAudioTrackId);
const isPlaying = computed(() => musicPlayer.isPlaying);
const currentTime = computed(() => musicPlayer.currentTime);
const duration = computed(() => musicPlayer.duration);
const progressValue = computed(() => musicPlayer.progressValue);
const activeTrack = computed(() => findTrack(activeTrackId.value) ?? musicPlayer.currentTrack);
const activeThread = computed(() => {
  const track = activeTrack.value;
  return track ? commentThreads.value.find((thread) => thread.trackKey === getTrackKey(track)) : undefined;
});
const visibleComments = computed(() => {
  const comments = activeThread.value?.comments ?? [];
  return activeThread.value?.expanded ? comments : comments.slice(0, 6);
});
const favoritePreviewTracks = computed(() => favoriteTracks.value.slice(0, 4));
const currentTimeLabel = computed(() => formatDuration(currentTime.value));
const durationLabel = computed(() => duration.value ? formatDuration(duration.value) : '03:40');
const nowPlayingTitle = computed(() => activeTrack.value?.name || '先搜索一首歌');
const nowPlayingArtists = computed(() => activeTrack.value ? trackArtists(activeTrack.value) : 'LINK FM');
const selectedSourceLabel = computed(() => sourceLabels[selectedSource.value] ?? '音乐源');
const parsedActiveLyrics = computed(() => {
  const track = activeTrack.value;
  return track ? parseLyricLines(lyricTextByTrackId.value[track.id] || '') : [];
});
const activeLyricIndex = computed(() => {
  const lines = parsedActiveLyrics.value;
  if (!lines.length) return -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (currentTime.value >= lines[index].time) return index;
  }
  return 0;
});
const activeLyricLine = computed(() => {
  const track = activeTrack.value;
  if (!track) return '搜索一首歌，开启滚动歌词与独立评论场';
  if (loadingLyricTrackId.value === track.id) return '歌词同步中';
  const lines = parsedActiveLyrics.value;
  if (!lines.length) return `${track.name} - ${trackArtists(track)}`;
  return lines[activeLyricIndex.value]?.text || lines[0]?.text || `${track.name} - ${trackArtists(track)}`;
});

onMounted(async () => {
  await store.hydrate();
  await loadMusicData();
  void hydrateFavoriteCovers();
});

watch(activeTrack, (track) => {
  if (track) void loadTrackLyric(track);
});

watch([activeLyricIndex, lyricCardFlipped], () => {
  if (!lyricCardFlipped.value) return;
  void nextTick(() => {
    const activeLine = lyricScrollRef.value?.querySelector<HTMLElement>('p.active');
    activeLine?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
});

function setMode(mode: MusicPageMode) {
  pageMode.value = mode;
  scrollMusicToTop();
}

function openSearch() {
  pageMode.value = 'search';
  searchError.value = '';
  scrollMusicToTop();
  void nextTick(() => searchInputRef.value?.focus());
}

function scrollMusicToTop() {
  void nextTick(() => screenRef.value?.scrollTo({ top: 0, behavior: 'auto' }));
}

function toggleLyricCard() {
  lyricCardFlipped.value = !lyricCardFlipped.value;
}

function getTrackKey(track: MusicTrack) {
  return `${track.source}:${track.platformId || track.id}`;
}

async function loadMusicData() {
  const db = await getDb();
  const [favorites, threads] = await Promise.all([
    db.getAll('musicFavoriteTracks'),
    db.getAll('musicCommentThreads')
  ]);
  favoriteTracks.value = favorites.sort((left, right) => (right.addedAt ?? 0) - (left.addedAt ?? 0));
  commentThreads.value = threads.sort((left, right) => right.updatedAt - left.updatedAt);
  if (!activeTrack.value) activeTrackId.value = favoriteTracks.value[0]?.id || '';
}

function trackArtists(track: MusicTrack) {
  return track.artists.join(' / ') || '未知歌手';
}

function coverImageSrc(track?: MusicTrack | null) {
  return track?.coverUrl || fallbackCoverUrl;
}

function handleCoverError(event: Event) {
  const image = event.currentTarget as HTMLImageElement | null;
  if (image && !image.src.endsWith(fallbackCoverUrl)) image.src = fallbackCoverUrl;
}

function findTrack(trackId: string) {
  return favoriteTracks.value.find((track) => track.id === trackId) ?? searchResults.value.find((track) => track.id === trackId) ?? null;
}

function isFavorite(trackId: string) {
  return favoriteTracks.value.some((track) => track.id === trackId);
}

function updateTrackEverywhere(nextTrack: MusicTrack) {
  const searchIndex = searchResults.value.findIndex((track) => track.id === nextTrack.id);
  if (searchIndex >= 0) searchResults.value[searchIndex] = nextTrack;
  const favoriteIndex = favoriteTracks.value.findIndex((track) => track.id === nextTrack.id);
  if (favoriteIndex >= 0) favoriteTracks.value[favoriteIndex] = nextTrack;
  const trackKey = getTrackKey(nextTrack);
  const threadIndex = commentThreads.value.findIndex((thread) => thread.trackKey === trackKey);
  if (threadIndex >= 0) commentThreads.value[threadIndex] = { ...commentThreads.value[threadIndex], track: nextTrack };
  musicPlayer.updateCurrentTrack(nextTrack);
}

async function withCover(track: MusicTrack) {
  if (track.coverUrl || !track.picId) return track;
  const coverUrl = await fetchMusicCoverUrl(track);
  if (!coverUrl) return track;
  return mergeMusicTrack(track, { coverUrl });
}

async function hydrateFavoriteCovers() {
  for (const track of favoriteTracks.value.filter((entry) => !entry.coverUrl && entry.picId).slice(0, 8)) {
    try {
      const nextTrack = await withCover(track);
      updateTrackEverywhere(nextTrack);
      await putEntity('musicFavoriteTracks', nextTrack);
    } catch {
      // 封面失败不影响播放和评论。
    }
  }
}

async function hydrateSearchCovers(tracks: MusicTrack[]) {
  await Promise.all(tracks.filter((track) => track.picId).slice(0, 8).map(async (track) => {
    try {
      updateTrackEverywhere(await withCover(track));
    } catch {
      // 封面失败不影响搜索结果。
    }
  }));
}

async function runSearch() {
  const keyword = query.value.trim();
  if (!keyword || searching.value) return;
  searching.value = true;
  searchError.value = '';
  try {
    const tracks = await searchMusicTracks(keyword, selectedSource.value, 1, 16);
    searchResults.value = tracks.map((track) => favoriteTracks.value.find((favorite) => favorite.id === track.id) ?? track);
    if (!activeTrackId.value && searchResults.value[0]) activeTrackId.value = searchResults.value[0].id;
    void hydrateSearchCovers(searchResults.value);
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : '音乐搜索失败。';
  } finally {
    searching.value = false;
  }
}

async function selectTrack(track: MusicTrack, nextMode: MusicPageMode = 'player') {
  activeTrackId.value = track.id;
  pageMode.value = nextMode;
  scrollMusicToTop();
  replyTargetId.value = '';
  commentDraft.value = '';
  if (!track.coverUrl) {
    try {
      updateTrackEverywhere(await withCover(track));
    } catch {
      // 封面失败不影响选择歌曲。
    }
  }
  void loadTrackLyric(track);
}

async function loadTrackLyric(track: MusicTrack) {
  if (lyricTextByTrackId.value[track.id] || loadingLyricTrackId.value === track.id) return;
  loadingLyricTrackId.value = track.id;
  try {
    const lyricText = await fetchMusicLyricText(track);
    lyricTextByTrackId.value = { ...lyricTextByTrackId.value, [track.id]: lyricText };
  } catch {
    lyricTextByTrackId.value = { ...lyricTextByTrackId.value, [track.id]: '' };
  } finally {
    if (loadingLyricTrackId.value === track.id) loadingLyricTrackId.value = '';
  }
}

function parseLyricLines(lyricText: string) {
  return lyricText.split('\n').flatMap((line) => {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g)];
    const text = line.replace(/\[[^\]]+\]/g, '').trim();
    if (!matches.length || !text) return [];
    return matches.map((match) => ({
      time: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] ?? '0'}`),
      text
    }));
  }).sort((left, right) => left.time - right.time);
}

async function ensurePlayableTrack(track: MusicTrack) {
  const existing = findTrack(track.id) ?? track;
  if (existing.audioUrl) return existing;
  musicPlayer.setLoadingAudioTrackId(track.id);
  try {
    const [audioUrl, coveredTrack] = await Promise.all([
      fetchMusicAudioUrl(existing),
      withCover(existing)
    ]);
    const nextTrack = mergeMusicTrack(coveredTrack, { audioUrl });
    updateTrackEverywhere(nextTrack);
    if (isFavorite(nextTrack.id)) await putEntity('musicFavoriteTracks', nextTrack);
    return nextTrack;
  } finally {
    musicPlayer.setLoadingAudioTrackId('');
  }
}

async function togglePlay(track: MusicTrack) {
  if (loadingAudioTrackId.value) return;
  try {
    const playableTrack = await ensurePlayableTrack(track);
    activeTrackId.value = playableTrack.id;
    pageMode.value = 'player';
    await nextTick();
    await musicPlayer.toggleTrack(playableTrack);
  } catch (error) {
    const message = error instanceof Error ? error.message : '歌曲播放失败。';
    if (!/interrupted by a call to pause/i.test(message)) searchError.value = message;
  }
}

async function toggleFavorite(track: MusicTrack) {
  if (isFavorite(track.id)) {
    favoriteTracks.value = favoriteTracks.value.filter((entry) => entry.id !== track.id);
    await deleteEntity('musicFavoriteTracks', track.id);
    return;
  }
  const now = Date.now();
  const nextTrack = mergeMusicTrack(await withCover(track), { addedAt: now, updatedAt: now });
  favoriteTracks.value = [nextTrack, ...favoriteTracks.value];
  updateTrackEverywhere(nextTrack);
  await putEntity('musicFavoriteTracks', nextTrack);
}

function upsertThread(thread: MusicCommentThread) {
  const index = commentThreads.value.findIndex((entry) => entry.trackKey === thread.trackKey);
  if (index >= 0) commentThreads.value[index] = thread;
  else commentThreads.value.unshift(thread);
}

async function saveThread(thread: MusicCommentThread) {
  upsertThread(thread);
  await putEntity('musicCommentThreads', thread);
}

async function generateThread(mode: 'replace' | 'expand') {
  const track = activeTrack.value;
  const currentUser = store.user;
  if (!track || !currentUser || generatingCommentTrackId.value) return;
  if (!hasTextGenerationConfig(store.settings ?? undefined)) {
    store.showConfigAlert('请先在设置中配置可用的文本 API 模型，再生成音乐评论区。', '需要配置 API 模型');
    return;
  }
  const trackKey = getTrackKey(track);
  generatingCommentTrackId.value = track.id;
  commentError.value = '';
  try {
    const currentThread = commentThreads.value.find((thread) => thread.trackKey === trackKey);
    const existingComments = mode === 'expand' ? currentThread?.comments ?? [] : [];
    const generatedComments = await generateMusicCommentThread({
      track,
      user: currentUser,
      characters: store.characters,
      existingComments,
      mode,
      settings: store.settings ?? undefined
    });
    const now = Date.now();
    await saveThread({
      trackKey,
      track,
      comments: mode === 'expand' ? [...existingComments, ...generatedComments] : generatedComments,
      expanded: mode === 'expand' || Boolean(currentThread?.expanded),
      generatedAt: mode === 'replace' ? now : currentThread?.generatedAt ?? now,
      updatedAt: now
    });
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : '评论区生成失败。';
  } finally {
    generatingCommentTrackId.value = '';
  }
}

async function toggleThreadExpanded() {
  if (!activeThread.value) return;
  await saveThread({ ...activeThread.value, expanded: !activeThread.value.expanded, updatedAt: Date.now() });
}

async function submitUserComment() {
  const track = activeTrack.value;
  const content = commentDraft.value.trim();
  const currentUser = store.user;
  if (!track || !content || !currentUser) return;
  const now = Date.now();
  const trackKey = getTrackKey(track);
  const comment: MusicComment = {
    id: createId('music_comment'),
    authorName: currentUser.nickname || currentUser.name || '我',
    authorId: currentUser.id,
    authorType: 'user',
    avatar: currentUser.avatar,
    content,
    parentId: replyTargetId.value || undefined,
    createdAt: now
  };
  const thread = commentThreads.value.find((entry) => entry.trackKey === trackKey) ?? {
    trackKey,
    track,
    comments: [],
    expanded: true,
    generatedAt: now,
    updatedAt: now
  };
  await saveThread({ ...thread, comments: [...thread.comments, comment], expanded: true, updatedAt: now });
  commentDraft.value = '';
  replyTargetId.value = '';
}

function parentComment(commentId: string) {
  return activeThread.value?.comments.find((comment) => comment.id === commentId);
}

function parentCommentName(commentId: string) {
  return parentComment(commentId)?.authorName || '评论';
}

function parentCommentText(commentId: string) {
  const content = parentComment(commentId)?.content || '';
  return content.length > 34 ? `${content.slice(0, 34)}...` : content;
}

function commentAuthorType(comment: MusicComment) {
  if (comment.authorType === 'user') return '我';
  if (comment.authorType === 'character') return '角色';
  return '听友';
}

function seekAudio(event: Event) {
  const input = event.currentTarget as HTMLInputElement | null;
  musicPlayer.seekToPercent(Number(input?.value ?? progressValue.value));
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const rest = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function playNeighbor(direction: -1 | 1) {
  const list = favoriteTracks.value.length ? favoriteTracks.value : searchResults.value;
  if (!list.length) return;
  const currentIndex = Math.max(0, list.findIndex((track) => track.id === activeTrackId.value));
  const nextTrack = list[(currentIndex + direction + list.length) % list.length];
  if (nextTrack) void togglePlay(nextTrack);
}
</script>

<style scoped>
.music-page {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(237, 239, 242, 0.72) 42%, rgba(208, 212, 217, 0.62)),
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.025) 0 1px, transparent 1px 18px),
    #f3f4f6;
}

.music-top-bar {
  background: rgba(248, 249, 250, 0.88);
  backdrop-filter: blur(22px) saturate(1.08);
}

.music-actions {
  gap: 2px;
}

.music-content {
  min-height: 0;
  padding: 0 16px 22px;
}

.music-content.player-content {
  padding: 0;
}

.track-list::-webkit-scrollbar {
  display: none;
}

.player-panel {
  display: grid;
  min-height: calc(100dvh - var(--tab-height) - 58px - var(--safe-bottom));
}

.player-stage {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: calc(100dvh - var(--tab-height) - 58px - var(--safe-bottom));
  overflow: hidden;
  perspective: 1200px;
  background:
    linear-gradient(155deg, #f9fafb 0%, #cfd3d8 18%, #6b717a 46%, #171a1f 78%, #050608 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.player-stage::before {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.42), transparent 18%),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.055) 0 1px, transparent 1px 12px),
    linear-gradient(180deg, transparent 56%, rgba(0, 0, 0, 0.76) 100%);
  pointer-events: none;
  content: '';
}

.player-stage::after {
  position: absolute;
  right: 0;
  bottom: 86px;
  left: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
  pointer-events: none;
  content: '';
}

.flip-card {
  position: relative;
  z-index: 2;
  min-height: 0;
  color: inherit;
  cursor: pointer;
  outline: none;
}

.flip-card:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.78);
}

.flip-card-inner {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 720ms cubic-bezier(0.2, 0.72, 0.12, 1);
}

.flip-card.flipped .flip-card-inner {
  transform: rotateY(180deg);
}

.flip-face {
  position: absolute;
  inset: 0;
  display: grid;
  min-height: 0;
  overflow: hidden;
  backface-visibility: hidden;
}

.flip-front {
  place-items: center;
  background:
    linear-gradient(122deg, rgba(255, 255, 255, 0.28), transparent 29%),
    radial-gradient(ellipse at 50% 52%, rgba(255, 255, 255, 0.17) 0 31%, transparent 32%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.18));
}

.flip-front::before,
.flip-back::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
}

.flip-front::before {
  background:
    linear-gradient(180deg, transparent 58%, rgba(2, 3, 4, 0.42) 100%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 13px);
}

.flip-back {
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  padding: 22px 20px 18px;
  color: #f7f8fa;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.16), transparent 28%),
    linear-gradient(180deg, #202329 0%, #111317 54%, #050608 100%);
  transform: rotateY(180deg);
}

.flip-back::before {
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.08), transparent 42%, rgba(255, 255, 255, 0.05)),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.045) 0 1px, transparent 1px 22px);
}

.lyrics-card-head {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 5px;
  min-width: 0;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.16);
}

.lyrics-card-head span {
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.18em;
}

.lyrics-card-head strong,
.lyrics-card-head small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-card-head strong {
  font-size: 21px;
  line-height: 1.15;
  font-weight: 950;
}

.lyrics-card-head small {
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
  font-weight: 800;
}

.full-lyrics {
  position: relative;
  z-index: 1;
  display: grid;
  align-content: start;
  gap: 13px;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 4px 42px;
  mask-image: linear-gradient(180deg, transparent, #000 10%, #000 86%, transparent);
  scrollbar-width: none;
}

.full-lyrics::-webkit-scrollbar {
  display: none;
}

.full-lyrics p {
  margin: 0;
  color: rgba(255, 255, 255, 0.38);
  font-size: 15px;
  font-weight: 850;
  line-height: 1.45;
  text-align: left;
  transition: color 220ms ease, font-size 220ms ease, transform 220ms ease;
}

.full-lyrics p.passed {
  color: rgba(255, 255, 255, 0.24);
}

.full-lyrics p.active {
  color: #ffffff;
  font-size: 23px;
  line-height: 1.25;
  transform: translateX(8px);
  text-shadow: 0 10px 26px rgba(0, 0, 0, 0.34);
}

.signal-caption {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 9px;
  color: rgba(255, 255, 255, 0.76);
}

.signal-caption span,
.discover-copy span,
.room-copy span,
.playlist-hero > div:last-child > span {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.signal-caption strong {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.13);
  padding: 5px 9px;
  color: #ffffff;
  font-size: 11px;
}

.needle {
  position: absolute;
  top: 20px;
  left: 52%;
  width: 126px;
  height: 152px;
  transform: rotate(-10deg);
  transform-origin: 18px 18px;
  transition: transform 260ms ease;
  z-index: 2;
}

.needle.playing {
  transform: rotate(8deg);
}

.needle span {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
}

.needle span::after {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: #d6e2f0;
  content: '';
}

.needle i {
  position: absolute;
  top: 25px;
  left: 23px;
  width: 126px;
  height: 9px;
  border-radius: 999px;
  background: #ffffff;
  transform: rotate(52deg);
  transform-origin: left center;
}

.needle i::after {
  position: absolute;
  right: -15px;
  top: 50px;
  width: 33px;
  height: 22px;
  border-radius: 7px;
  background: #ffffff;
  transform: rotate(-38deg);
  content: '';
}

.record {
  position: relative;
  display: grid;
  place-items: center;
  width: min(70vw, 292px);
  aspect-ratio: 1;
  margin-top: 26px;
  border-radius: 50%;
  background: #111114;
  box-shadow: 0 0 0 12px rgba(255, 255, 255, 0.08), 0 22px 38px rgba(7, 10, 18, 0.42);
}

.record.spinning {
  animation: rotate-record 12s linear infinite;
}

.grooves {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: repeating-radial-gradient(circle, #1d1d1f 0 2px, #101011 3px 5px);
}

.album-art {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 49%;
  aspect-ratio: 1;
  overflow: hidden;
  border: 11px solid #ffffff;
  border-radius: 50%;
  background: #eef3f8;
  color: #6d737c;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 10px 24px rgba(0, 0, 0, 0.22);
}

.album-art img,
.track-cover img,
.comment-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.song-summary,
.progress-panel,
.content-sheet {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 34px rgba(31, 38, 54, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(18px);
}

.song-summary {
  display: grid;
  grid-template-columns: 42px 1fr auto;
  align-items: center;
  gap: 11px;
  padding: 15px;
}

.sound-button,
.song-social-actions button,
.transport-row button,
.track-row > button:not(.track-main),
.comment-toolbar button,
.comment-body button,
.comment-composer button,
.reply-target button,
.search-form button {
  border: 0;
  background: transparent;
  color: inherit;
}

.music-page svg,
.music-page img {
  pointer-events: none;
}

.sound-button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(180deg, #f7f9fc, #edf1f7);
  color: #697284;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.song-title-block {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.song-title-block strong,
.track-main strong {
  overflow: hidden;
  color: #101525;
  font-size: 16px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-title-block span,
.track-main small,
.sheet-heading small,
.comment-meta small,
.translation {
  overflow: hidden;
  color: #8a909b;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-social-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.song-social-actions button {
  display: grid;
  justify-items: center;
  gap: 2px;
  color: #7b8291;
}

.song-social-actions button.active,
.track-row > button.active {
  color: #111317;
}

.song-social-actions small {
  font-size: 10px;
  font-weight: 800;
}

.progress-panel {
  display: grid;
  position: relative;
  z-index: 3;
  gap: 10px;
  border-radius: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03) 24%, rgba(0, 0, 0, 0.78));
  padding: 15px 18px 22px;
  box-shadow: none;
  backdrop-filter: blur(20px);
}

.progress-row {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

.progress-row input {
  width: 100%;
  accent-color: #ffffff;
}

.now-playing-line {
  display: grid;
  justify-items: center;
  gap: 2px;
  min-width: 0;
  color: #ffffff;
}

.now-playing-line strong,
.now-playing-line span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.now-playing-line strong {
  font-size: 17px;
  line-height: 1.15;
  font-weight: 950;
}

.now-playing-line span {
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  font-weight: 800;
}

.transport-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: center;
  justify-items: center;
  gap: 4px;
}

.transport-row button {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  box-shadow: none;
  backdrop-filter: none;
  transition: transform 160ms ease, color 160ms ease, filter 160ms ease;
}

.transport-row button:active {
  transform: scale(0.94);
}

.transport-row button.active {
  background: transparent;
  color: #ffffff;
  box-shadow: none;
  filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.3));
}

.transport-row button.active svg {
  fill: currentColor;
  stroke: currentColor;
}

.transport-row .main-play {
  width: 64px;
  height: 64px;
  background: transparent;
  box-shadow: none;
  color: #ffffff;
}

.transport-row .main-play svg {
  filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.28));
}

.content-sheet {
  display: grid;
  align-content: start;
  gap: 15px;
  padding: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.search-sheet,
.comments-sheet,
.likes-sheet {
  min-height: 520px;
}

.discover-hero,
.room-hero,
.playlist-hero,
.library-stats,
.search-form,
.search-console,
.source-segment,
.quick-grid,
.track-list,
.comment-toolbar,
.comment-list,
.empty-room,
.comment-composer {
  border-radius: 8px;
}

.search-console {
  display: grid;
  gap: 10px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(238, 240, 243, 0.74)),
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.03) 0 1px, transparent 1px 16px);
  padding: 10px;
  box-shadow: 0 18px 34px rgba(24, 28, 34, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

.discover-hero {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 78px;
  min-height: 126px;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.2), transparent 34%),
    linear-gradient(135deg, #f8f9fa 0%, #d5d9de 44%, #34383f 100%);
  padding: 17px;
  color: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5), 0 14px 28px rgba(18, 22, 28, 0.12);
}

.discover-copy {
  position: relative;
  z-index: 1;
  display: grid;
  align-content: center;
  gap: 8px;
}

.discover-copy strong {
  max-width: 210px;
  color: #111317;
  font-size: 23px;
  line-height: 1.1;
}

.discover-copy small {
  max-width: 235px;
  color: rgba(17, 19, 23, 0.62);
  line-height: 1.5;
}

.discover-orbit {
  position: relative;
  align-self: center;
  justify-self: end;
  width: 74px;
  height: 74px;
  border: 1px solid rgba(17, 19, 23, 0.12);
  border-radius: 50%;
}

.discover-orbit i {
  position: absolute;
  border-radius: 50%;
  background: rgba(17, 19, 23, 0.74);
}

.discover-orbit i:nth-child(1) {
  inset: 22px;
  background: #111317;
}

.discover-orbit i:nth-child(2) {
  top: 2px;
  left: 34px;
  width: 12px;
  height: 12px;
}

.discover-orbit i:nth-child(3) {
  right: 8px;
  bottom: 15px;
  width: 18px;
  height: 18px;
}

.search-form {
  display: grid;
  grid-template-columns: 1fr 44px;
  gap: 8px;
  padding: 7px;
  background: rgba(17, 19, 23, 0.06);
  box-shadow: inset 0 0 0 1px rgba(17, 19, 23, 0.06);
}

.source-segment {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  background: rgba(17, 19, 23, 0.08);
  padding: 4px;
}

.source-segment button {
  min-height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #656b74;
  font-size: 12px;
  font-weight: 900;
}

.source-segment button.active {
  background: #ffffff;
  color: #111317;
  box-shadow: 0 8px 18px rgba(17, 19, 23, 0.1), inset 0 0 0 1px rgba(17, 19, 23, 0.06);
}

.search-field,
.search-form select,
.search-form button,
.message,
.track-row,
.comment-card,
.comment-composer {
  border-radius: 8px;
  background: #f4f6fa;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 14px;
  color: #68707a;
}

.search-field input,
.composer-row input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #101525;
}

.search-form select,
.search-form button {
  min-height: 46px;
  border: 0;
  color: #101525;
}

.search-form button {
  display: grid;
  place-items: center;
  background: #ffffff;
  color: #111317;
  box-shadow: inset 0 0 0 1px rgba(17, 19, 23, 0.08);
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  background: transparent;
  padding: 0;
}

.quick-grid span {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-height: 66px;
  align-content: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.62);
  color: #5d646e;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px rgba(17, 19, 23, 0.05);
}

.track-list,
.comment-list {
  display: grid;
  gap: 10px;
  background: rgba(255, 255, 255, 0.58);
  padding: 9px;
  box-shadow: inset 0 0 0 1px rgba(20, 25, 38, 0.035);
}

.result-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  padding: 3px 3px 2px;
}

.result-head strong {
  color: #101525;
  font-size: 17px;
  font-weight: 900;
}

.result-head small {
  color: #8a909b;
  font-weight: 800;
}

.track-row {
  display: grid;
  grid-template-columns: 1fr 36px 36px;
  align-items: center;
  gap: 8px;
  padding: 9px;
  box-shadow: inset 0 0 0 1px rgba(20, 25, 38, 0.035), 0 8px 18px rgba(31, 38, 54, 0.035);
}

.track-row.active {
  background: #eef2f8;
}

.track-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
}

.track-main span:last-child {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.track-cover {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 8px;
  background: linear-gradient(135deg, #e8edf5, #d9e1ee);
  color: #657083;
}

.track-row > button:not(.track-main) {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #657083;
}

.sheet-heading {
  display: grid;
  gap: 4px;
}

.sheet-heading span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #101525;
  font-size: 18px;
  font-weight: 900;
}

.search-heading {
  padding: 2px 2px 0;
}

.room-hero {
  display: grid;
  grid-template-columns: 72px 1fr 38px;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #111827, #263348);
  padding: 13px;
  color: #ffffff;
  box-shadow: 0 18px 34px rgba(17, 24, 39, 0.16);
}

.room-cover {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.13);
  color: rgba(255, 255, 255, 0.88);
}

.room-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.room-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.room-copy strong {
  overflow: hidden;
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-copy small,
.room-copy span {
  color: rgba(255, 255, 255, 0.68);
}

.room-meter {
  display: grid;
  align-items: end;
  grid-template-columns: repeat(4, 4px);
  gap: 3px;
  height: 44px;
}

.room-meter i {
  border-radius: 999px;
  background: #dfe3e8;
}

.room-meter i:nth-child(1) { height: 34%; }
.room-meter i:nth-child(2) { height: 78%; }
.room-meter i:nth-child(3) { height: 52%; }
.room-meter i:nth-child(4) { height: 92%; }

.comment-toolbar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.62);
  padding: 8px;
}

.comment-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 38px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f4f6fa;
  color: #657083;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.comment-toolbar button:disabled,
.transport-row button:disabled {
  opacity: 0.5;
}

.comment-card {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 10px;
  padding: 11px;
  box-shadow: inset 0 0 0 1px rgba(20, 25, 38, 0.035), 0 8px 18px rgba(31, 38, 54, 0.035);
}

.empty-room {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-height: 150px;
  align-content: center;
  background: rgba(255, 255, 255, 0.68);
  color: #737b8c;
  padding: 22px;
  text-align: center;
  box-shadow: inset 0 0 0 1px rgba(20, 25, 38, 0.035);
}

.empty-room strong {
  color: #101525;
  font-size: 16px;
}

.empty-room span {
  max-width: 230px;
}

.comment-avatar {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  overflow: hidden;
  border-radius: 50%;
  background: linear-gradient(135deg, #e8edf5, #d9e1ee);
  color: #657083;
}

.comment-body {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: 7px;
}

.comment-meta strong {
  color: #101525;
}

.comment-body p {
  margin: 0;
  color: #343946;
  line-height: 1.45;
  word-break: break-word;
}

.reply-quote {
  border-radius: 8px;
  background: #edf1f7;
  padding: 7px 9px;
  color: #737b8c !important;
}

.comment-body button {
  justify-self: start;
  padding: 0;
  color: #8a909b;
}

.comment-composer {
  display: grid;
  gap: 8px;
  padding: 9px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: inset 0 0 0 1px rgba(20, 25, 38, 0.035), 0 12px 24px rgba(31, 38, 54, 0.06);
}

.reply-target,
.composer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reply-target {
  justify-content: space-between;
  color: #737b8c;
  padding: 0 4px;
}

.composer-row button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #101525;
  color: #ffffff;
}

.playlist-hero {
  position: relative;
  display: grid;
  grid-template-columns: 104px 1fr;
  align-items: center;
  gap: 16px;
  min-height: 154px;
  overflow: hidden;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.16), transparent 28%),
    linear-gradient(135deg, #2a2d33 0%, #5b626c 44%, #111317 100%);
  padding: 18px;
  color: #ffffff;
  box-shadow: 0 18px 34px rgba(17, 19, 23, 0.18);
}

.playlist-hero::after {
  position: absolute;
  right: 18px;
  bottom: 18px;
  left: 122px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34));
  content: '';
}

.like-cover {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  width: 94px;
  height: 94px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.24);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 18px 28px rgba(5, 6, 8, 0.24);
}

.like-cover > span {
  display: grid;
  place-items: center;
  min-width: 0;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.18);
}

.like-cover > svg {
  grid-column: 1 / -1;
  align-self: center;
  justify-self: center;
}

.like-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlist-hero > div:last-child {
  position: relative;
  z-index: 1;
}

.playlist-hero h2,
.playlist-hero p {
  margin: 0;
}

.playlist-hero h2 {
  font-size: 22px;
  line-height: 1.1;
}

.library-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
}

.library-stats span {
  display: grid;
  gap: 3px;
  min-height: 68px;
  align-content: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.74);
  padding: 10px;
  text-align: center;
  box-shadow: inset 0 0 0 1px rgba(20, 25, 38, 0.035);
}

.library-stats strong {
  color: #101525;
  font-size: 19px;
  line-height: 1;
}

.library-stats small {
  color: #8a909b;
  font-weight: 800;
}

.message {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 12px;
  color: #737b8c;
  text-align: center;
  box-shadow: inset 0 0 0 1px rgba(20, 25, 38, 0.035);
}

.comments-sheet .message {
  min-height: 108px;
}

.message.error {
  color: #2c3036;
  background: #e8ebef;
}

.spin {
  animation: rotate-record 1s linear infinite;
}

@keyframes rotate-record {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 370px) {
  .music-content {
    padding: 0 12px 18px;
  }

  .music-content.player-content {
    padding: 0;
  }

  .player-panel,
  .player-stage {
    min-height: calc(100dvh - var(--tab-height) - 56px - var(--safe-bottom));
  }

  .song-summary {
    grid-template-columns: 38px 1fr;
  }

  .song-social-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>