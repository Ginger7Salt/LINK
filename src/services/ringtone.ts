import type { AppSettings, RingtoneEventType } from '@/types/domain';
import { normalizeRingtoneSettings } from '@/utils/settings';

const silentAudioUrl = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';

let ringtoneAudio: HTMLAudioElement | null = null;
let unlockPromise: Promise<void> | null = null;
let unlockInstalled = false;

function getRingtoneAudio() {
  if (ringtoneAudio) return ringtoneAudio;
  if (typeof Audio === 'undefined') return null;
  ringtoneAudio = new Audio();
  ringtoneAudio.preload = 'auto';
  ringtoneAudio.setAttribute('playsinline', 'true');
  return ringtoneAudio;
}

async function unlockAudioContext() {
  if (typeof window === 'undefined') return;
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = window.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return;
  const audioContext = new AudioContextConstructor();
  if (audioContext.state === 'suspended') await audioContext.resume();
  await audioContext.close().catch(() => undefined);
}

export function unlockRingtoneAudio() {
  if (unlockPromise) return unlockPromise;
  unlockPromise = (async () => {
    const audio = getRingtoneAudio();
    await unlockAudioContext().catch(() => undefined);
    if (!audio) return;
    const previousSrc = audio.getAttribute('src') || '';
    const previousMuted = audio.muted;
    audio.muted = true;
    audio.src = silentAudioUrl;
    audio.load();
    await audio.play().catch(() => undefined);
    audio.pause();
    audio.currentTime = 0;
    audio.muted = previousMuted;
    if (previousSrc) {
      audio.src = previousSrc;
      audio.load();
    } else {
      audio.removeAttribute('src');
    }
  })();
  return unlockPromise;
}

export function installRingtoneAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const unlock = () => {
    void unlockRingtoneAudio();
  };
  window.addEventListener('pointerdown', unlock, { passive: true, capture: true });
  window.addEventListener('touchstart', unlock, { passive: true, capture: true });
  window.addEventListener('keydown', unlock, { passive: true, capture: true });
}

export async function playRingtone(settings: AppSettings | null | undefined, eventType: RingtoneEventType, characterId = '') {
  if (!settings) return false;
  const audio = getRingtoneAudio();
  if (!audio) return false;

  const ringtoneSettings = normalizeRingtoneSettings(settings.ringtoneSettings);
  const characterAsset = characterId ? ringtoneSettings.characters[characterId]?.[eventType] : null;
  const asset = characterAsset ?? ringtoneSettings.global[eventType];
  const audioUrl = asset?.url.trim();
  if (!audioUrl) return false;

  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // Ignore stale media state before changing the source.
  }

  audio.muted = false;
  audio.volume = 1;
  if (audio.getAttribute('src') !== audioUrl) {
    audio.src = audioUrl;
    audio.load();
  }

  try {
    await audio.play();
    return true;
  } catch (error) {
    console.warn('Ringtone playback was blocked or failed.', error);
    return false;
  }
}