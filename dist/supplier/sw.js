// Supplier portal: shows notifications on this computer or phone (16 Nov 2026). The portal page itself checks every
// minute and asks this worker to show them (Android's Chrome can only show notifications through a worker). No push,
// no caching: a click brings the portal forward and opens the page the notification is about.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.hash) || 'orders';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(w => new URL(w.url).pathname.startsWith('/supplier/'));
    if (open) { open.postMessage({ hash }); return open.focus(); }
    return self.clients.openWindow('/supplier/#' + hash);
  }));
});
