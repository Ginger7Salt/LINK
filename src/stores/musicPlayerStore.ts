import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { MusicTrack } from '@/types/domain';

export type PlaybackMode = 'sequence' | 'repeat-all' | 'shuffle' | 'repeat-one';

export interface MusicListenTogetherPartner {
  conversationId: string;
  characterId: string;
  userId: string;
  inviter: 'user' | 'char';
  joinedAt: number;
}

export const useMusicPlayerStore = defineStore('musicPlayer', () => {
  const currentTrack = ref<MusicTrack | null>(null);
  const loadingAudioTrackId = ref('');
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const playbackError = ref('');
  const playbackMode = ref<PlaybackMode>('sequence');
  const playbackQueue = ref<MusicTrack[]>([]);
  const listeningPartner = ref<MusicListenTogetherPartner | null>(null);
  const currentLyricLine = ref('');
  const playbackEndedTick = ref(0);
  let audio: HTMLAudioElement | null = null;

  const activeTrackId = computed(() => currentTrack.value?.id || '');
  const progressValue = computed(() => duration.value ? (currentTime.value / duration.value) * 100 : 0);

  function syncAudioProgress() {
    if (!audio) return;
    currentTime.value = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    duration.value = Number.isFinite(audio.duration) ? audio.duration : 0;
  }

  function bindAudioEvents(nextAudio: HTMLAudioElement) {
    nextAudio.addEventListener('timeupdate', syncAudioProgress);
    nextAudio.addEventListener('loadedmetadata', syncAudioProgress);
    nextAudio.addEventListener('ended', handleAudioEnded);
    nextAudio.addEventListener('pause', handleAudioPaused);
    nextAudio.addEventListener('play', handleAudioPlayed);
  }

  function unbindAudioEvents(currentAudio: HTMLAudioElement) {
    currentAudio.removeEventListener('timeupdate', syncAudioProgress);
    currentAudio.removeEventListener('loadedmetadata', syncAudioProgress);
    currentAudio.removeEventListener('ended', handleAudioEnded);
    currentAudio.removeEventListener('pause', handleAudioPaused);
    currentAudio.removeEventListener('play', handleAudioPlayed);
  }

  function handleAudioEnded() {
    isPlaying.value = false;
    syncAudioProgress();
    playbackEndedTick.value += 1;
  }

  function handleAudioPaused() {
    isPlaying.value = false;
    syncAudioProgress();
  }

  function handleAudioPlayed() {
    isPlaying.value = true;
    syncAudioProgress();
  }

  function setAudioElement(element: HTMLAudioElement | null) {
    if (audio === element) return;
    if (audio) unbindAudioEvents(audio);
    audio = element;
    if (!audio) return;
    bindAudioEvents(audio);
    syncAudioProgress();
  }

  function ensureAudio() {
    if (audio) return audio;
    if (typeof Audio === 'undefined') return null;
    const fallbackAudio = new Audio();
    fallbackAudio.preload = 'metadata';
    setAudioElement(fallbackAudio);
    return audio;
  }

  function setCurrentTrack(track: MusicTrack | null) {
    currentTrack.value = track;
  }

  function updateCurrentTrack(track: MusicTrack) {
    if (currentTrack.value?.id === track.id) currentTrack.value = track;
  }

  function setLoadingAudioTrackId(trackId: string) {
    loadingAudioTrackId.value = trackId;
  }

  function setPlaybackMode(mode: PlaybackMode) {
    playbackMode.value = mode;
  }

  function setPlaybackQueue(tracks: MusicTrack[]) {
    const dedupedTracks = new Map<string, MusicTrack>();
    tracks.forEach((track) => {
      if (track?.id) dedupedTracks.set(track.id, track);
    });
    playbackQueue.value = [...dedupedTracks.values()];
  }

  async function playTrack(track: MusicTrack, options: { restart?: boolean } = {}) {
    const player = ensureAudio();
    if (!player) throw new Error('当前环境无法播放音频。');
    if (!track.audioUrl) throw new Error('歌曲暂无可播放地址。');
    currentTrack.value = track;
    playbackError.value = '';
    const sourceChanged = player.src !== track.audioUrl;
    if (sourceChanged) player.src = track.audioUrl;
    if (options.restart || sourceChanged || player.ended) player.currentTime = 0;
    await player.play();
  }

  async function toggleTrack(track: MusicTrack) {
    const player = ensureAudio();
    if (!player) throw new Error('当前环境无法播放音频。');
    if (currentTrack.value?.id === track.id && isPlaying.value) {
      player.pause();
      return;
    }
    await playTrack(track);
  }

  function pause() {
    audio?.pause();
  }

  function seekToPercent(percent: number) {
    const player = ensureAudio();
    if (!player || !duration.value) return;
    const normalizedPercent = Math.min(100, Math.max(0, percent));
    player.currentTime = (normalizedPercent / 100) * duration.value;
    syncAudioProgress();
  }

  function setCurrentLyricLine(line: string) {
    currentLyricLine.value = line.trim();
  }

  function startListenTogether(partner: Omit<MusicListenTogetherPartner, 'joinedAt'> & { joinedAt?: number }) {
    listeningPartner.value = {
      ...partner,
      joinedAt: partner.joinedAt ?? Date.now()
    };
  }

  function stopListenTogether(characterId?: string) {
    if (characterId && listeningPartner.value?.characterId !== characterId) return;
    listeningPartner.value = null;
  }

  function isListeningWithConversation(conversationId: string) {
    return listeningPartner.value?.conversationId === conversationId;
  }

  return {
    currentTrack,
    activeTrackId,
    loadingAudioTrackId,
    isPlaying,
    currentTime,
    duration,
    progressValue,
    playbackError,
    playbackMode,
    playbackQueue,
    listeningPartner,
    currentLyricLine,
    playbackEndedTick,
    setAudioElement,
    setCurrentTrack,
    updateCurrentTrack,
    setLoadingAudioTrackId,
    setPlaybackMode,
    setPlaybackQueue,
    playTrack,
    toggleTrack,
    pause,
    seekToPercent,
    syncAudioProgress,
    setCurrentLyricLine,
    startListenTogether,
    stopListenTogether,
    isListeningWithConversation
  };
});
