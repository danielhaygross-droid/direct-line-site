// Shared exact-cent store calculations for the server, client portal and admin.
(function(root){
 const cents=n=>Math.round(Number(n||0)*100);
 const dateKey=o=>/^\d{4}-\d{2}-\d{2}$/.test(o.orderDate||'')?o.orderDate:new Date(o.createdAt*1000).toISOString().slice(0,10);
 const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 function periodRange(period='month',from='',to='',now=new Date()){
  const y=now.getFullYear(),m=now.getMonth(),d=now.getDate();
  if(period==='all')return{from:'0000-01-01',to:'9999-12-31'};
  if(period==='custom'){if(![from,to].every(s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s)||from>to)return null;return{from,to};}
  if(period==='last_month')return{from:iso(new Date(y,m-1,1)),to:iso(new Date(y,m,0))};
  if(period==='30'||period==='90')return{from:iso(new Date(y,m,d-Number(period)+1)),to:iso(now)};
  if(period==='year')return{from:iso(new Date(y,0,1)),to:iso(new Date(y,11,31))};
  return{from:iso(new Date(y,m,1)),to:iso(new Date(y,m+1,0))};
 }
 function performance(stores,orders,adjustments=[],range=periodRange('all')){
  const map=new Map(stores.map(s=>[s.id,{...s,orders:0,customersPaid:0,billed:0,profit:0,missingSalePrice:0,active:0}]));
  const matched=new Map();
  for(const o of orders){const key=dateKey(o);if(key<range.from||key>range.to)continue;matched.set(o.id,o);const row=map.get(o.storeId);if(!row)continue;if(o.status==='cancelled')continue;row.orders++;row.billed+=cents(o.price);if(o.sellingPrice==null)row.missingSalePrice++;else row.customersPaid+=cents(o.sellingPrice);if(!['delivered','cancelled'].includes(o.status))row.active++;}
  for(const a of adjustments){const o=matched.get(a.orderId),row=o&&map.get(o.storeId);if(row)row.billed+=cents(a.amount);}
  const rows=[...map.values()].map(r=>({...r,customersPaid:r.customersPaid/100,billed:r.billed/100,profit:(r.customersPaid-r.billed)/100}));
  const totals=rows.reduce((t,r)=>{for(const k of ['orders','missingSalePrice','active'])t[k]+=r[k];for(const k of ['customersPaid','billed','profit'])t[k]+=cents(r[k]);return t;},{orders:0,customersPaid:0,billed:0,profit:0,missingSalePrice:0,active:0});for(const k of ['customersPaid','billed','profit'])totals[k]/=100;
  for(const r of rows)r.share=totals.profit?Math.round(r.profit/totals.profit*1000)/10:0;
  return{rows,totals};
 }
 root.DLClientStoreMath={periodRange,performance,dateKey};
})(globalThis);
