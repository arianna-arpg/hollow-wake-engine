import assert from 'node:assert/strict';

// Only cross-runtime geometry has a tolerance. Original-vs-installed native
// observations always use the default exact comparison, including geometry.
export function compareAttackCourse(actual, expected, tolerance = false) {
  const differences=[];let numbers=0;
  const geometric=(at)=>{
    if(/^\$\/\d+\/value\/rows\/\d+\/worlds\/\d+\/actors\/\d+\/facing$/.test(at))return 'facing';
    const match=/^\$\/(\d+)\/value\/trace\/(\d+)\/args\/0\/(pos|anchor)\/(x|y)$/.exec(at);
    if(!match)return;
    const entry=expected[Number(match[1])]?.value?.trace?.[Number(match[2])];
    if(entry?.name==='sequence.flight'&&entry.phase==='before')return 'flight-coordinate';
  };
  function visit(a,b,at){
    if(typeof a==='number'&&typeof b==='number'){
      numbers++;if(Object.is(a,b))return;
      const kind=tolerance&&geometric(at),limit=kind==='facing'?1e-12*Math.max(1,Math.abs(b)):1e-12;
      if(kind&&Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=limit){differences.push({path:at,actual:a,expected:b,absoluteError:Math.abs(a-b),kind});return;}
      throw new Error(`Numeric mismatch at ${at}: ${a} != ${b}`);
    }
    if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){assert.equal(a,b,at);return;}
    assert.equal(Array.isArray(a),Array.isArray(b),at);assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),at);
    for(const key of Object.keys(b))visit(a[key],b[key],at+'/'+key);
  }
  visit(actual,expected,'$');return {numbers,differences};
}
