import assert from 'node:assert/strict';

export function projectDeliveryReplay(values,count) {
  assert.equal(values.length,count+1);
  for(let i=0;i<count;i++)assert.equal(values[i].done,false);
  assert.equal(values[count].done,true);
  return {...values[count].value,rows:values.slice(0,count).map(v=>v.value)};
}

export function compareDeliveryReplay(actual,expected) {
  let numbers=0;
  function visit(a,b,at) {
    if(typeof a==='number'&&typeof b==='number'){
      numbers++;
      if(!Object.is(a,b))assert.fail('Numeric mismatch at '+at+': '+a+' != '+b);
      return;
    }
    if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){assert.equal(a,b,at);return;}
    assert.equal(Array.isArray(a),Array.isArray(b),at);
    const keys=Object.keys(b);
    assert.equal(Object.keys(a).length,keys.length,at);
    for(const key of keys){
      assert(Object.hasOwn(a,key),at+'/'+key);
      visit(a[key],b[key],at+'/'+key);
    }
  }
  visit(actual,expected,'$');return {numbers,exact:true};
}

export function checkFaultCourseErrors(actual,expected) {
  assert.deepEqual(actual.rows.map(row=>[row.name,row.steps.map(s=>s.name)]),expected.rows.map(row=>[row.name,row.steps.map(s=>s.name)]));
  for(let i=0;i<expected.rows.length;i++)for(let j=0;j<expected.rows[i].steps.length;j++)
    assert.equal(actual.rows[i].steps[j].error,expected.rows[i].steps[j].error,'Unrelated exception');
}
