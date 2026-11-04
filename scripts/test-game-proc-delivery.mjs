import {procDeliveryDecision} from '../adapters/hollow-wake/integrate-proc-delivery.mjs';
import {verifyInstalledProcReplay} from './verify-installed-proc-replay.mjs';
verifyInstalledProcReplay('proc-delivery', 'procDeliveryDecision', procDeliveryDecision);
