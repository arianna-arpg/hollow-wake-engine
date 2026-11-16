import {dist,type CombatPoint} from './combat-geometry.js';
import {readList,type LiveList} from './live-list.js';
import type {Modifier} from './types.js';
export interface TargetingSpec {
  target:'enemy'|'corpse'|'minion'|'ally';castRange:number;searchRadius?:number;
  plural?:boolean;requiresStatus?:string|string[];requiresMonsterTags?:string[];fallback?:'fail'|'self'|'aim';
}
export interface TargetCorpse {pos:CombatPoint;defId:string;level:number;maxLife:number;remaining:number;tier?:number}
export interface TargetingActor<A> {
  pos:CombatPoint;radius:number;tier:number;owner?:A;dead:boolean;construct?:unknown;team:string;
  defId?:string;level:number;life:number;statuses:readonly {id:string}[];maxLife():number;
  sheet:{get(stat:string,tags:Set<string>,extra:Modifier[]):number};
}
export interface ResolvedCombatTarget<A,C> {pos:CombatPoint;actor?:A;corpse?:C;corpses?:C[];self?:boolean}
export interface TargetingPorts<A,I,C> {
  spec(skill:I):TargetingSpec;grimoire(skill:I):string|undefined;tags(skill:I):Set<string>;modifiers(skill:I):Modifier[];
  actors():readonly A[];enemies(actor:A):readonly A[];spoilStoryAt(at:CombatPoint):number;
  leavesRemains(defId:string):boolean;monsterTags(defId:string):readonly string[]|undefined;hasHeal(skill:I):boolean;
  occlusion(actor:A,skill:I):string;lineOfFire(from:CombatPoint,to:CombatPoint,tier:number):boolean;
  reachTo(actor:A,at:CombatPoint):number;kill(actor:A):void;corpse(record:TargetCorpse):C;
}
/** Target selection is combat policy. The borrowed census supplies hostility
 * and spatial facts. Corpse sacrifice is a real death; callers must admit
 * content and required services before invoking this side-effecting resolve. */
export class CombatTargeting<A extends TargetingActor<A>,I,C extends TargetCorpse> {
  constructor(private readonly corpseOwner:LiveList<C>,readonly corpseDuration:number,readonly ports:TargetingPorts<A,I,C>){}
  get corpses():C[]{return readList(this.corpseOwner);}
  resolve(caster:A,skill:I,aim:CombatPoint):ResolvedCombatTarget<A,C>|null {
    const p=this.ports,t=p.spec(skill),search=t.searchRadius??70;
    if(t.target==='corpse'){
      if(p.grimoire(skill))return{pos:{...aim}};
      const tags=p.tags(skill),extra=p.modifiers(skill);
      const want=t.plural?1+Math.max(0,Math.round(caster.sheet.get('corpseBatch',tags,extra))):1;
      const haul=this.corpses.filter(c=>(c.tier??p.spoilStoryAt(c.pos))===caster.tier&&dist(caster.pos,c.pos)<=t.castRange&&dist(aim,c.pos)<search)
        .sort((a,b)=>dist(aim,a.pos)-dist(aim,b.pos)).slice(0,want);
      if(!haul.length&&caster.sheet.get('targetMinionFallback',tags,extra)>0){
        let best:A|null=null,nearest=Math.max(search,160);
        for(const a of p.actors()){
          if(a.owner!==caster||a.dead||a.construct||dist(caster.pos,a.pos)>t.castRange)continue;
          const d=dist(aim,a.pos)-a.radius;if(d<nearest){nearest=d;best=a;}
        }
        if(best)return{pos:{...best.pos},actor:best};
      }
      if(haul.length<want&&caster.sheet.get('sacrificeMinions',tags,extra)>0){
        const victims=p.actors().filter(a=>a.owner===caster&&!a.dead&&!a.construct&&!!a.defId&&p.leavesRemains(a.defId)
          &&dist(caster.pos,a.pos)<=t.castRange&&dist(aim,a.pos)-a.radius<Math.max(search,160))
          .sort((a,b)=>(dist(aim,a.pos)-a.radius)-(dist(aim,b.pos)-b.radius));
        for(const victim of victims){
          if(haul.length>=want)break;
          const corpse=p.corpse({pos:{...victim.pos},defId:victim.defId!,level:victim.level,maxLife:victim.maxLife(),remaining:this.corpseDuration,tier:victim.tier});
          p.kill(victim);this.corpses.push(corpse);haul.push(corpse);
        }
      }
      if(!haul.length)return null;
      const found:ResolvedCombatTarget<A,C>={pos:{...haul[0].pos},corpse:haul[0]};if(haul.length>1)found.corpses=haul;return found;
    }
    const pool=t.target==='enemy'?p.enemies(caster):t.target==='minion'
      ?p.actors().filter(a=>a.owner===caster&&!a.dead&&!a.construct)
      :p.actors().filter(a=>a.team===caster.team&&!a.dead&&a!==caster);
    const required=t.requiresStatus===undefined?null:Array.isArray(t.requiresStatus)?t.requiresStatus:[t.requiresStatus];
    const needLine=t.target==='enemy'&&p.occlusion(caster,skill)==='blocked';
    const qualifies=(a:A):boolean=>{
      if(required&&!a.statuses.some(s=>required.includes(s.id)))return false;
      if(t.requiresMonsterTags){const tags=a.defId?p.monsterTags(a.defId):undefined;if(!tags||!t.requiresMonsterTags.some(tag=>tags.includes(tag)))return false;}
      return !needLine||p.lineOfFire(caster.pos,a.pos,caster.tier);
    };
    let best:A|null=null,nearest=search;
    for(const a of pool){if(dist(caster.pos,a.pos)>t.castRange||!qualifies(a))continue;const d=p.reachTo(a,aim);if(d<nearest){nearest=d;best=a;}}
    if(!best){
      if(t.target==='ally'&&p.hasHeal(skill)){
        let worst=.999;for(const a of pool){if(!qualifies(a)||a.construct||dist(caster.pos,a.pos)-a.radius>t.castRange)continue;
          const fraction=a.life/Math.max(1,a.maxLife());if(fraction<worst){worst=fraction;best=a;}}
      }else{
        let range=t.castRange;for(const a of pool){if(!qualifies(a))continue;const d=dist(caster.pos,a.pos)-a.radius;if(d<range){range=d;best=a;}}
      }
    }
    if(best)return{pos:{...best.pos},actor:best};
    return t.fallback==='self'?{pos:{...caster.pos},self:true}:null;
  }
}
