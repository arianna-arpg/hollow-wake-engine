import assert from 'node:assert/strict';
export function assertStatContextObservations(value) {
  assert.equal(value.schemaVersion,1);assert.equal(value.rows.length,74);
  const rows=new Map(value.rows.map(r=>[r.name,r]));assert.equal(rows.size,value.rows.length);
  const get=name=>{const row=rows.get(name);assert(row,'Missing course '+name);return row;};
  for(const row of value.rows)assert(Number.isFinite(row.value),row.name);
  for(const[name,expected]of [['undefined',10],['empty',10],['mutable-initial',15],['same-size-replacement',12],['growth',15],['shrink',13],['clear',10],['fresh-equal-set',15],['encoding-0',19],['encoding-1',19],['extra-bypasses-cache',22],['base-bypasses-cache',38],['linked-baseline',7.5],['linked-base-override',11.5],['condition-invalidation',19],['gauge-invalidation',25],['source-removal',21],['mutated-after-invalidation',18],['readonly-view',18],['readonly-view-mutation',21],['replacement-source',27]])assert.equal(get(name).value,expected,name);
  assert.deepEqual(get('empty').before,get('empty').after,'Undefined and empty contexts share the original key');
  assert.deepEqual(get('same-values-new-order').before,get('same-values-new-order').after);
  assert.deepEqual(get('fresh-equal-set').before,get('fresh-equal-set').after);
  for(const name of ['extra-bypasses-cache','base-bypasses-cache'])assert.deepEqual(get(name).before,get(name).after,name);
  assert(get('linked-baseline').after.some(([key])=>key.startsWith('§probe:contextPower|')));
  assert.deepEqual(get('revisit-evicted-context').before,get('revisit-evicted-context').after);
  assert.equal(get('source-invalidation').before.length,0);
}
