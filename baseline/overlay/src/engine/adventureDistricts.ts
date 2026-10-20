import { registerDistrictBuilder } from './localeGen';

const count=(value:number|undefined,fallback:number,min:number,max:number)=>Math.round(Math.max(min,Math.min(max,value??fallback)));

// New IDs preserve already-saved builders. Every motif connects its center and
// stays inside its footprint; shared locale links provide actual approaches.
registerDistrictBuilder('arcade_rows', ({ grid, center: c, w, h, params }) => {
  grid.fillRect(c.x-w*.47,c.y-h*.47,c.x+w*.47,c.y+h*.47);
  const rows = count(params.rows,3,2,5);
  for(let i=0;i<rows;i++) {
    const y=c.y-h*.32+i*h*.64/Math.max(1,rows-1);
    for(const s of [-1,1]) {
      const x=c.x+s*w*.27;
      grid.fillRect(x-w*.13,y-h*.065,x+w*.13,y+h*.065,false);
    }
  }
});
registerDistrictBuilder('terraced_homes', ({ grid, center:c,w,h,params }) => {
  const rows=count(params.rows,3,2,5), half=55;
  grid.carveCorridor(c.x,c.y-h*.44,c.x,c.y+h*.44,half);
  for(let i=0;i<rows;i++) {
    const y=c.y-h*.34+i*h*.68/Math.max(1,rows-1), shift=(i%2?1:-1)*w*.06;
    grid.carveCorridor(c.x-w*.43,y,c.x+w*.43,y,half);
    for(const s of [-1,1]) grid.fillRect(c.x+s*w*.24+shift-w*.10,y-h*.09,c.x+s*w*.24+shift+w*.10,y+h*.09);
  }
});
registerDistrictBuilder('ossuary_spokes', ({ grid,center:c,w,h,params }) => {
  const spokes=count(params.spokes,5,3,7), r=Math.min(w,h), angle=params.angle??0;
  grid.fillDisc(c.x,c.y,r*.19,'ground');
  for(let i=0;i<spokes;i++) {
    const a=angle+i*Math.PI*2/spokes, x=c.x+Math.cos(a)*w*.32,y=c.y+Math.sin(a)*h*.32;
    grid.carveCorridor(c.x,c.y,x,y,50);
    grid.fillDisc(x,y,r*.13,'ground');
  }
});
registerDistrictBuilder('cloister_walk', ({ grid,center:c,w,h,params }) => {
  grid.fillRect(c.x-w*.47,c.y-h*.47,c.x+w*.47,c.y+h*.47);
  grid.fillRect(c.x-w*.28,c.y-h*.28,c.x+w*.28,c.y+h*.28,false);
  const cuts=count(params.cuts,2,2,4);
  grid.fillDisc(c.x,c.y,Math.min(w,h)*.13,'ground');
  for(let i=0;i<cuts;i++) {
    const a=i*Math.PI*2/cuts;
    grid.carveCorridor(c.x,c.y,c.x+Math.cos(a)*w*.40,c.y+Math.sin(a)*h*.40,50);
  }
});
registerDistrictBuilder('braided_thickets', ({ grid,center:c,w,h,params }) => {
  const lobes=count(params.lobes,3,2,4), half=50;
  grid.carveCorridor(c.x-w*.42,c.y,c.x+w*.42,c.y,half);
  for(const sign of [-1,1]) {
    let px=c.x-w*.42,py=c.y;
    for(let i=1;i<=lobes*2;i++) {
      const x=c.x-w*.42+i*w*.84/(lobes*2),y=c.y+(i%2?sign*h*.32:0);
      grid.carveCorridor(px,py,x,y,half); px=x;py=y;
    }
  }
});
registerDistrictBuilder('stepping_pools', ({ grid,center:c,w,h,params }) => {
  grid.fillRect(c.x-w*.47,c.y-h*.47,c.x+w*.47,c.y+h*.47);
  const pools=count(params.pools,3,2,5),r=Math.min(w,h)*(pools>3?.12:.16);
  for(let i=0;i<pools;i++) {
    const a=i*Math.PI*2/pools+.35;
    grid.fillDisc(c.x+Math.cos(a)*w*.28,c.y+Math.sin(a)*h*.28,r,'water');
  }
  grid.carveCorridor(c.x-w*.44,c.y,c.x+w*.44,c.y,55);
});
registerDistrictBuilder('ridge_spurs', ({ grid,center:c,w,h,params }) => {
  const branches=count(params.branches,3,2,4);
  grid.carveCorridor(c.x,c.y-h*.44,c.x,c.y+h*.44,60);
  for(let i=0;i<branches;i++) {
    const y=c.y-h*.30+i*h*.60/Math.max(1,branches-1),sign=i%2?1:-1;
    grid.carveCorridor(c.x,y,c.x+sign*w*.40,y+h*.12,55);
    grid.fillDisc(c.x+sign*w*.36,y+h*.12,Math.min(w,h)*.11,'ground');
  }
});
registerDistrictBuilder('sunken_channels', ({ grid,center:c,w,h,params }) => {
  grid.fillRect(c.x-w*.47,c.y-h*.47,c.x+w*.47,c.y+h*.47);
  for(const s of [-1,1]) grid.fillRegion(c.x+s*w*.24-w*.07,c.y-h*.43,c.x+s*w*.24+w*.07,c.y+h*.43,'water');
  const bridges=count(params.bridges,2,1,3);
  for(let i=0;i<bridges;i++) {
    const y=c.y+(i-(bridges-1)/2)*h*.24;
    grid.fillRegion(c.x-w*.43,y-55,c.x+w*.43,y+55,'locale_bridge');
  }
});
