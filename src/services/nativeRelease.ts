import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativeReleasePlatform = 'android' | 'ios';
export type NativeReleasePhase = 'idle' | 'checking' | 'latest' | 'available' | 'opening' | 'unsupported' | 'error';

export interface NativeRelease {
  id: string;
  platform: NativeReleasePlatform;
  versionCode: number;
  versionName: string;
  minimumVersionCode: number;
  mandatory: boolean;
  updateAvailable: boolean;
  sha256: string;
  fileSize: number;
  notes: string;
  publishedAt: number;
  downloadUrl: string;
  downloadExpiresAt: number;
}

export interface NativeReleaseStatus {
  supported: boolean;
  native: boolean;
  platform: NativeReleasePlatform | '';
  currentVersionCode: number;
  currentVersionName: string;
  phase: NativeReleasePhase;
  message: string;
  release: NativeRelease | null;
  lastCheckedAt: number;
}

interface LinkUpdaterPlugin {
  getVersion(): Promise<{ versionCode: number; versionName: string }>;
  openDownload(options: { url: string }): Promise<void>;
}

const LinkUpdater = registerPlugin<LinkUpdaterPlugin>('LinkUpdater');

function detectedPlatform(): NativeReleasePlatform | '' {
  const capacitorPlatform = Capacitor.getPlatform();
  if (capacitorPlatform === 'android' || capacitorPlatform === 'ios') return capacitorPlatform;
  if (/Android/i.test(navigator.userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios';
  return '';
}

function configuredVersion(platform: NativeReleasePlatform) {
  const code = platform === 'android' ? import.meta.env.VITE_ANDROID_VERSION_CODE : import.meta.env.VITE_IOS_VERSION_CODE;
  const name = platform === 'android' ? import.meta.env.VITE_ANDROID_VERSION_NAME : import.meta.env.VITE_IOS_VERSION_NAME;
  return { versionCode: Math.max(0, Number(code ?? 0) || 0), versionName: String(name ?? '').trim() };
}

export function createInitialNativeReleaseStatus(): NativeReleaseStatus {
  const platform = detectedPlatform();
  return {
    supported: Boolean(platform),
    native: Capacitor.isNativePlatform(),
    platform,
    currentVersionCode: 0,
    currentVersionName: '',
    phase: platform ? 'idle' : 'unsupported',
    message: platform ? '可以检查受保护的安装包版本。' : '当前设备不需要原生安装包。',
    release: null,
    lastCheckedAt: 0
  };
}

async function resolveInstalledVersion(platform: NativeReleasePlatform) {
  if (platform === 'android' && Capacitor.isNativePlatform()) {
    try {
      const version = await LinkUpdater.getVersion();
      return { versionCode: Math.max(0, Number(version.versionCode) || 0), versionName: String(version.versionName ?? '') };
    } catch {
      return configuredVersion(platform);
    }
  }
  return configuredVersion(platform);
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
  return body?.message || body?.error || `版本请求失败 (${response.status})`;
}

export async function checkNativeRelease(): Promise<NativeReleaseStatus> {
  const initial = createInitialNativeReleaseStatus();
  if (!initial.platform) return initial;
  const current = await resolveInstalledVersion(initial.platform);
  try {
    const params = new URLSearchParams({ platform: initial.platform, versionCode: String(current.versionCode) });
    const response = await fetch(`/api/releases/latest?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(await responseError(response));
    const release = await response.json() as NativeRelease | { release: null; updateAvailable: false };
    if ('release' in release && release.release === null) {
      return { ...initial, ...current, phase: 'latest', message: '管理员尚未发布该平台安装包。', lastCheckedAt: Date.now() };
    }
    const nativeRelease = release as NativeRelease;
    return {
      ...initial,
      ...current,
      release: nativeRelease,
      phase: nativeRelease.updateAvailable ? 'available' : 'latest',
      message: nativeRelease.updateAvailable ? `发现 ${nativeRelease.versionName} 版本。` : '当前原生壳已经是最新版本。',
      lastCheckedAt: Date.now()
    };
  } catch (error) {
    return { ...initial, ...current, phase: 'error', message: error instanceof Error ? error.message : '检查安装包失败。', lastCheckedAt: Date.now() };
  }
}

export async function openNativeReleaseDownload(release: NativeRelease) {
  const absoluteUrl = new URL(release.downloadUrl, window.location.origin).toString();
  if (release.platform === 'android' && Capacitor.isNativePlatform()) {
    try {
      await LinkUpdater.openDownload({ url: absoluteUrl });
      return;
    } catch {
      window.location.assign(absoluteUrl);
      return;
    }
  }
  window.location.assign(absoluteUrl);
}