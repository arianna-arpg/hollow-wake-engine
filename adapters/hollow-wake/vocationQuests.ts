import {createVocationQuests, vocationStepQuestId} from '@hollow-wake/engine/progression/vocations';
import {VOCATION_CFG,VOCATION_LIST} from '../data/vocations';
import {powerProgressionOpen} from '../data/powerProgression';
import type {QuestDef,QuestGateCtx} from './types';

export {vocationStepQuestId};
export {vocationLedgerKey} from '../data/vocations';
export function vocationQuestDefs(): QuestDef[] {
  return createVocationQuests(VOCATION_LIST,VOCATION_CFG,(account:QuestGateCtx['accountLedger'])=>powerProgressionOpen(account,'vocations'));
}
