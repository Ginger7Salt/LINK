import type { FastifyInstance } from 'fastify';
import { requireSession } from './auth.js';
import { config } from './config.js';
import { createTimeoutSignal, validatePublicUrl } from './security.js';

const webDavMethods = ['GET', 'HEAD', 'PUT', 'DELETE', 'PROPFIND', 'MKCOL', 'MOVE'] as const;

function requestBody(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value);
  return Buffer.from(JSON.stringify(value));
}

export async function registerWebDavRelay(app: FastifyInstance) {
  app.addHttpMethod('PROPFIND', { hasBody: true });
  app.addHttpMethod('MKCOL');
  app.addHttpMethod('MOVE');

  app.route({
    method: [...webDavMethods],
    url: '/api/webdav',
    bodyLimit: config.webdavBodyLimitBytes,
    handler: async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session) return;
      const rawTarget = String((request.query as { url?: unknown } | null)?.url ?? '').trim();
      let target: URL;
      try {
        target = await validatePublicUrl(rawTarget, config.allowInsecureUpstreams ? ['http:', 'https:'] : ['https:']);
      } catch (error) {
        return await reply.code(400).send({ error: 'invalid_webdav_target', message: error instanceof Error ? error.message : 'WebDAV 地址无效。' });
      }

      const destinationHeader = String(request.headers['x-link-webdav-destination'] ?? '').trim();
      let destination = '';
      if (destinationHeader) {
        try {
          const destinationUrl = await validatePublicUrl(destinationHeader, config.allowInsecureUpstreams ? ['http:', 'https:'] : ['https:']);
          if (destinationUrl.origin !== target.origin) throw new Error('MOVE 目标必须与 WebDAV 地址同源。');
          destination = destinationUrl.toString();
        } catch (error) {
          return await reply.code(400).send({ error: 'invalid_webdav_destination', message: error instanceof Error ? error.message : 'WebDAV MOVE 目标无效。' });
        }
      }

      const method = request.method.toUpperCase();
      const headers = new Headers();
      const authorization = String(request.headers['x-link-webdav-authorization'] ?? '').trim();
      if (authorization) headers.set('Authorization', authorization);
      const contentType = String(request.headers['content-type'] ?? '').trim();
      if (contentType) headers.set('Content-Type', contentType);
      const depth = String(request.headers.depth ?? '').trim();
      if (depth) headers.set('Depth', depth);
      const overwrite = String(request.headers.overwrite ?? '').trim();
      if (overwrite) headers.set('Overwrite', overwrite);
      const ifMatch = String(request.headers['if-match'] ?? '').trim();
      if (ifMatch) headers.set('If-Match', ifMatch);
      if (destination) headers.set('Destination', destination);

      try {
        const upstream = await fetch(target, {
          method,
          headers,
          redirect: 'manual',
          signal: createTimeoutSignal(),
          ...(!['GET', 'HEAD', 'DELETE', 'PROPFIND', 'MKCOL'].includes(method) ? { body: requestBody(request.body) } : method === 'PROPFIND' && request.body ? { body: requestBody(request.body) } : {})
        });
        reply.code(upstream.status);
        for (const headerName of ['content-type', 'content-length', 'etag', 'last-modified', 'dav']) {
          const value = upstream.headers.get(headerName);
          if (value) reply.header(headerName, value);
        }
        reply.header('Cache-Control', 'no-store');
        if (method === 'HEAD') return reply.send();
        return reply.send(Buffer.from(await upstream.arrayBuffer()));
      } catch (error) {
        return await reply.code(502).send({ error: 'webdav_unreachable', message: error instanceof Error ? error.message : '无法连接 WebDAV。' });
      }
    }
  });
}