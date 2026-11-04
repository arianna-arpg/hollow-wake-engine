import assert from 'node:assert/strict';
import {checkFaultCourseErrors, compareDeliveryReplay} from './native-delivery-comparison.mjs';

export function assertProcDeliveryReplayFault(name,actual,expected) {
  assert.equal(actual.schemaVersion,expected.schemaVersion);
  assert.equal(actual.courses,expected.courses);
  assert.deepEqual(actual.authored,expected.authored);
  checkFaultCourseErrors(actual,expected);
  const calls=(data,row,kind)=>data.rows.find(r=>r.name===row).steps[0].events.filter(e=>e.kind===kind&&e.phase==='before');
  if(name==='arc-strict-tie-fault'){
    const victims=data=>calls(data,'arc-tie','resolveHit').map(e=>e.args[2].$actor);
    assert.deepEqual(victims(expected),[4,3]);assert.deepEqual(victims(actual),[3,4]);
  }else if(name==='rider-depth-fault'){
    const depth=data=>calls(data,'extraHit-missing-instance','fireProcRiders').map(e=>e.args[4]);
    assert.deepEqual(depth(expected),[2]);assert.deepEqual(depth(actual),[3]);
  }else throw Error('Unknown proc fault: '+name);
  assert.throws(()=>compareDeliveryReplay(actual,expected),{name:'AssertionError'});
}
