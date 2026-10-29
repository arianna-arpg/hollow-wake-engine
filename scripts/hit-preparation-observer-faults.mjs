// Faults are confined to the original preparation statements before hasDamage.
export const preparationFaults = [
 ['depth-floor',0,'Math.max(depth, inst.procChainDepth ?? 0)','depth'],
 ['fuse-bypass',2,'if (!fromFuse)','if (true)'],
 ['fuse-delay-scale',2,"* caster.sheet.get('fuseDelay', fTags, instanceMods(inst))",''],
 ['fuse-flat-identity',2,'flat: flatBonus','flat: { ...flatBonus }'],
 ['fuse-origin-copy',2,'{ ...(hitOrigin ?? caster.pos) }','(hitOrigin ?? caster.pos)'],
 ['fuse-explicit-tier-zero',2,'hitTier ?? caster.tier','hitTier || caster.tier'],
 ['fuse-segment-clear',2,'target.segHitPending = undefined;',''],
 ['fuse-no-early-return',2,'return;',''],
 ['combat-clock',3,'this.lastCombatAt = this.time;',''],
 ['grudge-seat',3,'this.seatOf(target)','false'],
 ['guise-self',4,'&& target !== caster',''],
 ['target-replacement',5,'inst = this.attackSequences.forTarget','this.attackSequences.forTarget'],
 ['noise-extra',7,'skillContextTags(def), extra','skillContextTags(def)'],
 ['shatter-direction',8,'let i = target.statuses.length - 1; i >= 0; i--','let i = 0; i < target.statuses.length; i++'],
 ['shatter-stack-sum',8,'consumedStacks += s.stacks','consumedStacks++'],
 ['shatter-source-removal',8,"target.sheet.removeSource('status:' + s.id);",''],
 ['shatter-stack-multiplier',8,'(def.shatterStatus.mult - 1) * consumedStacks','(def.shatterStatus.mult - 1)'],
 ['ambush-aware',9,'target.aiTargetId !== caster.id','true'],
 ['ambush-clock-edge',9,'this.time >= target.alertUntil','this.time > target.alertUntil'],
 ['ambush-team',9,'target.team !== caster.team','true'],
 ['rear-threshold',11,'> 2.0','>= 2.0'],
 ['proximity-radius',12,'DEFENSE_CFG.proximity.radius','(DEFENSE_CFG.proximity.radius * 2)'],
 ['breakable-owner',13,'target.owner === caster','true'],
 ['breakable-affinity',13,'b.affinityMult ?? 2','b.affinityMult ?? 1'],
 ['victim-scope',14,'victimScopeArmed(caster.sheet, extra)','false'],
 ['packet-scale',16,'packet.amounts[t]! *= dmgMult','packet.amounts[t]! *= 1'],
 ['affliction-upper-clamp',19,'Math.min(1, Math.max(0,','Math.min(2, Math.max(0,'],
 ['affliction-cut',19,'packet.amounts[t]! -= cut','packet.amounts[t]! -= 0'],
 ['affliction-yield',19,"* caster.sheet.get('afflictionYield', skillContextTags(inst, grantedTags(inst)), extra)",''],
 ['raw-total',20,'s + (v ?? 0)','s + (v ?? 0) * 2'],
 ['guard-zero-gate',21,'raw > 0 && ',''],
 ['guard-return',21,') return;',') {}'],
 ['shell-zero-gate',22,'raw > 0 && ',''],
 ['shell-return',22,') return;',') {}'],
 ['definition-capture','definition'],
 ['guard-shell-order','guards'],
 ['tone-before-forgo','tone'],
];
export function applyPreparationFault(source, ast, top, fault) {
 const [name,index,needle,replacement]=fault;
 if(index==='definition')return source.slice(0,top[1].getStart(ast))+top[1].getText(ast).replace('const def','let def')+source.slice(top[1].end,top[5].end)+'\n    def = inst.def;'+source.slice(top[5].end);
 if(index==='guards')return source.slice(0,top[21].getStart(ast))+top[22].getText(ast)+source.slice(top[21].end,top[22].getStart(ast))+top[21].getText(ast)+source.slice(top[22].end);
 if(index==='tone')return source.slice(0,top[17].getStart(ast))+source.slice(top[17].end,top[19].end)+'\n    '+top[17].getText(ast)+source.slice(top[19].end);
 const node=top[index],text=node.getText(ast);
 if(text.split(needle).length-1!==1)throw Error('Fault selector '+name);
 return source.slice(0,node.getStart(ast))+text.replace(needle,replacement)+source.slice(node.end);
}
