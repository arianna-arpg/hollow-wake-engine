import {changeCharacterPassive,type CharacterPassiveConditions,type CharacterPassivePorts} from '../../src/character-passive-commands.js';
import {CharacterPassiveEffects,type CharacterPassiveEffectPorts} from '../../src/character-passive-effects.js';

type Token={readonly identity:unique symbol};type Skill={skill:string};type Body={body:string};
declare const preparation:CharacterPassivePorts<Token>;
declare const effects:CharacterPassiveEffectPorts<Skill,Body>;
const conditions:CharacterPassiveConditions={refundRefusal:null,openAllRealms:false,runLedger:{}};
const result=changeCharacterPassive(preparation,{op:'refund',nodeId:'leaf'},conditions);
const player=new CharacterPassiveEffects(effects);player.play(result.events);
player.play([{kind:'capture-summons'},{kind:'recalculate',rebuild:0},{kind:'refresh-captured-summons'}]);

// @ts-expect-error continuations belong to the admitted private graph
changeCharacterPassive<Token>({...preparation,previous:{}},{},{});
// @ts-expect-error private rebuilds finish before persistence
changeCharacterPassive({...preparation,rebuild:async()=>preparation.previous},{},{});
// @ts-expect-error graph reads cannot be asynchronous
changeCharacterPassive({...preparation,read:async()=>preparation.read(preparation.previous)},{},{});
// @ts-expect-error ledger observations use admitted numeric values
const invalidConditions:CharacterPassiveConditions={...conditions,runLedger:{unlocked:'yes'}};
void invalidConditions;
// @ts-expect-error publication callbacks must complete synchronously
new CharacterPassiveEffects({...effects,rebuild:async()=>{}});
// @ts-expect-error eligible bodies are captured synchronously
new CharacterPassiveEffects({...effects,captureSummons:async()=>[]});
// @ts-expect-error survivor checks cannot return promises
new CharacterPassiveEffects({...effects,alive:async()=>true});
// @ts-expect-error support refresh consumes a skill identity
new CharacterPassiveEffects<Skill,Body>({...effects,refreshSupports:(_body:Body)=>undefined});
// @ts-expect-error a learned skill lookup is synchronous
new CharacterPassiveEffects({...effects,known:async()=>undefined});
// @ts-expect-error publication effects are a closed protocol
player.play([{kind:'grant-currency'}]);
// @ts-expect-error a rebuild reference is an index
player.play([{kind:'recalculate',rebuild:'0'}]);
// @ts-expect-error summon refresh has no asynchronous or value-bearing result
new CharacterPassiveEffects({...effects,refreshSummon:()=>1});
// @ts-expect-error graft refresh targets learned skills; refunds enumerate both maps at publication
player.play([{kind:'resync-supports',origin:'grant',skillId:'firebolt'}]);
