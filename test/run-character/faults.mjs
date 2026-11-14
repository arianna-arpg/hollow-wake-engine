export const experienceFaults=[
 ['early-milestone-publication',[['character-experience-plan.ts','for(const event of plan.events){','complete(p.writeLedger(plan.ledgerAfter));\n   for(const event of plan.events){']],'original experience publication mismatch'],
 ['heal-current-downed',[['character-experience-plan.ts','if(!downed)complete(p.fillResources());','complete(p.fillResources());']],'original experience publication mismatch'],
 ['dirty-final-state',[['character-experience-plan.ts','complete(p.write(event.state));',"complete(p.write(event.kind==='mark-dirty'?plan.after:event.state));"]],'original experience publication mismatch'],
 ['copy-unchanged-ledger',[['character-experience-plan.ts','if(missing(rules.pack.milestones)||missing(rules.classMilestones(input.classId)))ledger=','if(true)ledger=']],'unchanged milestone ledger must remain shared'],
 ['snapshot-downed-before-rebuild',[['character-experience-plan.ts','for(const event of plan.events){','const capturedDowned=p.downed();\n   for(const event of plan.events){'],['character-experience-plan.ts','const downed=p.downed();','const downed=capturedDowned;']],'level-up fill must read current downed state after rebuild']
];
export const ownerFaults=[
 ['journal-retained-build',[['character-workshop-boundary.ts','if(!path&&before===after)return;','']],'Account-only bookkeeping invented character transitions'],
 ['store-retained-build',[['account-workshop-core.ts','if(workshop!==previous&&(workshop.body','if(workshop!==previous&&(true||workshop.body']],'Account-only bookkeeping invented character storage writes'],
 ['drop-earned-points',[['character-workshop-commands.ts','after=before+grant.amount','after=before']],'Earned passive points were lost'],
 ['unbounded-run-counters',[['run-character-session.ts',"if(!present)need(Object.keys(before.ledger).length<4096,'run-ledger-limit');",'']],'Reward exceeded bounded run ledger'],
 ['unbounded-xp-milestones',[['run-character-session.ts',"  if(plan.ledgerAfter!==before.ledger)need(Object.keys(plan.ledgerAfter).length<=4096,'run-ledger-limit');\n",'']],'XP milestone exceeded bounded run ledger'],
 ['publish-run-during-prepare',[['run-character-session.ts','this.#staged=after;this.#rows.push({before,after,experience:plan})','this.#run=after;this.#staged=after;this.#rows.push({before,after,experience:plan})']],'preparation published run XP'],
 ['drop-passive-spend',[['run-character-session.ts','{...current,xp:row.xp','{...current,passivePoints:(current.level-1)*this.#rules.pack.tuning.passivePointsPerLevel,xp:row.xp']],'stale-experience-build'],
 ['recompute-stored-threshold',[['run-character-session.ts','xpNeeded:row.xpNeeded,ledger','xpNeeded:this.#rules.experienceForLevel(current.level),ledger']],'stored threshold was silently recomputed'],
 ['retain-step-capability',[['account-prepared-step.ts','}finally{active=false;}','}finally{}']],'prepared step read outlived transaction'],
 ['ignore-staged-enabled',[['account-prepared-step.ts','relicEnabled:selected?state(account).enabled:false','relicEnabled:selected']],'staged relic policy mismatch'],
 ['include-carried-area',[['account-prepared-step.ts','new Set(relics.seated)','new Set([...relics.seated,...relics.carried])']],'staged relic policy mismatch'],
 ['cache-by-account-key',[['account-prepared-step.ts','const cellCache=new WeakMap<Account,number>();','const cellCache=new Map<string,number>();'],['account-prepared-step.ts','cellCache.get(account)','cellCache.get(account.key)'],['account-prepared-step.ts','cellCache.set(account,cells)','cellCache.set(account.key,cells)']],'staged relic policy mismatch'],
 ['ignore-suppression',[['run-character-session.ts','current.relicEnabled&&!observed.relicSuppressed','current.relicEnabled']],'staged relic policy mismatch'],
 ['ignore-active-profile',[['account-prepared-step.ts','access.relicBuilds&&account.active===profile','access.relicBuilds']],'staged relic policy mismatch'],
 ['save-committed-run',[['durable-run-owner.ts','this.#pending?this.#engine.prepared(this.#pending).state:this.#engine.read()','this.#engine.read()']],'checkpoint omitted prepared run XP'],
 ['publish-run-on-refusal',[['durable-run-owner.ts','discard:lease=>{try{','discard:lease=>{this.#published=lease.run.candidate;try{']],'Expected values to be strictly deep-equal'],
 ['expose-run-before-live-publish',[['durable-run-owner.ts','publish:(lease,packet)=>{try{','publish:(lease,packet)=>{this.#published=lease.run.candidate;try{']],'read exposed partially published run state']
];
export const worldFaults=[
 ['ignore-relic-build-dependency',[['character-workshop-commands.ts','JSON.stringify(scope.relics)===held.relics','true']],'Expected values to be strictly equal'],
 ['retain-build-reader',[['durable-run-owner.ts','close:reader.close','close:()=>{}']],'finished checkpoint retained its build capability'],
 ['retain-failed-prepare-reader',[['durable-run-owner.ts','catch(error){reader.close();throw error;}','catch(error){throw error;}']],'failed preparation retained its build capability'],
 ['ignore-reader-membership',[['durable-run-owner.ts',"need(handles.has(handle),'foreign-run-build');",'']],'previous lease build escaped its scope'],
 ['ignore-scene-hero-fence',[['world-publication.ts','current();need(investment()===lease.investment','need(investment()===lease.investment']],'Missing expected rejection'],
 ['ignore-investment-fence',[['world-publication.ts',"need(investment()===lease.investment,'run-world-stale-investment');",'']],'run-world-stale-investment'],
 ['heal-downed-hero',[['character-experience-plan.ts','if(!downed)complete(p.fillResources())','complete(p.fillResources())']],'original live XP/passive']
];
