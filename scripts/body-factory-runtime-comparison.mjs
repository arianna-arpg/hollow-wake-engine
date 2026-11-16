import assert from 'node:assert/strict';

// Math.pow is implementation-approximated. Only these two morphology outputs
// differ between the original Node 22 and Node 24 census. The SDK must STILL
// equal the original exactly on the running runtime; this comparison is only
// between that original and the immutable recording from another runtime.
export function compareBodyFactoryRecording(actual, recorded) {
  const differences = [];
  const bits = new DataView(new ArrayBuffer(8));
  const positiveBits = n => {bits.setFloat64(0, n); return bits.getBigUint64(0);};
  function visit(a, b, at) {
    if (Object.is(a, b)) return;
    const morphology = at === '/fields/turnSpeed'
      || /^\/bases\/\d+\/1$/.test(at) && recorded.bases[Number(at.split('/')[2])][0] === 'weight';
    if (morphology && typeof a === 'number' && typeof b === 'number'
      && Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      const delta = positiveBits(a) - positiveBits(b), ulps = delta < 0n ? -delta : delta;
      assert(ulps <= 4n, `Morphology differs by ${ulps} ULP at ${at}`);
      differences.push({path: at, ulps: Number(ulps)}); return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      assert.equal(Array.isArray(a), Array.isArray(b), at);
      assert.deepEqual(Object.keys(a), Object.keys(b), at);
      for (const key of Object.keys(b)) visit(a[key], b[key], at + '/' + key);
      return;
    }
    assert.deepEqual(a, b, at);
  }
  visit(actual, recorded, ''); return differences;
}
