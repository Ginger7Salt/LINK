import { unzipSync } from 'fflate';
import type { Sticker, StickerGroup, StickerSourceType } from '@/types/domain';
import { createId } from './id';

export interface StickerImportDraft {
  description: string;
  imageUrl: string;
  sourceType: StickerSourceType;
}

const imageDownloadPath = '/__image-download';
const maxStickerImageBytes = 12 * 1024 * 1024;
const urlPattern = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s<>"'，。；;、)\]}]*?\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#][^\s<>"'，。；;、)\]}]*)?|https?:\/\/[^\s<>"'，。；;、)\]}]+)/gi;
const imageExtensionPattern = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#].*)?$/i;

function isDataImageUrl(value: string) {
  return /^data:image\//i.test(value.trim());
}

function isRemoteImageUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function inferImageMimeType(url: string) {
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
  return 'image/png';
}

function createImageDownloadUrl(url: string) {
  return import.meta.env.DEV && isRemoteImageUrl(url)
    ? `${imageDownloadPath}?url=${encodeURIComponent(url)}`
    : url;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片转码失败。'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
}

export function shouldLocalizeStickerImageUrl(imageUrl: string) {
  const trimmed = imageUrl.trim();
  return Boolean(trimmed) && !isDataImageUrl(trimmed) && isRemoteImageUrl(trimmed);
}

export async function localizeStickerImageUrl(imageUrl: string) {
  const trimmed = imageUrl.trim();
  if (!trimmed || isDataImageUrl(trimmed)) return trimmed;
  if (!isRemoteImageUrl(trimmed)) return trimmed;

  let response: Response;
  try {
    response = await fetch(createImageDownloadUrl(trimmed), {
      headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`贴纸图片下载失败，无法本地化：${message}。请改用本地图片导入，或通过可访问的图片代理/图床重新导入。`);
  }

  if (!response.ok) {
    throw new Error(`贴纸图片下载失败，状态码：${response.status}。请改用本地图片导入，或通过可访问的图片代理/图床重新导入。`);
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxStickerImageBytes) {
    throw new Error('贴纸图片超过 12MB，无法写入本地缓存。');
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  const downloadedBlob = await response.blob();
  if (!downloadedBlob.size) throw new Error('贴纸图片下载结果为空。');
  if (downloadedBlob.size > maxStickerImageBytes) throw new Error('贴纸图片超过 12MB，无法写入本地缓存。');

  const mimeType = downloadedBlob.type || contentType || inferImageMimeType(trimmed);
  if (!mimeType.startsWith('image/')) {
    throw new Error(`贴纸链接返回的不是图片内容：${mimeType || '未知类型'}。`);
  }

  return readBlobAsDataUrl(downloadedBlob.type ? downloadedBlob : new Blob([downloadedBlob], { type: mimeType }));
}

export async function localizeStickerImportDraft(draft: StickerImportDraft): Promise<StickerImportDraft> {
  if (!shouldLocalizeStickerImageUrl(draft.imageUrl)) return draft;
  return {
    ...draft,
    imageUrl: await localizeStickerImageUrl(draft.imageUrl)
  };
}

export async function localizeStickerImportDrafts(drafts: StickerImportDraft[]) {
  const localizedDrafts: StickerImportDraft[] = [];
  for (const draft of drafts) {
    localizedDrafts.push(await localizeStickerImportDraft(draft));
  }
  return localizedDrafts;
}

function stripWrappingPunctuation(value: string) {
  return value
    .trim()
    .replace(/^[\s,，;；|｜\-–—*·•]+/, '')
    .replace(/[\s,，;；|｜]+$/, '')
    .trim();
}

function normalizeDescription(description: string, fallback = 'Sticker') {
  const normalized = description
    .replace(/^[-*•\d.)、\s]+/, '')
    .replace(/^描述\s*[:：]/i, '')
    .replace(/^名称\s*[:：]/i, '')
    .replace(/^name\s*[:：]/i, '')
    .trim();
  return normalized || fallback;
}

function looksLikeImageUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith('data:image/') || /^https?:\/\//i.test(trimmed) && (imageExtensionPattern.test(trimmed) || /postimg|imgur|image|photo|pic|media|cdn/i.test(trimmed));
}

function uniqueDrafts(drafts: StickerImportDraft[]) {
  const seen = new Set<string>();
  const result: StickerImportDraft[] = [];
  for (const draft of drafts) {
    const imageUrl = stripWrappingPunctuation(draft.imageUrl);
    const description = normalizeDescription(draft.description);
    if (!imageUrl || !description || !looksLikeImageUrl(imageUrl)) continue;
    const key = `${description.toLocaleLowerCase()}::${imageUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ description, imageUrl, sourceType: draft.sourceType });
  }
  return result;
}

function parseJsonImport(text: string, sourceType: StickerSourceType) {
  const trimmed = text.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const entries = Array.isArray(parsed) ? parsed : Object.entries(parsed as Record<string, unknown>).map(([description, value]) => ({ description, value }));
    const drafts: StickerImportDraft[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string') {
        drafts.push(...parseStickerImportText(entry, sourceType));
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const description = String(record.description ?? record.text ?? record.name ?? record.title ?? record.label ?? '').trim();
      const imageUrl = String(record.imageUrl ?? record.url ?? record.src ?? record.image ?? record.value ?? '').trim();
      drafts.push({ description, imageUrl, sourceType });
    }
    return drafts;
  } catch {
    return [];
  }
}

function parseLineImport(line: string, sourceType: StickerSourceType) {
  const normalizedLine = line
    .replace(/\r/g, '\n')
    .replace(/[；;]+/g, '；')
    .replace(/[\t ]+/g, ' ')
    .trim();
  if (!normalizedLine) return [];

  const markdownMatches = [...normalizedLine.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/gi)];
  if (markdownMatches.length) {
    return markdownMatches.map((match) => ({
      description: match[1],
      imageUrl: match[2],
      sourceType
    }));
  }

  const urls = [...normalizedLine.matchAll(urlPattern)].map((match) => stripWrappingPunctuation(match[0]));
  if (!urls.length) return [];

  const matches = [...normalizedLine.matchAll(urlPattern)];
  return matches.map((match, index) => {
    const imageUrl = stripWrappingPunctuation(match[0]);
    const urlStart = match.index ?? normalizedLine.indexOf(imageUrl);
    const previousUrl = index > 0 ? matches[index - 1] : null;
    const previousEnd = previousUrl ? (previousUrl.index ?? 0) + previousUrl[0].length : 0;
    const nextUrl = matches[index + 1];
    const segmentBeforeUrl = normalizedLine.slice(previousEnd, urlStart).trim();
    const beforeUrl = segmentBeforeUrl || normalizedLine.slice(0, urlStart).trim();
    const afterUrl = nextUrl
      ? normalizedLine.slice(urlStart + match[0].length, nextUrl.index).trim()
      : normalizedLine.slice(urlStart + match[0].length).trim();
    const labelCandidate = stripWrappingPunctuation(
      beforeUrl
        .replace(/[\t|｜,，;；]+$/g, '')
        .replace(/[:：=]+$/g, '')
        .replace(/^[-*•\d.)、\s]+/, '')
    ) || stripWrappingPunctuation(afterUrl.replace(/^[:：=\t|｜,，;；]+/g, ''));

    return {
      description: normalizeDescription(labelCandidate, `Sticker ${index + 1}`),
      imageUrl,
      sourceType
    };
  });
}

export function parseStickerImportText(text: string, sourceType: StickerSourceType = 'manual') {
  const drafts = [
    ...parseJsonImport(text, sourceType),
    ...text
      .replace(/\r/g, '\n')
      .split(/\n+/)
      .flatMap((line) => parseLineImport(line, sourceType))
  ];
  return uniqueDrafts(drafts);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function readZipDocumentText(file: File) {
  const buffer = await file.arrayBuffer();
  const files = unzipSync(new Uint8Array(buffer));
  const decoder = new TextDecoder();
  const documentEntries = Object.entries(files).filter(([name]) => /word\/document\.xml$|word\/header\d*\.xml$|word\/footer\d*\.xml$/i.test(name));
  const xml = documentEntries.map(([, bytes]) => decoder.decode(bytes)).join('\n');
  return decodeXmlEntities(xml.replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, ' '));
}

function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('文件读取失败。'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}

export async function readStickerImportFile(file: File) {
  const lowerName = file.name.toLocaleLowerCase();
  if (/\.docx$/i.test(lowerName)) return readZipDocumentText(file);
  if (/\.doc$/i.test(lowerName)) {
    const text = await readTextFile(file);
    return text.replace(/\u0000/g, ' ');
  }
  return readTextFile(file);
}

export function readImageFileAsSticker(file: File) {
  return new Promise<StickerImportDraft>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.onload = () => {
      const fileName = file.name.replace(/\.[^.]+$/, '').trim() || '本地贴纸';
      resolve({
        description: fileName,
        imageUrl: String(reader.result ?? ''),
        sourceType: 'local-image'
      });
    };
    reader.readAsDataURL(file);
  });
}

export function createStickerGroup(name = '新分组'): StickerGroup {
  const now = Date.now();
  return {
    id: createId('sticker_group'),
    name: name.trim() || '新分组',
    createdAt: now,
    updatedAt: now
  };
}

export function createStickerFromDraft(draft: StickerImportDraft, groupIds: string[]): Sticker {
  const now = Date.now();
  return {
    id: createId('sticker'),
    description: normalizeDescription(draft.description),
    imageUrl: draft.imageUrl.trim(),
    groupIds: [...new Set(groupIds.filter(Boolean))],
    sourceType: draft.sourceType,
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeStickerGroup(group: Partial<StickerGroup> | null | undefined): StickerGroup | null {
  const id = String(group?.id ?? '').trim();
  const name = String(group?.name ?? '').trim();
  if (!id || !name) return null;
  const createdAt = Number(group?.createdAt) || Date.now();
  return {
    id,
    name,
    createdAt,
    updatedAt: Number(group?.updatedAt) || createdAt
  };
}

export function normalizeSticker(sticker: Partial<Sticker> | null | undefined, fallbackGroupId = ''): Sticker | null {
  const id = String(sticker?.id ?? '').trim();
  const description = normalizeDescription(String(sticker?.description ?? ''));
  const imageUrl = String(sticker?.imageUrl ?? '').trim();
  if (!id || !description || !imageUrl) return null;
  const createdAt = Number(sticker?.createdAt) || Date.now();
  const sourceType = ['url', 'local-image', 'text-file', 'doc-file', 'json-file', 'manual'].includes(String(sticker?.sourceType))
    ? sticker?.sourceType as StickerSourceType
    : 'manual';
  const normalizedGroupIds = [...new Set(
    Array.isArray(sticker?.groupIds)
      ? sticker.groupIds.map((item) => String(item).trim()).filter(Boolean)
      : []
  )];
  return {
    id,
    description,
    imageUrl,
    groupIds: normalizedGroupIds.length ? normalizedGroupIds : [fallbackGroupId].filter(Boolean),
    sourceType,
    createdAt,
    updatedAt: Number(sticker?.updatedAt) || createdAt
  };
}
