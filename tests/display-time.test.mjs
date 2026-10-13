import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../dist/p/'+f,import.meta.url),'utf8');
function ctx(lang,zone){return {window:{DLi18n:{lang}},document:{documentElement:{lang}},Intl:{DateTimeFormat:function(locale,options){return new Intl.DateTimeFormat(locale,{timeZone:zone,...options});}},Date};}
function helpers(lang,zone){const s=read('common.js'),c=ctx(lang,zone);vm.runInNewContext(s.slice(s.indexOf('  const hebrewTime'),s.indexOf('  const date ='))+';window.out={displayTime,displayTimeZone,timeZoneNote};',c);return c.window.out;}
const winter=Date.UTC(2026,0,15,11)/1000,summer=Date.UTC(2026,6,15,11)/1000;
test('English timestamps use the device zone and preserve seconds, including DST',()=>{
 for(const [zone,w,s] of [['Asia/Manila','19:00:00','19:00:00'],['America/New_York','06:00:00','07:00:00'],['Europe/London','11:00:00','12:00:00']]){
  const h=helpers('en',zone);assert.ok(h.displayTime(winter).includes(w));assert.ok(h.displayTime(summer).includes(s));assert.ok(h.displayTime(winter).endsWith('('+zone+')'));assert.equal(h.displayTimeZone(),zone);assert.ok(h.timeZoneNote().includes(zone));
 }
});
test('Hebrew always uses Jerusalem regardless of device location',()=>{
 for(const zone of ['Asia/Manila','America/New_York','Europe/London']){
  const h=helpers('he',zone);assert.ok(h.displayTime(winter).includes('13:00:00'));assert.ok(h.displayTime(summer).includes('14:00:00'));assert.ok(h.displayTime(winter).endsWith('(שעון ישראל)'));assert.equal(h.displayTimeZone(),'Asia/Jerusalem');
 }
});
test('date rollover follows the selected zone and invalid/missing timestamps stay blank',()=>{
 const t=Date.UTC(2026,0,15,23,30)/1000;assert.match(helpers('en','Asia/Manila').displayTime(t),/16\/01\/2026, 07:30:00/);assert.match(helpers('en','America/New_York').displayTime(t),/15\/01\/2026, 18:30:00/);
 const h=helpers('he','America/New_York');assert.match(h.displayTime(t),/16\/01\/2026, 01:30:00/);for(const v of [0,null,undefined,'invalid',Infinity])assert.equal(h.displayTime(v),'');
});
test('dashboard notification fallback respects the same language and zone rules',()=>{
 const src=read('notify.js');for(const lang of ['en','he'])for(const zone of ['Asia/Manila','America/New_York']){
  const c=ctx(lang,zone);vm.runInNewContext(src.slice(src.indexOf('  const he ='),src.indexOf('  const ICONS'))+';window.out=exactTime;',c);
  assert.equal(c.window.out(winter*1000),helpers(lang,zone).displayTime(winter));
 }
});
