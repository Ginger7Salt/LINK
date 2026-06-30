export function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件。'));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('图片读取失败。')));
    reader.readAsDataURL(file);
  });
}

export interface CompressInlineImageOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
  minBytes?: number;
  force?: boolean;
}

export interface ReadChatImageResult {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('图片加载失败。')));
    image.src = dataUrl;
  });
}

function isCompressibleInlineImage(dataUrl: string) {
  return /^data:image\/(?!svg\+xml|gif)/i.test(dataUrl.trim());
}

function estimateDataUrlBytes(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return dataUrl.length;
  const meta = dataUrl.slice(0, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1).replace(/\s+/g, '');
  if (/;base64/i.test(meta)) return Math.floor(payload.length * 0.75);
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
  } catch {
    return payload.length;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve) => {
    if (!canvas.toBlob) {
      resolve(dataUrlToBlob(canvas.toDataURL(mimeType, quality)));
      return;
    }

    canvas.toBlob((blob) => {
      resolve(blob ?? dataUrlToBlob(canvas.toDataURL(mimeType, quality)));
    }, mimeType, quality);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [meta = '', payload = ''] = dataUrl.split(',', 2);
  const mimeType = meta.match(/^data:([^;]+)/i)?.[1] || 'application/octet-stream';
  const binary = atob(payload.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('图片压缩失败。')));
    reader.readAsDataURL(blob);
  });
}

export async function compressInlineImageDataUrl(dataUrl: string, options: CompressInlineImageOptions = {}) {
  const source = dataUrl.trim();
  if (!isCompressibleInlineImage(source)) return dataUrl;

  const maxDimension = Math.max(1, Math.round(options.maxDimension ?? 800));
  const quality = Math.min(1, Math.max(0.1, options.quality ?? 0.62));
  const minBytes = Math.max(0, options.minBytes ?? 160 * 1024);
  const sourceBytes = estimateDataUrlBytes(source);
  if (!options.force && sourceBytes > 0 && sourceBytes < minBytes) return dataUrl;

  const image = await loadImage(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return dataUrl;

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  if (!options.force && scale === 1 && sourceBytes < minBytes * 1.35) return dataUrl;

  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const outputMimeType = options.mimeType ?? 'image/jpeg';
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;

  if (outputMimeType === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
  }
  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  const blob = await canvasToBlob(canvas, outputMimeType, quality);
  const compressed = await blobToDataUrl(blob);
  return compressed.length < source.length ? compressed : dataUrl;
}

const chatImageOriginalSizeLimit = 260_000;

export async function readChatImageFile(file: File, maxDimension = 720, quality = 0.72): Promise<ReadChatImageResult> {
  const source = await readImageFileAsDataUrl(file);
  const image = await loadImage(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('图片尺寸读取失败。');

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const canReuseOriginal = scale === 1 && file.size <= chatImageOriginalSizeLimit && /^image\/(?:png|jpe?g|webp)$/i.test(file.type);
  const mimeType = canReuseOriginal ? file.type : 'image/jpeg';

  if (canReuseOriginal) {
    return { dataUrl: source, width, height, mimeType: file.type };
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理图片。');
  if (mimeType === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
  }
  context.drawImage(image, 0, 0, outputWidth, outputHeight);
  return {
    dataUrl: canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? quality : undefined),
    width: outputWidth,
    height: outputHeight,
    mimeType
  };
}

export async function readImageFileFromInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !file.type.startsWith('image/')) return '';
  try {
    return await readImageFileAsDataUrl(file);
  } catch {
    return '';
  }
}