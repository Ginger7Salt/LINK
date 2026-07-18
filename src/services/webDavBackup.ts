import type { LinkBackupFile } from '@/utils/backup';
import type { WebDavBackupSettings } from '@/types/domain';
import { stringifyLinkBackupFile } from '@/utils/backup';
import { decryptLinkBackupText, encryptLinkBackupText } from './encryptedBackup';

const retainedVersionCount = 10;

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildAuthorization(settings: WebDavBackupSettings) {
  return `Basic ${encodeBase64Utf8(`${settings.username}:${settings.password}`)}`;
}

function appendWebDavPath(baseUrl: string, path: string) {
  const target = new URL(baseUrl);
  const basePath = target.pathname.endsWith('/') ? target.pathname : `${target.pathname}/`;
  const relativePath = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  target.pathname = `${basePath}${relativePath}`.replace(/\/{2,}/g, '/');
  return target.toString();
}

function fileNameFromPath(path: string) {
  return path.split('/').filter(Boolean).pop() || 'babylink-backup.enc.json';
}

function parentPath(path: string) {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `${parts.join('/')}/` : '';
}

async function webDavRequest(settings: WebDavBackupSettings, method: string, targetUrl: string, body?: BodyInit, extraHeaders: Record<string, string> = {}) {
  const relayUrl = `/api/webdav?${new URLSearchParams({ url: targetUrl }).toString()}`;
  return await fetch(relayUrl, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Link-WebDAV-Authorization': buildAuthorization(settings),
      ...extraHeaders
    },
    body
  });
}

async function assertWebDavResponse(response: Response, action: string) {
  if (response.ok || response.status === 207) return response;
  let message = '';
  try {
    const body = await response.json() as { message?: string };
    message = body.message ?? '';
  } catch {
    message = await response.text().catch(() => '');
  }
  throw new Error(`${action}失败（${response.status}）${message ? `：${message}` : ''}`);
}

function parseVersionUrls(xmlText: string, settings: WebDavBackupSettings) {
  const documentValue = new DOMParser().parseFromString(xmlText, 'application/xml');
  const hrefElements = Array.from(documentValue.getElementsByTagNameNS('*', 'href'));
  const latestName = fileNameFromPath(settings.path);
  const prefix = `${latestName}.`;
  return hrefElements
    .map((element) => {
      try {
        const href = new URL(element.textContent || '', settings.url);
        const name = decodeURIComponent(href.pathname.split('/').pop() || '');
        const timestamp = Number(name.startsWith(prefix) ? name.slice(prefix.length) : 0);
        return Number.isFinite(timestamp) && timestamp > 0 ? { timestamp, url: href.toString() } : null;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { timestamp: number; url: string } => Boolean(entry))
    .sort((left, right) => right.timestamp - left.timestamp);
}

async function pruneOldVersions(settings: WebDavBackupSettings) {
  const directoryUrl = appendWebDavPath(settings.url, parentPath(settings.path));
  const response = await webDavRequest(
    settings,
    'PROPFIND',
    directoryUrl,
    '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getlastmodified/><getcontentlength/></prop></propfind>',
    { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }
  );
  if (!(response.ok || response.status === 207)) return;
  const versions = parseVersionUrls(await response.text(), settings);
  await Promise.all(versions.slice(retainedVersionCount).map((version) => webDavRequest(settings, 'DELETE', version.url).catch(() => undefined)));
}

export async function testWebDavConnection(settings: WebDavBackupSettings) {
  const response = await webDavRequest(
    settings,
    'PROPFIND',
    settings.url,
    '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>',
    { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' }
  );
  await assertWebDavResponse(response, 'WebDAV 连接测试');
}

export async function uploadEncryptedWebDavBackup(settings: WebDavBackupSettings, backup: LinkBackupFile) {
  if (!settings.url || !settings.username || !settings.password || !settings.path || !settings.recoveryKey) {
    throw new Error('WebDAV 地址、账号、应用密码、路径和恢复密钥必须填写完整。');
  }
  const encryptedText = await encryptLinkBackupText(stringifyLinkBackupFile(backup), settings.recoveryKey, backup.exportedAt);
  const latestUrl = appendWebDavPath(settings.url, settings.path);
  const temporaryUrl = appendWebDavPath(settings.url, `${settings.path}.tmp-${crypto.randomUUID?.() ?? Date.now()}`);
  const versionUrl = appendWebDavPath(settings.url, `${settings.path}.${backup.exportedAt}`);
  const contentType = { 'Content-Type': 'application/vnd.babylink.encrypted-backup+json' };

  await assertWebDavResponse(await webDavRequest(settings, 'PUT', temporaryUrl, encryptedText, contentType), '上传临时备份');
  const moveResponse = await webDavRequest(settings, 'MOVE', temporaryUrl, undefined, {
    'X-Link-WebDAV-Destination': latestUrl,
    Overwrite: 'T'
  });
  if (!(moveResponse.ok || moveResponse.status === 201 || moveResponse.status === 204)) {
    await assertWebDavResponse(await webDavRequest(settings, 'PUT', latestUrl, encryptedText, contentType), '更新主备份');
    await webDavRequest(settings, 'DELETE', temporaryUrl).catch(() => undefined);
  }
  await assertWebDavResponse(await webDavRequest(settings, 'PUT', versionUrl, encryptedText, contentType), '保存历史备份');
  await pruneOldVersions(settings).catch(() => undefined);
  return { exportedAt: backup.exportedAt, byteLength: new Blob([encryptedText]).size };
}

export async function downloadEncryptedWebDavBackup(settings: WebDavBackupSettings) {
  if (!settings.url || !settings.username || !settings.password || !settings.path || !settings.recoveryKey) {
    throw new Error('WebDAV 配置或恢复密钥不完整。');
  }
  const response = await webDavRequest(settings, 'GET', appendWebDavPath(settings.url, settings.path));
  await assertWebDavResponse(response, '下载云端备份');
  return await decryptLinkBackupText(await response.text(), settings.recoveryKey);
}