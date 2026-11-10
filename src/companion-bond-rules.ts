export interface CompanionBondSpec<M> {
  normalSure?: number;
  rareSure?: number;
  bossSure?: number;
  slotsAdd?: number;
  reviveSeconds?: number;
  beastMods?: M[];
  beastSkills?: string[];
  familyArt?: boolean;
  attackOrb?: { chance: number; cooldown: number; kind: string };
  attackCharge?: { chance: number; cooldown: number; id: string };
  rally?: { maxStacks: number; damagePerStack: number; duration: number };
  rallyCapAdd?: number;
  frenzy?: { duration: number; attackSpeed: number; gapCloser: string };
  mimicMelee?: { cooldown: number; power: number };
  dread?: { radius: number; interval: number; damage: number; ramp: number; maxStacks: number };
  whistle?: { skillId: string; pulseSkill: string; duration: number; interval: number };
  /** THE STANCE ART (engine/companionStances.ts): a catalog skill every
   *  living beast of the bond casts at its own feet when the keeper SHIFTS
   *  the stance — the tree's hook on a behavioral change (the shift itself
   *  is an honest cast of companion_stance, so cast procs already see it). */
  stanceArt?: string;
}

export interface CompanionRules {
  level:{follow:'keeper'|'claimed';keepClaimed:boolean;offset:number};
  recovery:{seconds:number;divideByPack:boolean;cleanse:boolean;status:string};
}
export const DEFAULT_COMPANION_RULES:Readonly<{level:Readonly<CompanionRules['level']>;recovery:Readonly<CompanionRules['recovery']>}>=Object.freeze({
  level:Object.freeze({follow:'keeper',keepClaimed:true,offset:0}),
  recovery:Object.freeze({seconds:3,divideByPack:true,cleanse:true,status:'companion_recovery'}),
});

export function companionRecoverySeconds(activeBodies: number, cfg:Readonly<CompanionRules['recovery']>=DEFAULT_COMPANION_RULES.recovery): number {
  return Math.max(0, cfg.seconds) / (cfg.divideByPack ? Math.max(1, activeBodies) : 1);
}

/** The level a bonded body should stand at beside its keeper. */
export function companionLevelOf(keeperLevel: number, claimedLevel: number, c:Readonly<CompanionRules['level']>=DEFAULT_COMPANION_RULES.level): number {
  const claimed = Math.max(1, Math.round(claimedLevel));
  if (c.follow !== 'keeper') return claimed;
  const tracked = Math.max(1, Math.round(keeperLevel + c.offset));
  return c.keepClaimed ? Math.max(claimed, tracked) : tracked;
}

export interface CompanionSaved<M,R extends string=string> {
  defId: string;
  level: number;
  skillId: string;
  downed?: boolean;
  reviveRemaining?: number;
  rarity?: R;
  name?: string;
  radius?: number;
  /** Original per-spawn variance; omitted by older saves. */
  spawnScale?: number;
  raritySources?: [string, M[]][];
}

/** Duplicate node inputs retain their original additive meaning; only granted skill IDs deduplicate. */
export function resolveCompanionBond<M>(nodes:readonly string[]|undefined,node:(id:string)=>CompanionBondSpec<M>|undefined): CompanionBondSpec<M> {
  const out: CompanionBondSpec<M> = {};
  for (const id of [...(nodes ?? [])].sort()) {
    const patch = node(id);
    if (!patch) continue;
    for (const field of ['normalSure', 'rareSure', 'bossSure', 'reviveSeconds'] as const) {
      if (patch[field] !== undefined) out[field] = Math.max(out[field] ?? 0, patch[field]!);
    }
    out.slotsAdd = (out.slotsAdd ?? 0) + (patch.slotsAdd ?? 0);
    out.rallyCapAdd = (out.rallyCapAdd ?? 0) + (patch.rallyCapAdd ?? 0);
    if (patch.beastMods) (out.beastMods ??= []).push(...patch.beastMods);
    if (patch.beastSkills) out.beastSkills = [...new Set([...(out.beastSkills ?? []), ...patch.beastSkills])];
    if (patch.familyArt) out.familyArt = true;
    for (const field of ['attackOrb', 'attackCharge', 'rally', 'frenzy', 'mimicMelee', 'dread', 'whistle', 'stanceArt'] as const) {
      if (patch[field]) Object.assign(out, { [field]: patch[field] });
    }
  }
  return out;
}
