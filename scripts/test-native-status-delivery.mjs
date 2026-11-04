import {runNativeDeliveryCourse} from './run-native-delivery-course.mjs';
import {nativeStatusDeliveryEntry} from './native-status-delivery-entry.mjs';
import {assertStatusDeliveryReplayFault} from './native-status-delivery-checks.mjs';
import {assertStatusDeliveryObservations} from './status-delivery-observation-checks.mjs';

await runNativeDeliveryCourse({
  id:'status-delivery',entry:nativeStatusDeliveryEntry,check:assertStatusDeliveryObservations,detectFault:assertStatusDeliveryReplayFault,
  faults:[
    ['zero-share-fault','effect.spearShare ?? 0.5','effect.spearShare || 0.5'],
    ['source-identity-fault','recallSources.set(spear, inst)','recallSources.set(spear, spear)'],
  ],
});
