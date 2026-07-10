export type StoragePersistenceStatus = 'granted' | 'denied' | 'unsupported' | 'unknown';

export type PwaInstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'failed';

interface BeforeInstallPromptChoice {
  outcome: 'accepted' | 'dismissed';
  platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
}

export interface StoragePersistenceResult {
  status: StoragePersistenceStatus;
  persisted: boolean;
  supported: boolean;
}

export interface BrowserStorageContext {
  installed: boolean;
  installPromptAvailable: boolean;
  standaloneDisplay: boolean;
  iosStandalone: boolean;
  embeddedBrowser: boolean;
  embeddedBrowserLabel: string;
  ios: boolean;
}

export const pwaInstallPromptChangeEvent = 'link:pwa-install-prompt-change';

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let pwaInstallPromptSetup = false;

function hasWindow() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function getNavigatorStandalone() {
  if (!hasWindow()) return false;
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function getStandaloneDisplayMode() {
  if (!hasWindow() || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function dispatchInstallPromptChange() {
  if (!hasWindow()) return;
  window.dispatchEvent(new Event(pwaInstallPromptChangeEvent));
}

export function setupPwaInstallPrompt() {
  if (!hasWindow() || pwaInstallPromptSetup) return;
  pwaInstallPromptSetup = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    dispatchInstallPromptChange();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    dispatchInstallPromptChange();
  });
}

export function canPromptPwaInstall() {
  return Boolean(deferredInstallPrompt);
}

export async function promptPwaInstall(): Promise<PwaInstallPromptOutcome> {
  if (!deferredInstallPrompt) return 'unavailable';

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  dispatchInstallPromptChange();

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    return choice.outcome;
  } catch {
    return 'failed';
  }
}

export function getBrowserStorageContext(): BrowserStorageContext {
  if (!hasWindow()) {
    return {
      installed: false,
      installPromptAvailable: false,
      standaloneDisplay: false,
      iosStandalone: false,
      embeddedBrowser: false,
      embeddedBrowserLabel: '',
      ios: false
    };
  }

  const userAgent = navigator.userAgent || '';
  const standaloneDisplay = getStandaloneDisplayMode();
  const iosStandalone = getNavigatorStandalone();
  const embeddedBrowserMatch = [
    { pattern: /MicroMessenger/i, label: '微信内置浏览器' },
    { pattern: /QQ\//i, label: 'QQ 内置浏览器' },
    { pattern: /MQQBrowser/i, label: 'QQ 浏览器内核' },
    { pattern: /WeiBo/i, label: '微博内置浏览器' },
    { pattern: /DingTalk/i, label: '钉钉内置浏览器' },
    { pattern: /Lark|Feishu/i, label: '飞书内置浏览器' },
    { pattern: /Aweme|BytedanceWebview|Toutiao|NewsArticle/i, label: '字节系内置浏览器' }
  ].find((entry) => entry.pattern.test(userAgent));

  return {
    installed: standaloneDisplay || iosStandalone,
    installPromptAvailable: canPromptPwaInstall(),
    standaloneDisplay,
    iosStandalone,
    embeddedBrowser: Boolean(embeddedBrowserMatch),
    embeddedBrowserLabel: embeddedBrowserMatch?.label ?? '',
    ios: /iPad|iPhone|iPod/i.test(userAgent)
  };
}

export async function queryPersistentStorage(): Promise<StoragePersistenceResult> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persisted) {
    return { status: 'unsupported', persisted: false, supported: false };
  }

  try {
    const persisted = await storage.persisted();
    return { status: persisted ? 'granted' : 'denied', persisted, supported: true };
  } catch {
    return { status: 'unknown', persisted: false, supported: true };
  }
}

export async function requestPersistentStorage(): Promise<StoragePersistenceResult> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persist) return await queryPersistentStorage();

  try {
    if (storage.persisted && await storage.persisted()) {
      return { status: 'granted', persisted: true, supported: true };
    }

    const persisted = await storage.persist();
    return { status: persisted ? 'granted' : 'denied', persisted, supported: true };
  } catch {
    return { status: 'unknown', persisted: false, supported: true };
  }
}
