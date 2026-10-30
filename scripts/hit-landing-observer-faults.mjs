import assert from 'node:assert/strict';
// [name, section, index, selector, replacement]. Null selector omits a statement.
export const landingFaults=[
 ['force-admission','top',23,'forceDamage || ',''],
 ['authored-admission','top',23,'def.effects.some','inst.def.effects.some'],
 ['unconditional-admission','top',23,"forceDamage || def.effects.some(e => e.type === 'damage')",'true'],
 ['bind-deeds','landing',0,null,null],
 ['life-snapshot-order','move',1,4,null],
 ['hidden-snapshot-order','move',2,4,null],
 ['panic-snapshot-order','move',3,4,null],
 ['hidden-concealment','landing',2,'concealmentActive(caster, this.time) || ',''],
 ['hidden-detectability','landing',2,"caster.sheet.get('detectability') < 1",'false'],
 ['assault-packet','landing',4,null,null],
 ['self-damage-floor','landing',6,'Math.max(0, target.life)','target.life'],
 ['self-damage-record','landing',6,null,null],
 ['critical-capture','landing',7,'wasCrit = result.crit','wasCrit = false'],
 ['meta-admission','landing',8,'this.metaProgressionActive()','false'],
 ['deed-block-positive','landing',8,' && (result.blockedAmount ?? 0) > 0',''],
 ['deed-alive-before','landing',8,'deedLifeBefore > 0 && ',''],
 ['deed-owner','landing',8,' && this.deedOwned(caster)',''],
 ['deed-recipient','landing',8,'this.deedEnemy(target) && ',''],
 ['deed-poise','landing',8,'if (result.poiseBroke)','if (false)'],
 ['deed-elements','landing',8,'(result.receivedAmounts ?? packet.amounts)','packet.amounts'],
 ['deed-hidden-flag','landing',8,"...(deedHidden ? ['hidden'] : [])",'...[]'],
 ['evade-heal-gate','landing',9,'if (mend > 0)','if (mend >= 0)'],
 ['evade-stamp','landing',9,"target.noteRecent('evade')","target.noteRecent('hurt')"],
 ['evade-spend','landing',9,"target.spendBuffs('evade')","target.spendBuffs('hurt')"],
 ['evade-miss-context','landing',9,'tags: packet.tags','tags: new Set(packet.tags)'],
 ['evade-return','landing',9,'return;',''],
 ['block-thorns','landing',10,'this.applyThorns(target, caster);',''],
 ['block-charge-depth','landing',10,'depth === 0','depth <= 0'],
 ['block-heal-gate','landing',10,'if (mend > 0)','if (mend >= 0)'],
 ['block-spend','landing',10,"target.spendBuffs('block')","target.spendBuffs('hurt')"],
 ['block-own-proc','landing',10,"this.rollOwnProcs(target, 'block', { depth });",''],
 ['block-trigger-aim','landing',10,'aim: vec(caster.pos.x, caster.pos.y)','aim: vec(target.pos.x, target.pos.y)'],
 ['block-dead-check','landing',10,' && !target.dead',''],
 ['block-return','landing',10,'return;',''],
 ['immune-wounding','landing',11,'struckTone, false, inst','struckTone, true, inst'],
 ['immune-return','landing',11,'return;',''],
 ['mimic-occurrence','landing',12,null,null],
 ['mimic-enemy-gate','landing',12," && caster.team === 'enemy'",''],
 ['dealt-capture','landing',13,'dealt = result.total','dealt = 0'],
 ['rear-zero-gate','landing',14,' && dealt > 0',''],
 ['rear-disabled','landing',14,' && def.backstabCue !== false',''],
 ['rear-default','landing',14,"def.backstabCue ?? 'rear_hit'","def.backstabCue || 'rear_hit'"],
 ['struck-zero-gate','landing',15,'if (result.receivedAmounts)','if (dealt > 0 && result.receivedAmounts)'],
 ['struck-received-identity','landing',15,'receivedAmounts: result.receivedAmounts','receivedAmounts: {...result.receivedAmounts}'],
 ['hurt-critical-stamp','landing',16,"caster.noteRecent('crit'); target.noteRecent('critHurt');","target.noteRecent('critHurt'); caster.noteRecent('crit');"],
 ['hurt-received-identity','landing',16,'receivedAmounts: result.receivedAmounts','receivedAmounts: {...result.receivedAmounts}'],
 ['pool-zero-gate','landing',17,'dealt > 0','dealt >= 0'],
 ['pool-value-snapshot','landing',17,'amt ?? 0','packet.amounts[ty as DamageType] ?? 0'],
];
export function applyLandingFault(source,ast,top,landing,fault){
 const[name,section,index,needle,replacement]=fault;
 if(section==='move'){
  const node=landing[index],after=landing[needle],text=node.getText(ast);
  return source.slice(0,node.getStart(ast))+source.slice(node.end,after.end)+'\n      '+text+source.slice(after.end);
 }
 const node=(section==='top'?top:landing)[index],text=node.getText(ast);
 if(needle!==null)assert.equal(text.split(needle).length-1,1,'Fault selector '+name);
 const changed=needle===null?'void 0;':text.replace(needle,replacement);
 return source.slice(0,node.getStart(ast))+changed+source.slice(node.end);
}
export const removedFailureCourses={
 'assault-packet':['packet-callback-failure'],
 'meta-admission':['deed-callback-failure'],
 'block-own-proc':['block-proc-failure'],
 'dealt-capture':['pool-bank-failure'],
};
