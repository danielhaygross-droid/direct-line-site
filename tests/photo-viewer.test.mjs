import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = f => readFile(new URL(f, import.meta.url), 'utf8');

test('photos open in a viewer on the same page (client + admin), not a new tab', async () => {
  const common = await read('../dist/p/common.js'), css = await read('../dist/p/ui.css'), portal = await read('../dist/portal/portal.js'), admin = await read('../dist/admin/admin.js');
  assert.ok(common.includes('function openPhoto(list, index)') && common.includes("e.key === 'Escape'") && common.includes('stopImmediatePropagation'), 'viewer, Esc closes only the photo');
  assert.ok(common.includes('products\\/\\d+\\/photos'), 'order and product photos');
  assert.ok(!/photoUrl\(o\.id, p\.id\)}" target="_blank"/.test(common), 'order photos no longer open a new tab');
  assert.ok(!portal.includes('photos/${ph}" target="_blank"'), 'product photos no longer open a new tab');
  assert.ok(portal.includes('data-photo="1') && admin.includes('<img data-photo src="/api/portal/files/${t.id}?inline=1"'), 'image transfer confirmations too');
  assert.ok(css.includes('.pv{position:fixed;inset:0;z-index:3000'));
  for (const f of ['admin', 'portal']) { const html = await read(`../dist/${f}/index.html`); assert.ok(/common\.js\?v=(1[7-9]|[2-9]\d)/.test(html) && /ui\.css\?v=([9]|[1-9]\d)/.test(html), f); }
});
