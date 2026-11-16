import {createCombatGeometry} from '@hollow-wake/combat';

// Reference facts only: a bounded floor, optional rectangular wall and one
// raised platform. Replace this provider with the game's existing Ground seam.
// No terrain generation, actor writes, damage rules or global caches live here.
export function createReferenceSpace(content,{width=1600,height=1200,wall=false,platform=false}={}) {
  if (![width,height].every(n=>Number.isFinite(n)&&n>=120)) throw Error('Invalid reference floor');
  const geometry=createCombatGeometry(content),box={x:720,y:300,w:60,h:300};
  const blocked=(p,r=0)=>wall&&p.x+r>box.x&&p.x-r<box.x+box.w&&p.y+r>box.y&&p.y-r<box.y+box.h;
  const clamp=(at,r,from,options)=>{
    const p={x:Math.max(r,Math.min(width-r,at.x)),y:Math.max(r,Math.min(height-r,at.y))};
    if(options?.disp?.ignoreConfine)return p;
    if(from&&wall){const travel=Math.hypot(p.x-from.x,p.y-from.y),steps=Math.max(1,Math.ceil(travel/Math.max(1,r/2)));
      const dx=(p.x-from.x)/steps,dy=(p.y-from.y)/steps;
      let safe={...from};for(let i=0;i<steps;i++){
        // Advance from the last accepted position. Sampling the original
        // segment after a collision would eventually jump through the wall.
        const next={x:safe.x+dx,y:safe.y+dy};
        if(blocked(next,r)){
          if(options?.out)options.out.hit='wall';
          const slideX={x:next.x,y:safe.y},slideY={x:safe.x,y:next.y};
          if(!blocked(slideX,r))safe=slideX;else if(!blocked(slideY,r))safe=slideY;
        }else safe=next;
      }return safe;
    }
    if(blocked(p,r))return {x:box.x-r,y:p.y};
    return p;
  };
  // Slab intersection reports a swept contact parameter, independent of tick
  // distance. The SDK owns projectile bounce, reflection and hit ordering.
  const ray=(from,to)=>{
    if(!wall)return null;
    let lo=0,hi=1;
    for(const[k,min,max]of [['x',box.x,box.x+box.w],['y',box.y,box.y+box.h]]){
      const d=to[k]-from[k];if(d===0){if(from[k]<min||from[k]>max)return null;continue;}
      const a=(min-from[k])/d,b=(max-from[k])/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return null;
    }
    return lo;
  };
  const layerAt=at=>platform&&at.x>=1100?1:0;
  return {
    ...geometry,arena:()=>({w:width,h:height}),clamp,layerAt,
    stepPhysical:(actor,to,from,disp)=>{const collision={hit:'none'},pos=clamp(to,actor.radius,from,{out:collision,disp});
      // The small reference platform is reached through its marked ramp.
      if(platform&&!disp?.ignoreConfine&&layerAt(pos)!==actor.tier&&(pos.y<650||pos.y>850))return {pos:{...from},tier:actor.tier,collision:{hit:'wall'}};
      return {pos,tier:platform?layerAt(pos):actor.tier,collision};},
    heightAt:(pos,tier)=>tier===1?200:platform&&pos.x>=1000&&pos.y>=650&&pos.y<=850?Math.max(0,(pos.x-1000)*2):0,
    lineOfFire:(a,b)=>ray(a,b)===null,lineOfSight:(a,b)=>ray(a,b)===null,
    clipShot:(a,b)=>{const t=ray(a,b);return t===null?{...b}:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};},
    noteBodyHit(){},strikeSurfaces(){},frontSplash(){},freeSpot:at=>clamp(at,12),emergenceGround:()=>undefined,
    viewRectFor:actor=>actor.frameLockRect??{x:0,y:0,w:width,h:height},
    doodadsAt:()=>[],doodadRuleOf:()=>undefined,popBrittle(){},blocksProjectiles:()=>false,
    hitSurfaceOf:()=>undefined,shapeContains:()=>false,pushOutOfShape:at=>({...at}),
    shotGrid:()=>wall?{cellSize:30}:undefined,shotElev:()=>undefined,castGridRay:ray,groundAt:()=>undefined,
    isWalkable:(x,y)=>x>=0&&y>=0&&x<=width&&y<=height&&!blocked({x,y}),
    pointInSolid:(x,y,r)=>blocked({x,y},r),travelHit:()=>null,
    dwellReachable:(a,b,_mode,story)=>story.from===story.to&&ray(a,b)===null,
    description:()=>({width,height,wall:wall?{...box}:null,platform,unitsPerMetre:30,heightUnit:'cm'}),
  };
}
