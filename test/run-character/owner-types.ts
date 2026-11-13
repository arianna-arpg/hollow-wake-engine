import {RunCharacterSession,type RunState,type RunAction,type RunCharacterPorts,type RunPreparedCommand} from '../../src/run-character-session.js';
import type {PreparedStep,PreparedStepScope} from '../../src/account-prepared-step.js';
declare const owner:RunCharacterSession,run:RunState,entry:RunPreparedCommand,scope:PreparedStepScope;
const award:RunAction={kind:'award',profile:1,amount:7};owner.prepareTrusted([award]);
const step:PreparedStep=(command,current)=>{current.read(1);return current.execute(command);};void step;
// @ts-expect-error Immutable milestone ledger.
run.ledger.devotion_attuned=1;
// @ts-expect-error Immutable XP rows.
run.characters[0].xp=999;
// @ts-expect-error Immutable character collection.
run.characters.push({key:'x',accountKey:'a',xp:0,xpNeeded:45});
// @ts-expect-error Level belongs to character authority, never run rows.
run.characters[0].level;
// @ts-expect-error Passive currency belongs to character authority.
run.characters[0].passivePoints;
// @ts-expect-error Trusted awards cannot carry player-selected observation flags.
const forged:RunAction={kind:'award',profile:1,amount:7,eligible:true};
// @ts-expect-error Invalid action kind.
const invalid:RunAction={kind:'restore',profile:1,amount:7};
// @ts-expect-error A prepared effect cannot replace before-state investment.
entry.experience!.before.level=7;
// @ts-expect-error Journal run snapshots cannot be replaced.
entry.after=run;
// @ts-expect-error Read port exposes no item inventory.
scope.read(1).items;
// @ts-expect-error Read port exposes no actor resources.
scope.read(1).life;
// @ts-expect-error Read observation cannot change owned passive currency.
scope.read(1).passivePoints=100;
// @ts-expect-error Private prepared callbacks must finish synchronously.
const asynchronous:PreparedStep=async()=>({ok:true});
// @ts-expect-error Experience observations must finish synchronously.
const observe:RunCharacterPorts['experience']=async()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true});
// @ts-expect-error Experience observation cannot choose a run ledger.
const ledger:ReturnType<RunCharacterPorts['experience']>={eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true,ledger:{}};
// @ts-expect-error Callers cannot access a competing character writer.
owner.owner.command({op:'close-workshop',profile:1});
void [forged,invalid,asynchronous,observe,ledger];

// @ts-expect-error The host cannot substitute a live pre-batch multiplier.
const factor:ReturnType<RunCharacterPorts['experience']>={eligible:true,blessing:0,local:true,accountOwned:true,relicSuppressed:false,multiplier:1};
// @ts-expect-error Owned seated geometry is immutable.
scope.read(1).relicCells=100;
// @ts-expect-error Owned enabled policy is immutable.
scope.read(1).relicEnabled=true;
void factor;
