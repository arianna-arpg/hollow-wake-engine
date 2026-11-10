// Host-independent body-level derivation over explicit, trusted host ports.
export interface BodyPlySpec {count:number;perLevel?:number}
export interface BodyLevelSkill {level:number}
export interface BodyLevelActor<S,P extends BodyPlySpec> {
 defId?:string;level:number;life:number;plies:number;pliesMax:number;plySpec?:P;skills:(S|null)[];
}
export interface BodyStatScale {flatPerLevel?:number;incPerLevel?:number;rate?:number;pow?:number}
export interface BodyLevelDefinition<P> {base:{poise?:number};plies?:P;scaling?:Record<string,BodyStatScale>;boss?:boolean}
export interface BodyLevelPorts<A,M,P> {
 definition(id:string):BodyLevelDefinition<P>|undefined;
 growth():Readonly<Record<string,number>>;
 bossPoise():{bossBase:number;bossPerLevel:number};
 modifier(stat:string,kind:'flat'|'increased'|'more',value:number):M;
 setSource(actor:A,id:string,mods:M[]):void;setBase(actor:A,id:string,value:number):void;maxLife(actor:A):number;
}
export function bodySkillLevel(level:number,bodyLevelsPerSkill=4):number{return 1+Math.floor((level-1)/bodyLevelsPerSkill);}
export function bodyPlyCount(spec:BodyPlySpec,level:number):number{return Math.max(0,spec.count+Math.floor((spec.perLevel??0)*Math.max(0,level-1)));}
/** Stateless across actors and worlds. Definitions are borrowed from the host;
 * mutable body ownership and publication remain with that host. */
export class BodyLevels<A extends BodyLevelActor<S,P>,S extends BodyLevelSkill,M,P extends BodyPlySpec> {
 constructor(private readonly p:BodyLevelPorts<A,M,P>,private readonly bodyLevelsPerSkill=4){}
 stamp(a:A,def:BodyLevelDefinition<P>,level:number):void {
  a.level=level;const lv=level-1;
  if(def.plies){a.plySpec=def.plies;a.pliesMax=bodyPlyCount(def.plies,level);}
  this.p.setSource(a,'level',Object.entries(this.p.growth()).map(([stat,c])=>this.p.modifier(stat,'increased',c*lv)));
  if(def.scaling){const mods:M[]=[];
   for(const[stat,s]of Object.entries(def.scaling)){const lvp=Math.pow(lv,s.pow??1);
    if(s.flatPerLevel)mods.push(this.p.modifier(stat,'flat',s.flatPerLevel*lvp));
    if(s.incPerLevel)mods.push(this.p.modifier(stat,'increased',s.incPerLevel*lvp));
    if(s.rate)mods.push(this.p.modifier(stat,'more',Math.pow(1+s.rate,lv)-1));
   }
   if(mods.length)this.p.setSource(a,'scaling',mods);
  }
  if(def.boss&&def.base.poise===undefined){const rules=this.p.bossPoise();this.p.setBase(a,'poise',rules.bossBase+rules.bossPerLevel*lv);}
 }
 relevel(a:A,level:number):void {
  const def=a.defId?this.p.definition(a.defId):undefined;if(!def||a.level===level)return;
  const lifeFrac=a.life/Math.max(1,this.p.maxLife(a)),plyFrac=a.pliesMax>0?a.plies/a.pliesMax:1;
  this.stamp(a,def,level);
  a.life=Math.min(this.p.maxLife(a),Math.max(a.life>0?1:0,this.p.maxLife(a)*lifeFrac));
  a.plies=Math.min(a.pliesMax,Math.round(a.pliesMax*plyFrac));
  const skillLevel=bodySkillLevel(level,this.bodyLevelsPerSkill);for(const s of a.skills)if(s)s.level=skillLevel;
 }
}
