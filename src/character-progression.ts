import {copy,freeze,finite,integer} from './validation.js';

export interface ProgressionTuning {
  startingPassivePoints:number;passivePointsPerLevel:number;
  lifePerLevel:number;manaPerLevel:number;accuracyPerLevel:number;
  experience:{scale:number;exponent:number};
}
export interface ProgressionMilestone {level:number;key:string}
export interface ProgressionPack {
  schemaVersion:1;capability:'character-progression/v1';contentId:string;
  tuning:ProgressionTuning;milestones:readonly ProgressionMilestone[];
  classes:readonly {id:string;milestones:readonly ProgressionMilestone[]}[];
}
export function experienceForLevel(level:number,scale:number,exponent:number):number{
  integer(level,1,'Character level');
  if(finite(scale,'Experience scale')<=0||finite(exponent,'Experience exponent')<0)throw new Error('Invalid experience curve');
  const result=Math.floor(scale*Math.pow(level,exponent));
  if(!Number.isSafeInteger(result)||result<1)throw new Error('Experience threshold exceeds the supported integer range');
  return result;
}
export function passivePointsAtLevel(level:number,starting:number,perLevel:number):number{
  integer(level,1,'Character level');integer(starting,0,'Starting passive points');integer(perLevel,0,'Passive points per level');
  return integer(starting+Math.max(0,level-1)*perLevel,0,'Earned passive points');
}
export interface LevelGrowthModifier {stat:'life'|'mana'|'accuracy';kind:'flat';value:number}
export function levelModifiers(level:number,life:number,mana:number,accuracy:number):LevelGrowthModifier[]{
  integer(level,1,'Character level');const growth=level-1;
  return [{stat:'life',kind:'flat',value:finite(growth*finite(life,'Life growth'),'Level life')},
    {stat:'mana',kind:'flat',value:finite(growth*finite(mana,'Mana growth'),'Level mana')},
    {stat:'accuracy',kind:'flat',value:finite(growth*finite(accuracy,'Accuracy growth'),'Level accuracy')}];
}

/** Immutable executable tuning and ordered milestone keys. Authored account
 * gate compilation happens outside this module; no catalog or SQL is loaded. */
export class CharacterProgression {
  readonly pack:ProgressionPack;
  readonly #classes=new Map<string,readonly ProgressionMilestone[]>();
  constructor(input:ProgressionPack){
    const pack=copy(input);
    if(!pack||pack.schemaVersion!==1||pack.capability!=='character-progression/v1'||typeof pack.contentId!=='string'||!pack.contentId||!pack.tuning||!Array.isArray(pack.milestones)||!Array.isArray(pack.classes))throw new Error('Invalid character progression pack');
    const t=pack.tuning;passivePointsAtLevel(1,t.startingPassivePoints,t.passivePointsPerLevel);experienceForLevel(1,t.experience?.scale,t.experience?.exponent);levelModifiers(2,t.lifePerLevel,t.manaPerLevel,t.accuracyPerLevel);
    const validate=(rows:readonly ProgressionMilestone[])=>{if(!Array.isArray(rows)||rows.length>4096)throw new Error('Invalid milestone list');for(const row of rows){if(!row||typeof row.key!=='string'||!row.key||row.key.length>256)throw new Error('Invalid milestone key');integer(row.level,1,'Milestone level');}};
    validate(pack.milestones);
    if(pack.classes.length>4096)throw new Error('Too many progression classes');
    for(const row of pack.classes){if(!row||typeof row.id!=='string'||!row.id||this.#classes.has(row.id))throw new Error('Invalid or duplicate progression class');validate(row.milestones);this.#classes.set(row.id,row.milestones);}
    this.pack=freeze(pack);Object.freeze(this);
  }
  experienceForLevel(level:number):number{const {scale,exponent}=this.pack.tuning.experience;return experienceForLevel(level,scale,exponent);}
  passivePointsAtLevel(level:number):number{const t=this.pack.tuning;return passivePointsAtLevel(level,t.startingPassivePoints,t.passivePointsPerLevel);}
  levelModifiers(level:number):LevelGrowthModifier[]{const t=this.pack.tuning;return levelModifiers(level,t.lifePerLevel,t.manaPerLevel,t.accuracyPerLevel);}
  classMilestones(id:string):readonly ProgressionMilestone[]{const rows=this.#classes.get(id);if(!rows)throw new Error(`Unknown progression class: ${id}`);return rows;}
  stamp(ledger:Record<string,number>,level:number,classId:string):void{
    integer(level,1,'Character level');const rows=this.classMilestones(classId);
    const visit=(milestones:readonly ProgressionMilestone[])=>{for(const row of milestones)if(level>=row.level){
      const previous=Object.hasOwn(ledger,row.key)?ledger[row.key]:undefined;
      if(previous!==undefined)finite(previous,'Milestone counter');
      if(!previous)Object.defineProperty(ledger,row.key,{value:(previous??0)+1,writable:true,enumerable:true,configurable:true});
    }};
    visit(this.pack.milestones);visit(rows);
  }
}

export interface ProgressionState {xp:number;xpNeeded:number;passivePoints:number}
export interface ProgressionHero {level:number;downed?:boolean}
export interface ProgressionPorts<S,H extends ProgressionHero> {
  state(seat:S):ProgressionState;hero(seat:S):H;classId(seat:S):string;eligible(seat:S):boolean;
  rules(seat:S):CharacterProgression;
  /** Active fractional blessing (zero when inactive), applied before the multiplier. */
  blessing(seat:S):number;experienceMultiplier(seat:S,hero:H):number;
  markDirty(seat:S):void;recalculate(seat:S):void;fillResources(hero:H):void;announce(seat:S):void;
  local(seat:S):boolean;resyncMercenary():void;accountOwned(seat:S):boolean;ledger():Record<string,number>;
}

/** Synchronous host-owned progression. Ports must be pure reads or nonthrowing
 * completion effects; they must not reenter or alter XP/level/point fields or
 * tuning during a grant. Recalculation may change vital pools and downed state.
 * Each seat is an ordered commit, not a durable party-wide transaction. */
export class ProgressionHost<S,H extends ProgressionHero> {
  readonly #ports:ProgressionPorts<S,H>;
  readonly #maxLevels:number;
  #busy=false;
  constructor(ports:ProgressionPorts<S,H>,maxLevelsPerGrant=4096){
    integer(maxLevelsPerGrant,1,'Level-up work limit');if(maxLevelsPerGrant>65536)throw new Error('Level-up work limit exceeds 65536');this.#maxLevels=maxLevelsPerGrant;
    const bound={} as ProgressionPorts<S,H>;
    for(const key of ['state','hero','classId','eligible','rules','blessing','experienceMultiplier','markDirty','recalculate','fillResources','announce','local','resyncMercenary','accountOwned','ledger'] as const){
      const fn=ports[key];if(typeof fn!=='function')throw new Error(`Progression ${key} port is required`);
      Object.defineProperty(bound,key,{value:fn.bind(ports),enumerable:true});
    }
    this.#ports=bound;
  }
  grant(seat:S,amount:number):void{this.#run(()=>this.#grant(seat,amount));}
  grantAll(seats:Iterable<S>,amount:number):void{this.#run(()=>{finite(amount,'Experience award');for(const seat of seats)this.#grant(seat,amount);});}
  #run(work:()=>void):void{if(this.#busy)throw new Error('Reentrant progression grant');this.#busy=true;try{work();}finally{this.#busy=false;}}
  #grant(seat:S,amount:number):void{
    finite(amount,'Experience award');const ports=this.#ports;if(!ports.eligible(seat))return;
    const state=ports.state(seat),hero=ports.hero(seat),rules=ports.rules(seat),classId=ports.classId(seat);
    rules.classMilestones(classId);integer(hero.level,1,'Character level');finite(state.xp,'Banked experience');integer(state.xpNeeded,1,'Current experience threshold');integer(state.passivePoints,0,'Passive points');
    const blessing=finite(ports.blessing(seat),'Experience blessing'),multiplier=finite(ports.experienceMultiplier(seat,hero),'Experience multiplier');
    if(blessing<0||multiplier<0)throw new Error('Experience factors must be nonnegative');
    const award=finite((blessing>0?Math.round(amount*(1+blessing)):amount)*multiplier,'Adjusted experience');
    const banked=finite(state.xp+award,'Banked experience');
    // Bound work and reject invalid arithmetic before this seat's first write.
    // This preserves per-level callbacks without accepting an unbounded loop.
    let remaining=banked,threshold=state.xpNeeded,level=hero.level,count=0;
    while(remaining>=threshold){if(++count>this.#maxLevels)throw new Error('Experience award exceeds level-up work limit');remaining-=threshold;level=integer(level+1,1,'Character level');threshold=rules.experienceForLevel(level);}
    integer(state.passivePoints+count*rules.pack.tuning.passivePointsPerLevel,0,'Passive points');
    state.xp=banked;ports.markDirty(seat);
    for(let i=0;i<count;i++){
      state.xp-=state.xpNeeded;hero.level++;state.xpNeeded=rules.experienceForLevel(hero.level);
      state.passivePoints+=rules.pack.tuning.passivePointsPerLevel;
      ports.recalculate(seat);if(!hero.downed)ports.fillResources(hero);ports.announce(seat);if(ports.local(seat))ports.resyncMercenary();
    }
    if(ports.accountOwned(seat))rules.stamp(ports.ledger(),hero.level,classId);
  }
}
