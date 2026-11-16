export interface MinionPourEffect {
  readonly monsterId:string;readonly count:readonly [number,number];readonly owned?:boolean;readonly scatter?:number;
}
export interface MinionPocket {readonly anchorId:number;readonly kindIdx:number;readonly extinct:boolean;poured:boolean;live:number}
export interface MinionPourPorts {
  kind(id:string):number;
  definition(kind:number):{readonly plies0:number};
  random():number;
  open(x:number,y:number):boolean;
  spawn(kind:number,x:number,y:number,team:0|1,owner:number,plies:number,pocket:number):number;
}
/** Skill-driven population allocation into a host-owned dense pool. Capacity,
 * body storage and world membership remain with that pool; selection, random
 * continuation and pocket accounting remain the original combat rule. */
export class MinionPour {
  constructor(readonly pockets:MinionPocket[],readonly scatter:number,readonly ports:MinionPourPorts){}
  pour(caster:{readonly id:number;readonly team:string},effect:MinionPourEffect,at:{readonly x:number;readonly y:number}):number{
    const kind=this.ports.kind(effect.monsterId);if(kind<0)return 0;
    const definition=this.ports.definition(kind),count=Math.floor(effect.count[0]+this.ports.random()*(effect.count[1]+1-effect.count[0]));
    const team=caster.team==='player'?1:0,owner=effect.owned?caster.id:0;
    let pocket=-1;
    if(!effect.owned)for(let i=0;i<this.pockets.length;i++){
      const p=this.pockets[i];if(p.anchorId===caster.id&&p.kindIdx===kind&&!p.extinct){pocket=i;break;}
    }
    const scatter=effect.scatter??this.scatter;let made=0;
    for(let i=0;i<count;i++){
      const angle=this.ports.random()*(Math.PI*2),distance=4+this.ports.random()*(scatter-4);
      const x=at.x+Math.cos(angle)*distance,y=at.y+Math.sin(angle)*distance,open=this.ports.open(x,y);
      if(this.ports.spawn(kind,open?x:at.x,open?y:at.y,team,owner,definition.plies0,pocket)>=0){
        made++;if(pocket>=0){const p=this.pockets[pocket];p.poured=true;p.live++;}
      }
    }
    return made;
  }
}
