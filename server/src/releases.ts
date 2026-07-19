import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getSessionIdentity, requireSession } from './auth.js';
import { config } from './config.js';
import { query } from './db.js';
import { createSignedTicket, safeFileName, verifySignedTicket } from './security.js';

interface ReleaseRow {
  id: string;
  platform: 'android' | 'ios';
  version_code: number;
  version_name: string;
  minimum_version_code: number;
  file_name: string;
  sha256: string;
  file_size: string;
  notes: string;
  created_at: Date;
}

export function normalizeReleaseNotes(value: unknown) {
  const source = String(value ?? '').trim();
  if (!source) return '';
  let normalized = source;
  if (/%[0-9a-f]{2}/i.test(normalized)) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {}
  }
  if (/[\u00c0-\u00ff\u0152\u0153]/.test(normalized)) {
    const repaired = Buffer.from(normalized, 'latin1').toString('utf8');
    const normalizedCjkCount = normalized.match(/[\u3400-\u9fff]/g)?.length ?? 0;
    const repairedCjkCount = repaired.match(/[\u3400-\u9fff]/g)?.length ?? 0;
    if (!repaired.includes('\ufffd') && repairedCjkCount > normalizedCjkCount) normalized = repaired;
  }
  return normalized.slice(0, 4000);
}

function isAdmin(request: FastifyRequest) {
  return Boolean(config.adminToken && request.headers.authorization === `Bearer ${config.adminToken}`);
}

function createDownloadTicket(row: ReleaseRow, qq: string) {
  return createSignedTicket({ releaseId: row.id, qq, expiresAt: Date.now() + 5 * 60 * 1000 });
}

function releasePayload(row: ReleaseRow, qq: string, currentVersionCode = 0) {
  const ticket = createDownloadTicket(row, qq);
  return {
    id: row.id,
    platform: row.platform,
    versionCode: row.version_code,
    versionName: row.version_name,
    minimumVersionCode: row.minimum_version_code,
    mandatory: currentVersionCode > 0 && currentVersionCode < row.minimum_version_code,
    updateAvailable: currentVersionCode === 0 || currentVersionCode < row.version_code,
    sha256: row.sha256,
    fileSize: Number(row.file_size),
    notes: normalizeReleaseNotes(row.notes),
    publishedAt: row.created_at.getTime(),
    downloadUrl: `/api/releases/${row.id}/download?${new URLSearchParams({ ticket }).toString()}`,
    downloadExpiresAt: Date.now() + 5 * 60 * 1000
  };
}

export async function registerReleaseRoutes(app: FastifyInstance) {
  await mkdir(config.releaseDir, { recursive: true });

  app.get('/api/releases/latest', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const queryValue = request.query as { platform?: unknown; versionCode?: unknown };
    const platform = String(queryValue.platform ?? 'android');
    const currentVersionCode = Math.max(0, Number(queryValue.versionCode ?? 0) || 0);
    if (!['android', 'ios'].includes(platform)) return await reply.code(400).send({ error: 'invalid_platform' });
    const result = await query<ReleaseRow>(`
      SELECT id, platform, version_code, version_name, minimum_version_code, file_name, sha256, file_size::text, notes, created_at
      FROM releases
      WHERE platform = $1 AND published = TRUE
      ORDER BY version_code DESC
      LIMIT 1
    `, [platform]);
    const release = result.rows[0];
    return release ? releasePayload(release, session.qq, currentVersionCode) : { platform, updateAvailable: false, release: null };
  });

  app.get('/api/releases/:id/download', async (request, reply) => {
    const id = String((request.params as { id?: string }).id ?? '');
    const session = await getSessionIdentity(request);
    const ticketValue = String((request.query as { ticket?: unknown } | null)?.ticket ?? '');
    const ticket = verifySignedTicket<{ releaseId?: unknown; qq?: unknown; expiresAt?: unknown }>(ticketValue);
    const ticketValid = ticket?.releaseId === id && Number(ticket.expiresAt ?? 0) > Date.now() && /^\d{5,12}$/.test(String(ticket.qq ?? ''));
    if (!session && !ticketValid) return await reply.code(401).send({ error: 'download_authorization_required', message: '下载票据无效或已经过期，请返回 BabyLink 重新获取。' });
    const result = await query<ReleaseRow>(`
      SELECT id, platform, version_code, version_name, minimum_version_code, file_name, sha256, file_size::text, notes, created_at
      FROM releases
      WHERE id = $1 AND published = TRUE
      LIMIT 1
    `, [id]);
    const release = result.rows[0];
    if (!release) return await reply.code(404).send({ error: 'release_not_found' });
    const fileName = safeFileName(release.file_name);
    const filePath = join(config.releaseDir, fileName);
    try {
      await stat(filePath);
    } catch {
      return await reply.code(404).send({ error: 'release_file_missing' });
    }
    reply.header('Content-Type', release.platform === 'android' ? 'application/vnd.android.package-archive' : 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    reply.header('Content-Length', release.file_size);
    reply.header('X-Content-SHA256', release.sha256);
    reply.header('Cache-Control', 'private, no-store');
    return reply.send(createReadStream(filePath));
  });

  app.put('/api/admin/releases/upload', { bodyLimit: config.webdavBodyLimitBytes }, async (request, reply) => {
    if (!isAdmin(request)) return await reply.code(401).send({ error: 'admin_auth_required' });
    const platform = String(request.headers['x-link-platform'] ?? '');
    const versionCode = Number(request.headers['x-link-version-code'] ?? 0);
    const versionName = String(request.headers['x-link-version-name'] ?? '').trim().slice(0, 40);
    const minimumVersionCode = Math.max(1, Number(request.headers['x-link-minimum-version-code'] ?? 1) || 1);
    const encodedNotes = String(request.headers['x-link-release-notes-base64'] ?? '').trim();
    const legacyNotes = request.headers['x-link-release-notes'];
    const notes = encodedNotes
      ? normalizeReleaseNotes(Buffer.from(encodedNotes, 'base64').toString('utf8'))
      : normalizeReleaseNotes(legacyNotes);
    if (!['android', 'ios'].includes(platform) || !Number.isInteger(versionCode) || versionCode < 1 || !versionName) {
      return await reply.code(400).send({ error: 'invalid_release_metadata' });
    }
    if (!Buffer.isBuffer(request.body) || !request.body.length) return await reply.code(400).send({ error: 'release_file_required' });

    const extension = platform === 'android' ? 'apk' : 'ipa';
    const fileName = `babylink-${platform}-${versionCode}.${extension}`;
    const temporaryPath = join(config.releaseDir, `.${fileName}.${randomUUID()}.tmp`);
    const finalPath = join(config.releaseDir, fileName);
    try {
      await writeFile(temporaryPath, request.body);
      const bytes = await readFile(temporaryPath);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await rename(temporaryPath, finalPath);
      const releaseId = randomUUID();
      await query(`
        INSERT INTO releases (id, platform, version_code, version_name, minimum_version_code, file_name, sha256, file_size, notes, published)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
        ON CONFLICT (platform, version_code) DO UPDATE SET
          version_name = EXCLUDED.version_name,
          minimum_version_code = EXCLUDED.minimum_version_code,
          file_name = EXCLUDED.file_name,
          sha256 = EXCLUDED.sha256,
          file_size = EXCLUDED.file_size,
          notes = EXCLUDED.notes,
          published = TRUE,
          created_at = NOW()
      `, [releaseId, platform, versionCode, versionName, minimumVersionCode, fileName, sha256, bytes.byteLength, notes]);
      return { ok: true, platform, versionCode, versionName, sha256, fileSize: bytes.byteLength };
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      return await reply.code(500).send({ error: 'release_upload_failed', message: error instanceof Error ? error.message : '安装包保存失败。' });
    }
  });
}