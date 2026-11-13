import {runCharacterComposition} from './character-composition-runner.mjs';

await runCharacterComposition({
 name:'character-passive-composition',entry:'scripts/test-character-passive-composition.mjs',timeout:600000,
 extensions:['test/character-passive/composition-extra.mjs','test/character-passive/durable-world.mjs','test/character-passive/run-context.mjs','test/character-passive/account-mixed.mjs','test/character-passive/lifetimes.mjs'],
 beforeFinish:'checkPassiveCompositionBoundary',
 compressedJSON:{'passive-original':'baseline/milestone-eight/passives.json.gz'},
 extraAliases:{'diagnostic/live-passive-world':'test/character-passive/live-world.ts','diagnostic/passive-effects':'dist/character-passive-effects.js'},
 gameHarnesses:['test/character-passive/live-world.ts'],extraSharedModules:['character-passive-commands.js','character-passive-effects.js'],
 faults:[
  {"name":"substitute-account-ledger","file":"src/character-workshop-commands.ts","edits":[["return changeCharacterPassive({policy:this.#defs.character.passives,previous,","conditions={...(conditions as object),runLedger:scope.account.ledger};\n    return changeCharacterPassive({policy:this.#defs.character.passives,previous,"]],"expected":"passive realm must use the run ledger"},
  {name:'drop-intermediate-path',file:'src/complete-account-commands.ts',edits:[['...(rebuilds?{rebuilds}:{})','...{}']],expected:'passive rebuild path count'},
  {name:'late-summon-capture',file:'src/character-passive-commands.ts',edits:[
   ["events.push({kind:'capture-summons'});return[captured];","return[captured];"],
   ["events.push({kind:'recalculate',rebuild:rebuilds.length-1});","events.push({kind:'recalculate',rebuild:rebuilds.length-1});if(request.op==='refund')events.push({kind:'capture-summons'});"]
  ],expected:'capture summons precedes rebuild'},
  {name:'freeze-refund-skills',file:'src/character-passive-commands.ts',edits:[
   ["skills:()=>{events.push({kind:'resync-owned-supports'});return[];}","skills:()=>current.projection.known.map(([skillId])=>({origin:'learned' as const,skillId}))"]
  ],expected:'refund must not freeze preparation-time skill targets'},
  {name:'noisy-graft-noop',file:'src/character-passive-commands.ts',edits:[
   [' const changed=JSON.stringify(initial)'," if(request.op==='bindGraft'&&!rebuilds.length)events.push({kind:'meta-dirty'});\n const changed=JSON.stringify(initial)"]
  ],expected:'repeated graft has no publication'}
 ],
 reportFields:{additionalPassiveCompositionChecks:10,originalAuthoredPassiveCommands:9360,durableOriginalWorldCourses:4,separateRunAccountCases:4,forgedPlayerContextsRefused:8,invalidHostContextsRefused:8,
  mixedActualWorldCourses:2,realPassiveSceneCourses:6,passiveInvestmentOnly:true,currentSurvivingSummons:true,ordinarySummonGeometryPreserved:true,effectOnlyRefusal:true,fullActorRecoveryQualified:false}
});
