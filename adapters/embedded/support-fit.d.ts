export interface SocketRow {supportId:string;level:number;rolled?:Record<string,string>;locked?:boolean}
export interface LearnedGem {
  kind:'skill';skillId:string;level:number;rarity:string;sockets:(SocketRow|null)[];
  treeNodes?:string[];attunedForm?:string;empowermentRank?:number;replenishmentPaused?:true;granted?:boolean;
}
export interface LooseSupport extends SocketRow {kind:'support'}
export interface FitRow {slot:number;skillId:string;fits:boolean;sockets:number;occupied:number}
export interface PageRange {offset:number;length:number;sha256:string}
export interface FitIndex {format:'workshop-support-pages/v1';bytes:number;pages:PageRange[]}
export function fitPage(id:string,count:number):number;
export function fitSupport(bar:readonly (LearnedGem|null)[],support:LooseSupport,read:(table:'skills'|'supports'|'monsters',id:string)=>unknown):FitRow[];
export function createSupportReader(index:FitIndex,read:(range:Readonly<PageRange>,page:number)=>{text:string;sha256:string}):
  (bar:readonly (LearnedGem|null)[],support:LooseSupport)=>FitRow[];
