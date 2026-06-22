import type { AppSettings, MinimaxTtsSettings, OpenAiTtsSettings, PublicTtsSettings, TtsProviderType } from '@/types/domain';
import { getResolvedOpenAiTtsConfig, getTtsVoiceForProvider, normalizeAppSettings } from '@/utils/settings';

interface TtsAudioPayload {
  audioUrl: string;
  mimeType: string;
}

export interface TtsAudioResult extends TtsAudioPayload {
  provider: TtsProviderType;
  voiceId: string;
}

function minimaxMimeTypeForFormat(format: MinimaxTtsSettings['audioFormat']) {
  if (format === 'wav') return 'audio/wav';
  if (format === 'pcm') return 'audio/pcm';
  return 'audio/mpeg';
}

function openAiMimeTypeForFormat(format: OpenAiTtsSettings['responseFormat']) {
  if (format === 'wav') return 'audio/wav';
  if (format === 'pcm') return 'audio/pcm';
  if (format === 'opus') return 'audio/ogg; codecs=opus';
  if (format === 'aac') return 'audio/aac';
  if (format === 'flac') return 'audio/flac';
  return 'audio/mpeg';
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function hexToDataUrl(hex: string, mimeType: string) {
  const normalized = hex.replace(/\s+/g, '').trim();
  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) return '';
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function base64ToDataUrl(base64: string, mimeType: string) {
  const normalized = base64.trim();
  if (!normalized) return '';
  try {
    atob(normalized);
    return `data:${mimeType};base64,${normalized}`;
  } catch {
    return '';
  }
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('TTS 音频读取失败。'));
    reader.readAsDataURL(blob);
  });
}

async function remoteAudioToDataUrl(audioUrl: string, fallbackMimeType: string) {
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error(`TTS 音频下载失败：${response.status}`);
  return readAudioResponse(response, fallbackMimeType);
}

async function readAudioResponse(response: Response, fallbackMimeType: string) {
  const blob = await response.blob();
  const mimeType = blob.type || fallbackMimeType;
  return {
    audioUrl: await readBlobAsDataUrl(blob.type ? blob : new Blob([blob], { type: mimeType })),
    mimeType
  };
}

function buildMinimaxEndpoint(apiUrl: string, groupId: string) {
  const endpoint = apiUrl.trim().replace(/\s+/g, '');
  if (!endpoint) throw new Error('请先填写 MiniMax TTS API 地址。');
  if (!groupId.trim() || /[?&]GroupId=/i.test(endpoint)) return endpoint;
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}GroupId=${encodeURIComponent(groupId.trim())}`;
}

function buildPublicEndpoint(apiUrl: string, voice: string, text: string) {
  const endpoint = apiUrl.trim();
  if (!endpoint) throw new Error('请先填写公共 TTS API 地址。');
  const encodedVoice = encodeURIComponent(voice.trim());
  const encodedText = encodeURIComponent(text.trim());

  if (endpoint.includes('{voice}') || endpoint.includes('{text}')) {
    return endpoint
      .split('{voice}').join(encodedVoice)
      .split('{text}').join(encodedText);
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('公共 TTS API 地址必须是完整 URL。');
  }
  url.searchParams.set('voice', voice.trim());
  url.searchParams.set('text', text.trim());
  return url.toString();
}

function extractJsonErrorMessage(rawText: string, fallback: string) {
  try {
    const payload = JSON.parse(rawText) as Record<string, unknown>;
    const error = payload.error && typeof payload.error === 'object' && !Array.isArray(payload.error)
      ? payload.error as Record<string, unknown>
      : null;
    return String(error?.message ?? payload.message ?? fallback).trim() || fallback;
  } catch {
    return rawText.trim() || fallback;
  }
}

function extractAudioCandidate(payload: unknown): string {
  if (typeof payload === 'string') return payload.trim();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';

  const record = payload as Record<string, unknown>;
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : {};
  const candidates = [
    data.audio,
    data.audioUrl,
    data.audio_url,
    data.audio_file,
    record.audio,
    record.audioUrl,
    record.audio_url,
    record.audio_file
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (value) return value;
  }
  return '';
}

function getMinimaxError(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const record = payload as Record<string, unknown>;
  const baseResp = record.base_resp && typeof record.base_resp === 'object' && !Array.isArray(record.base_resp)
    ? record.base_resp as Record<string, unknown>
    : null;
  const statusCode = Number(baseResp?.status_code ?? record.status_code ?? 0);
  if (!Number.isFinite(statusCode) || statusCode === 0) return '';
  return String(baseResp?.status_msg ?? record.status_msg ?? record.message ?? 'MiniMax TTS 生成失败。').trim();
}

async function normalizeAudioPayload(candidate: string, mimeType: string): Promise<TtsAudioPayload> {
  if (candidate.startsWith('data:')) {
    const matchedMime = candidate.match(/^data:([^;,]+)/i)?.[1] || mimeType;
    return { audioUrl: candidate, mimeType: matchedMime };
  }
  if (/^https?:\/\//i.test(candidate)) return remoteAudioToDataUrl(candidate, mimeType);

  const hexAudioUrl = hexToDataUrl(candidate, mimeType);
  if (hexAudioUrl) return { audioUrl: hexAudioUrl, mimeType };

  const base64AudioUrl = base64ToDataUrl(candidate, mimeType);
  if (base64AudioUrl) return { audioUrl: base64AudioUrl, mimeType };

  throw new Error('MiniMax TTS 没有返回可识别的音频内容。');
}

export async function synthesizeMinimaxSpeech(text: string, settings: MinimaxTtsSettings): Promise<TtsAudioResult> {
  const content = text.trim();
  if (!content) throw new Error('语音内容为空。');
  if (!settings.apiKey.trim()) throw new Error('请先填写 MiniMax API Key。');
  if (!settings.groupId.trim()) throw new Error('请先填写 MiniMax Group ID。');
  if (!settings.voiceId.trim()) throw new Error('请先填写 MiniMax Voice ID。');

  const mimeType = minimaxMimeTypeForFormat(settings.audioFormat);
  const response = await fetch(buildMinimaxEndpoint(settings.apiUrl, settings.groupId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.model,
      text: content,
      stream: false,
      voice_setting: {
        voice_id: settings.voiceId,
        speed: settings.speed,
        vol: settings.volume,
        pitch: settings.pitch
      },
      audio_setting: {
        sample_rate: settings.sampleRate,
        bitrate: settings.bitrate,
        format: settings.audioFormat,
        channel: settings.channel
      }
    })
  });

  const rawText = await response.text();
  let payload: unknown = rawText;
  try {
    payload = JSON.parse(rawText) as unknown;
  } catch {
    if (!response.ok) throw new Error(rawText.trim() || `MiniMax TTS 请求失败：${response.status}`);
  }

  if (!response.ok) {
    const message = getMinimaxError(payload) || rawText.trim() || `MiniMax TTS 请求失败：${response.status}`;
    throw new Error(message);
  }

  const apiError = getMinimaxError(payload);
  if (apiError) throw new Error(apiError);

  const audio = await normalizeAudioPayload(extractAudioCandidate(payload), mimeType);
  return { ...audio, provider: 'minimax', voiceId: settings.voiceId };
}

export async function synthesizeOpenAiSpeech(text: string, settings: AppSettings): Promise<TtsAudioResult> {
  const content = text.trim();
  if (!content) throw new Error('语音内容为空。');
  if (!settings.ttsOpenAi.voice.trim()) throw new Error('请先填写 OpenAI TTS Voice。');
  const resolved = getResolvedOpenAiTtsConfig(settings);
  if (!resolved.endpoint.trim()) throw new Error('请先添加 OpenAI TTS 供应商。');
  if (!resolved.model.trim()) throw new Error('请先同步并选择 OpenAI TTS 模型。');

  const response = await fetch(resolved.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: resolved.model,
      input: content,
      voice: settings.ttsOpenAi.voice,
      response_format: settings.ttsOpenAi.responseFormat,
      speed: settings.ttsOpenAi.speed,
      ...(settings.ttsOpenAi.instructions.trim() ? { instructions: settings.ttsOpenAi.instructions.trim() } : {})
    })
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw new Error(extractJsonErrorMessage(rawText, `OpenAI TTS 请求失败：${response.status}`));
  }

  const audio = await readAudioResponse(response, openAiMimeTypeForFormat(settings.ttsOpenAi.responseFormat));
  return { ...audio, provider: 'openai', voiceId: settings.ttsOpenAi.voice };
}

export async function synthesizePublicSpeech(text: string, settings: PublicTtsSettings): Promise<TtsAudioResult> {
  const content = text.trim();
  if (!content) throw new Error('语音内容为空。');
  if (!settings.voice.trim()) throw new Error('请先填写公共 TTS Voice。');

  const response = await fetch(buildPublicEndpoint(settings.apiUrl, settings.voice, content));
  if (!response.ok) {
    const rawText = await response.text();
    throw new Error(rawText.trim() || `公共 TTS 请求失败：${response.status}`);
  }

  const audio = await readAudioResponse(response, settings.mimeType || 'audio/mpeg');
  return { ...audio, provider: 'public', voiceId: settings.voice };
}

export async function synthesizeSpeech(text: string, settings: AppSettings): Promise<TtsAudioResult> {
  const normalized = normalizeAppSettings(settings);

  if (normalized.ttsProvider === 'openai') return synthesizeOpenAiSpeech(text, normalized);
  if (normalized.ttsProvider === 'minimax') return synthesizeMinimaxSpeech(text, normalized.ttsMinimax);
  const result = await synthesizePublicSpeech(text, normalized.ttsPublic);
  return { ...result, voiceId: result.voiceId || getTtsVoiceForProvider(normalized) };
}