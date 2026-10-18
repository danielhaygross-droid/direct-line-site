// Shared exact-cent store calculations for the server, client portal and admin.
(function(root){
 const cents=n=>Math.round(Number(n||0)*100);
 const dateKey=o=>/^\d{4}-\d{2}-\d{2}$/.test(o.orderDate||'')?o.orderDate:new Date(o.createdAt*1000).toISOString().slice(0,10);
 const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 function periodRange(period='month',from='',to='',now=new Date()){
  const y=now.getFullYear(),m=now.getMonth(),d=now.getDate();
  const one=/^m:(\d{4})-(\d{2})$/.exec(period||'');if(one){const yy=Number(one[1]),mm=Number(one[2]);if(mm<1||mm>12)return null;return{from:iso(new Date(yy,mm-1,1)),to:iso(new Date(yy,mm,0))};}
  if(period==='all')return{from:'0000-01-01',to:'9999-12-31'};
  if(period==='custom'){if(![from,to].every(s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s)||from>to)return null;return{from,to};}
  if(period==='last_month')return{from:iso(new Date(y,m-1,1)),to:iso(new Date(y,m,0))};
  if(period==='30'||period==='90')return{from:iso(new Date(y,m,d-Number(period)+1)),to:iso(now)};
  if(period==='year')return{from:iso(new Date(y,0,1)),to:iso(new Date(y,11,31))};
  return{from:iso(new Date(y,m,1)),to:iso(new Date(y,m+1,0))};
 }
 // What the client earned on an order after Etsy's fees: Etsy's "You earned", else customer paid - Etsy fee.
 const earnedCents=o=>o.etsyEarned!=null?cents(o.etsyEarned):o.sellingPrice!=null&&o.etsyFee!=null?cents(o.sellingPrice)-cents(o.etsyFee):null;
 function performance(stores,orders,adjustments=[],range=periodRange('all')){
  const map=new Map(stores.map(s=>[s.id,{...s,orders:0,customersPaid:0,earned:0,billed:0,profit:0,missingSalePrice:0,otherCurrency:0,active:0}]));
  const matched=new Map();
  for(const o of orders){const key=dateKey(o);if(key<range.from||key>range.to)continue;matched.set(o.id,o);const row=map.get(o.storeId);if(!row)continue;if(o.status==='cancelled')continue;row.orders++;row.billed+=cents(o.price);const usd=(o.currency||'USD')==='USD';if(o.sellingPrice!=null&&usd)row.customersPaid+=cents(o.sellingPrice);const e=earnedCents(o);if(!usd)row.otherCurrency++;else if(e==null)row.missingSalePrice++;else{row.earned+=e;row.profit+=e-cents(o.price);}if(!['delivered','cancelled'].includes(o.status))row.active++;}
  for(const a of adjustments){const o=matched.get(a.orderId),row=o&&map.get(o.storeId);if(row){row.billed+=cents(a.amount);row.profit-=cents(a.amount);}}
  const rows=[...map.values()].map(r=>({...r,customersPaid:r.customersPaid/100,earned:r.earned/100,billed:r.billed/100,profit:r.profit/100}));
  const totals=rows.reduce((t,r)=>{for(const k of ['orders','missingSalePrice','otherCurrency','active'])t[k]+=r[k];for(const k of ['customersPaid','earned','billed','profit'])t[k]+=cents(r[k]);return t;},{orders:0,customersPaid:0,earned:0,billed:0,profit:0,missingSalePrice:0,otherCurrency:0,active:0});for(const k of ['customersPaid','earned','billed','profit'])totals[k]/=100;
  for(const r of rows)r.share=totals.profit?Math.round(r.profit/totals.profit*1000)/10:0;
  return{rows,totals};
 }
 // Months that have orders, newest first; this month is always there. ['2026-10','2026-09',...]
 function monthsOf(orders,now=new Date()){const set=new Set([iso(now).slice(0,7)]);for(const o of orders||[])set.add(dateKey(o).slice(0,7));return[...set].filter(k=>/^\d{4}-\d{2}$/.test(k)).sort().reverse();}
 root.DLClientStoreMath={periodRange,performance,dateKey,earnedCents,monthsOf};
})(globalThis);
