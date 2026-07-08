import type { ProfileTheme } from '@/types/domain';
import { createId } from './id';

const profileThemeExportMagic = 'LINK_PROFILE_THEME_V1';
const pngChannelCount = 3;
const exportPosterWidth = 1080;
const exportPosterHeight = 1350;

export const defaultProfileThemePrompt = `请为角色主页生成 3-5 句当前心声，像角色此刻不会在聊天气泡里直接说出口的内心独白。每句单独一行，不要重复聊天正文，不要解释格式。`;
export const defaultProfileThemeRegex = '';
export const defaultProfileThemeTemplate = '';
export const defaultProfileThemeCss = `.profile-theme-card {
  display: grid;
  gap: 6px;
  padding-top: 16px;
  border-top: 1px solid rgba(17, 17, 17, 0.08);
}

.profile-theme-line {
  color: #444444;
  font-size: 13px;
  line-height: 1.55;
}`;

export const defaultCustomProfileThemeCode = `<style>
.profile-homepage {
  display: grid;
  gap: 14px;
  min-height: 320px;
  padding: 20px;
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff 0%, #f6f8f7 100%);
  color: #171a1f;
}

.profile-homepage__title {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
}

.profile-homepage__content {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.profile-homepage__content p {
  margin: 0;
  color: #3d454e;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
</style>

<section class="profile-homepage">
  <h1 class="profile-homepage__title">{{title}}</h1>
  <div class="profile-homepage__content">{{lines}}</div>
</section>`;

interface ProfileThemeExportPayload {
  magic: typeof profileThemeExportMagic;
  version: 1;
  exportedAt: number;
  themes: Array<Omit<ProfileTheme, 'id' | 'charId' | 'createdAt' | 'updatedAt'>>;
}

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function normalizeBoolean(value: unknown, fallback = true) {
  if (value === false || value === 'false') return false;
  if (value === true || value === 'true') return true;
  return fallback;
}

export function createDefaultProfileTheme(characterId: string, timestamp = Date.now()): ProfileTheme {
  return {
    id: createId('profile-theme'),
    charId: characterId,
    name: 'Mood',
    prompt: defaultProfileThemePrompt,
    regex: defaultProfileThemeRegex,
    template: defaultProfileThemeTemplate,
    css: defaultProfileThemeCss,
    enabled: true,
    source: 'built-in',
    builtIn: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function normalizeProfileTheme(theme: Partial<ProfileTheme> | null | undefined, fallbackCharacterId = ''): ProfileTheme | null {
  if (!theme || typeof theme !== 'object') return null;
  const charId = normalizeText(theme.charId) || fallbackCharacterId.trim();
  const name = normalizeText(theme.name) || '主页主题';
  const prompt = normalizeText(theme.prompt) || defaultProfileThemePrompt;
  const createdAt = Number.isFinite(theme.createdAt) ? Number(theme.createdAt) : Date.now();
  const source = theme.source === 'imported' || theme.source === 'built-in' ? theme.source : 'custom';
  if (!charId || !name) return null;
  return {
    id: normalizeText(theme.id) || createId('profile-theme'),
    charId,
    name,
    prompt,
    regex: normalizeText(theme.regex),
    template: normalizeText(theme.template),
    css: normalizeText(theme.css),
    enabled: normalizeBoolean(theme.enabled, true),
    source,
    ...(theme.builtIn ? { builtIn: true } : {}),
    createdAt,
    updatedAt: Number.isFinite(theme.updatedAt) ? Number(theme.updatedAt) : createdAt
  };
}

export function normalizeProfileThemesForCharacter(themes: unknown, characterId: string): ProfileTheme[] {
  if (!Array.isArray(themes)) return [];
  const seen = new Set<string>();
  return themes
    .map((theme) => normalizeProfileTheme(theme as Partial<ProfileTheme>, characterId))
    .filter((theme): theme is ProfileTheme => Boolean(theme))
    .filter((theme) => {
      if (seen.has(theme.id)) return false;
      seen.add(theme.id);
      return true;
    })
    .sort((first, second) => first.createdAt - second.createdAt);
}

export function selectRandomEnabledProfileTheme(themes: ProfileTheme[]) {
  const enabledThemes = themes.filter((theme) => theme.enabled);
  return enabledThemes[Math.floor(Math.random() * enabledThemes.length)] ?? null;
}

export function isDefaultProfileTheme(theme: Pick<ProfileTheme, 'builtIn' | 'source' | 'name'> | null | undefined) {
  return Boolean(theme?.builtIn || theme?.source === 'built-in' || theme?.name === 'Mood');
}

export function normalizeProfileThemeContentLines(value: unknown, maxLines = 12) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAllTokens(template: string, tokens: Record<string, string>) {
  return Object.entries(tokens).reduce((result, [token, value]) => result.replace(new RegExp(escapeRegExp(token), 'g'), value), template);
}

export function splitProfileThemeCode(code: unknown) {
  const normalizedCode = normalizeText(code);
  const cssBlocks: string[] = [];
  const html = normalizedCode.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, css: string) => {
    const normalizedCss = normalizeText(css);
    if (normalizedCss) cssBlocks.push(normalizedCss);
    return '';
  }).trim();
  return {
    html,
    css: cssBlocks.join('\n\n').trim()
  };
}

export function composeProfileThemeCode(template: unknown, css: unknown) {
  const normalizedTemplate = normalizeText(template);
  const normalizedCss = normalizeText(css);
  return [
    normalizedCss ? `<style>\n${normalizedCss}\n</style>` : '',
    normalizedTemplate
  ].filter(Boolean).join('\n\n');
}

export function renderProfileThemeHtml(content: unknown, template: string) {
  const normalizedContent = normalizeText(content);
  const lines = normalizeProfileThemeContentLines(normalizedContent, 40);
  const escapedContent = escapeHtml(normalizedContent).replace(/\n/g, '<br />');
  const escapedLines = lines.map((line) => `<p class="profile-theme-line">${escapeHtml(line)}</p>`).join('');
  const normalizedTemplate = splitProfileThemeCode(template).html;
  if (!normalizedTemplate) return escapedLines || `<p class="profile-theme-line">${escapedContent}</p>`;
  return replaceAllTokens(normalizedTemplate, {
    '{{title}}': lines[0] ? escapeHtml(lines[0]) : '',
    '{{content}}': escapedContent,
    '{{rawContent}}': escapedContent,
    '{{lines}}': escapedLines,
    '{{profileThemeContent}}': escapedContent,
    '$content': escapedContent,
    '$rawContent': escapedContent,
    '$lines': escapedLines
  });
}

export function extractProfileThemeContent(rawContent: unknown, regex: string) {
  const content = normalizeText(rawContent);
  const pattern = normalizeText(regex);
  if (!content || !pattern) return content;

  try {
    const match = content.match(new RegExp(pattern, 's'));
    if (!match) return content;
    return normalizeText(match[1] ?? match[0]) || content;
  } catch {
    return content;
  }
}

function isAtRuleSelector(selector: string) {
  return selector.trim().startsWith('@');
}

export function scopeProfileThemeCss(css: string, scopeId: string) {
  const normalizedCss = normalizeText(css);
  const normalizedScopeId = scopeId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!normalizedCss || !normalizedScopeId) return '';
  const scopeSelector = `[data-profile-theme-scope="${normalizedScopeId}"]`;
  return normalizedCss.replace(/(^|})\s*([^@{}][^{]+)\s*{/g, (match, boundary: string, selectorText: string) => {
    const scopedSelectors = selectorText
      .split(',')
      .map((selector) => selector.trim())
      .filter(Boolean)
      .map((selector) => {
        if (selector.startsWith(scopeSelector) || isAtRuleSelector(selector)) return selector;
        if (selector === ':host' || selector === '&') return scopeSelector;
        if (selector.startsWith('&')) return `${scopeSelector}${selector.slice(1)}`;
        return `${scopeSelector} ${selector}`;
      });
    return scopedSelectors.length ? `${boundary}\n${scopedSelectors.join(', ')} {` : match;
  });
}

function createPayloadBytes(json: string) {
  const encoded = new TextEncoder().encode(json);
  const payload = new Uint8Array(4 + encoded.length);
  new DataView(payload.buffer).setUint32(0, encoded.length, false);
  payload.set(encoded, 4);
  return payload;
}

function getCanvasContext(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法创建 PNG 画布。');
  return { canvas, context };
}

function createRoundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const resolvedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + resolvedRadius, y);
  context.arcTo(x + width, y, x + width, y + height, resolvedRadius);
  context.arcTo(x + width, y + height, x, y + height, resolvedRadius);
  context.arcTo(x, y + height, x, y, resolvedRadius);
  context.arcTo(x, y, x + width, y, resolvedRadius);
  context.closePath();
}

function drawPoster(context: CanvasRenderingContext2D, themes: ProfileTheme[]) {
  const width = exportPosterWidth;
  const height = exportPosterHeight;
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#eef8f0');
  background.addColorStop(0.38, '#f4fbf5');
  background.addColorStop(1, '#eff7f1');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = 'rgba(108, 219, 146, 0.2)';
  context.beginPath();
  context.arc(width * 0.18, height * 0.14, width * 0.22, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = 'rgba(191, 242, 214, 0.22)';
  context.beginPath();
  context.arc(width * 0.84, height * 0.1, width * 0.18, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = 'rgba(255, 255, 255, 0.42)';
  context.fillRect(0, height * 0.58, width, height * 0.42);

  const cardX = 76;
  const cardY = 118;
  const cardWidth = width - 152;
  const cardHeight = height - 236;
  createRoundedRectPath(context, cardX, cardY, cardWidth, cardHeight, 42);
  context.fillStyle = 'rgba(255, 255, 255, 0.76)';
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  context.lineWidth = 2;
  context.stroke();

  const accent = '#0a8a44';
  const secondary = '#5f6771';
  const primary = '#111111';
  const body = '#2a3139';
  const names = themes.slice(0, 4).map((theme) => theme.name.trim() || '未命名主题');

  context.fillStyle = accent;
  context.font = '800 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText('LINK PROFILE SHARE', cardX + 56, cardY + 84);

  context.fillStyle = primary;
  context.font = '900 74px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText('主页主题', cardX + 56, cardY + 182);

  context.fillStyle = secondary;
  context.font = '600 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText(`导出 ${themes.length} 个自定义预设`, cardX + 56, cardY + 236);

  context.fillStyle = body;
  context.font = '500 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText('导入方式：在 LINK 主页自定义页选择 PNG 导入。', cardX + 56, cardY + 310);

  const chipTop = cardY + 366;
  names.forEach((name, index) => {
    const chipY = chipTop + index * 110;
    createRoundedRectPath(context, cardX + 48, chipY, cardWidth - 96, 78, 24);
    context.fillStyle = 'rgba(255, 255, 255, 0.84)';
    context.fill();
    context.strokeStyle = 'rgba(17, 17, 17, 0.05)';
    context.stroke();

    context.fillStyle = primary;
    context.font = '800 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillText(name, cardX + 80, chipY + 50, cardWidth - 160);
  });

  if (themes.length > names.length) {
    context.fillStyle = secondary;
    context.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillText(`还有 ${themes.length - names.length} 个预设包含在图片里`, cardX + 56, cardY + cardHeight - 96);
  }
}

function embedPayloadIntoImageData(data: Uint8ClampedArray, payload: Uint8Array) {
  const capacityBits = (data.length / 4) * pngChannelCount;
  const requiredBits = payload.length * 8;
  if (requiredBits > capacityBits) throw new Error('主题数据太大，无法写入 PNG。');

  let bitIndex = 0;
  for (let index = 0; index < data.length && bitIndex < requiredBits; index += 4) {
    for (let channel = 0; channel < pngChannelCount && bitIndex < requiredBits; channel += 1) {
      const byte = payload[bitIndex >> 3] ?? 0;
      const bit = (byte >> (7 - (bitIndex % 8))) & 1;
      data[index + channel] = (data[index + channel] & 0xfe) | bit;
      bitIndex += 1;
    }
  }
}

function normalizeThemeForExport(theme: ProfileTheme): ProfileThemeExportPayload['themes'][number] {
  return {
    name: theme.name,
    prompt: theme.prompt,
    regex: theme.regex,
    template: theme.template,
    css: theme.css,
    enabled: theme.enabled,
    source: 'imported'
  };
}

export async function encodeProfileThemesToPng(themes: ProfileTheme[]) {
  const payload = createPayloadBytes(JSON.stringify({
    magic: profileThemeExportMagic,
    version: 1,
    exportedAt: Date.now(),
    themes: themes.map(normalizeThemeForExport)
  } satisfies ProfileThemeExportPayload));
  const { canvas, context } = getCanvasContext(exportPosterWidth, exportPosterHeight);
  drawPoster(context, themes);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  embedPayloadIntoImageData(imageData.data, payload);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('PNG 主页主题图片读取失败。')), { once: true });
    image.src = dataUrl;
  });
}

function decodePayloadBytesFromLsb(data: Uint8ClampedArray) {
  const totalBytes = Math.floor(((data.length / 4) * pngChannelCount) / 8);
  if (totalBytes < 4) throw new Error('这张 PNG 不包含 LINK 主页主题数据。');

  const bytes = new Uint8Array(totalBytes);
  let byteIndex = 0;
  let bitOffset = 0;
  let currentByte = 0;

  for (let index = 0; index < data.length && byteIndex < totalBytes; index += 4) {
    for (let channel = 0; channel < pngChannelCount && byteIndex < totalBytes; channel += 1) {
      currentByte = (currentByte << 1) | (data[index + channel] & 1);
      bitOffset += 1;
      if (bitOffset === 8) {
        bytes[byteIndex] = currentByte;
        byteIndex += 1;
        bitOffset = 0;
        currentByte = 0;
      }
    }
  }

  const length = new DataView(bytes.buffer, 0, 4).getUint32(0, false);
  if (!Number.isFinite(length) || length <= 0 || length > bytes.length - 4) {
    throw new Error('这张 PNG 的主页主题数据不完整。');
  }
  return bytes.slice(4, 4 + length);
}

function parseProfileThemeExportPayload(payloadBytes: Uint8Array) {
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<ProfileThemeExportPayload>;
  if (payload.magic !== profileThemeExportMagic || payload.version !== 1 || !Array.isArray(payload.themes)) {
    throw new Error('这张 PNG 不是 LINK 主页主题。');
  }
  return payload.themes;
}

export async function decodeProfileThemesFromPng(dataUrl: string, characterId: string) {
  const image = await loadImageFromDataUrl(dataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const { context } = getCanvasContext(width, height);
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  const exportedThemes = parseProfileThemeExportPayload(decodePayloadBytesFromLsb(data));
  const now = Date.now();
  return exportedThemes
    .map((theme) => normalizeProfileTheme({
      ...theme,
      id: createId('profile-theme'),
      charId: characterId,
      source: 'imported',
      builtIn: false,
      createdAt: now,
      updatedAt: now
    }, characterId))
    .filter((theme): theme is ProfileTheme => Boolean(theme));
}
