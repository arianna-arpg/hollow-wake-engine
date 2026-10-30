import assert from 'node:assert/strict';
// Deliberate semantic faults only within the three reviewed original statements.
export const sustainFaults=[
 ['siphon-zero-gate',18,'dealt > 0','dealt >= 0'],
 ['siphon-truthiness',18,'def.siphon &&','(def.siphon ?? 0) > 0 &&'],
 ['siphon-dead',18,' && !caster.dead',''],
 ['siphon-depth',18,'dealt > 0','dealt > 0 && depth === 0'],
 ['siphon-power',18,"caster.sheet.get('healPower', skillContextTags(def), extra)",'1'],
 ['siphon-extra-identity',18,'skillContextTags(def), extra','skillContextTags(def), [...extra]'],
 ['siphon-flow-measured',18,"'life', gained","'life', dealt"],
 ['siphon-flow-cue',18,'gained, def.feedingCue','gained, false'],
 ['sharing-depth',19,'depth === 0','depth <= 0'],
 ['sharing-dead-caster',19,' && !caster.dead',''],
 ['sharing-zero-gate',19,'if (vamp > 0)','if (vamp >= 0)'],
 ['sharing-story',19,'if (!sameStory(ally, caster)) continue;',''],
 ['sharing-dead-ally',19,'ally.dead || ',''],
 ['sharing-team',19,'ally.team !== caster.team || ',''],
 ['sharing-self',19,' || ally === caster',''],
 ['sharing-radius',19,'> DEFENSE_CFG.sustain.vampiricRadius','>= DEFENSE_CFG.sustain.vampiricRadius'],
 ['sharing-distance-origin',19,'dist(caster.pos, ally.pos)','dist(target.pos, ally.pos)'],
 ['sharing-iterator-snapshot',19,'for (const ally of this.actors)','for (const ally of [...this.actors])'],
 ['sharing-flow-measured',19,"'life', got","'life', heal"],
 ['sharing-flow-cue',19,'got, def.feedingCue','got, false'],
 ['sharing-text-threshold',19,"if (got > 0.5) this.text(ally.pos","if (got >= 0.5) this.text(ally.pos"],
 ['bond-lookup-order',19,'this.actors.find','[...this.actors].reverse().find'],
 ['bond-dead-target',19,'bonded.dead || ',''],
 ['bond-buff',19,' || !bonded.buffs.has(caster.bond.buffId)',''],
 ['bond-clear',19,'caster.bond = undefined;','void 0;'],
 ['bond-share-positive',19,'if (share > 0)','if (share >= 0)'],
 ['bond-feed-default',19,'def.bondFeed ?? 1','def.bondFeed || 1'],
 ['bond-text-threshold',19,"if (got > 0.5) this.text(bonded.pos","if (got >= 0.5) this.text(bonded.pos"],
 ['tree-depth',20,'depth === 0','depth <= 0'],
 ['tree-caster-dead',20,'depth === 0','depth === 0 && !caster.dead'],
 ['tree-story-origin',20,'sameStory(t, target)','sameStory(t, caster)'],
 ['tree-dead',20,'t.dead || ',''],
 ['tree-team',20,' || t.team !== caster.team',''],
 ['tree-radius',20,'> t.construct!.range','>= t.construct!.range'],
 ['tree-cap',20,'Math.min(hb.cap, (t.construct!.stored ?? 0) + dealt)','(t.construct!.stored ?? 0) + dealt'],
 ['tree-store-add',20,'(t.construct!.stored ?? 0) + dealt','dealt'],
 ['tree-base-default',20,'t.construct!.baseRadius ?? t.radius','t.construct!.baseRadius || t.radius'],
 ['tree-growth',20,'1 + 0.6 *','1 + 0.5 *'],
];
export function applySustainFault(source,ast,statements,fault){
 const[name,index,needle,replacement]=fault,node=statements[index],text=node.getText(ast);
 assert.equal(text.split(needle).length-1,1,'Fault selector '+name);
 return source.slice(0,node.getStart(ast))+text.replace(needle,replacement)+source.slice(node.end);
}
