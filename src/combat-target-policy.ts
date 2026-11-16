/** Common blast eligibility, independent of the spatial provider. */
export function isBurstTarget(actor:{dead:boolean;downed:boolean;team:string;tier:number;untargetable:boolean;invulnerable:boolean},sourceTeam:string,sourceTier=0):boolean{
  return !actor.dead&&!actor.downed&&actor.team!==sourceTeam&&actor.tier===sourceTier&&!actor.untargetable&&!actor.invulnerable;
}
