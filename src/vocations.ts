import {vocationDiscoveryKey,vocationUnlockKey} from './vocation-keys.js';
export {vocationDiscoveryKey, vocationUnlockKey};
export {grantVocation, vocationRootId, type VocationGrantCharacter, type VocationGrantPorts} from './vocation-grants.js';

type Ledger = Readonly<Record<string, number | undefined>>;
export interface VocationGateState<L extends Ledger = Ledger> {
  readonly classId: string;
  readonly vocations: readonly string[];
  readonly runLedger: L;
  readonly accountLedger: L;
}
export interface VocationQuestStep<Zone> {
  readonly offerLabel: string;
  readonly zone: Zone;
  readonly xp?: number;
  readonly gems?: number;
  readonly vocationPoints?: number;
  readonly turnInPrompt?: string;
  readonly requiresLedger?: string;
}
export interface VocationChain<Zone> {
  readonly id: string;
  readonly name: string;
  readonly classId: string;
  readonly secret?: {
    readonly site: {readonly npc: string};
    readonly classLockedDiscovery?: boolean;
    readonly unlockedOffer?: 'menu' | 'site';
  };
  readonly quest: {readonly offerAtLevel?: number; readonly steps: readonly VocationQuestStep<Zone>[]};
}
export interface VocationQuestConfig {
  readonly giver: string;
  readonly offerAtLevel: number;
  readonly pointsPerStep: number;
  readonly maxPerCharacter: number;
}
export interface VocationQuest<Zone, L extends Ledger = Ledger> {
  id: string;
  giver: string | string[];
  offerLabel: string;
  category: 'vocation';
  vocation: string;
  offerAtLevel: number;
  gate(state: VocationGateState<L>): boolean;
  requiresLedger?: string;
  zone: Zone;
  reward: {xp: number | undefined; gems: number | undefined; vocationPoints: number; grantVocation: string | undefined; ledger: Record<string,number>};
  turnIn: {giver: string | string[]; prompt: string};
  next: string | undefined;
}

export function vocationStepQuestId(id: string, step: number): string {return `voc_${id}_${step}`;}
export function vocationStepKey(id: string, step: number): string {return `voc_${id}_step_${step}`;}

/** Compile the ordered chain at content load. Gates borrow the definition and
 * config and read current run and account state on every offer. */
export function createVocationQuests<Zone,L extends Ledger>(
  vocations: readonly VocationChain<Zone>[], config: VocationQuestConfig, progressionOpen: (account: L) => boolean,
): VocationQuest<Zone,L>[] {
  function gate(v: VocationChain<Zone>, index: number, state: VocationGateState<L>): boolean {
    if (!progressionOpen(state.accountLedger)) return false;
    if (state.vocations.includes(v.id) || state.vocations.length >= config.maxPerCharacter) return false;
    const unlocked = (state.accountLedger[vocationUnlockKey(v.id)] ?? 0) >= 1;
    if (v.secret) {
      const discovered = (state.runLedger[vocationDiscoveryKey(v.id)] ?? 0) >= 1;
      if (!unlocked) {
        if (!discovered || ((v.secret.classLockedDiscovery ?? true) && state.classId !== v.classId)) return false;
        return index === 0 || (state.runLedger[vocationStepKey(v.id,index)] ?? 0) >= 1;
      }
      if ((v.secret.unlockedOffer ?? 'menu') === 'site' && !discovered) return false;
    } else if (state.classId !== v.classId && !unlocked) return false;
    return !(index > 0 && (state.runLedger[vocationStepKey(v.id,index)] ?? 0) < 1);
  }
  return vocations.flatMap(v => v.quest.steps.map((_, index) => {
    const step = v.quest.steps[index];
    const last = index === v.quest.steps.length - 1, number = index + 1;
    const giver = v.secret ? [v.secret.site.npc, config.giver] : config.giver;
    return {
      id:vocationStepQuestId(v.id,number), giver, offerLabel:step.offerLabel, category:'vocation' as const, vocation:v.id,
      offerAtLevel:v.quest.offerAtLevel ?? config.offerAtLevel, gate:(state: VocationGateState<L>) => gate(v,index,state),
      ...(step.requiresLedger ? {requiresLedger:step.requiresLedger} : {}), zone:step.zone,
      reward:{xp:step.xp,gems:step.gems,vocationPoints:step.vocationPoints ?? config.pointsPerStep,
        grantVocation:last?v.id:undefined,ledger:{[vocationStepKey(v.id,number)]:1,quests_completed:1}},
      turnIn:{giver,prompt:step.turnInPrompt ?? `The deed is done — return to the quartermaster (${v.name}, step ${number}).`},
      next:last?undefined:vocationStepQuestId(v.id,number+1),
    };
  }));
}
