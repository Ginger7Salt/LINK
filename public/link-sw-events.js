self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = String(event.notification.data?.url || self.location.origin || '').trim();
  if (!targetUrl) return;

  event.waitUntil((async () => {
    const target = new URL(targetUrl, self.location.origin);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of windows) {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin !== target.origin) continue;
      await client.focus();
      if ('navigate' in client && client.url !== target.href) await client.navigate(target.href);
      return;
    }

    await self.clients.openWindow(target.href);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'LINK_KEEP_ALIVE_PING') return;
  self.__LINK_LAST_KEEP_ALIVE_PING__ = event.data.at || Date.now();
});