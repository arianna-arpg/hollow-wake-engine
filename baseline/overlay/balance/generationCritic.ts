import type { GridWalkField } from '../src/world/gridWalk';
/** Coarse occupancy, not exact pixels: discard tiny jitter and all dressing.
 * Each bin averages the finished grid; water is a separate terrain class. */
export function terrainSilhouette(grid:GridWalkField, w:number, h:number, side=32):number[] {
  const bins=Array.from({length:side*side},()=>[0,0,0]);
  for(let y=grid.cell/2;y<h;y+=grid.cell) for(let x=grid.cell/2;x<w;x+=grid.cell) {
    const i=Math.min(side-1,Math.floor(y/h*side))*side+Math.min(side-1,Math.floor(x/w*side));
    const region=grid.regionAt(x,y),value=region.includes('water')||region==='locale_river'?2:grid.isWalkable(x,y)?1:0;
    bins[i][value]++;
  }
  return bins.map(counts=>counts.indexOf(Math.max(...counts)));
}
export function orientations(mask:number[],side=32):number[][] {
  const all:number[][]=[];
  for(const mirror of [false,true]) {
    let a=mask.map((_,i)=>mask[Math.floor(i/side)*side+(mirror?side-1-i%side:i%side)]);
    for(let turn=0;turn<4;turn++) {all.push(a);a=a.map((_,i)=>a[(side-1-i%side)*side+Math.floor(i/side)]);}
  }
  return all;
}
export function silhouetteDifference(a:number[],b:number[],side=32):number {
  return Math.min(...orientations(b,side).map(c=>{
    let union=0,difference=0;
    for(let i=0;i<a.length;i++) {if(a[i]||c[i])union++;if(a[i]!==c[i])difference++;}
    return difference/Math.max(1,union);
  }));
}
