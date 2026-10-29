// Real authored relay and live-registration observer; no mocked armed-family result.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {mod} from '../src/engine/stats';
import {STATUS_RELAY_IDS,registerStatusRelay} from '../src/engine/reception';
bootSimEngine();assert(STATUS_RELAY_IDS.includes('grounding'));
const rows:unknown[]=[];
function course(label:string,relay:string,statusId:string,gate:string){
  const restore=seedGlobalRandom(912);
  try{
    const w=makeSimWorld('guardian',912),p=w.player;p.id=1;p.statuses=[];p.pos={x:100,y:100};w.actors=[p];
    p.sheet.setSource('relay-observer',[mod('relayStatus_'+relay,'flat',gate==='disabled'?0:1),mod('debuffImmunity','override',0)]);
    const e=w.createMonster('zombie',1,'enemy');e.id=2;e.pos={x:140,y:100};e.tier=p.tier;e.statuses=[];
    if(gate!=='none')w.actors.push(e);if(gate==='range-edge')e.pos.x=360;if(gate==='other-story')e.tier++;if(gate==='immune')e.invulnerable=true;if(gate==='passive')e.passive=true;if(gate==='dead')e.dead=true;
    const calls:unknown[]=[],families:unknown[]=[];
    for(const a of [p,e]){const apply=a.applyStatus.bind(a),armed=a.sheet.armedFamily.bind(a.sheet);a.applyStatus=(...args)=>{calls.push({actor:a.id,args});apply(...args);};a.sheet.armedFamily=(prefix,ids,extra)=>{const value=armed(prefix,ids,extra);if(prefix==='relayStatus_')families.push({actor:a.id,ids:[...ids],value:[...value]});return value;};}
    p.applyStatus(statusId,10,1,'incoming',gate==='already-relayed'?{relayed:true}:undefined);
    rows.push({label,ids:[...STATUS_RELAY_IDS],calls,families,actors:[p,e].map(a=>({id:a.id,statuses:a.statuses,sources:a.sheet.sourceNames().filter(n=>n.startsWith('status:')).map(n=>[n,a.sheet.getSourceMods(n)])}))});
  }finally{restore();}
}
for(const gate of ['enabled','disabled','none','range-edge','other-story','immune','passive','dead','already-relayed'])course('authored-'+gate,'grounding','shock',gate);
registerStatusRelay({id:'observed_late',status:'burn',radius:260,name:'Explicit late observer relay'});
course('late-registration','observed_late','burn','enabled');
const order=[...STATUS_RELAY_IDS];STATUS_RELAY_IDS.reverse();try{course('live-order','grounding','shock','enabled');}finally{STATUS_RELAY_IDS.splice(0,STATUS_RELAY_IDS.length,...order);}
course('restored-order','grounding','shock','enabled');
assert.equal(rows.length,12);fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows},null,2)+'\n');console.log('Observed 12 real status-relay courses including authored Grounding Relay and explicit late registration');
