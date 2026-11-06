/** Synchronous moves between a bag, the learned book and the skill bar.
 * Views are live. Hosts own costs, space, identity allocation and the world
 * effects of learning or leaving. Call on validated, single-writer state. */
export interface RackSkill {def:{id:string};grafts?:unknown}
export interface RackItem {
  uid:number;x?:number;y?:number;
  gem?:{kind:'skill';skillId:string}|{kind:'support'};
}
export interface RackBody<S> {skills:(S|null)[]}

/** Real character resume fills vacant bindings in learned-book insertion
 * order. Existing IDs, including retired and duplicate ones, occupy their
 * positions until the host resolves them to learned or equipment skills. */
export function restoreLearnedSeatIds(saved:readonly (string|null)[],known:Iterable<string>,capacity:number):(string|null)[]{
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>4096)throw new Error('Invalid learned skill capacity');
  const bar=[...saved];
  while(bar.length<capacity)bar.push(null);
  for(const id of known){
    if(bar.includes(id))continue;
    const open=bar.indexOf(null);
    if(open>=0)bar[open]=id;
  }
  return bar;
}
export interface SkillRackPorts<Seat,Body,Skill,Item> {
  maxLearned:number;
  hero(seat:Seat):Body;
  actor(seat:Seat):Body;
  known(seat:Seat):Map<string,Skill>;
  granted(seat:Seat,id:string):boolean;
  bagItem(seat:Seat,uid:number):Item|undefined;
  unpack(item:Item):Skill|null;
  pack(skill:Skill):Item;
  meets(seat:Seat,id:string):boolean;
  refusal(seat:Seat,skill:Skill):{key:string;why:string}|null;
  fail(body:Body,key:string,reason:string):void;
  remove(seat:Seat,uid:number):void;
  freeCells(seat:Seat):number;
  place(seat:Seat,item:Item,x?:number,y?:number):boolean;
  /** Called after the returned wrapper lands and before removing the skill. */
  beforeForget(seat:Seat,body:Body,skill:Skill):void;
  /** Called after book and actor bar removal, before the dirty notification. */
  afterForget(seat:Seat,body:Body,id:string):void;
  afterLearn(seat:Seat,skill:Skill):void;
  dirty(seat:Seat):void;
  afterUnlearn(seat:Seat,id:string):void;
  /** Optional for hosts whose existing unlearn entry point has observers. */
  unlearn?(seat:Seat,id:string):boolean;
}

export class SkillRackActions<Seat,Body extends RackBody<Skill>,Skill extends RackSkill,Item extends RackItem> {
  readonly #p:SkillRackPorts<Seat,Body,Skill,Item>;
  constructor(ports:SkillRackPorts<Seat,Body,Skill,Item>){
    if(!Number.isSafeInteger(ports.maxLearned)||ports.maxLearned<1)throw new Error('Invalid learned skill capacity');
    this.#p=ports;
  }
  learn(seat:Seat,uid:number,slot?:number):boolean{
    const p=this.#p,hero=p.hero(seat),item=p.bagItem(seat,uid);
    if(!item||item.gem?.kind!=='skill')return false;
    const id=item.gem.skillId,copy=p.known(seat).get(id),skill=p.unpack(item);
    if(!skill)return false;
    if(!p.meets(seat,skill.def.id)){p.fail(hero,'learn:'+uid,'requirements unmet');return false;}
    const previous=copy?hero.skills.findIndex(s=>s?.def.id===id):-1;
    const at=slot??(previous>=0?previous:hero.skills.indexOf(null));
    if(!Number.isSafeInteger(at)||at<0||at>=hero.skills.length){
      if(slot===undefined)p.fail(hero,'learn:'+uid,'every seat is taken');
      return false;
    }
    const sitter=hero.skills[at];
    if(!sitter&&!copy&&p.known(seat).size>=p.maxLearned){
      p.fail(hero,'learn:'+uid,'every seat is taken');return false;
    }
    const departing:Skill[]=[];
    if(sitter)departing.push(sitter);
    if(copy&&copy.def.id!==sitter?.def.id)departing.push(copy);
    for(const d of departing){
      const stop=p.refusal(seat,d);
      if(stop){p.fail(hero,d.def.id+':'+stop.key,stop.why);return false;}
    }
    const {x,y}=item;p.remove(seat,uid);
    if(p.freeCells(seat)<departing.length){
      p.place(seat,item,x,y);p.fail(hero,'learn:'+uid,'no room in the bag');return false;
    }
    for(const d of departing){
      const removed=p.unlearn?p.unlearn(seat,d.def.id):this.unlearn(seat,d.def.id);
      if(!removed){p.place(seat,item,x,y);return false;}
    }
    p.known(seat).set(skill.def.id,skill);hero.skills[at]=skill;
    p.afterLearn(seat,skill);p.dirty(seat);return true;
  }
  unlearn(seat:Seat,id:string,x?:number,y?:number):boolean{
    const p=this.#p,body=p.actor(seat),skill=p.known(seat).get(id);
    if(!skill){
      if(p.granted(seat,id))p.fail(body,id+':granted','granted by your gear — take the piece off instead');
      return false;
    }
    const stop=p.refusal(seat,skill);
    if(stop){p.fail(body,id+':'+stop.key,stop.why);return false;}
    skill.grafts=undefined;
    const item=p.pack(skill);
    if(!p.place(seat,item,x,y)){
      p.fail(body,id+':bagfull',x!==undefined?'no room there':'no room in the bag');return false;
    }
    p.beforeForget(seat,body,skill);
    p.known(seat).delete(id);
    for(let i=0;i<body.skills.length;i++)if(body.skills[i]?.def.id===id)body.skills[i]=null;
    p.afterForget(seat,body,id);p.dirty(seat);p.afterUnlearn(seat,id);
    return true;
  }
}
