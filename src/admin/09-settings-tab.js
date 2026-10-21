  // ---------- settings tab ----------
  function adminsHTML() {
    return S.ov.admins.map(x => `<div><span class="ava">${esc(initials(x.name))}</span><span class="who"><span><b>${esc(x.name)}</b><small>@${esc(x.username)}${x.active ? '' : ' · disabled'}</small></span></span><button type="button" class="btn btn-sm" data-edit-admin="${x.id}" style="margin-inline-start:auto">Edit</button></div>`).join('')
      + '<div><span class="ava">DL</span><span class="who"><span><b>Main admin login</b><small>set in Vercel</small></span></span></div>';
  }
  const BANK_UI = [['bank_currency', 'Currency'], ['bank_holder', 'Account holder name'], ['bank_account', 'Account number'], ['bank_ach', 'ACH routing number'],
    ['bank_wire', 'Wire routing number'], ['bank_swift', 'SWIFT/BIC'], ['bank_name', 'Bank name'], ['bank_address', 'Bank address'], ['bank_reference', 'Payment reference note']];
  function settingsHTML() {
    const s = S.ov.settings, rated = COUNTRIES.filter(([c]) => RATES[c]);
    return `<div class="settings-grid">
      <section class="card card-pad"><h3 class="form-sec">Fee per order</h3>
        <form class="form-grid" id="settings-form" novalidate>
          <label class="field"><span>Fee per order (USD)</span><span class="money"><input name="commission_per_order" type="number" min="0" step="0.01" value="${esc(s.commission_per_order)}"></span></label>
          <div class="full split" data-split></div>
          <label class="field"><span>Client subscription <small>₪ / month, after the free month</small></span><input name="subscription_price" type="number" min="0" step="0.01" value="${esc(s.subscription_price ?? 29)}"></label>
          <label class="field"><span>Size-to-weight divisor <small>cm³ per kg</small></span><input name="volumetric_divisor" type="number" min="1000" max="10000" step="1" value="${esc(s.volumetric_divisor)}"></label>
          <div class="field" style="align-content:end"><button class="btn btn-primary" type="submit">Save settings</button></div>
          <p class="form-msg full" data-settings-msg></p>
        </form>
        <p class="note" style="margin-top:6px">The fee is already inside the product cost the client pays, so clients don’t see it. Changes apply to new orders only. Size-based weight = L × W × H ÷ divisor (6000 until the supplier confirms).</p>
      </section>
      <section class="card card-pad"><h3 class="form-sec">Couriers</h3>
        <form class="form-grid" id="couriers-form" novalidate>
          <label class="field full"><span>Couriers the supplier can pick <small>one per line</small></span><textarea name="couriers" rows="4" maxlength="1000" data-no-i18n>${esc(String(s.couriers || ''))}</textarea></label>
          <div class="full" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save couriers</button><p class="form-msg" data-couriers-msg style="margin:0"></p></div>
        </form>
        <p class="note" style="margin-top:6px">These show as a dropdown in the Courier column of the supplier sheet. The supplier can also type a name that isn’t listed. Clients see the courier next to the tracking number.</p>
      </section>
      <section class="card card-pad"><h3 class="form-sec">How clients pay (bank details)</h3>
        <form class="form-grid" id="bank-form" novalidate>
          ${BANK_UI.map(([k, label]) => `<label class="field${k === 'bank_address' || k === 'bank_reference' ? ' full' : ''}"><span>${label}</span><input name="${k}" type="text" maxlength="200" value="${esc(s[k] ?? '')}"></label>`).join('')}
          <div class="field" style="align-content:end"><button class="btn btn-primary" type="submit">Save bank details</button></div>
          <p class="form-msg full" data-bank-msg></p>
        </form>
        <p class="note" style="margin-top:6px">Clients see these on their Payments page under “How to pay”, each with a Copy button. Leave a field empty to hide it.</p>
      </section>
      <section class="card card-pad"><h3 class="form-sec">Terms of Service</h3><p class="note">Publishing a new version requires every client to accept again. Previous versions and acceptance records are preserved.</p>
        <form id="terms-publish" class="form-grid"><label class="field full"><span>New version number</span><input name="version" type="number" min="${S.ov.termsPolicy.version + 1}" value="${S.ov.termsPolicy.version + 1}" required></label>
          <label class="field full"><span>English policy text</span><textarea name="english" rows="10" maxlength="18000" required>${esc(S.ov.termsPolicy.english)}</textarea></label>
          <label class="field full"><span>Hebrew policy text</span><textarea name="hebrew" rows="10" maxlength="18000" dir="rtl" required>${esc(S.ov.termsPolicy.hebrew)}</textarea></label>
          <div class="field full"><button type="submit" class="btn btn-primary">Publish new terms version</button></div><p class="form-msg full" data-terms-msg role="status"></p></form></section>
      <section class="card card-pad"><h3 class="form-sec">Shipping calculator</h3>
        <form class="form-grid" data-calc onsubmit="return false">
          <label class="field"><span>Destination</span><select name="country">${rated.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('')}</select></label>
          <label class="field"><span>Product type</span><select name="category">${categoryOptions('general')}</select></label>
          <label class="field"><span>Weight (kg)</span><input name="weight" type="number" min="0" step="0.01" placeholder="e.g. 0.25"></label>
          <div class="field"><span>Size L × W × H (cm)</span><div class="dims"><input name="l" type="number" min="0" placeholder="L" aria-label="Length"><input name="w" type="number" min="0" placeholder="W" aria-label="Width"><input name="h" type="number" min="0" placeholder="H" aria-label="Height"></div></div>
        </form>
        <div class="calc-out" data-calc-out><small>Shipping fee</small><strong>—</strong><div class="bd">Enter a weight.</div></div>
      </section>
      <section class="card card-pad"><h3 class="form-sec">Team accounts</h3><div class="acc-list" data-admins>${adminsHTML()}</div>
        <button type="button" class="btn" style="margin-top:12px" data-add-account="admin">${ic('plus')}Add admin</button></section>
      <section class="card card-pad"><h3 class="form-sec">Supplier sheet</h3><div data-supplier-sheet><p class="muted" style="margin:0">Loading…</p></div>
        <div class="row-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-sm" data-supplier-setup>Set up supplier sheet</button><button type="button" class="btn btn-sm" data-supplier-check hidden>Check sheet now</button></div>
        <p class="form-msg" data-supplier-msg role="status"></p></section>
      <section class="card card-pad"><h3 class="form-sec">Storage &amp; backups</h3><div data-storage><p class="muted" style="margin:0">Loading…</p></div>
        <div class="row-actions" data-storage-actions hidden style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-sm" data-backup-now>Back up now</button><button type="button" class="btn btn-sm" data-copy-files>Copy files now</button></div>
        <p class="form-msg" data-storage-msg role="status"></p></section>
      <section class="card card-pad"><h3 class="form-sec">Client portal link</h3><p class="muted" style="margin:0 0 10px;font-size:14px">Clients sign in here with the username and password you give them.</p>
        <div class="copy-line"><span style="flex:1">${esc(location.origin)}/portal/</span><button type="button" class="btn btn-sm" data-copy="${esc(location.origin)}/portal/">${ic('copy')}Copy</button></div></section>
    </div>`;
  }
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function storageHTML(d) {
    const s = d.storage;
    if (!s.configured) return '<p class="note" style="margin:0">File storage isn’t connected yet. Photos and documents stay in the database as before. Connect a private Blob store in Vercel to turn on file storage and daily backups.</p>';
    const total = s.kinds.reduce((n, k) => n + k.total, 0), copied = s.kinds.reduce((n, k) => n + k.copied, 0), cleared = s.kinds.reduce((n, k) => n + k.cleared, 0);
    const dbBytes = s.kinds.reduce((n, k) => n + k.databaseBytes, 0);
    const files = `<p style="margin:0 0 6px"><b>${copied} of ${total} files copied to file storage.</b></p>
      <p class="note" style="margin:0"><span>${s.clearing ? `${cleared} database copies removed after checking.` : 'Database copies are kept for safety.'}</span> <span>Files still in the database: ${kb(dbBytes)}</span></p>`;
    const list = d.backups.length ? `<div class="acc-list">${d.backups.slice(0, 7).map(b => `<div><span class="who"><span><b>${esc(fmtDay(b.date))}</b><small>${kb(b.bytes)}</small></span></span><a class="btn btn-sm" style="margin-inline-start:auto" href="/api/portal/admin/backups/${encodeURIComponent(b.name)}" target="_blank" rel="noopener" data-backup-link>Download</a></div>`).join('')}</div>`
      : `<p class="note" style="margin:0">${d.backupError ? esc(d.backupError) : 'No backups yet. The first one runs automatically within a day, or press Back up now.'}</p>`;
    return files + '<p style="margin:12px 0 6px"><b>Daily backups</b> <small class="muted">kept for 30 days</small></p>' + list;
  }
  async function loadStorage() {
    const box = $('[data-storage]'); if (!box) return;
    try { const d = await api('/admin/storage'); box.innerHTML = storageHTML(d); $('[data-storage-actions]').hidden = !d.storage.configured; }
    catch (ex) { box.innerHTML = `<p class="note" style="margin:0">${esc(ex.message)}</p>`; }
  }
  function bindStorage() {
    loadStorage();
    const m = $('[data-storage-msg]');
    const run = (sel, path, done) => { const b = $(sel); if (b) b.addEventListener('click', async () => {
      b.disabled = true; m.textContent = 'Working…'; m.className = 'form-msg';
      try { const r = await api(path, { method: 'POST' }); m.textContent = done(r); m.className = 'form-msg ok'; await loadStorage(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      b.disabled = false;
    }); };
    run('[data-backup-now]', '/admin/backups/run', r => r.configured === false ? 'File storage isn’t connected yet.' : 'Backup saved.');
    run('[data-copy-files]', '/admin/storage/sync', r => r.configured === false ? 'File storage isn’t connected yet.' : `${r.copied} files copied.${r.failed ? ` ${r.failed} will be retried.` : ''}${r.more ? ' More remain; they continue automatically every hour.' : ''}`);
  }
  // Supplier Work Queue: suppliers fill in total cost, tracking and shipping status in the Google Sheet.
  function supplierSheetHTML(d) {
    if (!d.configured) return '<p class="note" style="margin:0">The Google Sheet isn’t connected.</p>';
    if (!d.enabled) return '<p class="note" style="margin:0">Set up adds three yellow columns to the Orders tab for the supplier: Total cost (whole order, USD), Tracking number and Shipping status. The website then bills clients (total + fee), adds tracking and marks orders Shipped within a minute. The current tab is kept as a hidden backup tab.</p>';
    const l = d.last;
    return `<p style="margin:0 0 6px"><b>On.</b> <span>The website reads the supplier columns every minute.</span></p>${l ? `<p class="note" style="margin:0"><span>Last check</span> <span data-no-i18n>${esc(fullDate(l.at))}</span>: ${l.ok ? `<span data-no-i18n>${l.checked}</span> <span>orders checked</span>, <span data-no-i18n>${l.changed}</span> <span>updated</span>` : `<span>error</span> <span data-no-i18n>${esc(l.error)}</span>`}</p>${(l.skipped || []).length ? `<p class="note" style="margin:6px 0 0"><b>Needs a look:</b> <span data-no-i18n>${l.skipped.map(s => esc((s.ref || '#' + s.orderId) + ' — ' + s.why.join(', '))).join('; ')}</span></p>` : ''}` : ''}`;
  }
  async function loadSupplierSheet() {
    const box = $('[data-supplier-sheet]'); if (!box) return;
    try { const d = await api('/admin/supplier-sheet'); box.innerHTML = supplierSheetHTML(d); const setupBtn = $('[data-supplier-setup]'); setupBtn.hidden = !d.configured; setupBtn.textContent = d.enabled ? 'Rebuild supplier sheet' : 'Set up supplier sheet'; $('[data-supplier-check]').hidden = !d.enabled; }
    catch (ex) { box.innerHTML = `<p class="note" style="margin:0">${esc(ex.message)}</p>`; }
  }
  function bindSupplierSheet() {
    loadSupplierSheet();
    const m = $('[data-supplier-msg]');
    const run = (sel, path, done) => { const b = $(sel); if (b) b.addEventListener('click', async () => {
      b.disabled = true; m.textContent = 'Working…'; m.className = 'form-msg';
      try { const r = await api(path, { method: 'POST' }); m.textContent = done(r); m.className = r.ok === false ? 'form-msg err' : 'form-msg ok'; await loadSupplierSheet(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      b.disabled = false;
    }); };
    run('[data-supplier-setup]', '/admin/supplier-sheet/setup', r => `Supplier sheet is set up with ${r.rows} orders.`);
    run('[data-supplier-check]', '/admin/supplier-sheet/check', r => r.ok ? `${r.changed.length} orders updated from the sheet.` : r.error);
  }
  function bindSettings() {
    bindStorage();
    bindSupplierSheet();
    const tf = $('#terms-publish');
    if (tf) tf.addEventListener('submit', async e => {
      e.preventDefault(); const b = $('[type=submit]', tf), m = $('[data-terms-msg]'); b.disabled = true;
      try { await api('/admin/terms', { method: 'POST', body: { version: Number(tf.version.value), english: tf.english.value, hebrew: tf.hebrew.value } }); m.textContent = 'Published. Clients must accept the new version.'; m.className = 'form-msg full ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; b.disabled = false; }
    });
    const bf = $('#bank-form');
    if (bf) bf.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-bank-msg]');
      try { await api('/admin/settings', { method: 'POST', body: Object.fromEntries(BANK_UI.map(([k]) => [k, bf[k].value])) }); m.textContent = 'Saved. Clients see the new details right away.'; m.className = 'form-msg full ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; }
    });
    const cf = $('#couriers-form');
    cf?.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-couriers-msg]'), b = $('[type=submit]', cf); if (b.disabled) return; b.disabled = true;
      try { await api('/admin/settings', { method: 'POST', body: { couriers: cf.couriers.value } }); m.textContent = 'Saved. The supplier sheet dropdown is updated.'; m.className = 'form-msg ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg err'; }
      finally { b.disabled = false; }
    });
    const f = $('#settings-form');
    const split = () => {
      const fee = parseFloat(f.commission_per_order.value);
      $('[data-split]').innerHTML = `<div><small>Client pays (inside product cost)</small><b>${Number.isFinite(fee) ? money(fee) : '—'}</b></div><div><small>We earn</small><b class="pos">${Number.isFinite(fee) ? money(fee) : '—'}</b></div>`;
    };
    f.addEventListener('input', split); split();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('[data-settings-msg]');
      try { await api('/admin/settings', { method: 'POST', body: { commission_per_order: f.commission_per_order.value, volumetric_divisor: f.volumetric_divisor.value, subscription_price: f.subscription_price.value } }); m.textContent = 'Saved. New orders use the new fee.'; m.className = 'form-msg full ok'; await loadAll(); }
      catch (ex) { m.textContent = ex.message; m.className = 'form-msg full err'; }
    });
    const c = $('[data-calc]'), out = $('[data-calc-out]');
    const upd = () => {
      const q = quote({ country: c.country.value, category: c.category.value, weightKg: c.weight.value, lengthCm: c.l.value, widthCm: c.w.value, heightCm: c.h.value, divisor: divisor() });
      out.innerHTML = q ? `<small>Shipping fee to ${esc(countryName(c.country.value))}</small><strong>${money(q.total)}</strong><div class="bd">${q.chargeable} kg${q.usedVolumetric ? ' (size-based)' : ''} × ${money(q.perKg)}/kg = ${money(q.freight)} + ${money(q.registration)} registration${q.euTax ? ` + ${money(q.euTax)} EU tax` : ''}${q.estimated ? '<br>Estimated rate (not confirmed by the supplier yet).' : ''}</div>` : '<small>Shipping fee</small><strong>—</strong><div class="bd">Enter a weight.</div>';
    };
    c.addEventListener('input', upd); c.addEventListener('change', upd);
  }

