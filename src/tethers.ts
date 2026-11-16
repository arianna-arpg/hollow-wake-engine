import {dist,type CombatPoint} from './combat-geometry.js';import {pointSegDist} from './segment-geometry.js';import type {Modifier} from './types.js';import type {DamageAmounts,DamageType} from './damage-pipeline-types.js';
export interface TetherSpec {visual?:string;link:'caster'|'network'|'target';affects?:'enemies'|'allies'|'all';dps?:number;damageType?:DamageType;healPerSec?:number;width?:number;radius?:number;duration?:number;color?:string}
export interface CombatTether<A,I>{
  a:A;b:A;owner:A;skillId:string;link:string;inst?:I;visual?:string;visualAge?:number;amounts:DamageAmounts;heal:number;affects:'enemies'|'allies'|'all';width:number;remaining:number;tickTimer:number;color:string;
  ax:number;ay:number;bx:number;by:number;phase?:boolean;los?:Map<number,{ok:boolean;until:number}>;
}
export interface TetherSkill {def:{id:string;delivery:{occlusion?:'free'|'blocked'}}}
export interface TetherActor<A>{id:number;defId?:string;owner?:A;sourceSkillId?:string;team:string;tier:number;dead:boolean;pos:CombatPoint;radius:number;life:number;hitFlash:number;hitFlashType?:DamageType;untargetable:boolean;sheet:{get(stat:string,tags?:Set<string>,mods?:Modifier[]):number};healBy(n:number):number}
export interface PackTetherSpec {period?:number;duty?:number;radius?:number;damageType?:DamageType;dps:number;width?:number;color?:string}
export interface TetherRules {tick:number;memoTtl:number;memoJitter:number;links:Readonly<Record<string,'blocked'|'free'|undefined>>;colors:Readonly<Record<DamageType,string>>}
export interface TetherPorts<A,I>{
  actors():A[];time():number;tags(skill:I|TetherSkill['def'],extra?:string[]):Set<string>;modifiers(skill:I):Modifier[];grantedTags(skill:I):string[];specs(skill:I):readonly TetherSpec[];packSpec(id:string):PackTetherSpec|undefined;
  applyConversion(owner:A,amounts:DamageAmounts,tags:Set<string>,extra?:Modifier[]):void;mitigate(target:A,amounts:DamageAmounts):number;dominantType(amounts:DamageAmounts):DamageType;
  bodyWhere(actor:A,predicate:(at:CombatPoint,radius:number,segment:number)=>boolean):{seg:number}|null;lineOfFire(from:CombatPoint,to:CombatPoint):boolean;
  isBurstTarget(actor:A,team:string,tier:number):boolean;stampSegment(actor:A,segment:number):void;damageCue(actor:A,taken:number,tick:number):void;kill(actor:A,silent:false,owner:A):void;
}
/** One band's clocks and visibility cache are owned by its record. Ray casts
 * are host facts; conversion, cadence, affected teams, expiry and cache policy
 * remain SDK rules. Healing uses frame time; damage retains one-tick debt. */
export class Tethers<A extends TetherActor<A>,I extends TetherSkill>{
  #packScan=0;
  constructor(readonly state:{tethers:CombatTether<A,I>[]},readonly rules:TetherRules,readonly ports:TetherPorts<A,I>){}
  add(a:A,b:A,spec:TetherSpec,inst:I,owner:A):void{
    if(a===b||a.dead||b.dead)return;const p=this.ports;
    this.state.tethers=this.state.tethers.filter(t=>!(t.skillId===inst.def.id&&((t.a===a&&t.b===b)||(t.a===b&&t.b===a))));
    const extra=p.modifiers(inst),type=spec.damageType??'physical',tags=p.tags(inst,[type]),amounts:DamageAmounts={};
    if(spec.dps)amounts[type]=spec.dps*owner.sheet.get('damage',tags,extra)*owner.sheet.get('tetherDamage',tags,extra);
    p.applyConversion(owner,amounts,tags,extra);const width=(spec.width??10)*owner.sheet.get('aoeRadius',tags,extra)*owner.sheet.get('tetherWidth',tags,extra);
    let dominant:DamageType|null=null,best=0;for(const[k,v]of Object.entries(amounts))if((v??0)>best){best=v??0;dominant=k as DamageType;}
    this.state.tethers.push({a,b,owner,skillId:inst.def.id,link:spec.link,inst,visual:spec.visual,visualAge:0,amounts,heal:spec.healPerSec??0,affects:spec.affects??'enemies',width,
      remaining:spec.link==='target'?(spec.duration??8)*owner.sheet.get('effectDuration',tags,extra):Infinity,tickTimer:this.rules.tick,color:spec.color??(dominant?this.rules.colors[dominant]:'#7ec88a'),ax:a.pos.x,ay:a.pos.y,bx:b.pos.x,by:b.pos.y});
  }
  attach(spawned:A,inst:I,caster:A):void{
    for(const spec of this.ports.specs(inst))if(spec.link==='caster')this.add(spawned,caster,spec,inst,caster);
    else if(spec.link==='network'){const reach=spec.radius??360;for(const other of this.ports.actors()){if(other===spawned||other.dead||other.owner!==caster||other.sourceSkillId!==inst.def.id||dist(spawned.pos,other.pos)>reach)continue;this.add(spawned,other,spec,inst,caster);}}
  }
  advancePacks(dt:number):void{
    this.#packScan-=dt;if(this.#packScan>0)return;this.#packScan=.5;const p=this.ports;
    for(const a of p.actors()){
      if(a.dead||a.team!=='enemy'||!a.defId)continue;const td=p.packSpec(a.defId);if(!td)continue;
      const period=td.period??6,duty=td.duty??3,phase=p.time()%period;if(phase>=duty||this.state.tethers.some(t=>t.a===a||t.b===a))continue;
      let best:A|null=null,bd=td.radius??320;
      for(const b of p.actors()){if(b===a||b.dead||b.defId!==a.defId||(a.tier??0)!==(b.tier??0)||this.state.tethers.some(t=>t.a===b||t.b===b))continue;const d=dist(a.pos,b.pos);if(d<bd){bd=d;best=b;}}
      if(!best)continue;const type=td.damageType??'lightning',tags=new Set([type]),amounts:DamageAmounts={[type]:td.dps*a.sheet.get('damage',tags)};p.applyConversion(a,amounts,tags);
      this.state.tethers.push({a,b:best,owner:a,skillId:'__pack:'+a.defId,link:'pack',amounts,heal:0,affects:'enemies',width:td.width??10,remaining:duty-phase,tickTimer:this.rules.tick,color:td.color??this.rules.colors[type],ax:a.pos.x,ay:a.pos.y,bx:best.pos.x,by:best.pos.y});
    }
  }
  occlusion(t:CombatTether<A,I>):'blocked'|'free'{
    const base=t.inst?.def.delivery.occlusion??this.rules.links[t.link]??'free';if(base==='free')return base;const p=this.ports;
    const phasing=t.inst?t.owner.sheet.get('phasing',p.tags(t.inst.def,p.grantedTags(t.inst)),p.modifiers(t.inst)):t.owner.sheet.get('phasing');return phasing>0?'free':'blocked';
  }
  sees(t:CombatTether<A,I>,victim:A,at:CombatPoint,segment:number):boolean{
    const p=this.ports;t.phase??=this.occlusion(t)==='free';if(t.phase||victim===t.a||victim===t.b)return true;
    const memo=t.los??=new Map(),key=victim.id*128+segment+1,seen=memo.get(key);if(seen&&seen.until>p.time())return seen.ok;
    const ok=p.lineOfFire({x:t.ax,y:t.ay},at)&&p.lineOfFire({x:t.bx,y:t.by},at);
    if(memo.size>512){let drop=memo.size-384;for(const k of memo.keys()){memo.delete(k);if(--drop<=0)break;}}
    const j=this.rules.memoJitter,salt=key^Math.imul(t.a.id*131+t.b.id,0x85EBCA6B);
    memo.set(key,{ok,until:p.time()+(j>0?this.rules.memoTtl*(1-j/2+j*((Math.imul(salt,0x9E3779B1)>>>16)/65536)):this.rules.memoTtl)});return ok;
  }
  advance(dt:number):void{
    const p=this.ports;for(let i=this.state.tethers.length-1;i>=0;i--){const t=this.state.tethers[i];t.visualAge=(t.visualAge??0)+dt;t.remaining-=dt;
      if(t.a.dead||t.b.dead||t.remaining<=0){this.state.tethers.splice(i,1);continue;}
      t.ax=t.a.pos.x;t.ay=t.a.pos.y;t.bx=t.b.pos.x;t.by=t.b.pos.y;t.tickTimer-=dt;const damageTick=t.tickTimer<=0;if(damageTick)t.tickTimer+=this.rules.tick;
      const hasDamage=t.affects!=='allies'&&Object.keys(t.amounts).length>0,hasHeal=t.heal>0&&t.affects!=='enemies';if(!hasDamage&&!hasHeal)continue;
      for(const e of p.actors()){if(e.dead||(e.tier??0)!==(t.owner.tier??0))continue;const touch=p.bodyWhere(e,(bp,br,seg)=>pointSegDist(bp.x,bp.y,t.ax,t.ay,t.bx,t.by)<=t.width+br&&this.sees(t,e,bp,seg));if(!touch)continue;
        if(hasDamage&&damageTick&&p.isBurstTarget(e,t.owner.team,t.owner.tier)){const tick:DamageAmounts={};for(const[k,v]of Object.entries(t.amounts))tick[k as DamageType]=(v??0)*this.rules.tick;
          const taken=p.mitigate(e,tick);if(taken>0){e.life-=taken;e.hitFlash=.1;e.hitFlashType=p.dominantType(tick);p.stampSegment(e,touch.seg);p.damageCue(e,taken,this.rules.tick);if(e.life<=0&&!e.dead)p.kill(e,false,t.owner);}}
        if(hasHeal&&e.team===t.owner.team&&!e.untargetable)e.healBy(t.heal*dt);
      }
    }
  }
}
