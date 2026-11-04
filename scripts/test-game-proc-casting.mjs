import {procCastingDecision} from '../adapters/hollow-wake/integrate-proc-casting.mjs';
import {verifyInstalledProcReplay} from './verify-installed-proc-replay.mjs';
verifyInstalledProcReplay('proc-casting', 'procCastingDecision', procCastingDecision);
