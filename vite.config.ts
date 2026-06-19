import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.BASE_PATH || '/';
const textProxyPath = '/__text-proxy';
const imageProxyPath = '/__image-proxy';
const openAiImageGeneratePath = '/__openai-image-generate';
const openAiModelsPath = '/__openai-models';
const imageDownloadPath = '/__image-download';

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function getForwardHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name];
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

function sendProxyError(response: ServerResponse, statusCode: number, message: string) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(message);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function createProxyErrorPayload(message: string, code = 'proxy_request_failed') {
  return {
    error: {
      message,
      type: 'link_proxy_error',
      param: '',
      code
    }
  };
}

export default defineConfig({
  base,
  server: {
    headers: {
      'Cache-Control': 'no-store'
    },
    proxy: {
      '/__openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__openai/, '')
      }
    }
  },
  plugins: [
    {
      name: 'link-openai-compatible-dev-proxy',
      configureServer(server) {
        server.middlewares.use(textProxyPath, async (request, response) => {
          if (request.method === 'OPTIONS') {
            response.statusCode = 204;
            response.end();
            return;
          }

          if (request.method !== 'POST') {
            sendProxyError(response, 405, 'Text proxy only supports POST requests.');
            return;
          }

          const requestUrl = new URL(request.url ?? '', 'http://localhost');
          const target = requestUrl.searchParams.get('url')?.trim() ?? '';

          let targetUrl: URL;
          try {
            targetUrl = new URL(target);
          } catch {
            sendProxyError(response, 400, 'Text proxy target URL is invalid.');
            return;
          }

          if (!['http:', 'https:'].includes(targetUrl.protocol)) {
            sendProxyError(response, 400, 'Text proxy target URL must use http or https.');
            return;
          }

          try {
            const headers = new Headers();
            const contentType = getForwardHeader(request, 'content-type');
            const authorization = getForwardHeader(request, 'authorization');
            const accept = getForwardHeader(request, 'accept');
            if (contentType) headers.set('Content-Type', contentType);
            if (authorization) headers.set('Authorization', authorization);
            if (accept) headers.set('Accept', accept);

            const upstreamResponse = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: await readRequestBody(request)
            });

            response.statusCode = upstreamResponse.status;
            response.statusMessage = upstreamResponse.statusText;
            const upstreamContentType = upstreamResponse.headers.get('content-type');
            if (upstreamContentType) response.setHeader('Content-Type', upstreamContentType);
            response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            sendProxyError(response, 502, `OpenAI-compatible text proxy request failed: ${message}`);
          }
        });

        server.middlewares.use(imageProxyPath, async (request, response) => {
          if (request.method === 'OPTIONS') {
            response.statusCode = 204;
            response.end();
            return;
          }

          if (request.method !== 'POST') {
            sendProxyError(response, 405, 'Image proxy only supports POST requests.');
            return;
          }

          const requestUrl = new URL(request.url ?? '', 'http://localhost');
          const target = requestUrl.searchParams.get('url')?.trim() ?? '';

          let targetUrl: URL;
          try {
            targetUrl = new URL(target);
          } catch {
            sendProxyError(response, 400, 'Image proxy target URL is invalid.');
            return;
          }

          if (!['http:', 'https:'].includes(targetUrl.protocol)) {
            sendProxyError(response, 400, 'Image proxy target URL must use http or https.');
            return;
          }

          try {
            const headers = new Headers();
            const contentType = getForwardHeader(request, 'content-type');
            const authorization = getForwardHeader(request, 'authorization');
            const accept = getForwardHeader(request, 'accept');
            if (contentType) headers.set('Content-Type', contentType);
            if (authorization) headers.set('Authorization', authorization);
            if (accept) headers.set('Accept', accept);

            const upstreamResponse = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: await readRequestBody(request)
            });

            response.statusCode = upstreamResponse.status;
            response.statusMessage = upstreamResponse.statusText;
            response.setHeader('X-Link-Proxy-Target-Host', targetUrl.host);
            const upstreamContentType = upstreamResponse.headers.get('content-type');
            if (upstreamContentType) response.setHeader('Content-Type', upstreamContentType);
            response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            response.setHeader('X-Link-Proxy-Error', 'upstream_unreachable');
            sendProxyError(response, 502, `OpenAI-compatible image proxy request failed: ${message}`);
          }
        });

        server.middlewares.use(openAiImageGeneratePath, async (request, response) => {
          if (request.method === 'OPTIONS') {
            response.statusCode = 204;
            response.end();
            return;
          }

          if (request.method !== 'POST') {
            sendJson(response, 405, createProxyErrorPayload('OpenAI image generation proxy only supports POST requests.', 'method_not_allowed'));
            return;
          }

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse((await readRequestBody(request)).toString('utf8')) as Record<string, unknown>;
          } catch {
            sendJson(response, 400, createProxyErrorPayload('OpenAI image generation proxy received invalid JSON.', 'invalid_json'));
            return;
          }

          const endpoint = String(payload.endpoint ?? '').trim();
          const apiKey = String(payload.apiKey ?? '').trim();
          const model = String(payload.model ?? '').trim();
          const prompt = String(payload.prompt ?? '').trim();
          const size = String(payload.size ?? '').trim();

          if (!endpoint || !apiKey || !model || !prompt) {
            sendJson(response, 400, createProxyErrorPayload('OpenAI image generation proxy requires endpoint, apiKey, model, and prompt.', 'missing_required_fields'));
            return;
          }

          let targetUrl: URL;
          try {
            targetUrl = new URL(endpoint);
          } catch {
            sendJson(response, 400, createProxyErrorPayload('OpenAI image generation endpoint is invalid.', 'invalid_endpoint'));
            return;
          }

          if (!['http:', 'https:'].includes(targetUrl.protocol)) {
            sendJson(response, 400, createProxyErrorPayload('OpenAI image generation endpoint must use http or https.', 'invalid_endpoint_protocol'));
            return;
          }

          try {
            const upstreamResponse = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model,
                prompt,
                ...(size ? { size } : {}),
                n: 1
              })
            });

            response.statusCode = upstreamResponse.status;
            response.statusMessage = upstreamResponse.statusText;
            const upstreamContentType = upstreamResponse.headers.get('content-type');
            response.setHeader('Content-Type', upstreamContentType || 'application/json; charset=utf-8');
            response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            sendJson(response, 502, createProxyErrorPayload(`OpenAI image generation proxy could not reach upstream: ${message}`, 'upstream_unreachable'));
          }
        });

        server.middlewares.use(openAiModelsPath, async (request, response) => {
          if (request.method === 'OPTIONS') {
            response.statusCode = 204;
            response.end();
            return;
          }

          if (request.method !== 'POST') {
            sendJson(response, 405, createProxyErrorPayload('OpenAI models proxy only supports POST requests.', 'method_not_allowed'));
            return;
          }

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse((await readRequestBody(request)).toString('utf8')) as Record<string, unknown>;
          } catch {
            sendJson(response, 400, createProxyErrorPayload('OpenAI models proxy received invalid JSON.', 'invalid_json'));
            return;
          }

          const apiUrl = String(payload.apiUrl ?? '').trim().replace(/\/+$/, '');
          const apiKey = String(payload.apiKey ?? '').trim();
          if (!apiUrl) {
            sendJson(response, 400, createProxyErrorPayload('OpenAI models proxy requires apiUrl.', 'missing_api_url'));
            return;
          }

          let targetUrl: URL;
          try {
            targetUrl = new URL(`${apiUrl}/models`);
          } catch {
            sendJson(response, 400, createProxyErrorPayload('OpenAI models endpoint is invalid.', 'invalid_endpoint'));
            return;
          }

          if (!['http:', 'https:'].includes(targetUrl.protocol)) {
            sendJson(response, 400, createProxyErrorPayload('OpenAI models endpoint must use http or https.', 'invalid_endpoint_protocol'));
            return;
          }

          try {
            const upstreamResponse = await fetch(targetUrl, {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
              }
            });

            response.statusCode = upstreamResponse.status;
            response.statusMessage = upstreamResponse.statusText;
            response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8');
            response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            sendJson(response, 502, createProxyErrorPayload(`OpenAI models proxy could not reach upstream: ${message}`, 'upstream_unreachable'));
          }
        });

        server.middlewares.use(imageDownloadPath, async (request, response) => {
          if (request.method !== 'GET') {
            sendProxyError(response, 405, 'Image download proxy only supports GET requests.');
            return;
          }

          const requestUrl = new URL(request.url ?? '', 'http://localhost');
          const target = requestUrl.searchParams.get('url')?.trim() ?? '';
          let targetUrl: URL;
          try {
            targetUrl = new URL(target);
          } catch {
            sendProxyError(response, 400, 'Image download target URL is invalid.');
            return;
          }

          if (!['http:', 'https:'].includes(targetUrl.protocol)) {
            sendProxyError(response, 400, 'Image download target URL must use http or https.');
            return;
          }

          try {
            const upstreamResponse = await fetch(targetUrl, { method: 'GET' });
            response.statusCode = upstreamResponse.status;
            response.statusMessage = upstreamResponse.statusText;
            const upstreamContentType = upstreamResponse.headers.get('content-type');
            if (upstreamContentType) response.setHeader('Content-Type', upstreamContentType);
            response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            sendProxyError(response, 502, `Image download proxy request failed: ${message}`);
          }
        });
      }
    },
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['link-icon.png'],
      manifest: {
        id: base,
        name: 'Link',
        short_name: 'Link',
        description: 'LINE style roleplay chat PWA',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'link-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});