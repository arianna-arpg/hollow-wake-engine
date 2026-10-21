import {integer} from './validation.js';

export interface ContainerRungShape { feature: string; cells: readonly string[] }
export interface ContainerBoard { w: number; h: number; open: readonly boolean[]; cells: number }
export interface ContainerBoardWire { w: number; h: number; mask: string }
function dimensions(w: number, h: number): void {
  integer(w,1,'Container width'); integer(h,1,'Container height');
  if(w>256||h>256||w*h>4096)throw new Error('Container exceeds 4096 cells or 256 cells per axis');
}
export function containerBoardOpen(board: ContainerBoard, x: number, y: number): boolean {
  return Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x>=0&&y>=0&&x<board.w&&y<board.h&&board.open[y*board.w+x]===true;
}
export function containerBoardDimensions(board: ContainerBoard) {
  dimensions(board.w,board.h);
  return {w:board.w,h:board.h,open:(x:number,y:number)=>containerBoardOpen(board,x,y)};
}
export function packContainerBoard(board: ContainerBoard): ContainerBoardWire {
  dimensions(board.w,board.h);
  if(board.open.length!==board.w*board.h)throw new Error('Container mask length differs from canvas');
  return {w:board.w,h:board.h,mask:board.open.map(value=>value?'#':'.').join('')};
}
/** Legacy wire behavior: missing cells are closed, excess characters ignored. */
export function unpackContainerBoard(wire: ContainerBoardWire): ContainerBoard {
  dimensions(wire.w,wire.h);
  if(typeof wire.mask!=='string')throw new Error('Container mask must be a string');
  const open:boolean[]=new Array(wire.w*wire.h);let cells=0;
  for(let i=0;i<open.length;i++){open[i]=wire.mask[i]==='#';if(open[i])cells++;}
  return {w:wire.w,h:wire.h,open,cells};
}

/** Immutable compiled ladder. Authored strings are inspected once; live board
 * folds union precompiled cell indices. No feature-set or board cache grows
 * with account activity. Returned boards own their masks. */
export class ContainerLayout {
  readonly w: number;
  readonly h: number;
  readonly #rungs: {feature:string;rows:readonly string[];indices:Uint16Array}[];
  readonly #first: Int16Array;
  readonly #full: ContainerBoard;
  constructor(ladder: readonly ContainerRungShape[]) {
    if(!Array.isArray(ladder)||!ladder.length||ladder.length>256)throw new Error('Container requires 1–256 rungs');
    let w=0,h=0;const features=new Set<string>();
    for(const rung of ladder){
      if(typeof rung.feature!=='string'||!rung.feature||features.has(rung.feature))throw new Error('Container features must be nonempty and unique');
      features.add(rung.feature);
      if(!Array.isArray(rung.cells))throw new Error('Container frame must contain rows');
      h=Math.max(h,rung.cells.length);
      for(const row of rung.cells){if(typeof row!=='string')throw new Error('Container frame rows must be strings');w=Math.max(w,row.length);}
    }
    dimensions(w,h);this.w=w;this.h=h;this.#first=new Int16Array(w*h).fill(-1);
    this.#rungs=ladder.map((rung,index)=>{
      const indices:number[]=[];
      for(let y=0;y<rung.cells.length;y++)for(let x=0;x<rung.cells[y].length;x++)if(rung.cells[y][x]==='#'){
        const cell=y*w+x;indices.push(cell);if(this.#first[cell]===-1)this.#first[cell]=index;
      }
      return {feature:rung.feature,rows:[...rung.cells],indices:new Uint16Array(indices)};
    });
    if(!this.#rungs[0].indices.length)throw new Error('First container rung must open a cell');
    this.#full=this.#union(()=>true);Object.freeze(this);
  }
  /** Compare only geometry/feature inputs, without stringifying or allocating.
   * A live-content adapter can rebuild after in-place edits or replacements. */
  matches(ladder: readonly ContainerRungShape[]): boolean {
    if(ladder.length!==this.#rungs.length)return false;
    for(let i=0;i<ladder.length;i++){
      const a=ladder[i],b=this.#rungs[i];if(a.feature!==b.feature||a.cells.length!==b.rows.length)return false;
      for(let y=0;y<b.rows.length;y++)if(a.cells[y]!==b.rows[y])return false;
    }
    return true;
  }
  #union(owned: (feature:string)=>boolean): ContainerBoard {
    const open:boolean[]=new Array(this.w*this.h).fill(false);let cells=0;
    for(const rung of this.#rungs)if(owned(rung.feature))for(const i of rung.indices)if(!open[i]){open[i]=true;cells++;}
    return {w:this.w,h:this.h,open,cells};
  }
  board(features: ReadonlySet<string>|undefined): ContainerBoard|null {
    if(!features?.has(this.#rungs[0].feature))return null;
    return this.#union(feature=>features.has(feature));
  }
  fullBoard(): ContainerBoard {return {...this.#full,open:[...this.#full.open]};}
  rungIndexAt(x:number,y:number): number|null {
    if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>=this.w||y>=this.h)return null;
    const index=this.#first[y*this.w+x];return index<0?null:index;
  }
  /** Retained typed cells only; excludes object/array/string heap overhead. */
  get indexedBytes(): number {return this.#first.byteLength+this.#rungs.reduce((sum,rung)=>sum+rung.indices.byteLength,0);}
}
