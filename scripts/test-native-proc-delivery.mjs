import {runNativeDeliveryCourse} from './run-native-delivery-course.mjs';
import {nativeProcDeliveryEntry} from './native-proc-delivery-entry.mjs';
import {assertProcDeliveryReplayFault} from './native-proc-delivery-checks.mjs';
import {assertProcDeliveryObservations} from './proc-delivery-observation-checks.mjs';

await runNativeDeliveryCourse({
  id:'proc-delivery',entry:nativeProcDeliveryEntry,check:assertProcDeliveryObservations,detectFault:assertProcDeliveryReplayFault,
  timeoutMs:600000,
  faults:[
    ['arc-strict-tie-fault','distance <= nearest','distance < nearest'],
    ['rider-depth-fault','ports.riders(proc, caster, instance, target, depth);','ports.riders(proc, caster, instance, target, depth + 1);'],
  ],
});
