export interface ThrongPoint {x:number;y:number}
export interface ThrongSpec {readonly tier?:string;readonly monsterId:string;readonly direct?:{readonly linger?:number;readonly radius?:number}}
export interface ThrongOrderSkill {readonly def:{readonly id:string;readonly throng?:ThrongSpec};readonly hostSkillId?:string}
export interface ThrongOrderActor<A,I>{
  readonly id:number;readonly dead:boolean;readonly passive?:boolean;readonly untargetable?:boolean;
  readonly pos:ThrongPoint;readonly radius:number;readonly tier:number;readonly skills:readonly (I|null|undefined)[];
  readonly clingTo?:unknown;readonly sheet:{get(stat:string):number};
  throngCarried:boolean;throngDive?:ThrongPoint;casting:unknown;
  ownedBy(actor:A):boolean;
}
export interface ThrongOrderRules {readonly linger:number;readonly radius:number;readonly pin:number}
export interface ThrongOrderPorts<A,I>{
  actors():readonly A[];enemies(actor:A):Iterable<A>;time():number;
  evolution(skill:I):{readonly fullDive?:boolean;readonly whirlwind?:boolean;readonly [key:string]:unknown};
  bodies(caster:A,skillId:string):A[];rosterCount(caster:A,skill:I):number;capacity(caster:A,skill:I):number;
  kind(monsterId:string):number;used():number;countOwned(owner:number,kind:number):number;
  promote(at:ThrongPoint,query:{within:number;max:number;owner:number;kindIdx:number}):void;
  unclasp(actor:A):void;clamp(at:ThrongPoint,radius:number,mover:A):ThrongPoint;
  pooledOrder(owner:number,kind:number,order:{x:number;y:number;until:number;targetId?:number}):void;
  issue(actor:A,order:{kind:'assault';pos:ThrongPoint;until:number;radius:number;issuerId:number;targetId?:number}):void;
  empty(caster:A,skillId:string):void;
}

/** Skill-controlled swarm orders. Bodies can reside in a dense pool or as full
 * combat actors; promotion preserves ownership and the source skill anchor.
 * The host's AI interprets orders and its mover performs physical placement. */
export class ThrongOrders<A extends ThrongOrderActor<A,I>,I extends ThrongOrderSkill>{
  constructor(readonly rules:ThrongOrderRules,readonly ports:ThrongOrderPorts<A,I>){}
  promoteCommand(caster:A,skill:I,affects:string,radius?:number):void{
    if(affects==='squad')return;
    for(const keeper of [...this.ports.actors()]){
      if(keeper.dead||(keeper!==caster&&!keeper.ownedBy(caster)))continue;
      for(const anchor of keeper.skills){
        const spec=anchor?.def.throng;
        if(!anchor||spec?.tier!=='lite'||(skill.hostSkillId&&anchor.def.id!==skill.hostSkillId))continue;
        const kindIdx=this.ports.kind(spec.monsterId);if(kindIdx<0)continue;
        this.ports.promote(caster.pos,{within:radius??Infinity,max:this.ports.used(),owner:keeper.id,kindIdx});
      }
    }
  }
  direct(caster:A,skill:I,aim:ThrongPoint,effect:{readonly pin?:number;readonly linger?:number}):void{
    const spec=skill.def.throng;if(!spec)return;
    const evolution=this.ports.evolution(skill);
    if(Object.keys(evolution).length&&spec.tier==='lite'){
      const kindIdx=this.ports.kind(spec.monsterId);
      if(kindIdx>=0)this.ports.promote(caster.pos,{within:Infinity,max:this.ports.used(),owner:caster.id,kindIdx});
    }
    const bodies=this.ports.bodies(caster,skill.def.id);
    if(evolution.fullDive&&bodies.every(body=>!body.throngDive)&&this.ports.rosterCount(caster,skill)>=this.ports.capacity(caster,skill)){
      for(const body of bodies){
        if(body.clingTo)this.ports.unclasp(body);
        body.casting=null;body.throngCarried=false;
        body.throngDive=this.ports.clamp({...aim},body.radius,body);
      }
      return;
    }
    if(evolution.whirlwind)return;
    for(const body of bodies)if(!body.throngDive)body.throngCarried=false;
    const kindIdx=spec.tier==='lite'?this.ports.kind(spec.monsterId):-1;
    const rows=kindIdx>=0?this.ports.countOwned(caster.id,kindIdx):0;
    if(!bodies.length&&!rows){this.ports.empty(caster,skill.def.id);return;}
    const mark={...aim},until=this.ports.time()+(effect.linger??spec.direct?.linger??this.rules.linger),radius=spec.direct?.radius??this.rules.radius;
    let quarry:A|undefined,nearest=effect.pin??this.rules.pin;
    for(const enemy of this.ports.enemies(caster)){
      if(enemy.passive||enemy.untargetable||enemy.sheet.get('invisible')>0)continue;
      const distance=Math.hypot(enemy.pos.x-mark.x,enemy.pos.y-mark.y);
      if(distance<nearest){nearest=distance;quarry=enemy;}
    }
    if(kindIdx>=0){
      const order:{x:number;y:number;until:number;targetId?:number}={x:mark.x,y:mark.y,until};
      if(quarry)order.targetId=quarry.id;
      this.ports.pooledOrder(caster.id,kindIdx,order);
    }
    for(const body of bodies){
      if(body.throngDive)continue;
      const order:{kind:'assault';pos:ThrongPoint;until:number;radius:number;issuerId:number;targetId?:number}={kind:'assault',pos:{...mark},until,radius,issuerId:caster.id};
      if(quarry)order.targetId=quarry.id;
      this.ports.issue(body,order);
    }
  }
}

export interface PromotionPool {
  readonly used:number;
  readonly alive:ArrayLike<number>;readonly owner:ArrayLike<number>;readonly kind:ArrayLike<number>;
  readonly team:ArrayLike<number>;readonly story:ArrayLike<number>;readonly x:ArrayLike<number>;readonly y:ArrayLike<number>;
}
export interface PromotionQuery {
  readonly within:number;readonly max:number;readonly owner?:number;readonly kindIdx?:number;readonly opposing?:string;
  readonly rank?:ThrongPoint;readonly story?:number;
}
/** Snapshot candidate rows, then promote in stable distance order. A failed
 * promotion does not consume the successful-body cap. Pool writes remain the
 * host's responsibility and are visible to subsequent promotion callbacks. */
export function promoteNearest<A>(pool:PromotionPool,at:ThrongPoint,query:PromotionQuery,promote:(row:number)=>A|null):A[]{
  const picks:{row:number;distance:number}[]=[],team=query.opposing?(query.opposing==='player'?0:1):undefined,rank=query.rank??at;
  for(let row=0;row<pool.used;row++){
    if(!pool.alive[row]||(query.owner!==undefined&&pool.owner[row]!==query.owner)||(query.kindIdx!==undefined&&pool.kind[row]!==query.kindIdx)
      ||(team!==undefined&&pool.team[row]!==team)||(query.story!==undefined&&pool.story[row]!==query.story))continue;
    const dx=pool.x[row]-at.x,dy=pool.y[row]-at.y;if(dx*dx+dy*dy>query.within*query.within)continue;
    const rx=pool.x[row]-rank.x,ry=pool.y[row]-rank.y;picks.push({row,distance:rx*rx+ry*ry});
  }
  picks.sort((a,b)=>a.distance-b.distance);const out:A[]=[];
  for(const pick of picks){if(out.length>=query.max)break;const body=promote(pick.row);if(body)out.push(body);}
  return out;
}

/** Original eight-hop court ownership rule, including its cycle bound. */
export function combatOwnedBy<A extends {readonly owner?:A|null}>(actor:A,lord:A):boolean{
  let owner=actor.owner;
  for(let hops=0;owner&&hops<8;hops++){if(owner===lord)return true;owner=owner.owner;}
  return false;
}
