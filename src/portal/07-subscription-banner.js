  // ---------- subscription banner (first month free, then monthly) ----------
  const fmtDay = iso => { const d = new Date(iso + 'T12:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  const shekels = n => (Number(n) % 1 ? Number(n).toFixed(2) : String(Number(n))) + ' ₪';
  function subBanner(sub) {
    if (!sub || !sub.status || sub.status === 'cancelled') return '';
    const price = `<b>${shekels(sub.price)} / month</b>`;
    if (sub.status === 'trial' && sub.trialEnd && !sub.trialEnded) {
      const left = sub.trialDaysLeft, days = left === 0 ? 'last day today' : `${left} day${left === 1 ? '' : 's'} left`;
      return `<section class="sub-banner"><span class="sub-tag">First month free</span><p>Your free month runs until <b>${fmtDay(sub.trialEnd)}</b> (${days}). After that the subscription is ${price}.</p></section>`;
    }
    if (sub.status === 'trial' && sub.trialEnded) return `<section class="sub-banner due"><span class="sub-tag">Free month ended</span><p>Your free month ended on <b>${fmtDay(sub.trialEnd)}</b>. The subscription is ${price}.</p></section>`;
    if (sub.status === 'overdue') return `<section class="sub-banner due"><span class="sub-tag">Payment due</span><p>Your subscription payment (${price}) is due. Questions? <a href="#/messages">Message us</a>.</p></section>`;
    if (sub.status === 'active') return `<section class="sub-banner ok"><span class="sub-tag">Subscription active</span><p>${price}${sub.lastPayment ? ` · last payment ${fmtDay(sub.lastPayment)}` : ''}</p></section>`;
    return '';
  }

