// Read-only observations of the actual native gain methods and synchronous queries.
import fs from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';

const destination=process.argv[2];
bootSimEngine();
type Phase='maximum'|'overcharge';
interface Input {name:string;amount?:number;dead?:boolean;maximum?:number;current?:number;filled?:boolean;broken?:boolean;overcharge?:number;at?:Phase;action?:string}
const inputs:Input[]=[
  {name:'ordinary'},{name:'zero',amount:0},{name:'negative-zero',amount:-0},
  {name:'negative',amount:-10},{name:'dead',dead:true},{name:'zero-maximum',maximum:0},
  {name:'negative-maximum',maximum:-10},{name:'full',current:100},{name:'above-cap',current:120},
  {name:'flag-already-set',filled:true},{name:'broken',broken:true},
  {name:'overcharge',overcharge:.5,amount:120},
  {name:'below-threshold',current:99.9985,amount:.0004},
  {name:'cross-threshold',current:99.9985,amount:.0006},
  {name:'at-threshold',current:100-.001,amount:.0002},
  {name:'raw-nan-amount',amount:NaN},{name:'raw-infinite-amount',amount:Infinity},
  {name:'raw-nan-maximum',maximum:NaN},{name:'raw-infinite-maximum',maximum:Infinity},
];
const actions=['current','dead','maximum','throw','reenter','nested-fill'];
const rows:unknown[]=[];
for(const resource of ['es','poise'] as const){
  const cases:Input[]=[...inputs,...actions.map<Input>(action=>({name:'maximum-'+action,at:'maximum',action})),
    ...(resource==='poise'?actions.map<Input>(action=>({name:'overcharge-'+action,at:'overcharge',action})):[])];
  for(const input of cases){
    const restore=seedGlobalRandom(0xc043);
    try{
      const world=makeSimWorld('warrior',0xc043),actor=world.player,events:unknown[]=[];
      actor.sheet=new StatSheet();actor.skills=[];
      for(const stat of ['life','energyShield','poise'])actor.sheet.setBase(stat,100);
      actor.sheet.setBase('poiseOvercharge',input.overcharge??0);
      actor.life=100;actor.es=actor.poise=input.current??40;actor.dead=input.dead??false;
      actor.esJustFilled=input.filled??false;actor.poiseBroken=input.broken??false;
      const state=()=>({current:actor[resource],dead:actor.dead,filled:actor.esJustFilled,broken:actor.poiseBroken});
      const method=resource==='es'?'gainEs':'gainPoise',maximum=resource==='es'?'maxEs':'maxPoise';
      const gain=actor[method].bind(actor),nativeMaximum=actor[maximum].bind(actor),get=actor.sheet.get.bind(actor.sheet);
      let fired=false;
      const action=(phase:Phase)=>{
        if(fired||input.at!==phase)return;
        fired=true;events.push({phase:'action:'+input.action,state:state()});
        if(input.action==='current')actor[resource]=90;
        if(input.action==='dead')actor.dead=true;
        if(input.action==='maximum')actor.sheet.setBase(resource==='es'?'energyShield':'poise',50);
        if(input.action==='throw')throw new Error('observed-query-failure');
        if(input.action==='reenter'||input.action==='nested-fill'){
          const result=gain(input.action==='reenter'?5:70);
          events.push({phase:'nested-return',result,state:state()});
        }
      };
      actor[maximum]=()=>{
        events.push({phase:'maximum-before',state:state()});action('maximum');
        const result=Object.hasOwn(input,'maximum')?input.maximum!:nativeMaximum();
        events.push({phase:'maximum-return',result,state:state()});return result;
      };
      actor.sheet.get=(id,...args)=>{
        if(id!=='poiseOvercharge')return get(id,...args);
        events.push({phase:'overcharge-before',state:state()});action('overcharge');
        const result=get(id,...args);events.push({phase:'overcharge-return',result,state:state()});return result;
      };
      const before=state();let result:unknown,error:string|null=null;
      try{result=gain(input.amount??20);}catch(e){error=String(e);}
      rows.push({resource,input,before,result,error,events,after:state()});
    }finally{restore();}
  }
}
fs.writeFileSync(destination,JSON.stringify({schemaVersion:1,stage:'Exploratory only; not accepted fixtures',
  scope:'Real actor gates with query order, same-actor reentry and partial failure. Nonfinite cases are raw runtime observations, not accepted content values.',
  courses:rows.length,rows},(_k,v)=>v===undefined?{$undefined:true}:typeof v==='number'&&!Number.isFinite(v)?{$number:String(v)}:
    typeof v==='number'&&Object.is(v,-0)?{$number:'-0'}:v,2)+'\n',{flag:'wx'});
