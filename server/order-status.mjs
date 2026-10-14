export const STATUS_SCHEMA = [
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS cancellation_previous_status TEXT',
  "ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS delivered_at INTEGER',
  `CREATE TABLE IF NOT EXISTS client_balance_adjustments (
    id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id), order_id INTEGER NOT NULL REFERENCES client_orders(id),
    kind TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
    UNIQUE(order_id,kind))`,
  "UPDATE client_orders SET delivered_at=updated_at WHERE status='delivered' AND delivered_at IS NULL",
];
export const ADMIN_STATUS_TARGETS=['pending','processing','shipped','delivered','cancelled'];
// A fee in dollars with up to two decimals; empty means no fee.
export function parseFee(value) {
  const fee=value==null||value===''?0:Number(value);
  if(!Number.isFinite(fee)||fee<0||fee>=1e7||Math.abs(fee*100-Math.round(fee*100))>1e-7) throw Object.assign(new Error('Enter a cancellation fee with up to two decimal places.'),{status:400});
  return fee;
}
export function statusChange(order, action, body, admin) {
  const status=order.status;
  if(action==='request-cancellation') {
    if(admin) throw Object.assign(new Error('Only clients can request cancellation.'),{status:403});
    if(status==='cancellation_requested') return null;
    if(!['pending','processing','shipped'].includes(status)) throw new Error('Cancellation cannot be requested for this order.');
    return {status:'cancellation_requested',previous:status,reason:String(body.reason||'').trim().slice(0,1000),fee:0};
  }
  if(action==='approve-cancellation'||action==='reject-cancellation') {
    if(!admin) throw Object.assign(new Error('Only admins can decide cancellation requests.'),{status:403});
    if(status!=='cancellation_requested') throw new Error('There is no pending cancellation request.');
    const fee=action==='approve-cancellation'?parseFee(body.fee):0;
    return {status:action==='approve-cancellation'?'cancelled':order.cancellation_previous_status||'pending',previous:order.cancellation_previous_status,reason:order.cancellation_reason,fee:action==='approve-cancellation'?fee:0};
  }
  const next=action==='mark-delivered'?'delivered':body.status;
  if(next===status) return null;
  if(!admin&&!(next==='delivered'&&status==='shipped')) throw Object.assign(new Error('Only admins can set this status. Request cancellation instead.'),{status:403});
  if(admin) {
    // Admins can set any order to any status: back to Pending, out of Cancelled (reopening it), or cancelled with an optional fee.
    if(!ADMIN_STATUS_TARGETS.includes(next)) throw new Error('Unknown status.');
    if(next!=='cancelled') return {status:next,previous:order.cancellation_previous_status,reason:order.cancellation_reason,fee:0};
    return {status:'cancelled',previous:status,reason:String(body.reason||'').trim().slice(0,1000)||order.cancellation_reason,fee:parseFee(body.fee)};
  }
  if(next!=='delivered') throw new Error('Request cancellation instead.');
  return {status:next,previous:order.cancellation_previous_status,reason:order.cancellation_reason,fee:0};
}
export async function changeStatus(DB, order, action, body, admin) {
  const change=statusChange(order,action,body,admin);if(!change)return order;
  const t=Math.floor(Date.now()/1000),actor=admin?'admin':'client';
  // Status, audit event and fee are one statement: retries/races cannot charge twice or lose the audit entry.
  const row=await DB.prepare(`WITH changed AS (
    UPDATE client_orders SET status=?,cancellation_previous_status=?,cancellation_reason=?,
      delivered_at=CASE WHEN ?='delivered' THEN COALESCE(delivered_at,?) WHEN ? IN ('pending','processing','shipped') THEN NULL ELSE delivered_at END,
      last_tracking_update_at=CASE WHEN ?='shipped' THEN ? ELSE last_tracking_update_at END,
      edit_locked=edit_locked OR ? IN ('processing','shipped','delivered','cancelled'),updated_at=? WHERE id=? AND status=? RETURNING *),
    audit AS (INSERT INTO order_events(order_id,client_id,kind,actor,detail,created_at)
      SELECT id,client_id,'status',?,?,? FROM changed),
    decision AS (INSERT INTO order_events(order_id,client_id,kind,actor,detail,created_at)
      SELECT id,client_id,'cancellation',?,?,? FROM changed WHERE ?<>''),
    fee AS (INSERT INTO client_balance_adjustments(client_id,order_id,kind,amount,note,created_at)
      SELECT client_id,id,'cancellation_fee',?,'Cancellation fee',? FROM changed WHERE ?>0
      ON CONFLICT(order_id,kind) DO UPDATE SET amount=EXCLUDED.amount,created_at=EXCLUDED.created_at)
    SELECT * FROM changed`).bind(change.status,change.previous,change.reason,change.status,t,change.status,change.status,t,change.status,t,order.id,order.status,
      actor,change.status,t,actor,action==='request-cancellation'?change.reason:action==='reject-cancellation'?'Cancellation rejected':action==='approve-cancellation'?'Cancellation approved':'',t,
      action==='request-cancellation'?change.reason:action==='reject-cancellation'?'Cancellation rejected':action==='approve-cancellation'?'Cancellation approved':'',change.fee,t,change.fee).first();
  if(!row)throw new Error('The order changed. Refresh and try again.');
  // Reopened after a cancellation: the cancellation fee no longer applies (the row stays for the record, at 0).
  if(admin&&order.status==='cancelled'&&row.status!=='cancelled') await DB.prepare("UPDATE client_balance_adjustments SET amount=0 WHERE order_id=? AND kind='cancellation_fee'").bind(order.id).run();
  return row;
}
export async function balanceAdjustments(DB,clientId) {
  const rows=(await DB.prepare('SELECT a.*,o.order_ref FROM client_balance_adjustments a JOIN client_orders o ON o.id=a.order_id WHERE a.client_id=? AND a.amount<>0 ORDER BY a.created_at DESC,a.id DESC').bind(clientId).all()).results||[];
  return rows.map(r=>({id:Number(r.id),orderId:Number(r.order_id),orderRef:r.order_ref,kind:r.kind,amount:Number(r.amount),note:r.note,createdAt:Number(r.created_at)}));
}
