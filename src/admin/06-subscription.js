  // ---------- subscription (first month free, then monthly) ----------
  const fmtDay = iso => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
  const shekels = n => (Number(n) % 1 ? Number(n).toFixed(2) : String(Number(n))) + ' ₪';
  function subPill(sub) {
    if (!sub || !sub.status) return '<span class="dim" style="font-size:13px">Not set</span>';
    if (sub.status === 'trial') {
      if (sub.trialEnded) return `<span class="st st-cancelled">Trial ended</span><small class="dim sub-when">${esc(fmtDay(sub.trialEnd))}</small>`;
      return `<span class="st st-pending">Free month</span><small class="dim sub-when">until ${esc(fmtDay(sub.trialEnd))}</small>`;
    }
    if (sub.status === 'active') return `<span class="st st-delivered">Paying</span>${sub.lastPayment ? `<small class="dim sub-when">paid ${esc(fmtDay(sub.lastPayment))}</small>` : ''}`;
    if (sub.status === 'overdue') return '<span class="st st-cancelled">Overdue</span>';
    return '<span class="st" style="--tone:var(--dim)">Cancelled</span>';
  }

