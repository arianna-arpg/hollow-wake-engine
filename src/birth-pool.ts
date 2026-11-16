/** Content weighting used by combat births. This does not own world spawning. */
export interface BirthEnvelope {from?:number;to?:number;fadeIn?:number;fadeOut?:number;stops?:readonly (readonly [number,number])[];mul?:number}
export type BirthPresence=string|BirthEnvelope;
export interface BirthPoolEntry {id:string;weight:number;presence?:BirthPresence}
const clamp01=(n:number)=>n<0?0:n>1?1:n;
export class BirthPool {
  constructor(readonly bands:Readonly<Record<string,BirthEnvelope>>,readonly definitionPresence:(id:string)=>BirthPresence|undefined,readonly random:()=>number){}
  multiplier(spec:BirthPresence|undefined,level:number):number{
    if(spec===undefined)return 1;
    // Unknown band names retain the source's always-present fallback. Content
    // admission reports them before a runtime can be constructed.
    const env=typeof spec==='string'?this.bands[spec]??{}:spec;let m=env.mul??1;
    if(env.from!==undefined&&level<env.from){const fade=env.fadeIn??0;m*=fade>0?clamp01((level-(env.from-fade))/fade):0;}
    if(env.to!==undefined&&level>env.to){const fade=env.fadeOut??0;m*=fade>0?clamp01((env.to+fade-level)/fade):0;}
    const stops=env.stops;
    if(stops?.length){
      if(level<=stops[0][0])m*=stops[0][1];
      else if(level>=stops[stops.length-1][0])m*=stops[stops.length-1][1];
      else for(let i=1;i<stops.length;i++)if(level<=stops[i][0]){const[l0,m0]=stops[i-1],[l1,m1]=stops[i];m*=l1===l0?m1:m0+(m1-m0)*((level-l0)/(l1-l0));break;}
    }
    return m<0?0:m;
  }
  shaped<T extends BirthPoolEntry>(table:readonly T[],level:number):readonly T[]{
    let touched=false;for(const e of table)if(e.presence!==undefined||this.definitionPresence(e.id)!==undefined){touched=true;break;}
    if(!touched)return table;
    const out:T[]=[];for(const e of table){const weight=e.weight*this.multiplier(e.presence,level)*this.multiplier(this.definitionPresence(e.id),level);if(weight>0)out.push({...e,weight});}
    return out.length?out:table;
  }
  pick(table:readonly BirthPoolEntry[],level:number):string{
    const picks=this.shaped(table,level);let total=0;for(const e of picks)total+=e.weight;
    let roll=this.random()*total;for(const e of picks){roll-=e.weight;if(roll<=0)return e.id;}
    return picks[picks.length-1].id;
  }
}
