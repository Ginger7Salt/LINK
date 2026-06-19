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

export interface ReadChatImageResult {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('图片加载失败。')));
    image.src = dataUrl;
  });
}

export async function readChatImageFile(file: File, maxDimension = 1280, quality = 0.86): Promise<ReadChatImageResult> {
  const source = await readImageFileAsDataUrl(file);
  const image = await loadImage(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('图片尺寸读取失败。');

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

  if (scale === 1 && file.size <= 900_000 && /^image\/(?:png|jpe?g|webp)$/i.test(file.type)) {
    return { dataUrl: source, width, height, mimeType: file.type };
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理图片。');
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