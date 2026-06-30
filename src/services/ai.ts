import { unzipSync } from 'fflate';
import type { ApiVendor, AppSettings, CharacterProfile, ConversationMemoryAtom, ConversationMemoryEntryStatus, ConversationMemoryEntryType, ConversationTimeAwarenessSettings, GenerateReplyInput, ImageProviderType, MusicComment, MusicTrack, NovelAiModelOption, PollinationsModelOption, PromptContext, SmallTheater, SmallTheaterTopic, UserProfile, VoomComment, VoomFrequency, VoomPost } from '@/types/domain';
import { createId } from '@/utils/id';
import { getCharacterAiName, getCharacterVoomAuthorName } from '@/utils/character';
import { getUserAiName, getUserVoomAuthorName } from '@/utils/profile';
import { defaultNovelAiModels, defaultPollinationsModels, getResolvedApiConfig, getResolvedOpenAiImageConfig, novelAiOfficialApiUrl, novelAiProxyApiUrl } from '@/utils/settings';
import { estimateTokenCount } from '@/utils/memory';
import { renderTimeAwarenessPrompt } from '@/utils/timeAwareness';
import { formatContentWithChineseTranslation, normalizeTranslationText } from '@/utils/translation';
import { getVoomFrequencyChance, stripVoomCommentReplyPrefix } from '@/utils/voom';
import { buildMomentPrompt, buildPrompt } from './prompt';

const modelSelectionSeparator = '::';
const textProxyPath = '/__text-proxy';
const imageDownloadProxyPath = '/__image-download';

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
  offlineInvitation?: { prompt: string } | null;
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
  | { type: 'voice'; content: string; translation?: string; duration?: number }
  | { type: 'location'; name: string; address?: string; distance: string }
  | { type: 'transfer'; amount: string; note?: string };

export interface RoleplayReplyResult {
  reply: string;
  replies?: string[];
  plotChoices?: string[];
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

export interface MemoryAtomAuditUpdate {
  id: string;
  type?: ConversationMemoryEntryType;
  status?: ConversationMemoryEntryStatus;
  subject?: string;
  content?: string;
  owner?: string;
  counterparty?: string;
  due?: string;
  resolution?: string;
  importance?: number;
  confidence?: number;
  reason?: string;
}

export interface MemoryAtomAuditResult {
  updates: MemoryAtomAuditUpdate[];
}

export type UserVoomCommentResult = Pick<VoomComment, 'authorName' | 'authorId' | 'content' | 'contentTranslation' | 'parentId'> & { draftId?: string };

export interface SmallTheaterGenerationResult {
  title: string;
  summary: string;
  html: string;
  model?: string;
}

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
    return `${imageDownloadProxyPath}?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

const imageDownloadAcceptHeader = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';

function createImageDownloadHeaders(apiKey = '') {
  const headers: HeadersInit = { Accept: imageDownloadAcceptHeader };
  const normalizedApiKey = apiKey.trim();
  if (normalizedApiKey) headers.Authorization = `Bearer ${normalizedApiKey}`;
  return headers;
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

function getDownloadedImageMimeType(blob: Blob, contentType: string, imageUrl: string, fallbackMimeType: string) {
  const normalizedContentType = contentType.trim().toLowerCase();
  const normalizedBlobType = blob.type.trim().toLowerCase();
  if (/^(?:text\/|application\/(?:json|xml|xhtml\+xml))/i.test(normalizedContentType)) return '';
  if (/^(?:text\/|application\/(?:json|xml|xhtml\+xml))/i.test(normalizedBlobType)) return '';
  return normalizeImageMimeType(normalizedBlobType || normalizedContentType || inferImageMimeType(imageUrl, fallbackMimeType), fallbackMimeType);
}

async function readDownloadedImageResponse(response: Response, imageUrl: string, fallbackMimeType: string) {
  if (!response.ok) {
    throw new Error(`图片下载返回 ${formatHttpStatus(response) || '请求失败'}`);
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  const downloadedBlob = await response.blob();
  if (!downloadedBlob.size) throw new Error('图片下载结果为空。');

  const mimeType = getDownloadedImageMimeType(downloadedBlob, contentType, imageUrl, fallbackMimeType);
  if (!mimeType.startsWith('image/')) throw new Error(`图片下载返回了非图片内容：${contentType || downloadedBlob.type || 'unknown'}`);

  return readBlobAsDataUrl(downloadedBlob.type === mimeType ? downloadedBlob : new Blob([downloadedBlob], { type: mimeType }));
}

async function fetchGeneratedImageUrlAsDataUrl(imageUrl: string, fallbackMimeType: string, apiKey = '') {
  const proxyEndpoint = createImageDownloadUrl(imageUrl);
  const attempts = [
    { label: '同源下载代理（带鉴权）', endpoint: proxyEndpoint, headers: createImageDownloadHeaders(apiKey), enabled: Boolean(apiKey) },
    { label: '同源下载代理', endpoint: proxyEndpoint, headers: createImageDownloadHeaders(), enabled: true },
    { label: '浏览器直连（带鉴权）', endpoint: imageUrl, headers: createImageDownloadHeaders(apiKey), enabled: Boolean(apiKey) && proxyEndpoint !== imageUrl },
    { label: '浏览器直连', endpoint: imageUrl, headers: createImageDownloadHeaders(), enabled: proxyEndpoint !== imageUrl }
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    if (!attempt.enabled) continue;
    for (let retryIndex = 0; retryIndex <= openAiImageRetryDelays.length; retryIndex += 1) {
      try {
        const response = await fetch(attempt.endpoint, { headers: attempt.headers });
        if (!response.ok && transientOpenAiImageStatuses.has(response.status) && retryIndex < openAiImageRetryDelays.length) {
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          await wait(retryAfter || openAiImageRetryDelays[retryIndex]);
          continue;
        }
        return await readDownloadedImageResponse(response, imageUrl, fallbackMimeType);
      } catch (error) {
        lastError = error instanceof Error ? new Error(`${attempt.label}失败：${error.message}`) : error;
        if (retryIndex < openAiImageRetryDelays.length) {
          await wait(openAiImageRetryDelays[retryIndex]);
          continue;
        }
        break;
      }
    }
  }

  throw lastError ?? new Error('图片 URL 下载失败。');
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

function supportsB64JsonResponseFormat(model: string) {
  return /^dall-e-(?:2|3)$/i.test(model.trim());
}

function buildOpenAiImageRequestBody(endpoint: string, model: string, prompt: string, size: string, preferBase64ImageResponse = false) {
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
    ...(preferBase64ImageResponse && supportsB64JsonResponseFormat(model) ? { response_format: 'b64_json' } : {}),
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
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized === '[::1]'
    || /^10\./.test(normalized)
    || /^192\.168\./.test(normalized)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    || /^169\.254\./.test(normalized);
}

function isLikelyViteProxyPort(port: string) {
  return port === '5173' || port === '4173';
}

function canUseLocalTextProxy() {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  if (!['http:', 'https:'].includes(window.location.protocol)) return false;
  return isLocalProxyHostname(window.location.hostname) || isLikelyViteProxyPort(window.location.port);
}

function createTextProxyEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();
  return `${textProxyPath}?url=${encodeURIComponent(trimmed)}`;
}

function createTextRequestEndpoints(endpoint: string) {
  const trimmed = endpoint.trim();
  if (!/^https?:\/\//i.test(trimmed)) return [trimmed];

  const proxyEndpoint = createTextProxyEndpoint(trimmed);
  const endpoints = canUseLocalTextProxy()
    ? [proxyEndpoint, trimmed]
    : [trimmed, proxyEndpoint];

  return endpoints.filter((item, index) => item && endpoints.indexOf(item) === index);
}

function createTextNetworkErrorMessage(error: unknown, endpoint: string, requestEndpoint: string) {
  return createNetworkErrorMessage(
    error,
    '文本模型网络请求失败',
    endpoint,
    requestEndpoint.startsWith(textProxyPath)
      ? '本地同源文本代理没有响应。请确认正在通过 npm run dev 或 npm run preview 访问应用；如果仍失败，请检查本机网络、代理节点、网关地址、API Key 与模型是否可用。'
      : '当前运行环境没有可用的同源文本代理，浏览器直连 OpenAI 兼容聊天网关可能会被 CORS 或网络策略拦截。请使用 npm run dev / npm run preview，或换用支持浏览器跨域的网关。'
  );
}

function waitForTextApiRetry() {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 800);
  });
}

function shouldRetryTextApiResponse(response: Response) {
  return response.status === 405 || response.status === 429 || response.status >= 500;
}

function createTextApiStatusHint(response: Response, endpoint: string) {
  if (response.status !== 405) return '';
  return [
    `请求地址：${endpoint}`,
    '405 通常表示上游网关不接受当前路径或请求方法。请确认 API Url 只填到 /v1 这一层，API 路径为 /chat/completions；如果配置无误，多半是供应商兼容网关短暂路由异常，可稍后重试或切换供应商。'
  ].join('\n');
}

function createNovelAiNetworkErrorMessage(error: unknown, endpoint: string, requestEndpoint: string) {
  return createNetworkErrorMessage(
    error,
    'NovelAI 生图接口预检网络请求失败',
    endpoint,
    requestEndpoint.startsWith(textProxyPath)
      ? 'NovelAI 预检请求无法通过本地同源代理到达后台。请确认正在通过 npm run dev 或 npm run preview 访问应用，并检查本机网络、代理节点和 Token 是否可用。'
      : 'NovelAI 预检请求无法到达后台。请确认连接方式、网络代理和 Token 可用。本地开发/预览会优先通过同源代理转发官方接口。'
  );
}

async function fetchTextEndpointWithFallback(
  endpoint: string,
  init: RequestInit,
  createErrorMessage: (error: unknown, endpoint: string, requestEndpoint: string) => string
) {
  const requestEndpoints = createTextRequestEndpoints(endpoint);
  let lastError: unknown;
  let lastRequestEndpoint = requestEndpoints[0] ?? endpoint;

  for (const requestEndpoint of requestEndpoints) {
    lastRequestEndpoint = requestEndpoint;
    try {
      const response = await fetch(requestEndpoint, init);
      return { response, requestEndpoint };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(createErrorMessage(lastError, endpoint, lastRequestEndpoint));
}

async function fetchTextEndpoint(endpoint: string, init: RequestInit) {
  return fetchTextEndpointWithFallback(endpoint, init, createTextNetworkErrorMessage);
}

async function fetchNovelAiEndpoint(endpoint: string, init: RequestInit) {
  return fetchTextEndpointWithFallback(endpoint, init, createNovelAiNetworkErrorMessage);
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

async function localizeGeneratedImageUrl(imageUrl: string, fallbackMimeType = 'image/png', apiKey = '') {
  const trimmed = imageUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  try {
    return await fetchGeneratedImageUrlAsDataUrl(trimmed, fallbackMimeType, apiKey);
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

const plotChoiceBlockPattern = /(?:\[\[PLOT_CHOICES\]\]|【剧情选择】|<plotChoices>)([\s\S]*?)(?:\[\[\/PLOT_CHOICES\]\]|【\/剧情选择】|<\/plotChoices>)/gi;

function parsePlotChoicesFromText(content: string) {
  const choices: string[] = [];
  const cleaned = content.replace(plotChoiceBlockPattern, (_match, body: string) => {
    choices.push(...normalizePlotChoices(body));
    return '';
  }).trim();
  return { content: cleaned, choices };
}

function normalizePlotChoices(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizePlotChoices(item)).slice(0, 6);
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
      .split(/\r?\n+/)
      .map((item) => item.replace(/^(?:[-*•]|\d+[.)、：:]|选项\s*\d+[:：]?|剧情\s*\d+[:：]?)\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.content, record.text, record.choice, record.option, record.direction, record.summary];
    for (const candidate of candidates) {
      const choices = normalizePlotChoices(candidate);
      if (choices.length) return choices;
    }
  }
  return [];
}

function normalizeNestedPlotChoices(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeNestedPlotChoices(item)).slice(0, 6);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    ...normalizePlotChoices(record.plotChoices),
    ...normalizePlotChoices(record.choices),
    ...normalizePlotChoices(record.storyChoices),
    ...normalizePlotChoices(record.directions)
  ].slice(0, 6);
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
    const translations = normalizeTranslationList(record.translation ?? record.contentTranslation ?? record.translationZh ?? record.chineseTranslation);
    return normalizeTextFragments(record.content ?? record.transcript ?? record.text ?? record.message ?? record.reply)
      .map((content, index) => ({
        type: 'voice' as const,
        content,
        ...(translations[index] ? { translation: translations[index] } : {}),
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

function normalizeTransferDecisionStatus(value: unknown): 'accepted' | 'rejected' | '' {
  const status = String(value ?? '').trim().toLocaleLowerCase();
  if (['accepted', 'accept', 'received', 'receive', 'take', 'yes', '收款', '接收', '接受', '领取', '同意'].includes(status)) return 'accepted';
  if (['rejected', 'reject', 'refused', 'refuse', 'declined', 'decline', 'no', '退回', '拒收', '拒绝', '婉拒'].includes(status)) return 'rejected';
  return '';
}

function normalizeTransferDecisionActions(value: unknown): Array<{ messageId: string; status: 'accepted' | 'rejected' }> {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeTransferDecisionActions(item));
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const status = normalizeTransferDecisionStatus(record.status ?? record.decision ?? record.action ?? record.result);
  if (!status) return [];
  const messageIds = normalizeMessageIds(record.messageId ?? record.targetMessageId ?? record.transferMessageId ?? record.id);
  return messageIds.map((messageId) => ({ messageId, status }));
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
  const transferDecisionEntries = [
    ...normalizeTransferDecisionActions(record.transferDecisions),
    ...normalizeTransferDecisionActions(record.transferDecision),
    ...normalizeTransferDecisionActions(record.transferReplies),
    ...normalizeTransferDecisionActions(actionRecord.transferDecisions),
    ...normalizeTransferDecisionActions(actionRecord.transferDecision),
    ...normalizeTransferDecisionActions(actionRecord.transferReplies)
  ];
  const transferDecisions = Array.from(new Map(transferDecisionEntries.map((decision) => [decision.messageId, decision])).values());
  return { recallMessageIds, quotes, transferDecisions, offlineInvitation: normalizeOfflineInvitationAction(record, actionRecord) };
}

function normalizeOfflineInvitationAction(record: Record<string, unknown>, actionRecord: Record<string, unknown>): { prompt: string } | null {
  const candidates = [
    actionRecord.offlineInvitation,
    actionRecord.offlineInvite,
    actionRecord.inviteOffline,
    record.offlineInvitation,
    record.offlineInvite,
    record.inviteOffline
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string') {
      const prompt = candidate.trim();
      if (prompt) return { prompt };
      continue;
    }
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const inviteRecord = candidate as Record<string, unknown>;
      const explicitDisabled = inviteRecord.enabled === false || inviteRecord.enabled === 'false' || inviteRecord.status === 'none';
      if (explicitDisabled) continue;
      const prompt = normalizeLocationText(inviteRecord.prompt)
        || normalizeLocationText(inviteRecord.openingPrompt)
        || normalizeLocationText(inviteRecord.scene)
        || normalizeLocationText(inviteRecord.content)
        || normalizeLocationText(inviteRecord.text);
      if (prompt) return { prompt };
    }
  }
  return null;
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
  comments: Array<Pick<VoomComment, 'authorName' | 'content' | 'contentTranslation' | 'parentId'> & { draftId?: string }>;
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
  const characterName = getCharacterAiName(context.character);
  const options = [
    `和这条动态相配的一张生活随手拍，画面里有${characterName}最近状态里的细节。`,
    `一张方形社交配图，记录${characterName}当天看到的小场景，氛围自然日常。`,
    '一张像朋友圈随手发布的生活照片，画面简单，重点是当下的物品、光线和环境。',
    '一张和动态内容相呼应的日常配图，构图干净，像手机相册里刚拍下来的照片。'
  ];
  return options[Math.abs(hash) % options.length];
}

function extractVoomCommentReplyTarget(content: string) {
  const normalized = content.trim();
  const replyMatch = normalized.match(/^回复\s+([^：:，,、\s][^：:，,、]{0,30})\s*[：:，,、-]/u);
  if (replyMatch?.[1]) return replyMatch[1].trim();
  const mentionMatch = normalized.match(/^@([^：:，,、\s][^：:，,、\s]{0,30})\s*[：:，,、-]?/u);
  return mentionMatch?.[1]?.trim() ?? '';
}

function normalizeVoomMomentComments(input: unknown): VoomMomentPayload['comments'] {
  if (!Array.isArray(input)) return [];
  const comments: VoomMomentPayload['comments'] = [];
  for (const comment of input) {
    if (!comment || typeof comment !== 'object') continue;
    const entry = comment as Record<string, unknown>;
    const authorName = String(entry.authorName ?? '').trim();
    const rawContent = String(entry.content ?? '');
    const replyTargetName = String(entry.replyToAuthorName ?? entry.replyToName ?? entry.targetAuthorName ?? '').trim() || extractVoomCommentReplyTarget(rawContent);
    const content = stripVoomCommentReplyPrefix(rawContent, replyTargetName);
    const contentTranslation = normalizeTranslationText(entry.contentTranslation ?? entry.translation ?? entry.translationZh ?? entry.chineseTranslation);
    const draftId = String(entry.id ?? entry.draftId ?? entry.tempId ?? '').trim();
    const parentId = String(entry.parentId ?? entry.replyToId ?? entry.replyTo ?? entry.parent ?? '').trim() || replyTargetName;
    if (!authorName || !content) continue;
    comments.push({
      authorName,
      content,
      ...(contentTranslation ? { contentTranslation } : {}),
      ...(draftId ? { draftId } : {}),
      parentId
    });
  }
  return comments;
}

function resolveInitialVoomComments(comments: VoomMomentPayload['comments']) {
  const generatedComments: VoomComment[] = [];
  const idByDraftId = new Map<string, string>();

  for (const comment of comments) {
    const id = createId('comment');
    const rawParentId = comment.parentId?.trim() ?? '';
    const parentByDraftId = idByDraftId.get(rawParentId) ?? '';
    const parentByAuthor = rawParentId
      ? [...generatedComments].reverse().find((entry) => entry.authorName === rawParentId)?.id ?? ''
      : '';
    const parentId = parentByDraftId || parentByAuthor;
    generatedComments.push({
      id,
      authorName: comment.authorName,
      content: stripVoomCommentReplyPrefix(comment.content, rawParentId),
      contentTranslation: comment.contentTranslation ? stripVoomCommentReplyPrefix(comment.contentTranslation, rawParentId) : comment.contentTranslation,
      parentId: parentId || undefined
    });
    if (comment.draftId) idByDraftId.set(comment.draftId, id);
  }

  return generatedComments;
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

function normalizeVoomSimilarityText(value = '') {
  return value
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
}

function createCharacterNgrams(value: string, size: number) {
  const normalized = normalizeVoomSimilarityText(value);
  if (!normalized) return new Set<string>();
  if (normalized.length <= size) return new Set([normalized]);
  const grams = new Set<string>();
  for (let index = 0; index <= normalized.length - size; index += 1) {
    grams.add(normalized.slice(index, index + size));
  }
  return grams;
}

function jaccardSimilarity(first: Set<string>, second: Set<string>) {
  if (!first.size || !second.size) return 0;
  let intersection = 0;
  for (const item of first) {
    if (second.has(item)) intersection += 1;
  }
  return intersection / (first.size + second.size - intersection);
}

function getVoomSimilarityScore(first: string, second: string) {
  const firstText = normalizeVoomSimilarityText(first);
  const secondText = normalizeVoomSimilarityText(second);
  if (!firstText || !secondText) return 0;
  if (firstText === secondText) return 1;
  if (firstText.length >= 8 && secondText.length >= 8 && (firstText.includes(secondText) || secondText.includes(firstText))) return 0.9;

  const bigramScore = jaccardSimilarity(createCharacterNgrams(firstText, 2), createCharacterNgrams(secondText, 2));
  const trigramScore = jaccardSimilarity(createCharacterNgrams(firstText, 3), createCharacterNgrams(secondText, 3));
  return Math.max(bigramScore, trigramScore);
}

function getVoomPayloadSimilarity(payload: VoomMomentPayload, post: VoomPost) {
  const payloadCombined = [payload.content, payload.imageDescription].filter(Boolean).join('\n');
  const postCombined = [post.content, post.contentTranslation, post.imageDescription].filter(Boolean).join('\n');
  return Math.max(
    getVoomSimilarityScore(payload.content, post.content),
    getVoomSimilarityScore(payload.imageDescription, post.imageDescription ?? ''),
    getVoomSimilarityScore(payloadCombined, postCombined)
  );
}

function findSimilarRecentVoomPost(payload: VoomMomentPayload, recentPosts: VoomPost[]) {
  const candidates = recentPosts
    .map((post) => ({ post, score: getVoomPayloadSimilarity(payload, post) }))
    .sort((first, second) => second.score - first.score);
  const [bestMatch] = candidates;
  return bestMatch && bestMatch.score >= 0.42 ? bestMatch : null;
}

async function generateDistinctVoomPayload(context: PromptContext, settings?: AppSettings, modelOverride = '') {
  const basePrompt = buildMomentPrompt(context);
  const recentPosts = context.recentVoomPosts ?? [];
  let prompt = basePrompt;
  let latestPayload: VoomMomentPayload | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const apiReply = await callTextApi(settings, prompt, modelOverride);
    const payload = parseVoomMomentPayload(apiReply, context);
    latestPayload = payload;

    const similarPost = findSimilarRecentVoomPost(payload, recentPosts);
    if (!similarPost) return payload;

    prompt = [
      basePrompt,
      '上一版候选因为和近期 VOOM 太相似被拒绝，请完全重写。',
      `被拒绝的候选正文：${payload.content}`,
      `被拒绝的候选配图：${payload.imageDescription}`,
      `最相似的历史正文：${similarPost.post.content}`,
      similarPost.post.imageDescription ? `最相似的历史配图：${similarPost.post.imageDescription}` : '',
      '这次必须换成另一个具体事件或生活切面，正文、配图、情绪重心都要明显不同。只输出新的 JSON。'
    ].filter(Boolean).join('\n\n');
  }

  return latestPayload ?? parseVoomMomentPayload('', context);
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

    const content = stripVoomCommentReplyPrefix(String(reply.content ?? ''));
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
      const apiUrl = normalizeBaseUrl(vendor.apiUrl);
      return {
        endpoint: apiUrl ? `${apiUrl}/${vendor.apiPath.trim().replace(/^\/+/, '')}` : '',
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

  const content = imageParts.length
    ? [{ type: 'text' as const, text: prompt }, ...imageParts]
    : prompt;

  const requestInit: RequestInit = {
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
  };

  let { response, requestEndpoint } = await fetchTextEndpoint(resolved.endpoint, requestInit);
  if (!response.ok && shouldRetryTextApiResponse(response)) {
    await waitForTextApiRetry();
    const retryResult = await fetchTextEndpoint(resolved.endpoint, requestInit);
    response = retryResult.response;
    requestEndpoint = retryResult.requestEndpoint;
  }

  if (!response.ok) {
    const statusHint = createTextApiStatusHint(response, resolved.endpoint);
    if (requestEndpoint.startsWith(textProxyPath) && response.status === 502) {
      throw new Error([await createApiErrorMessage(response, '本地文本模型代理请求失败'), statusHint].filter(Boolean).join('\n\n'));
    }
    throw new Error([await createApiErrorMessage(response, '文本模型 API 请求失败'), statusHint].filter(Boolean).join('\n\n'));
  }

  const data = await readJsonPayload(response, '文本模型 API 返回异常');
  return String(data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? data.content ?? '').trim();
}

export async function fetchVendorModels(vendor: Pick<ApiVendor, 'apiUrl' | 'apiKey'>): Promise<string[]> {
  const modelsEndpoint = `${vendor.apiUrl.trim().replace(/\/+$/, '')}/models`;
  if (!vendor.apiUrl.trim()) return [];
  const { response, requestEndpoint } = await fetchTextEndpointWithFallback(
    modelsEndpoint,
    {
      headers: {
        Accept: 'application/json',
        ...(vendor.apiKey ? { Authorization: `Bearer ${vendor.apiKey}` } : {})
      }
    },
    (error, endpoint, activeRequestEndpoint) => createNetworkErrorMessage(
      error,
      '模型列表网络请求失败',
      endpoint,
      activeRequestEndpoint.startsWith(textProxyPath)
        ? '本地同源文本代理没有响应。请确认正在通过 npm run dev 或 npm run preview 访问应用，并检查网关 /models 路径是否可达。'
        : '当前运行环境没有可用的同源文本代理，浏览器直连模型列表接口可能会被 CORS 或网络策略拦截。'
    )
  );

  if (!response.ok) {
    if (requestEndpoint.startsWith(textProxyPath) && response.status === 502) {
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
      body: JSON.stringify(buildOpenAiImageRequestBody(resolved.endpoint, model, prompt, size, resolved.preferBase64ImageResponse))
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
    ? await localizeGeneratedImageUrl(extractedImage.imageUrl, extractedImage.mimeType, resolved.apiKey)
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
    if (requestEndpoint.startsWith(textProxyPath) && response.status === 502) {
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
      const parsedRecordAny = parsedRecord as Record<string, unknown>;
      const hiddenPlotChoices: string[] = [];
      const replies = normalizeReplyMessages(parsed)
        .map((reply) => {
          const parsedReply = parsePlotChoicesFromText(reply);
          hiddenPlotChoices.push(...parsedReply.choices);
          return parsedReply.content || reply;
        })
        .filter(Boolean);
      const plotChoices = input.mode === 'offline'
        ? [...new Set([
          ...normalizePlotChoices(parsedRecordAny.plotChoices),
          ...normalizePlotChoices(parsedRecordAny.choices),
          ...normalizePlotChoices(parsedRecordAny.storyChoices),
          ...normalizePlotChoices(parsedRecordAny.directions),
          ...normalizeNestedPlotChoices(parsedRecordAny.messages),
          ...normalizeNestedPlotChoices(parsedRecordAny.replies),
          ...hiddenPlotChoices
        ].map((item) => item.trim()).filter(Boolean))].slice(0, 6)
        : [];
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
        plotChoices,
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
      const hiddenPlotChoices: string[] = [];
      const replies = (input.mode === 'online' ? normalizeRawOnlineReply(apiReply) : [apiReply])
        .map((reply) => {
          const parsedReply = parsePlotChoicesFromText(reply);
          hiddenPlotChoices.push(...parsedReply.choices);
          return parsedReply.content || reply;
        });
      const plotChoices = input.mode === 'offline' ? [...new Set(hiddenPlotChoices)].slice(0, 6) : [];
      return JSON.stringify({ reply: replies[0] ?? '', replies, plotChoices, narrations: [], images: [], stickers: [], stickerPlacements: [], segments: [], messageActions: { recallMessageIds: [], quotes: [] }, profileUpdate: null } satisfies RoleplayReplyResult);
    }
  }
  throw new Error('角色回复模型没有返回内容。');
}

export async function generateVoomPost(context: PromptContext, settings?: AppSettings, modelOverride = ''): Promise<Omit<VoomPost, 'id' | 'createdAt'>> {
  const { content, contentTranslation, imageDescription, likes, comments } = await generateDistinctVoomPayload(context, settings, modelOverride);
  const characterName = getCharacterAiName(context.character);
  const characterVoomAuthorName = getCharacterVoomAuthorName(context.character);
  const characterAuthorAliases = new Set([context.character.id, context.character.name, context.character.nickname, characterName, characterVoomAuthorName]
    .map((name) => name.trim().toLocaleLowerCase())
    .filter(Boolean));
  const resolvedComments = resolveInitialVoomComments(comments).map((comment) => characterAuthorAliases.has(comment.authorName.trim().toLocaleLowerCase())
    ? { ...comment, authorName: characterVoomAuthorName, authorId: context.character.id }
    : comment);

  return {
    charId: context.character.id,
    conversationId: context.messages[0]?.conversationId,
    authorName: characterVoomAuthorName,
    authorAvatar: context.character.avatar,
    content,
    contentTranslation,
    imageDescription,
    likes,
    comments: resolvedComments
  };
}

function extractHtmlCodeBlock(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  const rawHtml = (fenced?.[1] ?? trimmed).trim();
  const htmlStart = rawHtml.search(/<!doctype\s+html|<html[\s>]/i);
  return (htmlStart >= 0 ? rawHtml.slice(htmlStart) : rawHtml).trim();
}

function ensureCompleteHtmlDocument(content: string, fallbackTitle: string) {
  const html = extractHtmlCodeBlock(content);
  if (!html) return '';
  if (/<html[\s>]/i.test(html)) return html;

  const title = escapeHtmlText(fallbackTitle || '小剧场');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${title}</title>
</head>
<body>
${html}
</body>
</html>`;
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeHtmlText(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function compactHtmlText(value: string, maxLength: number) {
  const normalized = decodeHtmlText(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function extractSmallTheaterTitle(html: string, fallback: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    ?? html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  return compactHtmlText(titleMatch?.[1] ?? '', 36) || fallback;
}

function extractSmallTheaterSummary(html: string, fallback: string) {
  const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return compactHtmlText(metaMatch?.[1] ?? '', 90) || fallback;
}

function buildSmallTheaterPrompt(input: { context: PromptContext; topic: SmallTheaterTopic; recentTheaters?: SmallTheater[] }) {
  const characterName = getCharacterAiName(input.context.character);
  const topicPrompt = input.topic.prompt.trim() || input.topic.title;
  return [
    buildPrompt(input.context, { includeAvailableStickers: false }),
    '现在生成一个「小剧场」独立番外页面。它可以读取上面的角色设定、世界书、记忆手册、最近对话和当前时间上下文，但它绝对不是聊天消息、不是 VOOM、不是记忆写入内容，也不会被 AI 后续读取。',
    '生成结果必须是正文之外的番外小页面：不要把内容写成角色已在当前会话里发送、发布或注入楼层；不要输出聊天事件、VOOM JSON、朋友圈、系统旁白或任何需要写回对话的内容。',
    `本次角色：${characterName}（角色ID：${input.context.character.id}）`,
    `本次小剧场题材：${input.topic.title}\n题材扩展：${topicPrompt}`,
    `输出格式：只输出一个完整 HTML 文件代码块，形如：\n\`\`\`html\n<!doctype html>...\n\`\`\`。不要输出解释、JSON、Markdown 标题或代码块之外的文字。`,
    `HTML 要求：
1. 必须包含 <!doctype html>、<html>、<head>、<meta charset="UTF-8">、<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">、<title>、完整 <style> 和 <script>。
2. 页面必须适配手机端 320px-480px 宽度，考虑安全区、竖屏滚动、触控目标、按钮状态、长文本换行和深浅色视觉对比。
3. 有互动性：至少包含 3 个可点击/可切换/可展开/可选择/可拖动/可输入的交互点，交互由原生 JavaScript 实现，并且不依赖网络。
4. 不允许加载外部 JS/CSS/字体/图片/接口；图片只能用 CSS、emoji、渐变、内嵌 SVG data URL 或纯 HTML/CSS 视觉替代。
5. 小剧场要像一个完整可玩的移动网页，而不是静态文章：可以使用论坛楼层、问答折叠、群聊切换、相册翻页、时间线、卡牌、投票、抽签、小游戏、档案抽屉等形式。
6. 内容必须遵守信息边界：NPC 只来自当前角色设定、世界书、记忆或合理新生成的当前角色社交圈；禁止借用其他角色的 NPC、关系和评论区常客。
7. 标题、正文、按钮文案和交互反馈要自然、有代入感；不要在页面里解释“这是功能”“这是 HTML/CSS/JS”“如何使用本应用”。
8. 这是番外，不改变正文事实；如果写平行世界、传闻、论坛猜测或匿名爆料，必须在页面语气里自然体现它不是既定事实。
9. JavaScript 必须健壮：使用 DOMContentLoaded 或脚本放在 body 末尾，选择器存在性要检查，交互不能因为缺少元素报错。
10. 视觉要完整：有明确层级、背景、卡片/列表/控件状态、空状态或完成状态，避免文字溢出、重叠、按钮过小或页面横向滚动。`
  ].join('\n\n');
}

export async function generateSmallTheater(input: {
  context: PromptContext;
  topic: SmallTheaterTopic;
  recentTheaters?: SmallTheater[];
  settings?: AppSettings;
  modelOverride?: string;
}): Promise<SmallTheaterGenerationResult> {
  requireTextGenerationConfig(input.settings, input.modelOverride, '小剧场生成');
  const prompt = buildSmallTheaterPrompt({ context: input.context, topic: input.topic, recentTheaters: input.recentTheaters });
  const apiReply = await callTextApi(input.settings, prompt, input.modelOverride);
  const html = ensureCompleteHtmlDocument(apiReply, input.topic.title);
  if (!html) throw new Error('小剧场模型没有返回 HTML 内容。');

  const fallbackSummary = `由「${input.topic.title}」生成的互动番外小剧场。`;
  return {
    title: extractSmallTheaterTitle(html, input.topic.title),
    summary: extractSmallTheaterSummary(html, fallbackSummary),
    html,
    model: getResolvedTextApiConfig(input.settings, input.modelOverride).model
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
    [character.id, character.name, character.nickname, getCharacterAiName(character), getCharacterVoomAuthorName(character)]
      .map((name) => name.trim().toLocaleLowerCase())
      .filter(Boolean)
      .forEach((name) => characterAliases.set(name, character));
  }

  const candidates: Array<UserVoomCommentResult & { rawParentId?: string }> = [];
  for (const entry of source) {
    if (candidates.length >= 10 || !entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const content = stripVoomCommentReplyPrefix(String(record.content ?? record.text ?? record.comment ?? ''));
    if (!content) continue;

    const requestedAuthorId = String(record.authorId ?? record.characterId ?? '').trim();
    const requestedAuthorName = String(record.authorName ?? record.name ?? record.nickname ?? '').trim();
    const character = characterAliases.get(requestedAuthorId.toLocaleLowerCase()) ?? characterAliases.get(requestedAuthorName.toLocaleLowerCase());
    const fallbackCharacter = !requestedAuthorName ? targetCharacters[candidates.length % targetCharacters.length] : undefined;
    const authorName = character
      ? getCharacterVoomAuthorName(character)
      : fallbackCharacter
        ? getCharacterVoomAuthorName(fallbackCharacter)
        : requestedAuthorName;
    if (!authorName) continue;

    const contentTranslation = normalizeTranslationText(record.contentTranslation ?? record.translation ?? record.translationZh ?? record.chineseTranslation);
    const draftId = String(record.id ?? record.draftId ?? record.tempId ?? '').trim();
    candidates.push({
      authorName,
      authorId: character?.id ?? fallbackCharacter?.id,
      content,
      ...(contentTranslation ? { contentTranslation } : {}),
      ...(draftId ? { draftId } : {}),
      rawParentId: String(record.parentId ?? record.replyToId ?? '').trim()
    });
  }

  const draftIds = new Set(candidates.map((comment) => comment.draftId).filter(Boolean));
  return candidates.map((comment) => {
    const parentId = comment.rawParentId && draftIds.has(comment.rawParentId) ? comment.rawParentId : undefined;
    return {
      authorName: comment.authorName,
      ...(comment.authorId ? { authorId: comment.authorId } : {}),
      content: comment.content,
      ...(comment.contentTranslation ? { contentTranslation: comment.contentTranslation } : {}),
      ...(comment.draftId ? { draftId: comment.draftId } : {}),
      ...(parentId ? { parentId } : {})
    };
  });
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
    userName: getUserAiName(input.author)
  });
  const includeTimeContext = shouldIncludeVoomTimeContext(input.timeAwareness);

  const targetCharacterText = input.targetCharacters
    .map((character) => [
      `id: ${character.id}`,
      `角色真名: ${getCharacterAiName(character)}`,
      `主页网名: ${getCharacterVoomAuthorName(character)}`,
      `主页签名: ${character.signature || '无'}`,
      `角色设定: ${character.description || '无'}`
    ].join('；'))
    .join('\n');
  const prompt = [
    '你要模拟 LINK VOOM 里，用户可见角色以及这些角色社交圈 NPC 看到用户动态后的自然评论区。只输出 JSON，不要输出 JSON 以外的文字。',
    timeAwarenessPrompt,
    `用户真名：${getUserAiName(input.author)}`,
    `用户主页网名：${getUserVoomAuthorName(input.author)}`,
    `用户设定：${input.author.description || '无'}`,
    includeTimeContext && input.createdAt ? `用户动态发布时间：${formatVoomContextTime(input.createdAt)}` : '',
    `用户动态正文：\n${input.content}`,
    input.imageDescription ? `配图描述：${input.imageDescription}` : '',
    `可见角色与可用 NPC 线索：\n${targetCharacterText}`,
    `输出格式：
{
  "comments": [
    { "id": "c1", "authorId": "可见角色 id；NPC 留空", "authorName": "NPC 网名或角色主页网名", "content": "评论内容", "contentTranslation": "如 content 不是普通话，则给普通话译文；否则留空", "parentId": "被回复的本次评论 id；直接评论则留空" },
    { "id": "c2", "authorName": "NPC 网名", "content": "回复内容", "contentTranslation": "如 content 不是普通话，则给普通话译文；否则留空", "parentId": "c1" }
  ]
}`,
    '要求：1. 输出 0-10 条；2. authorId 可以来自可见角色，NPC 则不要填 authorId，必须填写具体 authorName；3. NPC 只能来自可见角色自己的设定、社交圈、朋友同事家人粉丝或评论区常客线索，不确定归属就不要生成该 NPC；4. parentId 留空表示直接评论用户动态，填写本次前面输出的 id 表示回复那条评论；5. 可以让角色回复 NPC，也可以让 NPC 回复角色或其他 NPC，但不要代替用户本人评论；6. 评论要短、自然、有社交软件感，不要解释设定；7. 不要使用“NPC”“朋友A”“路人”这类占位名；8. contentTranslation 规则：外语、粤语、方言、繁体中文、文言/古风表达都要翻译成自然现代简体普通话；不要加“翻译：”前缀。'
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
  const fallbackAuthorName = getCharacterAiName(input.context.character);
  const postAuthorName = input.post.authorName || fallbackAuthorName;
  const postBelongsToUser = input.post.authorType === 'user';
  const targetComments = input.userComments.length ? input.userComments : input.post.comments.slice(-2);
  const includeTimeContext = shouldIncludeVoomTimeContext(input.context.timeAwareness);
  const blockedAuthorNames = [getUserVoomAuthorName(input.context.boundUser), getUserAiName(input.context.boundUser), getUserVoomAuthorName(input.context.user), getUserAiName(input.context.user)]
    .map((name) => name.trim())
    .filter(Boolean);
  const prompt = [
    buildPrompt(input.context, { includeAvailableStickers: false }),
    '现在你要模拟这条 VOOM 的真实评论区继续发展。只输出 JSON，不要输出 JSON 以外的任何文字。',
    `当前执行角色：${fallbackAuthorName}（角色ID：${input.context.character.id}）`,
    `VOOM 作者：${postAuthorName}${postBelongsToUser ? '（当前用户）' : ''}`,
    postBelongsToUser
      ? '社交圈边界：这是用户发布的 VOOM。除当前执行角色本人外，不要新增任何NPC作者；不要替用户发言。'
      : '社交圈边界：新增NPC只能来自这条 VOOM 作者所属角色自己的社交圈。禁止把其他角色设定里的朋友、同事、家人、同学、粉丝、熟人、NPC网名或评论区常客借到这里；不确定归属时就不生成该NPC。',
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
    '要求：1. 输出 0-6 条；2. authorName 可以是当前执行角色真名，也可以是符合社交圈边界的真实感 NPC 网名；3. 角色可以回复用户或其他人的评论，NPC 也可以发新评论、回复角色或互相回复；4. parentId 留空表示新评论，填写已有评论 ID 或本次前面输出的 id 表示回复；5. 不要代替用户发言，不要使用“NPC”“路人”“朋友A”这类占位名；6. 内容像真实社交软件评论区，短、自然、有上下文，不要解释设定；7. contentTranslation 规则：外语、粤语、方言、繁体中文、文言都要翻译成简体普通话；不要加“翻译：”前缀。'
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

function formatMusicTrackPrompt(track: MusicTrack) {
  return [
    `歌名：${track.name}`,
    `歌手：${track.artists.join('、') || '未知歌手'}`,
    `专辑：${track.album || '未知专辑'}`,
    `音乐源：${track.source}`
  ].join('\n');
}

function formatMusicCommentPromptLine(comment: MusicComment) {
  const replyText = comment.parentId ? ` 回复 ${comment.parentId}` : '';
  return `${comment.id}｜${comment.authorName}${replyText}：${comment.content}`;
}

function normalizeMusicComments(value: unknown, input: { user: UserProfile; characters: CharacterProfile[]; existingComments: MusicComment[] }) {
  const source = Array.isArray((value as { comments?: unknown[] })?.comments)
    ? (value as { comments: unknown[] }).comments
    : Array.isArray(value)
      ? value
      : [];
  const characterById = new Map(input.characters.map((character) => [character.id, character]));
  const existingCommentIds = new Set(input.existingComments.map((comment) => comment.id));
  const generatedIdByDraftId = new Map<string, string>();
  const comments: MusicComment[] = [];
  const createdAt = Date.now();

  source.forEach((entry, index) => {
    if (comments.length >= 12 || !entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const content = String(record.content ?? record.text ?? record.comment ?? '').trim();
    if (!content) return;

    const draftId = String(record.id ?? record.draftId ?? '').trim();
    const id = createId('music_comment');
    if (draftId) generatedIdByDraftId.set(draftId, id);

    const authorId = String(record.authorId ?? record.characterId ?? '').trim();
    const character = authorId ? characterById.get(authorId) : undefined;
    const authorType = character ? 'character' : 'passerby';
    const fallbackName = character ? getCharacterVoomAuthorName(character) : `听友${Math.floor(1000 + Math.random() * 9000)}`;
    const authorName = String(record.authorName ?? record.name ?? fallbackName).trim() || fallbackName;
    const rawParentId = String(record.parentId ?? record.replyTo ?? '').trim();
    const parentId = existingCommentIds.has(rawParentId)
      ? rawParentId
      : generatedIdByDraftId.get(rawParentId) ?? '';
    const contentTranslation = normalizeTranslationText(record.contentTranslation ?? record.translation ?? record.translationZh ?? record.chineseTranslation);

    comments.push({
      id,
      authorName,
      authorId: character?.id,
      authorType,
      avatar: character?.avatar,
      content,
      ...(contentTranslation ? { contentTranslation } : {}),
      ...(parentId && parentId !== id ? { parentId } : {}),
      createdAt: createdAt + index
    });
  });

  return comments;
}

export async function generateMusicCommentThread(input: {
  track: MusicTrack;
  user: UserProfile;
  characters: CharacterProfile[];
  existingComments?: MusicComment[];
  mode?: 'replace' | 'expand';
  settings?: AppSettings;
  modelOverride?: string;
}) {
  requireTextGenerationConfig(input.settings, input.modelOverride, '音乐评论区生成');
  const existingComments = input.existingComments ?? [];
  const boundCharacters = input.characters.filter((character) => character.boundUserId === input.user.id);
  const characterText = boundCharacters.length
    ? boundCharacters.map((character) => [
      `id: ${character.id}`,
      `角色真名: ${getCharacterAiName(character)}`,
      `主页网名: ${getCharacterVoomAuthorName(character)}`,
      `签名: ${character.signature || '无'}`,
      `设定: ${character.description || '无'}`
    ].join('；')).join('\n')
    : '当前账号暂未绑定角色。';
  const prompt = [
    '你要为 LINK 音乐页生成一个独立的歌曲评论区。它不是线上聊天、线下 RP 或 VOOM 会话，不要写入任何聊天事件。只输出 JSON，不要输出 JSON 以外的文字。',
    `当前用户真名：${getUserAiName(input.user)}（不要代替该用户发评论）`,
    `当前用户主页网名：${getUserVoomAuthorName(input.user)}`,
    `歌曲信息：\n${formatMusicTrackPrompt(input.track)}`,
    `该用户账号绑定的角色：\n${characterText}`,
    existingComments.length ? `已有评论区：\n${existingComments.map(formatMusicCommentPromptLine).join('\n')}` : '已有评论区：暂无。',
    input.mode === 'expand' ? '任务：在已有评论区基础上追加新的评论和回复，延续上下文。' : '任务：生成一版新的完整评论区，可包含一级评论和互相回复。',
    `输出格式：
{
  "comments": [
    { "id": "c1", "authorId": "绑定角色id，可留空", "authorName": "角色昵称或真实感听友名", "content": "评论内容", "contentTranslation": "如需翻译则填写，否则留空", "parentId": "回复的已有评论ID或本次前面输出的id，可留空" }
  ]
}`,
    '要求：1. 输出 8-12 条；2. 至少包含 2 条该用户绑定角色的评论或回复，角色 authorId 必须来自绑定角色；3. 其余可以是有真实感的路人听友；4. 可以回复任意已有评论或本次前面评论；5. 不要使用“NPC”“路人A”“朋友A”这类占位名；6. 语气像音乐 App 评论区，短、自然、有情绪和梗，但不要刷屏；7. contentTranslation 规则：外语、粤语、方言、繁体中文、文言/古风表达都要翻译成自然现代简体普通话，不要加“翻译：”前缀。'
  ].join('\n\n');

  const apiReply = await callTextApi(input.settings, prompt, input.modelOverride);
  if (!apiReply) return [];
  try {
    return normalizeMusicComments(JSON.parse(extractJsonContent(apiReply)), { user: input.user, characters: boundCharacters, existingComments });
  } catch {
    return [];
  }
}

export async function generateConversationSummary(input: {
  messages: string;
  previousSummary: string;
  timeAwareness?: ConversationTimeAwarenessSettings;
  timeAwarenessUserName?: string;
  timelineContext?: string;
  settings?: AppSettings;
  modelOverride?: string;
  promptOverride?: string;
}) {
  const includeTimeline = Boolean(input.timeAwareness?.enabled);
  const timeAwarenessPrompt = includeTimeline
    ? renderTimeAwarenessPrompt(input.timeAwareness, { userName: input.timeAwarenessUserName || '用户' })
    : '';
  const prompt = [
    input.promptOverride?.trim() || '请把下面聊天楼层整理成结构化长期记忆。每条一行：- [类型|状态|重要度1-5|主体|证据楼层] 内容。类型只能用 fact/preference/promise/conflict/plot/relationship/boundary/emotion/world；状态只能用 active/open/resolved/superseded/cancelled。必须根据新聊天校验旧记忆，已解决或被推翻的事项不能继续写成 open；不要评价用户；用中文输出。',
    timeAwarenessPrompt,
    '记忆生命周期规则：新聊天优先于旧记忆；同一事实有新版本时保留新版本，并把旧版本标为 superseded 或移除；承诺/冲突/未解决事项只有仍需要后续处理时才标为 open；已经回应、兑现、和解、拒绝或撤销的事项标为 resolved/cancelled，且不要在后续回复里反复催促。',
    includeTimeline ? '时间线写入规则：每条内容尽量携带楼层、日期或相对时间；不要只写“之前”“后来”等模糊顺序；无法确认精确时间时，保留可见楼层范围和已知时间范围。' : '',
    input.previousSummary ? `旧记忆候选（仅供校验和更新，不是绝对事实）：\n${input.previousSummary}` : '旧记忆候选：暂无。',
    includeTimeline && input.timelineContext ? `待总结事件时间线：\n${input.timelineContext}` : '',
    `待总结聊天：\n${input.messages}`
  ].filter(Boolean).join('\n\n');
  const apiReply = await callTextApi(input.settings, prompt, input.modelOverride);
  return apiReply || input.messages.slice(0, 1400);
}

function formatAtomForAudit(atom: Pick<ConversationMemoryAtom, 'id' | 'type' | 'status' | 'subject' | 'content' | 'importance' | 'owner' | 'counterparty' | 'due' | 'resolution' | 'evidenceFloors' | 'lastTouchedFloor'>) {
  const meta = [
    atom.owner ? `owner=${atom.owner}` : '',
    atom.counterparty ? `counterparty=${atom.counterparty}` : '',
    atom.due ? `due=${atom.due}` : '',
    atom.resolution ? `resolution=${atom.resolution}` : '',
    atom.evidenceFloors?.length ? `floors=${atom.evidenceFloors.join('/')}` : '',
    atom.lastTouchedFloor ? `lastFloor=${atom.lastTouchedFloor}` : ''
  ].filter(Boolean).join('; ');
  return `- id=${atom.id} [${atom.type}|${atom.status}|${atom.importance}|${atom.subject}${meta ? `|${meta}` : ''}] ${atom.content}`;
}

function normalizeMemoryAtomAuditResult(value: unknown, allowedIds: Set<string>): MemoryAtomAuditResult {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawUpdates = Array.isArray(record.updates) ? record.updates : [];
  const statuses: ConversationMemoryEntryStatus[] = ['active', 'open', 'resolved', 'superseded', 'cancelled'];
  const types: ConversationMemoryEntryType[] = ['fact', 'preference', 'promise', 'conflict', 'plot', 'relationship', 'boundary', 'emotion', 'world'];
  const updates = rawUpdates
    .map((item): MemoryAtomAuditUpdate | null => {
      if (!item || typeof item !== 'object') return null;
      const update = item as Record<string, unknown>;
      const id = String(update.id ?? '').trim();
      if (!id || !allowedIds.has(id)) return null;
      const status = String(update.status ?? '').trim() as ConversationMemoryEntryStatus;
      const type = String(update.type ?? '').trim() as ConversationMemoryEntryType;
      const normalizedUpdate: MemoryAtomAuditUpdate = { id };
      if (statuses.includes(status)) normalizedUpdate.status = status;
      if (types.includes(type)) normalizedUpdate.type = type;
      const textFields = ['subject', 'content', 'owner', 'counterparty', 'due', 'resolution', 'reason'] as const;
      textFields.forEach((field) => {
        const text = String(update[field] ?? '').replace(/\s+/g, ' ').trim();
        if (text) normalizedUpdate[field] = text;
      });
      const importance = Math.round(Number(update.importance));
      if (Number.isFinite(importance)) normalizedUpdate.importance = Math.min(5, Math.max(1, importance));
      const confidence = Number(update.confidence);
      if (Number.isFinite(confidence)) normalizedUpdate.confidence = Math.min(1, Math.max(0, confidence));
      return Object.keys(normalizedUpdate).length > 1 ? normalizedUpdate : null;
    })
    .filter((item): item is MemoryAtomAuditUpdate => Boolean(item));
  return { updates };
}

export async function generateMemoryAtomAudit(input: {
  conversationText: string;
  previousAtoms: ConversationMemoryAtom[];
  newAtoms: ConversationMemoryAtom[];
  settings?: AppSettings;
  modelOverride?: string;
}) {
  const previousAtoms = input.previousAtoms.slice(0, 28);
  if (!previousAtoms.length || !input.conversationText.trim()) return { updates: [] } satisfies MemoryAtomAuditResult;
  const allowedIds = new Set(previousAtoms.map((atom) => atom.id));
  const prompt = [
    '你是聊天记忆生命周期审查器。请只审查“旧原子记忆”是否被“本轮对话”和“新原子候选”更新、解决、推翻或取消。',
    '只允许输出 JSON 对象，不要 Markdown，不要解释。格式：{"updates":[{"id":"旧原子ID","status":"active|open|resolved|superseded|cancelled","content":"可选的新内容","subject":"可选主题","owner":"可选责任方","counterparty":"可选对象","due":"可选期限","resolution":"可选结果","importance":1-5,"confidence":0-1,"reason":"简短原因"}]}。',
    '规则：只能引用旧原子里存在的 id；不要为新事实编造 id；承诺/冲突仍需后续处理才保留 open；已经兑现、和解、拒绝、撤销或被新版本覆盖的，改为 resolved/superseded/cancelled；信息不足就不要输出该原子的更新。',
    `旧原子记忆：\n${previousAtoms.map(formatAtomForAudit).join('\n')}`,
    input.newAtoms.length ? `新原子候选：\n${input.newAtoms.slice(0, 18).map(formatAtomForAudit).join('\n')}` : '新原子候选：暂无。',
    `本轮对话：\n${input.conversationText}`
  ].join('\n\n');
  const apiReply = await callTextApi(input.settings, prompt, input.modelOverride);
  if (!apiReply.trim()) return { updates: [] } satisfies MemoryAtomAuditResult;
  try {
    return normalizeMemoryAtomAuditResult(JSON.parse(extractJsonContent(apiReply)), allowedIds);
  } catch {
    return { updates: [] } satisfies MemoryAtomAuditResult;
  }
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
  try {
    const { response } = await fetchTextEndpoint(embeddingsEndpoint, {
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