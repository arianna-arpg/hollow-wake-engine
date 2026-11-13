import {planExperience,ExperiencePlanEffects,type OwnedExperienceState,type ExperienceObservation,type ExperienceEffectPorts,type ExperienceEvent} from '../../src/character-experience-plan.js';
import type {CharacterProgression} from '../../src/character-progression.js';
declare const rules:CharacterProgression;declare const input:OwnedExperienceState;declare const observation:ExperienceObservation;declare const ports:ExperienceEffectPorts;
const plan=planExperience(rules,input,1,observation);new ExperiencePlanEffects(ports).play(plan);
// @ts-expect-error prepared checkpoints are immutable
plan.after.level=10;
// @ts-expect-error retained run state is immutable
plan.ledgerAfter.changed=1;
// @ts-expect-error ordered effect lists are immutable
plan.events.push({kind:'announce'});
// @ts-expect-error investment reads are synchronous
new ExperiencePlanEffects({...ports,read:async()=>ports.read()});
// @ts-expect-error investment publication completes synchronously
new ExperiencePlanEffects({...ports,write:async()=>{}});
// @ts-expect-error resource condition is observed synchronously
new ExperiencePlanEffects({...ports,downed:async()=>false});
// @ts-expect-error resource filling completes synchronously
new ExperiencePlanEffects({...ports,fillResources:async()=>{}});
// @ts-expect-error effect ports cannot return values
new ExperiencePlanEffects({...ports,announce:()=>7});
// @ts-expect-error eligibility is a host boolean
planExperience(rules,input,1,{...observation,eligible:1});
// @ts-expect-error downed state is observed during publication, not stored in a plan
planExperience(rules,input,1,{...observation,downed:true});
// @ts-expect-error an experience checkpoint cannot overwrite live health
ports.write({...plan.after,life:0});
// @ts-expect-error the effect protocol is closed
const invalid:ExperienceEvent={kind:'set-health'};
void invalid;
