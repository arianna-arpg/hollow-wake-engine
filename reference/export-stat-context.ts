import fs from 'node:fs';
import assert from 'node:assert/strict';
import {StatSheet, mod, type SkillTag} from '../src/engine/stats';

// Observe the original cache encoding and numerical fold. No replacement cache,
// overridden query implementation or writes through an observation tap.
const sheet = new StatSheet();
const power = 'probe:contextPower', linked = 'probe:contextLinked';
sheet.setBase(power, 10);
sheet.setSource('context', [
  mod(power, 'flat', 2, ['spell']), mod(power, 'flat', 3, ['fire']),
  mod(power, 'flat', 9, ['a,b' as SkillTag]),
  {stat: linked, kind: 'link', value: .5, fromStat: power},
]);
const cache = () => (sheet as unknown as {cache: Map<string, number>}).cache;
const rows: unknown[] = [];
function query(name: string, tags?: ReadonlySet<SkillTag>, extra?: Parameters<StatSheet['get']>[2], base?: number, stat = power) {
  const before = [...cache()];
  const value = sheet.get(stat, tags, extra, base);
  assert(Number.isFinite(value), name);
  rows.push({name,stat,tags: tags ? [...tags] : null,extra: extra ?? null,base: base ?? null,value,before,after:[...cache()]});
}
const tags = new Set<SkillTag>(['spell', 'fire']);
query('undefined'); query('empty', new Set());
query('mutable-initial', tags);
tags.delete('fire'); tags.add('cold'); query('same-size-replacement', tags);
tags.add('fire'); query('growth', tags);
tags.delete('spell'); query('shrink', tags);
tags.clear(); query('clear', tags);
tags.add('fire'); tags.add('spell'); query('same-values-new-order', tags);
query('fresh-equal-set', new Set(['spell', 'fire']));
for (const [i, values] of [
  ['a,b'], ['a','b'], ['a','b','spell'], ['b','a','spell'],
  [''], ['|'], ['§'], ['"','\\','\n'], ['雪','😀'], ['e\u0301','é'],
].entries()) query('encoding-'+i, new Set(values as SkillTag[]));
for (let i=0;i<40;i++) query('churn-'+i, new Set(['spell', 'probe:'+i as SkillTag]));
query('revisit-evicted-context', new Set(['probe:0' as SkillTag, 'spell']));
query('mutable-after-churn', tags);
query('extra-bypasses-cache', tags, [mod(power,'flat',7)]);
query('empty-extra-cache', tags, []);
query('base-bypasses-cache', tags, undefined, 33);
query('linked-baseline', tags, undefined, undefined, linked);
query('linked-base-override', tags, undefined, 4, linked);
sheet.setSource('conditions', [mod(power,'flat',4,undefined,'lowLife')]);
query('source-invalidation', tags);
sheet.setConditions(['lowLife']); query('condition-invalidation', tags);
sheet.setSource('gauge', [{stat:power,kind:'flat',value:2,gauge:'probe'}]);
sheet.setGauges([['probe',3]]); query('gauge-invalidation', tags);
sheet.removeSource('conditions'); query('source-removal', tags);
tags.delete('fire'); tags.add('cold'); query('mutated-after-invalidation', tags);
const view: ReadonlySet<SkillTag> = {
  get size(){return tags.size;}, has: value=>tags.has(value),
  entries:()=>tags.entries(), keys:()=>tags.keys(), values:()=>tags.values(),
  forEach: (callback,thisArg)=>tags.forEach(value=>callback.call(thisArg,value,value,view)),
  [Symbol.iterator]:()=>tags[Symbol.iterator](),
};
query('readonly-view',view); tags.delete('cold'); tags.add('fire'); query('readonly-view-mutation',view);
sheet.setSource('context', [mod(power,'flat',11,['fire'])]);
query('replacement-source',view);
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,rows},null,2)+'\n');
