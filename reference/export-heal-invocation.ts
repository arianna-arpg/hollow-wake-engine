// Native World invocation must not inspect a callable's user-defined .call.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {StatSheet} from '../src/engine/stats';import {PROCS,procPowerStat,type ProcDef} from '../src/data/procs';
bootSimEngine();const rows:unknown[]=[];
for(const mode of ['call-value','call-getter','proxy','bound-receiver']){
  const restore=seedGlobalRandom(42);
  try{
    const w=makeSimWorld('warrior',42),p=w.player,other=new Actor('bound-heal','player',{x:0,y:0}),calls:unknown[]=[];
    for(const a of [p,other]){
      a.sheet=new StatSheet();a.sheet.setBase('life',100);a.sheet.setBase('healTaken',1);a.life=50;a.healedSince=0;
      const maximum=a.maxLife;a.maxLife=function(){calls.push(['maximum',this===p?'caster':'bound']);return maximum.call(this);};
      a.onLifeHealed=function(amount,silent){calls.push(['observer',this===p?'caster':'bound',amount,silent]);};
    }
    p.sheet.setBase(procPowerStat('guarded_heart'),1);p.procCues=undefined;p.procCuePulses=[];p.procPopEvents=[];
    const heal=p.healBy;
    let selected:Actor['healBy']=function(this:Actor,amount,silent=false){calls.push(['selected',this===p?'caster':'bound',amount,silent]);return Reflect.apply(heal,this,[amount,silent]);};
    if(mode==='call-value')Object.defineProperty(selected,'call',{value:()=>{calls.push(['incorrect-call']);return 0;}});
    if(mode==='call-getter')Object.defineProperty(selected,'call',{get(){calls.push(['incorrect-call-getter']);throw Error('Unexpected callable property read');}});
    if(mode==='proxy')selected=new Proxy(selected,{
      get(target,key,receiver){calls.push(['callable-get',String(key)]);return Reflect.get(target,key,receiver);},
      apply(target,receiver,args){calls.push(['proxy-apply',receiver===p,args[0]]);return Reflect.apply(target,receiver,args);},
    });
    if(mode==='bound-receiver'){selected=selected.bind(other);Object.defineProperty(selected,'call',{value:null});}
    p.healBy=selected;
    const effect={type:'heal' as const,get flat(){calls.push(['flat']);return 3;},get pctMax(){calls.push(['pct']);return 0;}};
    const proc:ProcDef={...PROCS.guarded_heart,effect};w['executeProc'](proc,p,null,null,0);
    const receiver=mode==='bound-receiver'?'bound':'caster';
    assert.deepEqual(calls,[['flat'],['pct'],['maximum','caster'],...(mode==='proxy'?[['proxy-apply',true,3]]:[]),
      ['selected',receiver,3,false],['maximum',receiver],['observer',receiver,3,false]]);
    assert.equal(p.life,mode==='bound-receiver'?50:53);assert.equal(other.life,mode==='bound-receiver'?53:50);
    const gainPulses=p.procCuePulses.filter(c=>c.phase==='gain').length;assert.equal(gainPulses,1);
    rows.push({mode,calls,life:p.life,boundLife:other.life,healedSince:p.healedSince,boundHealedSince:other.healedSince,gainPulses});
  }finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows,
  scope:'Native World heal-case invocation with own call values/accessors, a callable Proxy and a bound receiver. Method invocation itself must not read call. Synthetic host-callable probes, not owned content.'},null,2)+'\n');
