// Original-only observations of the caster-resource phase through executeSkill.
// Synthetic banks select boundary states; the pressed skills are authored content.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {makeSkillInstance, instanceEffects} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';

const kinds=new Set(['gainCharge','drainCharge','payLedger','restoreSkillCharges','reduceCooldowns']);
const specs=[
  {id:'cross_jab'}, {id:'bloodlust'},
  {id:'absolution',balance:10}, {id:'absolution',balance:.5}, {id:'absolution',balance:.50001},
  {id:'absolution',missingHost:true}, {id:'time_dilation'},
  {id:'head_of_steam'}, {id:'re_energize'}, {id:'reload_powder'},
  {id:'re_energize',full:true}, {id:'re_energize',missingHost:true},
  {id:'re_energize',duplicate:true}, {id:'head_of_steam',duplicate:true},
] as const;
const restore=seedGlobalRandom(0x4d3301),courses:unknown[]=[];
try {
  for (const config of specs) {
    const spec:{id:string;balance?:number;missingHost?:boolean;full?:boolean;duplicate?:boolean}=config;
    const w=makeSimWorld('warrior',0x4d3301),actor=w.player;
    w.walk=null;w.actors=[actor];w.meta.modeId='immortal';
    const skill=makeSkillInstance(SKILLS[spec.id],4);
    const bank=(id:string,still=false)=>makeSkillInstance({id,name:id,description:'reference bank',tags:['spell'],color:'#fff',
      manaCost:0,useTime:0,cooldown:1,delivery:{type:'self'},effects:[],useCharges:{max:4,...(still?{still:{bleed:1}}:{})}},1);
    const host=bank('m3-bank'),patient=bank('m3-still',true);
    skill.hostSkillId=spec.missingHost?'absent':'m3-bank';
    actor.skills=[skill,host,patient,...(spec.duplicate?[patient]:[])];
    for(const entry of [host,patient])Object.assign(actor.skillChargeBank(entry),{count:spec.full?4:1,timer:.75,reloading:true});
    actor.cooldowns=new Map([[skill.def.id,8],['m3-bank',5],['m3-still',2]]);
    actor.cooldownTotals=new Map(actor.cooldowns);
    actor.activeAuras.clear();
    actor.activeAuras.set('m3-bank',{ledger:{balance:spec.balance??10}} as never);
    actor.charges.set('fury',2);actor.charges.set('bloodlust',5);
    actor.chargeState.set('bloodlust',{idle:0,acc:0,tick:0});
    actor.casting={inst:skill,mode:'channel',held:true,elapsed:0,total:1,baseMult:1,aim:{...actor.pos}} as never;
    const effects=instanceEffects(skill).filter(fx=>kinds.has(fx.type));assert(effects.length);
    const inspect=()=>({cooldowns:[...actor.cooldowns],totals:[...actor.cooldownTotals],
      banks:[host,patient].map(s=>({id:s.def.id,cap:actor.skillChargeCap(s),state:{...actor.skillChargeBank(s)}})),
      ledger:actor.activeAuras.get('m3-bank')!.ledger!.balance,
      charges:[...actor.charges],drains:[...actor.chargeState].map(([id,s])=>[id,s.drain??null]),held:actor.casting?.held??null});
    const input={spec,skillId:skill.def.id,hostSkillId:skill.hostSkillId,ownCharges:skill.def.useCharges??null,effects,initial:inspect()};
    assert(w.executeSkill(actor,skill,{x:actor.pos.x+40,y:actor.pos.y},{noRepeat:true,noCooldown:true}));
    courses.push({input,expected:inspect()});
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));
} finally {restore();}
