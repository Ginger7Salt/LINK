import { unzipSync } from 'fflate';
import type { ApiVendor, AppSettings, CharacterProfile, ConversationTimeAwarenessSettings, GenerateReplyInput, ImageProviderType, NovelAiModelOption, PollinationsModelOption, PromptContext, UserProfile, VoomComment, VoomFrequency, VoomPost } from '@/types/domain';
import { createId } from '@/utils/id';
import { getCharacterVoomAuthorName } from '@/utils/character';
import { defaultNovelAiModels, defaultPollinationsModels, getImageGenerationSize, getResolvedApiConfig, getResolvedOpenAiImageConfig, getSelectedImageModelOption, novelAiOfficialApiUrl, novelAiProxyApiUrl } from '@/utils/settings';
import { estimateTokenCount } from '@/utils/memory';
import { renderTimeAwarenessPrompt } from '@/utils/timeAwareness';
import { formatContentWithChineseTranslation, normalizeTranslationText } from '@/utils/translation';
import { getVoomFrequencyChance } from '@/utils/voom';
import { buildMomentPrompt, buildPrompt } from './prompt';

const modelSelectionSeparator = '::';
const imageModelSelectionSeparator = '::';

export interface ImageGenerationResult {
  imageUrl: string;
  provider: ImageProviderType;
}

export interface RoleplayQuoteAction {
  messageId: string;
  replyIndex: number;
}

export interface RoleplayMessageActions {
  recallMessageIds: string[];
  quotes: RoleplayQuoteAction[];
  transferDecisions?: Array<{ messageId: string; status: 'accepted' | 'rejected' }>;
}

export type RoleplayStickerPosition = 'before' | 'after';

export interface RoleplayStickerPlacement {
  replyIndex: number;
  position: RoleplayStickerPosition;
  stickers: string[];
}

export type RoleplayReplySegment =
  | { type: 'reply'; content: string; translation?: string }
  | { type: 'narration'; content: string }
  | { type: 'sticker'; stickers: string[] }
  | { type: 'image'; description: string }
  | { type: 'voice'; content: string; duration?: number }
  | { type: 'location'; name: string; address?: string; distance: string }
  | { type: 'transfer'; amount: string; note?: string };

export interface RoleplayReplyResult {
  reply: string;
  replies?: string[];
  replyTranslations?: string[];
  narrations?: string[];
  images?: Array<{ description: string }>;
  stickers?: string[];
  stickerPlacements?: RoleplayStickerPlacement[];
  segments?: RoleplayReplySegment[];
  messageActions?: RoleplayMessageActions;
  profileUpdate: null | {
    nickname: string;
    signature: string;
    narration: string;
    innerMonologue: string[];
  };
}

export interface VoomCommentReplyResult {
  authorName: string;
  content: string;
  contentTranslation?: string;
  parentId?: string;
  draftId?: string;
}

export type UserVoomCommentResult = Pick<VoomComment, 'authorName' | 'authorId' | 'content' | 'contentTranslation' | 'parentId'>;

export interface ImageGenerationOverrides {
  positivePrompt?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  size?: string;
  model?: string;
  seed?: string;
}

function sanitizePrompt(positivePrompt: string, negativePrompt = '') {
  const positive = positivePrompt.trim();
  const negative = negativePrompt.trim();
  if (!positive) return '';
  if (!negative) return positive;
  return `${positive}\n\nAvoid: ${negative}`;
}

function toDataUrlFromBase64(base64: string, mimeType = 'image/png') {
  return `data:${mimeType};base64,${base64}`;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片转码失败。'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
}

function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType = 'image/png') {
  return toDataUrlFromBase64(uint8ArrayToBase64(new Uint8Array(buffer)), mimeType);
}

function extractImageFromArchive(buffer: ArrayBuffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const fileEntry = Object.entries(files).find(([name]) => /\.(png|jpg|jpeg|webp)$/i.test(name))
    ?? Object.entries(files)[0];

  if (!fileEntry) {
    throw new Error('NovelAI returned an empty image archive.');
  }

  const [name, bytes] = fileEntry;
  const mimeType = /\.jpe?g$/i.test(name)
    ? 'image/jpeg'
    : /\.webp$/i.test(name)
      ? 'image/webp'
      : 'image/png';

  return arrayBufferToDataUrl(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mimeType);
}

function parseSeed(seed: string) {
  const trimmed = seed.trim();
  if (!trimmed) return Math.floor(Math.random() * 2_147_483_647);
  const numericSeed = Number(trimmed);
  return Number.isFinite(numericSeed) ? Math.floor(numericSeed) : Math.floor(Math.random() * 2_147_483_647);
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

function createImageDownloadUrl(url: string) {
  const trimmed = url.trim();
  if (canUseLocalTextProxy() && /^https?:\/\//i.test(trimmed)) {
    return `/__image-download?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

function inferImageMimeType(url: string, fallback = 'image/png') {
  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  if (/\.jpe?g$/i.test(pathname)) return 'image/jpeg';
  if (/\.gif$/i.test(pathname)) return 'image/gif';
  if (/\.webp$/i.test(pathname)) return 'image/webp';
  if (/\.avif$/i.test(pathname)) return 'image/avif';
  if (/\.bmp$/i.test(pathname)) return 'image/bmp';
  if (/\.svg$/i.test(pathname)) return 'image/svg+xml';
  return fallback;
}

function normalizeImageMimeType(value: unknown, fallback = 'image/png') {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('image/')) return trimmed;
  if (trimmed === 'jpg') return 'image/jpeg';
  if (trimmed === 'svg') return 'image/svg+xml';
  if (['png', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg+xml'].includes(trimmed)) {
    return `image/${trimmed}`;
  }
  return fallback;
}

function unwrapOpenAiImageEndpoint(endpoint: string) {
  if (!endpoint.startsWith('/__image-proxy')) return endpoint;
  try {
    return new URL(endpoint, window.location.origin).searchParams.get('url')?.trim() || endpoint;
  } catch {
    return endpoint;
  }
}

function isOpenAiResponsesEndpoint(endpoint: string) {
  const unwrappedEndpoint = unwrapOpenAiImageEndpoint(endpoint);
  try {
    return /\/responses\/?$/i.test(new URL(unwrappedEndpoint, window.location.origin).pathname);
  } catch {
    return /\/responses(?:\?|$)/i.test(unwrappedEndpoint);
  }
}

function buildOpenAiImageRequestBody(endpoint: string, model: string, prompt: string, size: string) {
  if (isOpenAiResponsesEndpoint(endpoint)) {
    return {
      model,
      input: prompt,
      tools: [{
        type: 'image_generation',
        action: 'generate',
        ...(size ? { size } : {})
      }],
      tool_choice: 'required'
    };
  }

  return {
    model,
    prompt,
    ...(size ? { size } : {}),
    n: 1
  };
}

const httpStatusText: Record<number, string> = {
  408: 'Request Timeout',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  520: 'Unknown Error',
  522: 'Connection Timed Out',
  524: 'A Timeout Occurred'
};

const transientOpenAiImageStatuses = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524]);
const openAiImageRetryDelays = [1200];

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function parseRetryAfter(value: string | null) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlTagText(payload: string, tagName: string) {
  const match = payload.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? stripHtml(match[1]) : '';
}

function extractCloudflareHost(payload: string) {
  const hostBlock = payload.match(/<div[^>]+id=["']cf-host-status["'][\s\S]*?<\/div>/i)?.[0] ?? '';
  const labels = [...hostBlock.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
  return labels.find((label) => label.includes('.')) ?? '';
}

function extractCloudflareErrorPayload(payload: string) {
  if (!/cloudflare|cf-error-details|cf-wrapper/i.test(payload)) return '';

  const title = extractHtmlTagText(payload, 'title') || extractHtmlTagText(payload, 'h1');
  const errorCode = payload.match(/Error code\s*(\d{3})/i)?.[1] ?? payload.match(/\b(5\d{2}|524)\b/)?.[1] ?? '';
  const rayId = payload.match(/Cloudflare Ray ID:\s*<strong[^>]*>([^<]+)<\/strong>/i)?.[1]?.trim() ?? '';
  const host = extractCloudflareHost(payload);
  const happenedBlock = payload.match(/What happened\?[\s\S]*?<\/h2>([\s\S]*?)(?:<\/div>|<h2)/i)?.[1] ?? '';
  const happened = stripHtml(happenedBlock);

  return [
    title || (errorCode ? `Cloudflare ${errorCode} 错误` : 'Cloudflare 网关错误'),
    host ? `异常主机：${host}` : '',
    rayId ? `Cloudflare Ray ID：${rayId}` : '',
    happened ? `说明：${happened}` : '',
    '这通常表示图片供应商网关或其上游模型服务暂时不可用，不是本地请求格式错误。'
  ].filter(Boolean).join('\n');
}

function formatHttpStatus(response: Response) {
  const statusText = response.statusText.trim() || httpStatusText[response.status] || '';
  return [response.status || '', statusText].filter(Boolean).join(' ');
}

function formatApiErrorPayload(payload: string) {
  const trimmed = payload.trim();
  if (!trimmed) return '';

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    const cloudflareError = extractCloudflareErrorPayload(trimmed);
    if (cloudflareError) return cloudflareError;

    if (/^\s*<!doctype html|^\s*<html[\s>]/i.test(trimmed)) {
      const title = extractHtmlTagText(trimmed, 'title') || extractHtmlTagText(trimmed, 'h1');
      const body = stripHtml(trimmed).slice(0, 800);
      return [title, body && body !== title ? body : ''].filter(Boolean).join('\n') || '上游返回了 HTML 错误页。';
    }

    return trimmed;
  }
}

async function createApiErrorMessage(response: Response, title: string) {
  let details = '';
  try {
    details = formatApiErrorPayload(await response.text());
  } catch (error) {
    details = `读取后台日志失败：${error instanceof Error ? error.message : String(error)}`;
  }

  const status = formatHttpStatus(response);
  return [
    `${title}：${status || '请求失败'}`,
    details ? `后台日志：\n${details}` : ''
  ].filter(Boolean).join('\n\n');
}

async function readJsonPayload(response: Response, title: string) {
  const responseClone = response.clone();
  try {
    return await response.json();
  } catch (error) {
    let details = '';
    try {
      details = formatApiErrorPayload(await responseClone.text());
    } catch {
      details = error instanceof Error ? error.message : String(error);
    }

    const status = formatHttpStatus(response);
    throw new Error([
      `${title}：${status || '返回内容不是 JSON'}`,
      details ? `后台日志：\n${details}` : '请确认当前服务端实际挂载了同源代理，而不是把代理路径回退到了前端页面。'
    ].filter(Boolean).join('\n\n'));
  }
}

function createNetworkErrorMessage(error: unknown, title: string, endpoint: string, hint = '浏览器直连 OpenAI 兼容图片网关可能会被 CORS 或网络策略拦截。本地开发会通过同源代理请求；如果仍失败，请确认网关可访问、支持图片生成路径，并且 API Key 与模型可用。') {
  const message = error instanceof Error ? error.message : String(error);
  return [
    `${title}：${message || '网络请求失败'}`,
    `请求地址：${endpoint}`,
    hint
  ].join('\n\n');
}

function isLocalProxyHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized === '[::1]'
    || /^10\./.test(normalized)
    || /^192\.168\./.test(normalized)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    || /^169\.254\./.test(normalized);
}

function canUseLocalTextProxy() {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  if (!['http:', 'https:'].includes(window.location.protocol)) return false;
  return isLocalProxyHostname(window.location.hostname);
}

function createTextRequestEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();
  if (canUseLocalTextProxy() && /^https?:\/\//i.test(trimmed)) {
    return `/__text-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

function createTextNetworkErrorMessage(error: unknown, endpoint: string, requestEndpoint: string) {
  return createNetworkErrorMessage(
    error,
    '文本模型网络请求失败',
    endpoint,
    requestEndpoint.startsWith('/__text-proxy')
      ? '本地同源文本代理没有响应。请确认正在通过 npm run dev 或 npm run preview 访问应用；如果仍失败，请检查本机网络、代理节点、网关地址、API Key 与模型是否可用。'
      : '当前运行环境没有可用的同源文本代理，浏览器直连 OpenAI 兼容聊天网关可能会被 CORS 或网络策略拦截。请使用 npm run dev / npm run preview，或换用支持浏览器跨域的网关。'
  );
}

function createNovelAiRequestEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();
  if (import.meta.env.DEV && /^https?:\/\//i.test(trimmed)) {
    return `/__text-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

function createNovelAiNetworkErrorMessage(error: unknown, endpoint: string) {
  return createNetworkErrorMessage(
    error,
    'NovelAI 生图接口预检网络请求失败',
    endpoint,
    'NovelAI 预检请求无法到达后台。请确认连接方式、网络代理和 Token 可用。开发环境会通过同源代理转发官方接口；如果仍失败，通常是本机网络无法访问对应服务或代理节点异常。'
  );
}

async function fetchNovelAiEndpoint(endpoint: string, init: RequestInit) {
  const requestEndpoint = createNovelAiRequestEndpoint(endpoint);
  try {
    const response = await fetch(requestEndpoint, init);
    return { response, requestEndpoint };
  } catch (error) {
    throw new Error(createNovelAiNetworkErrorMessage(error, endpoint));
  }
}

async function probeNovelAiAuth(settings: AppSettings) {
  const config = settings.imageNovelAi;
  const endpointBase = getNovelAiEndpointBase(settings);
  const endpoints = [
    `${endpointBase}/user/subscription`,
    `${endpointBase}/ai/generate-image/models`,
    `${endpointBase}/ai/models`
  ];

  let lastFailure: Response | null = null;
  for (const endpoint of endpoints) {
    const { response } = await fetchNovelAiEndpoint(endpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`
      }
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('NovelAI Token 无法通过鉴权。');
    }

    if (response.ok) {
      return;
    }

    lastFailure = response;
  }

  if (lastFailure) {
    throw new Error(await createApiErrorMessage(lastFailure, 'NovelAI 鉴权/模型接口探测失败'));
  }
}

function getOpenAiImageErrorTitle(response: Response, endpoint: string) {
  if (endpoint.startsWith('/__image-proxy')) {
    return response.headers.get('x-link-proxy-error')
      ? '本地 OpenAI 兼容图片代理请求失败'
      : 'OpenAI 兼容图片网关请求失败';
  }

  return 'OpenAI 图片请求失败';
}

async function fetchOpenAiImageWithRetry(endpoint: string, init: RequestInit) {
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt <= openAiImageRetryDelays.length; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(endpoint, init);
    } catch (error) {
      lastNetworkError = error;
      if (attempt >= openAiImageRetryDelays.length) break;
      await wait(openAiImageRetryDelays[attempt]);
      continue;
    }

    if (!response.ok && transientOpenAiImageStatuses.has(response.status) && attempt < openAiImageRetryDelays.length) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      await wait(retryAfter || openAiImageRetryDelays[attempt]);
      continue;
    }

    return response;
  }

  throw lastNetworkError ?? new Error('图片请求失败。');
}

function normalizeImageSource(value: unknown) {
  return normalizeImageSourceWithMime(value).imageUrl;
}

function normalizeImageSourceWithMime(value: unknown, mimeType = 'image/png') {
  const source = String(value ?? '').trim();
  if (!source) {
    return {
      imageUrl: '',
      mimeType
    };
  }
  if (/^(?:data:image\/|blob:)/i.test(source)) {
    return {
      imageUrl: source,
      mimeType
    };
  }
  if (/^https?:/i.test(source)) {
    return {
      imageUrl: source,
      mimeType: inferImageMimeType(source, mimeType)
    };
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(source) && source.length > 80) {
    return {
      imageUrl: toDataUrlFromBase64(source, mimeType),
      mimeType
    };
  }
  return {
    imageUrl: '',
    mimeType
  };
}

async function localizeGeneratedImageUrl(imageUrl: string, fallbackMimeType = 'image/png') {
  const trimmed = imageUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  try {
    const response = await fetch(createImageDownloadUrl(trimmed), {
      headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
    });
    if (!response.ok) {
      throw new Error(`图片下载代理返回 ${formatHttpStatus(response) || '请求失败'}`);
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    const downloadedBlob = await response.blob();
    if (!downloadedBlob.size) throw new Error('图片下载结果为空。');

    const mimeType = normalizeImageMimeType(downloadedBlob.type || contentType || inferImageMimeType(trimmed, fallbackMimeType), fallbackMimeType);
    if (!mimeType.startsWith('image/')) throw new Error(`图片下载返回了非图片内容：${mimeType}`);

    return readBlobAsDataUrl(downloadedBlob.type ? downloadedBlob : new Blob([downloadedBlob], { type: mimeType }));
  } catch (error) {
    throw new Error(`OpenAI 图片接口返回了远程图片地址，但本地化下载失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractGeneratedImage(payload: unknown, fallbackMimeType = 'image/png'): { imageUrl: string; mimeType: string } {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const image = extractGeneratedImage(item, fallbackMimeType);
      if (image.imageUrl) return image;
    }
    return { imageUrl: '', mimeType: fallbackMimeType };
  }

  if (!payload || typeof payload !== 'object') {
    return normalizeImageSourceWithMime(payload, fallbackMimeType);
  }

  const record = payload as Record<string, unknown>;
  const candidateMimeType = normalizeImageMimeType(
    record.output_format
      ?? record.outputFormat
      ?? record.mime_type
      ?? record.mimeType
      ?? record.content_type
      ?? record.contentType
      ?? record.format,
    fallbackMimeType
  );
  const directCandidates = [
    record.url,
    record.imageUrl,
    record.image_url,
    record.outputUrl,
    record.output_url,
    record.resultUrl,
    record.result_url,
    record.b64_json,
    record.b64Json,
    record.base64,
    record.image_base64,
    record.imageBase64,
    record.result_base64,
    record.resultBase64
  ];

  for (const candidate of directCandidates) {
    const image = normalizeImageSourceWithMime(candidate, candidateMimeType);
    if (image.imageUrl) return image;
  }

  const nestedCandidates = [record.data, record.images, record.image, record.imageUrl, record.image_url, record.output, record.result, record.results, record.artifacts];
  for (const candidate of nestedCandidates) {
    const image = extractGeneratedImage(candidate, candidateMimeType);
    if (image.imageUrl) return image;
  }

  return { imageUrl: '', mimeType: fallbackMimeType };
}

function splitModelSelection(selection = '') {
  const trimmed = selection.trim();
  if (!trimmed.includes(modelSelectionSeparator)) {
    return {
      vendorId: '',
      model: trimmed
    };
  }
  const [vendorId, ...modelParts] = trimmed.split(modelSelectionSeparator);
  return {
    vendorId: vendorId.trim(),
    model: modelParts.join(modelSelectionSeparator).trim()
  };
}

function splitImageModelSelection(selection = '') {
  const trimmed = selection.trim();
  if (!trimmed.includes(imageModelSelectionSeparator)) {
    return {
      vendorId: '',
      model: trimmed
    };
  }

  const [vendorId, ...modelParts] = trimmed.split(imageModelSelectionSeparator);
  return {
    vendorId: vendorId.trim(),
    model: modelParts.join(imageModelSelectionSeparator).trim()
  };
}

function extractJsonContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function normalizeTextFragments(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeTextFragments(item));
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const content = String(value).trim();
    return content ? [content] : [];
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.content, record.text, record.message, record.reply];
    for (const candidate of candidates) {
      const fragments = normalizeTextFragments(candidate);
      if (fragments.length) return fragments;
    }
  }
  return [];
}

function normalizeReplyMessages(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return normalizeTextFragments(payload);
  }

  const record = payload as Record<string, unknown>;
  const candidates = [record.replies, record.reply, record.messages, record.content, record.message, record.text, record.response, record.output];
  for (const candidate of candidates) {
    const replies = normalizeTextFragments(candidate);
    if (replies.length) return replies;
  }
  return [];
}

function normalizeTranslationFragments(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeTranslationFragments(item));
  if (typeof value === 'string' || typeof value === 'number') {
    const content = normalizeTranslationText(value);
    return content ? [content] : [];
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.contentTranslation, record.translation, record.translationZh, record.chineseTranslation, record.chinese, record.zh, record.cn, record.translatedContent];
    for (const candidate of candidates) {
      const fragments = normalizeTranslationFragments(candidate);
      if (fragments.length) return fragments;
    }
  }
  return [];
}

function normalizeTranslationSlot(value: unknown) {
  return normalizeTranslationFragments(value).join('\n');
}

function normalizeTranslationList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => normalizeTranslationSlot(item));
  const translation = normalizeTranslationSlot(value);
  return translation ? [translation] : [];
}

function normalizeNestedTranslationFragments(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => normalizeTranslationSlot(item));
  if (value && typeof value === 'object') return normalizeTranslationList(value);
  return [];
}

function normalizeTranslationMessages(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return normalizeTranslationFragments(payload);
  }

  const record = payload as Record<string, unknown>;
  const candidates = [record.replyTranslations, record.translations, record.translationTexts, record.chineseTranslations, record.translation, record.contentTranslation];
  for (const candidate of candidates) {
    const translations = normalizeTranslationList(candidate);
    if (translations.length) return translations;
  }

  const nestedCandidates = [record.replies, record.messages, record.reply, record.content, record.message, record.text];
  for (const candidate of nestedCandidates) {
    const translations = normalizeNestedTranslationFragments(candidate);
    if (translations.length) return translations;
  }
  return [];
}

function normalizeStickerSelections(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeStickerSelections(item));
  if (typeof value === 'string' || typeof value === 'number') {
    const content = String(value).trim();
    return content ? [content] : [];
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.stickerId, record.id, record.description, record.name, record.label, record.text];
    for (const candidate of candidates) {
      const selections = normalizeStickerSelections(candidate);
      if (selections.length) return selections;
    }
    return normalizeStickerSelections(record.stickers ?? record.stickerIds ?? record.sticker);
  }
  return [];
}

function normalizeStickerPosition(value: unknown, fallback: RoleplayStickerPosition = 'after'): RoleplayStickerPosition {
  const position = String(value ?? '').trim().toLocaleLowerCase();
  return position === 'before' || position === 'after' ? position : fallback;
}

function normalizeStickerPlacementRecord(value: unknown, fallbackReplyIndex = 0, fallbackPosition: RoleplayStickerPosition = 'after'): RoleplayStickerPlacement[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const rawReplyIndex = Number(record.replyIndex ?? record.index ?? record.messageIndex ?? record.replyNumber);
  const replyIndex = Number.isFinite(rawReplyIndex)
    ? Math.max(0, Math.floor(rawReplyIndex))
    : fallbackReplyIndex;
  const position = normalizeStickerPosition(record.position ?? record.placement ?? record.where, fallbackPosition);
  const directSelections = [
    ...normalizeStickerSelections(record.stickers),
    ...normalizeStickerSelections(record.stickerIds),
    ...normalizeStickerSelections(record.sticker),
    ...normalizeStickerSelections(record.stickerId)
  ];
  const fallbackSelections = directSelections.length ? [] : normalizeStickerSelections(record.id ?? record.description ?? record.name ?? record.label ?? record.text);
  const stickers = [...new Set([...directSelections, ...fallbackSelections].map((item) => item.trim()).filter(Boolean))];
  return stickers.length ? [{ replyIndex, position, stickers }] : [];
}

function normalizeStickerPlacements(value: unknown): RoleplayStickerPlacement[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeStickerPlacements(item));
  return normalizeStickerPlacementRecord(value);
}

function normalizeReplyStickerPlacements(value: unknown): RoleplayStickerPlacement[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const inlinePosition = normalizeStickerPosition(record.stickerPosition ?? record.position, 'after');
      return [
        ...normalizeStickerPlacementRecord({ replyIndex: index, position: 'before', stickers: record.stickersBefore ?? record.beforeStickers ?? record.stickerBefore }, index, 'before'),
        ...normalizeStickerPlacementRecord({ replyIndex: index, position: inlinePosition, stickers: record.stickers ?? record.stickerIds ?? record.sticker }, index, inlinePosition),
        ...normalizeStickerPlacementRecord({ replyIndex: index, position: 'after', stickers: record.stickersAfter ?? record.afterStickers ?? record.stickerAfter }, index, 'after')
      ];
    });
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return normalizeReplyStickerPlacements(record.replies ?? record.messages ?? record.reply ?? record.message ?? record.content);
  }
  return [];
}

function normalizeInnerMonologueLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeInnerMonologueLines(item));
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.innerMonologue, record.innerThoughts, record.thoughts, record.statusLines, record.lines, record.content, record.text];
    for (const candidate of candidates) {
      const lines = normalizeInnerMonologueLines(candidate);
      if (lines.length) return lines;
    }
  }
  return [];
}

function normalizeNarrationLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeNarrationLines(item));
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.narration, record.content, record.text, record.message, record.description];
    for (const candidate of candidates) {
      const lines = normalizeNarrationLines(candidate);
      if (lines.length) return lines;
    }
  }
  return [];
}

function normalizeImageDescriptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeImageDescriptions(item));
  if (typeof value === 'string' || typeof value === 'number') {
    const content = String(value).trim();
    return content ? [content] : [];
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.description, record.imageDescription, record.prompt, record.content, record.text, record.message];
    for (const candidate of candidates) {
      const descriptions = normalizeImageDescriptions(candidate);
      if (descriptions.length) return descriptions;
    }
    return normalizeImageDescriptions(record.images ?? record.image);
  }
  return [];
}

function normalizeLocationText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function normalizeLocationSegment(record: Record<string, unknown>): RoleplayReplySegment[] {
  const name = normalizeLocationText(record.name)
    || normalizeLocationText(record.placeName)
    || normalizeLocationText(record.locationName)
    || normalizeLocationText(record.title)
    || normalizeLocationText(record.place)
    || normalizeLocationText(record.poi);
  const address = normalizeLocationText(record.address)
    || normalizeLocationText(record.detail)
    || normalizeLocationText(record.description);
  const distance = normalizeLocationText(record.distance)
    || normalizeLocationText(record.distanceText)
    || normalizeLocationText(record.distanceFromUser)
    || normalizeLocationText(record.distanceToUser)
    || normalizeLocationText(record.distanceFromCharacter)
    || normalizeLocationText(record.distanceToCharacter);
  if (!name || !distance) return [];
  return [{
    type: 'location',
    name,
    ...(address && address !== name ? { address } : {}),
    distance
  }];
}

function normalizeTransferAmount(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).replace(/[￥¥,\s]/g, '').trim();
  return '';
}

function normalizeTransferSegment(record: Record<string, unknown>): RoleplayReplySegment[] {
  const amount = normalizeTransferAmount(record.amount)
    || normalizeTransferAmount(record.money)
    || normalizeTransferAmount(record.value)
    || normalizeTransferAmount(record.total);
  if (!amount || !/^\d+(?:\.\d{1,2})?$/.test(amount)) return [];
  const note = normalizeLocationText(record.note)
    || normalizeLocationText(record.remark)
    || normalizeLocationText(record.message)
    || normalizeLocationText(record.description);
  return [{
    type: 'transfer',
    amount,
    ...(note ? { note } : {})
  }];
}

function normalizeSegmentType(value: unknown): RoleplayReplySegment['type'] | '' {
  const type = String(value ?? '').trim().toLocaleLowerCase();
  if (['reply', 'message', 'bubble', 'text'].includes(type)) return 'reply';
  if (['narration', 'narrative', 'action', 'system'].includes(type)) return 'narration';
  if (['sticker', 'stickers', 'emoji', 'emote'].includes(type)) return 'sticker';
  if (['image', 'picture', 'photo', 'pic'].includes(type)) return 'image';
  if (['voice', 'audio', 'voice_message', 'voice-message', 'speech'].includes(type)) return 'voice';
  if (['location', 'map', 'position', 'geo', 'geolocation', '定位', '位置'].includes(type)) return 'location';
  if (['transfer', 'money', 'payment', 'redpacket', 'red_packet', '转账', '付款'].includes(type)) return 'transfer';
  return '';
}

function normalizeRoleplaySegment(value: unknown, narrationEnabled: boolean): RoleplayReplySegment[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeRoleplaySegment(item, narrationEnabled));
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const type = normalizeSegmentType(record.type ?? record.kind ?? record.role);
  if (type === 'sticker') {
    const stickers = [...new Set([
      ...normalizeStickerSelections(record.stickers),
      ...normalizeStickerSelections(record.stickerIds),
      ...normalizeStickerSelections(record.sticker),
      ...normalizeStickerSelections(record.stickerId),
      ...normalizeStickerSelections(record.id)
    ].map((item) => item.trim()).filter(Boolean))];
    return stickers.length ? [{ type: 'sticker', stickers }] : [];
  }

  if (type === 'narration') {
    if (!narrationEnabled) return [];
    return normalizeNarrationLines(record.content ?? record.narration ?? record.text ?? record.message ?? record.description)
      .map((content) => ({ type: 'narration' as const, content }));
  }

  if (type === 'reply') {
    const replies = normalizeTextFragments(record.content ?? record.reply ?? record.message ?? record.text);
    const translations = normalizeTranslationList(record.translation ?? record.contentTranslation ?? record.translationZh ?? record.chineseTranslation);
    return replies.map((content, index) => ({
      type: 'reply' as const,
      content,
      ...(translations[index] ? { translation: translations[index] } : {})
    }));
  }

  if (type === 'image') {
    return normalizeImageDescriptions(record.description ?? record.imageDescription ?? record.prompt ?? record.content ?? record.text ?? record.message)
      .map((description) => ({ type: 'image' as const, description }));
  }

  if (type === 'voice') {
    const duration = Number(record.duration ?? record.seconds ?? record.length);
    return normalizeTextFragments(record.content ?? record.transcript ?? record.text ?? record.message ?? record.reply)
      .map((content) => ({
        type: 'voice' as const,
        content,
        ...(Number.isFinite(duration) && duration > 0 ? { duration: Math.round(duration) } : {})
      }));
  }

  if (type === 'location') return normalizeLocationSegment(record);

  if (type === 'transfer') return normalizeTransferSegment(record);

  return [];
}

function normalizeRoleplaySegments(value: unknown, narrationEnabled: boolean): RoleplayReplySegment[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeRoleplaySegment(item, narrationEnabled));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return normalizeRoleplaySegments(record.messages ?? record.items ?? record.sequence ?? record.timeline ?? record.segments, narrationEnabled);
  }
  return [];
}

function normalizeMessageIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeMessageIds(item));
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
      .split(/[\s,，、]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.messageId, record.targetMessageId, record.quoteMessageId, record.recalledMessageId, record.id];
    for (const candidate of candidates) {
      const ids = normalizeMessageIds(candidate);
      if (ids.length) return ids;
    }
  }
  return [];
}

function normalizeReplyIndex(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

function normalizeQuoteActions(value: unknown): RoleplayQuoteAction[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeQuoteActions(item));
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeMessageIds(value).map((messageId) => ({ messageId, replyIndex: 0 }));
  }
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const messageId = normalizeMessageIds(record.messageId ?? record.targetMessageId ?? record.quoteMessageId ?? record.id)[0];
  if (!messageId) return [];
  const replyNumber = Number(record.replyNumber ?? record.replyNo ?? record.messageNumber);
  const replyIndex = Number.isFinite(replyNumber)
    ? Math.max(0, Math.floor(replyNumber) - 1)
    : normalizeReplyIndex(record.replyIndex ?? record.index ?? record.reply, 0);
  return [{ messageId, replyIndex }];
}

function normalizeRoleplayMessageActions(record: Record<string, unknown>): RoleplayMessageActions {
  const actionRecord = record.messageActions && typeof record.messageActions === 'object'
    ? record.messageActions as Record<string, unknown>
    : record.actions && typeof record.actions === 'object'
      ? record.actions as Record<string, unknown>
      : {};
  const recallMessageIds = [...new Set([
    ...normalizeMessageIds(record.recallMessageIds),
    ...normalizeMessageIds(record.recalledMessageIds),
    ...normalizeMessageIds(record.withdrawMessageIds),
    ...normalizeMessageIds(record.withdrawnMessageIds),
    ...normalizeMessageIds(record.recalls),
    ...normalizeMessageIds(record.withdrawals),
    ...normalizeMessageIds(actionRecord.recallMessageIds),
    ...normalizeMessageIds(actionRecord.recalledMessageIds),
    ...normalizeMessageIds(actionRecord.withdrawMessageIds),
    ...normalizeMessageIds(actionRecord.withdrawnMessageIds),
    ...normalizeMessageIds(actionRecord.recalls),
    ...normalizeMessageIds(actionRecord.withdrawals)
  ])];
  const quotes = [
    ...normalizeQuoteActions(record.quotes),
    ...normalizeQuoteActions(record.quoteReplies),
    ...normalizeQuoteActions(record.references),
    ...normalizeQuoteActions(actionRecord.quotes),
    ...normalizeQuoteActions(actionRecord.quoteReplies),
    ...normalizeQuoteActions(actionRecord.references)
  ];
  return { recallMessageIds, quotes };
}

function normalizeRawOnlineReply(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
  const explicitFragments = lines
    .map((line) => line.replace(/^(?:[-*•]|\d+[.)、]|(?:消息|气泡)\s*\d+[:：]?)\s*/, '').trim())
    .filter(Boolean);

  if (lines.length > 1 && explicitFragments.length === lines.length) {
    const allLinesLookSplit = lines.every((line) => /^(?:[-*•]|\d+[.)、]|(?:消息|气泡)\s*\d+[:：]?)/.test(line));
    const allLinesLookShort = lines.every((line) => line.length <= 80);
    if (allLinesLookSplit || allLinesLookShort) return explicitFragments;
  }

  return [trimmed];
}

interface TextApiContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

function getVisualImageParts(input: GenerateReplyInput): TextApiContentPart[] {
  const stickerParts = input.stickerVisionEnabled ? input.messages
    .slice(-12)
    .filter((message) => message.sender === 'user' && message.sticker?.imageUrl)
    .slice(-4)
    .flatMap((message) => [
      {
        type: 'text' as const,
        text: `Sticker image for "${message.sticker?.description ?? 'Sticker'}":`
      },
      {
        type: 'image_url' as const,
        image_url: { url: message.sticker?.imageUrl ?? '' }
      }
    ]) : [];
  const imageParts = input.messages
    .slice(-12)
    .filter((message) => message.sender === 'user' && message.image?.url)
    .slice(-4)
    .flatMap((message) => [
      {
        type: 'text' as const,
        text: [
          `User sent image (${message.image?.kind ?? 'image'}).`,
          message.image?.aiHint ? `Visual context: ${message.image.aiHint}` : ''
        ].filter(Boolean).join(' ')
      },
      {
        type: 'image_url' as const,
        image_url: { url: message.image?.url ?? '' }
      }
    ]);
  return [...stickerParts, ...imageParts];
}

export function estimateRoleplayReplyInputTokens(input: GenerateReplyInput) {
  const prompt = buildPrompt(input);
  const imageParts = getVisualImageParts(input);
  const imageText = imageParts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n');
  const imageCount = imageParts.filter((part) => part.type === 'image_url').length;
  return estimateTokenCount([prompt, imageText].filter(Boolean).join('\n')) + imageCount * 85;
}

interface VoomMomentPayload {
  content: string;
  contentTranslation?: string;
  imageDescription: string;
  likes: string[];
  comments: Array<Pick<VoomComment, 'authorName' | 'content' | 'contentTranslation' | 'parentId'>>;
}

const voomDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function shouldIncludeVoomTimeContext(timeAwareness: ConversationTimeAwarenessSettings | null | undefined) {
  return Boolean(timeAwareness?.enabled);
}

function formatVoomContextTime(timestamp?: number) {
  const normalizedTimestamp = Number(timestamp);
  if (!Number.isFinite(normalizedTimestamp) || normalizedTimestamp <= 0) return '未知';
  return voomDateTimeFormatter.format(normalizedTimestamp);
}

function formatVoomPostPromptContent(post: VoomPost, includeTimeContext: boolean) {
  return [
    includeTimeContext ? `发布时间：${formatVoomContextTime(post.createdAt)}` : '',
    formatContentWithChineseTranslation(post.content, post.contentTranslation),
    post.imageDescription ? `配图描述：${post.imageDescription}` : ''
  ].filter(Boolean).join('\n');
}

function formatVoomCommentPromptLine(comment: VoomComment, includeTimeContext: boolean) {
  const timeText = includeTimeContext ? `（${formatVoomContextTime(comment.createdAt)}）` : '';
  return `${comment.id}｜${comment.authorName}${timeText}: ${formatContentWithChineseTranslation(comment.content, comment.contentTranslation)}`;
}

function createFallbackVoomImageDescription(context: PromptContext, content: string) {
  const source = `${context.character.id}:${content}:${context.messages.length}`;
  const hash = Array.from(source).reduce((total, char) => total + char.charCodeAt(0), 0);
  const options = [
    `和这条动态相配的一张生活随手拍，画面里有${context.character.nickname}最近状态里的细节。`,
    `一张方形社交配图，记录${context.character.nickname}当天看到的小场景，氛围自然日常。`,
    '一张像朋友圈随手发布的生活照片，画面简单，重点是当下的物品、光线和环境。',
    '一张和动态内容相呼应的日常配图，构图干净，像手机相册里刚拍下来的照片。'
  ];
  return options[Math.abs(hash) % options.length];
}

function normalizeVoomMomentComments(input: unknown): VoomMomentPayload['comments'] {
  if (!Array.isArray(input)) return [];
  const comments: VoomMomentPayload['comments'] = [];
  for (const comment of input) {
    if (!comment || typeof comment !== 'object') continue;
    const entry = comment as Record<string, unknown>;
    const authorName = String(entry.authorName ?? '').trim();
    const content = String(entry.content ?? '').trim();
    const contentTranslation = normalizeTranslationText(entry.contentTranslation ?? entry.translation ?? entry.translationZh ?? entry.chineseTranslation);
    const parentId = String(entry.parentId ?? '').trim();
    if (!authorName || !content) continue;
    comments.push({
      authorName,
      content,
      ...(contentTranslation ? { contentTranslation } : {}),
      parentId
    });
  }
  return comments;
}

function parseVoomMomentPayload(rawContent: string, context: PromptContext): VoomMomentPayload {
  const fallbackContent = context.mode === 'offline' ? '回去路上有点安静。' : '刚刚看到自动贩卖机出了新口味。';
  const trimmed = rawContent.trim();

  if (!trimmed) {
    return {
      content: fallbackContent,
      imageDescription: createFallbackVoomImageDescription(context, fallbackContent),
      likes: [],
      comments: []
    };
  }

  try {
    const parsed = JSON.parse(extractJsonContent(trimmed)) as Partial<VoomMomentPayload> & Record<string, unknown>;
    const content = String(parsed.content ?? '').trim() || fallbackContent;
    const contentTranslation = normalizeTranslationText(parsed.contentTranslation ?? parsed.translation ?? parsed.translationZh ?? parsed.chineseTranslation);
    const imageDescription = String(parsed.imageDescription ?? '').trim() || createFallbackVoomImageDescription(context, content);
    const likes = Array.isArray(parsed.likes)
      ? [...new Set(parsed.likes.map((item) => String(item ?? '').trim()).filter(Boolean))]
      : [];
    return {
      content,
      ...(contentTranslation ? { contentTranslation } : {}),
      imageDescription,
      likes,
      comments: normalizeVoomMomentComments(parsed.comments)
    };
  } catch {
    return {
      content: trimmed,
      imageDescription: createFallbackVoomImageDescription(context, trimmed),
      likes: [],
      comments: []
    };
  }
}

function buildVoomImagePrompt(context: PromptContext, content: string, imageDescription: string) {
  const recentMessages = context.messages
    .slice(-6)
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join(' / ')
    .slice(0, 280);

  return [
    'Square LINK VOOM social feed image, candid mobile photo style, realistic composition, natural light, no text overlay',
    `image description: ${imageDescription}`,
    `character: ${context.character.nickname}, ${context.character.description || context.character.signature}`,
    `post text context: ${content}`,
    recentMessages ? `recent chat context: ${recentMessages}` : ''
  ].filter(Boolean).join(', ');
}

function normalizeVoomCommentReplies(input: unknown, fallbackAuthorName: string, post: VoomPost, blockedAuthorNames: string[] = []): VoomCommentReplyResult[] {
  const replySource = Array.isArray(input)
    ? input
    : typeof input === 'object' && input && Array.isArray((input as { replies?: unknown }).replies)
      ? (input as { replies: unknown[] }).replies
      : [];
  const commentIds = new Set(post.comments.map((comment) => comment.id));
  const blockedAuthors = new Set(blockedAuthorNames.map((name) => name.trim().toLocaleLowerCase()).filter(Boolean));
  const candidates: Array<VoomCommentReplyResult & { rawParentId?: string }> = [];

  for (const entry of replySource) {
    if (candidates.length >= 6 || !entry || typeof entry !== 'object') continue;
    const reply = entry as Record<string, unknown>;
    const authorName = String(reply.authorName ?? '').trim() || fallbackAuthorName;
    if (blockedAuthors.has(authorName.toLocaleLowerCase())) continue;

    const content = String(reply.content ?? '').trim();
    if (!content) continue;

    const contentTranslation = normalizeTranslationText(reply.contentTranslation ?? reply.translation ?? reply.translationZh ?? reply.chineseTranslation);
    const draftId = String(reply.id ?? reply.draftId ?? reply.tempId ?? '').trim();
    candidates.push({
      authorName,
      content,
      ...(contentTranslation ? { contentTranslation } : {}),
      ...(draftId ? { draftId } : {}),
      rawParentId: String(reply.parentId ?? '').trim()
    });
  }

  const draftIds = new Set(candidates.map((reply) => reply.draftId).filter(Boolean));
  const replies: VoomCommentReplyResult[] = [];

  for (const reply of candidates) {
    const parentId = reply.rawParentId ?? '';
    replies.push({
      authorName: reply.authorName,
      content: reply.content,
      ...(reply.contentTranslation ? { contentTranslation: reply.contentTranslation } : {}),
      ...(reply.draftId ? { draftId: reply.draftId } : {}),
      ...(parentId && (commentIds.has(parentId) || draftIds.has(parentId)) ? { parentId } : {})
    });
  }

  return replies;
}

function getResolvedTextApiConfig(settings: AppSettings | undefined, modelOverride = '') {
  const selection = splitModelSelection(modelOverride);
  if (selection.vendorId) {
    const vendor = settings?.apiVendors.find((item) => item.id === selection.vendorId);
    if (vendor) {
      return {
        endpoint: `${normalizeBaseUrl(vendor.apiUrl)}/${vendor.apiPath.trim().replace(/^\/+/, '')}`,
        apiKey: vendor.apiKey,
        model: selection.model || vendor.models.find((model) => model.selected)?.id || vendor.models[0]?.id || ''
      };
    }
  }

  const resolved = getResolvedApiConfig(settings);
  return {
    ...resolved,
    model: selection.model || resolved.model
  };
}

export function hasTextGenerationConfig(settings: AppSettings | undefined, modelOverride = '') {
  const resolved = getResolvedTextApiConfig(settings, modelOverride);
  return Boolean(resolved.endpoint.trim() && resolved.model.trim());
}

function requireTextGenerationConfig(settings: AppSettings | undefined, modelOverride = '', target = 'AI 回复') {
  if (hasTextGenerationConfig(settings, modelOverride)) return;
  throw new Error(`请先配置可用的 API 模型后再使用${target}。`);
}

async function callTextApi(settings: AppSettings | undefined, prompt: string, modelOverride = '', imageParts: TextApiContentPart[] = []) {
  const resolved = getResolvedTextApiConfig(settings, modelOverride);
  if (!resolved.endpoint.trim()) return '';
  const requestEndpoint = createTextRequestEndpoint(resolved.endpoint);

  const content = imageParts.length
    ? [{ type: 'text' as const, text: prompt }, ...imageParts]
    : prompt;

  let response: Response;
  try {
    response = await fetch(requestEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: resolved.model,
        messages: [{ role: 'user', content }],
        temperature: 0.9
      })
    });
  } catch (error) {
    throw new Error(createTextNetworkErrorMessage(error, resolved.endpoint, requestEndpoint));
  }

  if (!response.ok) {
    if (requestEndpoint.startsWith('/__text-proxy') && response.status === 502) {
      throw new Error(await createApiErrorMessage(response, '本地文本模型代理请求失败'));
    }
    throw new Error(await createApiErrorMessage(response, '文本模型 API 请求失败'));
  }

  const data = await readJsonPayload(response, '文本模型 API 返回异常');
  return String(data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? data.content ?? '').trim();
}

export async function fetchVendorModels(vendor: Pick<ApiVendor, 'apiUrl' | 'apiKey'>): Promise<string[]> {
  const modelsEndpoint = `${vendor.apiUrl.trim().replace(/\/+$/, '')}/models`;
  if (!vendor.apiUrl.trim()) return [];
  const requestEndpoint = createTextRequestEndpoint(modelsEndpoint);

  let response: Response;
  try {
    response = await fetch(requestEndpoint, {
      headers: {
        Accept: 'application/json',
        ...(vendor.apiKey ? { Authorization: `Bearer ${vendor.apiKey}` } : {})
      }
    });
  } catch (error) {
    throw new Error(createNetworkErrorMessage(
      error,
      '模型列表网络请求失败',
      modelsEndpoint,
      requestEndpoint.startsWith('/__text-proxy')
        ? '本地同源文本代理没有响应。请确认正在通过 npm run dev 或 npm run preview 访问应用，并检查网关 /models 路径是否可达。'
        : '当前运行环境没有可用的同源文本代理，浏览器直连模型列表接口可能会被 CORS 或网络策略拦截。'
    ));
  }

  if (!response.ok) {
    if (requestEndpoint.startsWith('/__text-proxy') && response.status === 502) {
      throw new Error(await createApiErrorMessage(response, '本地文本模型代理请求失败'));
    }
    throw new Error(await createApiErrorMessage(response, '模型列表 API 请求失败'));
  }

  const data = await readJsonPayload(response, '模型列表 API 返回异常');
  const list: Array<Record<string, unknown>> = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.models)
      ? data.models
      : [];

  return list
    .map((item) => String(item?.id ?? item?.name ?? '').trim())
    .filter(Boolean);
}

export async function generateOpenAiImage(settings: AppSettings, overrides: ImageGenerationOverrides = {}): Promise<ImageGenerationResult> {
  const resolved = getResolvedOpenAiImageConfig(settings);
  const positivePrompt = overrides.positivePrompt ?? settings.imageOpenAi.positivePrompt;
  const negativePrompt = overrides.negativePrompt ?? settings.imageOpenAi.negativePrompt;
  const prompt = sanitizePrompt(positivePrompt, negativePrompt);
  const model = String(overrides.model ?? resolved.model).trim();
  const size = String(overrides.size ?? resolved.size).trim();

  if (!resolved.endpoint.trim() || !resolved.apiKey.trim()) {
    throw new Error('请先在 OpenAI 图片模块里配置可用的兼容供应商和 API Key。');
  }

  if (!model) {
    throw new Error('请先为 OpenAI 兼容供应商选择或手动添加图片模型。');
  }

  if (!prompt) {
    throw new Error('请先填写正向提示词。');
  }

  let response: Response;
  try {
    response = await fetchOpenAiImageWithRetry(resolved.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolved.apiKey}`
      },
      body: JSON.stringify(buildOpenAiImageRequestBody(resolved.endpoint, model, prompt, size))
    });
  } catch (error) {
    throw new Error(createNetworkErrorMessage(error, 'OpenAI 图片网络请求失败', resolved.endpoint));
  }

  if (!response.ok) {
    throw new Error(await createApiErrorMessage(response, getOpenAiImageErrorTitle(response, resolved.endpoint)));
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';

  if (contentType.startsWith('image/')) {
    return {
      imageUrl: arrayBufferToDataUrl(await response.arrayBuffer(), contentType),
      provider: 'openai'
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`OpenAI 图片接口返回了无法解析的响应：${error instanceof Error ? error.message : String(error)}`);
  }

  const extractedImage = extractGeneratedImage(data);
  const imageUrl = extractedImage.imageUrl
    ? await localizeGeneratedImageUrl(extractedImage.imageUrl, extractedImage.mimeType)
    : '';

  if (!imageUrl) {
    throw new Error('OpenAI 图片接口返回里没有可用图片。');
  }

  return {
    imageUrl,
    provider: 'openai'
  };
}

export async function generateNovelAiImage(settings: AppSettings, overrides: ImageGenerationOverrides = {}): Promise<ImageGenerationResult> {
  const config = settings.imageNovelAi;
  const positivePrompt = overrides.positivePrompt ?? config.positivePrompt;
  const negativePrompt = overrides.negativePrompt ?? config.negativePrompt;
  const endpointBase = getNovelAiEndpointBase(settings);
  const generationEndpoint = `${endpointBase}/ai/generate-image`;

  if (!endpointBase) {
    throw new Error('请先选择 NovelAI 的连接方式。');
  }

  if (!config.apiKey.trim()) {
    throw new Error('请先填写 NovelAI Token。');
  }

  if (!positivePrompt.trim()) {
    throw new Error('请先填写正向提示词。');
  }

  const { response, requestEndpoint } = await fetchNovelAiEndpoint(generationEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`
    },
    body: JSON.stringify({
      action: 'generate',
      input: positivePrompt.trim(),
      model: overrides.model ?? config.model,
      parameters: {
        negative_prompt: negativePrompt.trim(),
        width: Math.max(320, Math.floor(overrides.width ?? config.width)),
        height: Math.max(320, Math.floor(overrides.height ?? config.height)),
        scale: config.guidance,
        sampler: config.sampler,
        steps: config.steps,
        seed: parseSeed(overrides.seed ?? config.seed),
        n_samples: 1,
        ucPreset: config.ucPreset,
        qualityToggle: config.qualityToggle,
        sm: config.sm,
        sm_dyn: config.smDyn,
        dynamic_thresholding: config.dynamicThresholding,
        legacy: false,
        add_original_image: false,
        uncond_scale: 1,
        cfg_rescale: config.cfgRescale,
        noise_schedule: config.noiseSchedule
      }
    })
  });

  if (!response.ok) {
    if (requestEndpoint.startsWith('/__text-proxy') && response.status === 502) {
      throw new Error(await createApiErrorMessage(response, '本地 NovelAI 代理请求失败'));
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('NovelAI Token 无法通过鉴权。');
    }
    throw new Error(await createApiErrorMessage(response, 'NovelAI 请求失败'));
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = await response.arrayBuffer();

  return {
    imageUrl: /zip|octet-stream/i.test(contentType)
      ? extractImageFromArchive(buffer)
      : arrayBufferToDataUrl(buffer, contentType.startsWith('image/') ? contentType : 'image/png'),
    provider: 'novelai'
  };
}

export async function fetchNovelAiModels(settings: AppSettings): Promise<NovelAiModelOption[]> {
  const config = settings.imageNovelAi;
  const endpointBase = getNovelAiEndpointBase(settings);

  if (!config.apiKey.trim()) {
    return defaultNovelAiModels;
  }

  const modelListEndpoints = [
    `${endpointBase}/ai/generate-image/models`,
    `${endpointBase}/ai/models`
  ];

  for (const endpoint of modelListEndpoints) {
    try {
      const { response } = await fetchNovelAiEndpoint(endpoint, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`
        }
      });

      if (!response.ok) continue;
      const payload = await response.json();
      const models = normalizeNovelAiModelPayload(payload);
      if (models.length) return models;
    } catch {
      continue;
    }
  }

  return defaultNovelAiModels;
}

export async function checkNovelAiImageAccess(settings: AppSettings): Promise<void> {
  const config = settings.imageNovelAi;

  if (!config.apiKey.trim()) {
    throw new Error('请先填写 NovelAI Token。');
  }

  await probeNovelAiAuth(settings);
}

export async function generatePollinationsImage(settings: AppSettings, overrides: ImageGenerationOverrides = {}): Promise<ImageGenerationResult> {
  const config = settings.imagePollinations;
  const positivePrompt = overrides.positivePrompt ?? config.positivePrompt;
  const negativePrompt = overrides.negativePrompt ?? config.negativePrompt;

  if (!config.apiKey.trim()) {
    throw new Error('请先填写 Pollinations API Key。文档要求生成请求使用 Bearer key。');
  }

  if (!positivePrompt.trim()) {
    throw new Error('请先填写正向提示词。');
  }

  const promptPath = encodeURIComponent(positivePrompt.trim());
  const url = new URL(`https://gen.pollinations.ai/image/${promptPath}`);
  url.searchParams.set('model', overrides.model ?? config.model);
  url.searchParams.set('width', String(Math.max(320, Math.floor(overrides.width ?? config.width))));
  url.searchParams.set('height', String(Math.max(320, Math.floor(overrides.height ?? config.height))));
  url.searchParams.set('seed', (overrides.seed ?? config.seed).trim() ? String(parseSeed(overrides.seed ?? config.seed)) : '-1');
  url.searchParams.set('safe', config.safe);
  url.searchParams.set('quality', config.quality);
  url.searchParams.set('transparent', String(config.transparent));
  if (config.referenceImage.trim()) url.searchParams.set('image', config.referenceImage.trim());
  if (negativePrompt.trim()) {
    url.searchParams.set('negative', negativePrompt.trim());
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.apiKey.trim()}` }
  });

  if (!response.ok) {
    throw new Error(await createApiErrorMessage(response, 'Pollinations 请求失败'));
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = await response.arrayBuffer();

  return {
    imageUrl: arrayBufferToDataUrl(buffer, contentType.startsWith('image/') ? contentType : 'image/jpeg'),
    provider: 'pollinations'
  };
}

export async function fetchPollinationsModels(): Promise<PollinationsModelOption[]> {
  try {
    const response = await fetch('https://gen.pollinations.ai/image/models', {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return defaultPollinationsModels;
    const payload = await response.json();
    const models = normalizePollinationsModelPayload(payload);
    return models.length ? models : defaultPollinationsModels;
  } catch {
    return defaultPollinationsModels;
  }
}

export async function checkPollinationsImageAccess(settings: AppSettings): Promise<void> {
  const config = settings.imagePollinations;
  if (!config.apiKey.trim()) {
    throw new Error('请先填写 Pollinations API Key。');
  }

  const promptPath = encodeURIComponent('link health check');
  const url = new URL(`https://gen.pollinations.ai/image/${promptPath}`);
  url.searchParams.set('model', config.model || defaultPollinationsModels[0].id);
  url.searchParams.set('width', '64');
  url.searchParams.set('height', '64');
  url.searchParams.set('seed', '-1');
  url.searchParams.set('safe', config.safe);
  url.searchParams.set('quality', config.quality);
  url.searchParams.set('transparent', String(config.transparent));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.apiKey.trim()}` }
  });

  if (!response.ok) {
    throw new Error(await createApiErrorMessage(response, 'Pollinations 生图接口检测失败'));
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Pollinations 检测返回的不是图片内容。');
  }
}

export async function generateImageByProvider(
  provider: ImageProviderType,
  settings: AppSettings,
  overrides: ImageGenerationOverrides = {}
): Promise<ImageGenerationResult> {
  if (provider === 'openai') return generateOpenAiImage(settings, overrides);
  if (provider === 'novelai') return generateNovelAiImage(settings, overrides);
  return generatePollinationsImage(settings, overrides);
}

export async function generateRoleplayReply(input: GenerateReplyInput): Promise<string> {
  requireTextGenerationConfig(input.settings, input.modelOverride, '角色回复');
  const prompt = buildPrompt(input);
  const apiReply = await callTextApi(input.settings, prompt, input.modelOverride, getVisualImageParts(input));
  if (apiReply) {
    try {
      const parsed = JSON.parse(extractJsonContent(apiReply)) as unknown;
      const parsedRecord = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Partial<RoleplayReplyResult>
        : {};
      const replies = normalizeReplyMessages(parsed);
      const parsedRecordAny = parsedRecord as Record<string, unknown>;
      const replyTranslations = normalizeTranslationMessages(parsed);
      const narrations = input.mode === 'online' && input.narrationModeEnabled
        ? normalizeNarrationLines(parsedRecordAny.narrations ?? parsedRecordAny.narrationMessages ?? parsedRecordAny.actionNarrations ?? parsedRecordAny.actions)
        : [];
      const segments = normalizeRoleplaySegments(
        parsedRecordAny.messages ?? parsedRecordAny.items ?? parsedRecordAny.sequence ?? parsedRecordAny.timeline ?? parsedRecordAny.segments,
        input.mode === 'online' && Boolean(input.narrationModeEnabled)
      );
      const messageActions = normalizeRoleplayMessageActions(parsedRecordAny);
      const images = normalizeImageDescriptions(parsedRecordAny.images ?? parsedRecordAny.imageMessages ?? parsedRecordAny.pictures)
        .map((description) => ({ description }));
      const profileUpdateRecord = parsedRecord.profileUpdate && typeof parsedRecord.profileUpdate === 'object'
        ? parsedRecord.profileUpdate as Record<string, unknown>
        : null;
      const stickers = [...new Set([
        ...normalizeStickerSelections(parsedRecord.stickers),
        ...normalizeStickerSelections(parsedRecordAny.stickerIds),
        ...normalizeStickerSelections(parsedRecordAny.sticker)
      ].map((item) => item.trim()).filter(Boolean))];
      const stickerPlacements = [
        ...normalizeStickerPlacements(parsedRecordAny.stickerPlacements),
        ...normalizeStickerPlacements(parsedRecordAny.replyStickers),
        ...normalizeStickerPlacements(parsedRecordAny.stickerMessages),
        ...normalizeReplyStickerPlacements(parsedRecordAny.replies ?? parsedRecordAny.messages)
      ];
      return JSON.stringify({
        reply: replies[0] ?? '',
        replies,
        replyTranslations,
        narrations: narrations.slice(0, 3),
        images,
        stickers,
        stickerPlacements,
        segments,
        messageActions,
        profileUpdate: profileUpdateRecord
          ? {
              nickname: String(profileUpdateRecord.nickname ?? '').trim(),
              signature: String(profileUpdateRecord.signature ?? '').trim(),
              narration: String(profileUpdateRecord.narration ?? '').trim(),
              innerMonologue: normalizeInnerMonologueLines(
                profileUpdateRecord.innerMonologue
                ?? profileUpdateRecord.innerThoughts
                ?? profileUpdateRecord.thoughts
                ?? profileUpdateRecord.statusLines
              ).slice(0, 5)
            }
          : null
      } satisfies RoleplayReplyResult);
    } catch {
      const replies = input.mode === 'online' ? normalizeRawOnlineReply(apiReply) : [apiReply];
      return JSON.stringify({ reply: replies[0] ?? '', replies, narrations: [], images: [], stickers: [], stickerPlacements: [], segments: [], messageActions: { recallMessageIds: [], quotes: [] }, profileUpdate: null } satisfies RoleplayReplyResult);
    }
  }
  throw new Error('角色回复模型没有返回内容。');
}

export async function generateVoomPost(context: PromptContext, settings?: AppSettings, modelOverride = ''): Promise<Omit<VoomPost, 'id' | 'createdAt'>> {
  const prompt = buildMomentPrompt(context);
  const apiReply = await callTextApi(settings, prompt, modelOverride);

  await new Promise((resolve) => window.setTimeout(resolve, 500));

  const { content, contentTranslation, imageDescription, likes, comments } = parseVoomMomentPayload(apiReply, context);
  const imagePrompt = buildVoomImagePrompt(context, content, imageDescription);
  const selectedImageModel = getSelectedImageModelOption(settings, 'voom');
  const imageProvider = selectedImageModel?.provider ?? null;
  let imageResult: ImageGenerationResult | null = null;

  if (settings && imageProvider && selectedImageModel) {
    let imageSettings = settings;
    const imageSize = getImageGenerationSize(settings, imageProvider);
    const imageOverrides: ImageGenerationOverrides = {
      positivePrompt: imagePrompt,
      size: imageSize.size,
      width: imageSize.width,
      height: imageSize.height,
      model: selectedImageModel.model
    };

    if (imageProvider === 'openai') {
      const selected = splitImageModelSelection(selectedImageModel.model);
      if (selected.vendorId) {
        imageSettings = {
          ...settings,
          imageOpenAi: {
            ...settings.imageOpenAi,
            activeVendorId: selected.vendorId
          }
        };
      }
      if (selected.model) imageOverrides.model = selected.model;
    }

    try {
      imageResult = await generateImageByProvider(imageProvider, imageSettings, imageOverrides);
    } catch {
      imageResult = null;
    }
  }

  const fallbackImage = settings && imageProvider && !imageResult ? '/load.jpg' : undefined;
  const resolvedImage = imageResult?.imageUrl ?? fallbackImage;
  const resolvedProvider = imageResult?.provider ?? (fallbackImage ? 'local' : 'mock');
  const resolvedImageSize = settings && imageProvider ? getImageGenerationSize(settings, imageProvider).size : undefined;

  return {
    charId: context.character.id,
    conversationId: context.messages[0]?.conversationId,
    authorName: context.character.nickname,
    authorAvatar: context.character.avatar,
    content,
    contentTranslation,
    image: resolvedImage,
    imageDescription,
    imageProvider: resolvedProvider,
    imageCandidates: resolvedImage
      ? [{ id: createId('voom-image'), image: resolvedImage, description: imageDescription, provider: resolvedProvider, model: selectedImageModel?.label, size: resolvedImageSize, createdAt: Date.now() }]
      : undefined,
    likes,
    comments: comments.map((comment) => ({
      id: createId('comment'),
      authorName: comment.authorName,
      content: comment.content,
      contentTranslation: comment.contentTranslation,
      parentId: comment.parentId || undefined
    }))
  };
}

function normalizeUserVoomComments(input: unknown, targetCharacters: CharacterProfile[]): UserVoomCommentResult[] {
  const source = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray((input as { comments?: unknown }).comments)
      ? (input as { comments: unknown[] }).comments
      : [];
  const characterAliases = new Map<string, CharacterProfile>();
  for (const character of targetCharacters) {
    [character.id, character.nickname, character.name, getCharacterVoomAuthorName(character)]
      .map((name) => name.trim().toLocaleLowerCase())
      .filter(Boolean)
      .forEach((name) => characterAliases.set(name, character));
  }

  const comments: UserVoomCommentResult[] = [];
  for (const entry of source) {
    if (comments.length >= 6 || !entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const content = String(record.content ?? record.text ?? record.comment ?? '').trim();
    if (!content) continue;

    const requestedAuthorKey = String(record.authorId ?? record.characterId ?? record.authorName ?? '').trim().toLocaleLowerCase();
    const character = characterAliases.get(requestedAuthorKey) ?? targetCharacters[comments.length % targetCharacters.length];
    if (!character) continue;

    const contentTranslation = normalizeTranslationText(record.contentTranslation ?? record.translation ?? record.translationZh ?? record.chineseTranslation);
    comments.push({
      authorName: getCharacterVoomAuthorName(character),
      authorId: character.id,
      content,
      ...(contentTranslation ? { contentTranslation } : {})
    });
  }
  return comments;
}

export async function generateUserVoomComments(input: {
  author: UserProfile;
  content: string;
  imageDescription?: string;
  createdAt?: number;
  targetCharacters: CharacterProfile[];
  timeAwareness?: ConversationTimeAwarenessSettings;
  settings?: AppSettings;
  modelOverride?: string;
}): Promise<UserVoomCommentResult[]> {
  if (!input.targetCharacters.length) return [];
  requireTextGenerationConfig(input.settings, input.modelOverride, '用户 VOOM 评论生成');

  const timeAwarenessPrompt = renderTimeAwarenessPrompt(input.timeAwareness, {
    userName: input.author.name || input.author.nickname || '用户'
  });
  const includeTimeContext = shouldIncludeVoomTimeContext(input.timeAwareness);

  const targetCharacterText = input.targetCharacters
    .map((character) => [
      `id: ${character.id}`,
      `VOOM 网名: ${getCharacterVoomAuthorName(character)}`,
      `角色名: ${character.name}`,
      `主页签名: ${character.signature || '无'}`,
      `角色设定: ${character.description || '无'}`
    ].join('；'))
    .join('\n');
  const prompt = [
    '你要模拟 LINK VOOM 里，角色们看到用户发出的动态后留下的自然评论。只输出 JSON，不要输出 JSON 以外的文字。',
    timeAwarenessPrompt,
    `用户昵称：${input.author.nickname || input.author.name}`,
    `用户设定：${input.author.description || '无'}`,
    includeTimeContext && input.createdAt ? `用户动态发布时间：${formatVoomContextTime(input.createdAt)}` : '',
    `用户动态正文：\n${input.content}`,
    input.imageDescription ? `配图描述：${input.imageDescription}` : '',
    `可评论角色：\n${targetCharacterText}`,
    `输出格式：
{
  "comments": [
    { "authorId": "从可评论角色 id 中选择", "content": "评论内容", "contentTranslation": "如 content 不是普通话，则给普通话译文；否则留空" }
  ]
}`,
    '要求：1. 输出 0-6 条；2. authorId 必须来自可评论角色；3. 不要代替用户本人评论；4. 评论要短、自然、有社交软件感；5. 不要使用“NPC”“朋友A”“路人”这类占位名；6. contentTranslation 规则：外语、粤语、方言、繁体中文、文言/古风表达都要翻译成自然现代简体普通话；不要加“翻译：”前缀。'
  ].filter(Boolean).join('\n\n');

  const apiReply = await callTextApi(input.settings, prompt, input.modelOverride);
  if (!apiReply) return [];

  try {
    return normalizeUserVoomComments(JSON.parse(extractJsonContent(apiReply)), input.targetCharacters);
  } catch {
    const content = apiReply.trim();
    const character = input.targetCharacters[0];
    return content && character
      ? [{ authorName: getCharacterVoomAuthorName(character), authorId: character.id, content }]
      : [];
  }
}

export async function generateVoomCommentReplies(input: {
  context: PromptContext;
  post: VoomPost;
  userComments: VoomComment[];
  settings?: AppSettings;
  modelOverride?: string;
}): Promise<VoomCommentReplyResult[]> {
  requireTextGenerationConfig(input.settings, input.modelOverride, 'VOOM 评论回复');
  const fallbackAuthorName = input.context.character.nickname;
  const targetComments = input.userComments.length ? input.userComments : input.post.comments.slice(-2);
  const includeTimeContext = shouldIncludeVoomTimeContext(input.context.timeAwareness);
  const blockedAuthorNames = [input.context.boundUser.nickname, input.context.boundUser.name, input.context.user.nickname, input.context.user.name]
    .map((name) => name.trim())
    .filter(Boolean);
  const prompt = [
    buildPrompt(input.context),
    '现在你要模拟这条 VOOM 的真实评论区继续发展。只输出 JSON，不要输出 JSON 以外的任何文字。',
    `VOOM 正文：\n${formatVoomPostPromptContent(input.post, includeTimeContext)}`,
    `评论区：\n${input.post.comments.map((comment) => formatVoomCommentPromptLine(comment, includeTimeContext)).join('\n') || '暂无评论。'}`,
    `优先关注这些评论：\n${targetComments.map((comment) => formatVoomCommentPromptLine(comment, includeTimeContext)).join('\n') || '没有指定评论，可根据正文补一条自然评论。'}`,
    `不要使用这些作者名发言：${blockedAuthorNames.join('、') || '当前用户'}`,
    `输出格式：
{
  "replies": [
    { "id": "r1", "authorName": "${fallbackAuthorName}", "content": "回复内容", "contentTranslation": "如 content 不是普通话，则给普通话译文；否则留空", "parentId": "被回复评论ID，可留空" },
    { "id": "r2", "authorName": "NPC网名", "content": "自然评论或回复", "contentTranslation": "如 content 不是普通话，则给普通话译文；否则留空", "parentId": "已有评论ID或本次前面输出的id，可留空" }
  ]
}`,
    '要求：1. 输出 0-6 条；2. authorName 可以是角色昵称，也可以是角色社交圈里真实感的 NPC 网名；3. 角色可以回复用户或其他人的评论，NPC 也可以发新评论、回复角色或互相回复；4. parentId 留空表示新评论，填写已有评论 ID 或本次前面输出的 id 表示回复；5. 不要代替用户发言，不要使用“NPC”“路人”“朋友A”这类占位名；6. 内容像真实社交软件评论区，短、自然、有上下文，不要解释设定；7. contentTranslation 规则：外语、粤语、方言、繁体中文、文言/古风表达都要翻译成简体普通话；不要加“翻译：”前缀。'
  ].join('\n\n');

  const apiReply = await callTextApi(input.settings, prompt, input.modelOverride);
  if (apiReply) {
    try {
      const parsed = JSON.parse(extractJsonContent(apiReply));
      const replies = normalizeVoomCommentReplies(parsed, fallbackAuthorName, input.post, blockedAuthorNames);
      if (replies.length) return replies;
    } catch {
      const content = apiReply.trim();
      if (content) {
        return [{
          authorName: fallbackAuthorName,
          content,
          parentId: targetComments[0]?.id
        }];
      }
    }
  }
  throw new Error('评论区回复模型没有返回内容。');
}

export async function generateConversationSummary(input: {
  messages: string;
  previousSummary: string;
  settings?: AppSettings;
  modelOverride?: string;
  promptOverride?: string;
}) {
  const prompt = [
    input.promptOverride?.trim() || '请把下面聊天楼层总结成可供角色扮演继续读取的记忆手册。要求：保留人物关系变化、承诺、偏好、冲突、时间顺序和未解决事项；不要评价用户；用中文输出。',
    input.previousSummary ? `已有长期/短期记忆：\n${input.previousSummary}` : '已有长期/短期记忆：暂无。',
    `待总结聊天：\n${input.messages}`
  ].filter(Boolean).join('\n\n');
  const apiReply = await callTextApi(input.settings, prompt, input.modelOverride);
  return apiReply || input.messages.slice(0, 1400);
}

export function shouldAutoGenerateMoment(frequency: VoomFrequency) {
  return Math.random() < getVoomFrequencyChance(frequency);
}

export async function generateEmbeddingVector(input: {
  text: string;
  settings?: AppSettings;
  modelOverride?: string;
}) {
  const resolved = getResolvedTextApiConfig(input.settings, input.modelOverride);
  if (!resolved.endpoint.trim() || !resolved.model.trim() || !input.text.trim()) return [];

  const embeddingsEndpoint = resolved.endpoint.replace(/\/chat\/completions\/?$/i, '/embeddings');
  const requestEndpoint = createTextRequestEndpoint(embeddingsEndpoint);
  try {
    const response = await fetch(requestEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: resolved.model,
        input: input.text
      })
    });

    if (!response.ok) return [];
    const data = await response.json();
    const embedding = Array.isArray(data.data?.[0]?.embedding) ? data.data[0].embedding : [];
    return embedding
      .map((value: unknown) => Number(value))
      .filter((value: number) => Number.isFinite(value));
  } catch {
    return [];
  }
}

function getNovelAiEndpointBase(settings: AppSettings) {
  const config = settings.imageNovelAi;
  const endpoint = config.endpointMode === 'official' ? novelAiOfficialApiUrl : novelAiProxyApiUrl;
  return normalizeBaseUrl(endpoint);
}

function normalizeNovelAiModelPayload(payload: unknown): NovelAiModelOption[] {
  const maybeObject = payload as { models?: unknown; data?: unknown; results?: unknown } | null;
  const rawModels = Array.isArray(payload)
    ? payload
    : Array.isArray(maybeObject?.models)
      ? maybeObject.models
      : Array.isArray(maybeObject?.data)
        ? maybeObject.data
        : Array.isArray(maybeObject?.results)
          ? maybeObject.results
          : [];

  const models = rawModels.flatMap((item) => {
    if (typeof item === 'string') return [{ id: item, label: item }];
    if (!item || typeof item !== 'object') return [];
    const model = item as { id?: unknown; name?: unknown; model?: unknown; label?: unknown; title?: unknown; nickname?: unknown };
    const id = String(model.id ?? model.model ?? model.name ?? '').trim();
    if (!id) return [];
    const label = String(model.label ?? model.title ?? model.nickname ?? model.name ?? id).trim();
    return [{ id, label: label || id }];
  });

  const byId = new Map(defaultNovelAiModels.map((model) => [model.id, model]));
  models.forEach((model) => byId.set(model.id, model));
  return [...byId.values()];
}

function normalizePollinationsModelPayload(payload: unknown): PollinationsModelOption[] {
  const maybeObject = payload as { models?: unknown; data?: unknown } | null;
  const rawModels = Array.isArray(payload)
    ? payload
    : Array.isArray(maybeObject?.models)
      ? maybeObject.models
      : Array.isArray(maybeObject?.data)
        ? maybeObject.data
        : [];

  const models = rawModels.flatMap((item) => {
    if (typeof item === 'string') return [{ id: item, label: item }];
    if (!item || typeof item !== 'object') return [];
    const model = item as { id?: unknown; name?: unknown; model?: unknown; label?: unknown; title?: unknown; category?: unknown; output_modalities?: unknown; outputModalities?: unknown };
    const outputModalities = Array.isArray(model.output_modalities)
      ? model.output_modalities
      : Array.isArray(model.outputModalities)
        ? model.outputModalities
        : [];
    if (String(model.category ?? '').trim() && String(model.category).trim() !== 'image') return [];
    if (outputModalities.length && !outputModalities.includes('image')) return [];
    const id = String(model.id ?? model.model ?? model.name ?? '').trim();
    if (!id) return [];
    const label = String(model.label ?? model.title ?? model.name ?? id).trim();
    return [{ id, label: label || id }];
  });

  const byId = new Map(defaultPollinationsModels.map((model) => [model.id, model]));
  models.forEach((model) => byId.set(model.id, model));
  return [...byId.values()];
}