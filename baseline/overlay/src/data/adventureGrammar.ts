import type { LocaleVariant, LocaleDistrict, DistrictChoice } from '../world/locales';
type Point = [number, number];
interface Grammar { id: string; points: Point[]; edges: [number, number][]; goal: number; }
/** Different branch counts, cycle counts, route depths and district counts.
 * A rotation is never registered as a second grammar. */
const GRAMMARS: Grammar[] = [
  { id:'procession', points:[[.2,.2],[.5,.2],[.8,.2],[.8,.72],[.35,.72]], edges:[[0,1],[1,2],[2,3],[3,4]], goal:4 },
  { id:'branching_lanes', points:[[.2,.5],[.5,.5],[.8,.5],[.5,.2],[.5,.8],[.8,.8]], edges:[[0,1],[1,2],[1,3],[1,4],[4,5]], goal:2 },
  { id:'perimeter', points:[[.2,.5],[.2,.2],[.5,.2],[.8,.5],[.8,.8],[.35,.8]], edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]], goal:3 },
  { id:'linked_courts', points:[[.2,.2],[.5,.2],[.2,.5],[.5,.5],[.8,.5],[.8,.8],[.5,.8]], edges:[[0,1],[1,3],[3,2],[2,0],[3,4],[4,5],[5,6],[6,3]], goal:5 },
  { id:'crossed_ladder', points:[[.22,.2],[.78,.2],[.22,.5],[.78,.5],[.22,.8],[.78,.8]], edges:[[0,1],[0,2],[1,3],[2,3],[2,4],[3,5],[4,5]], goal:5 },
  { id:'long_spurs', points:[[.2,.2],[.2,.5],[.2,.8],[.5,.8],[.8,.8],[.5,.5],[.5,.2]], edges:[[0,1],[1,2],[2,3],[3,4],[1,5],[0,6]], goal:4 },
  { id:'court_and_tail', points:[[.2,.2],[.5,.2],[.35,.5],[.7,.5],[.8,.8],[.8,.2]], edges:[[0,1],[1,2],[2,0],[2,3],[3,4],[3,5]], goal:4 },
  { id:'three_approaches', points:[[.2,.5],[.5,.2],[.5,.5],[.5,.8],[.8,.5]], edges:[[0,1],[1,4],[0,2],[2,4],[0,3],[3,4]], goal:4 },
];
export const ADVENTURE_GRAMMARS = GRAMMARS.map(g => g.id);
export interface AdventurePalette {
  id: string; label: string; core: DistrictChoice[]; side: DistrictChoice[];
  coreSize?: Point; sideSize?: Point;
  grammars: number[]; scenery: 'rubble' | 'burial_urn' | 'flowers' | 'rock'; river?: boolean;
}
export function adventureVariants(p: AdventurePalette): LocaleVariant[] {
  return p.grammars.map(index => {
    const g=GRAMMARS[index], ids=g.points.map((_,i)=>i===0?'entry':i===g.goal?'heart':'district_'+i);
    const districts: LocaleDistrict[]=g.points.map((at,i)=>({
      id:ids[i],at,size:(i?(i%3===0?p.sideSize:p.coreSize):undefined)??(i===g.goal?[.30,.28]:i%2?[.24,.28]:[.28,.24]),jitter:.006,
      builder:i===0?'open':p.core[0].builder,
      ...(i ? { choices:structuredClone(i%3===0?p.side:p.core) } : {}),
      ...(i===g.points.length-1 && i!==g.goal && !p.river ? {cave:true} : {}),
      dress:[{kind:p.scenery,count:[5,10],radius:[12,20]}],
    }));
    return { id:g.id,weight:1,entrance:ids[0],goal:ids[g.goal],portalMode:'nearest',districts,
      links:g.edges.map(([a,b],i)=>({from:ids[a],to:ids[b],role:i<g.points.length-1?'main':'flank',width:120})),
      ...(p.river?{river:{width:[170,220] as [number,number],bend:[-.08,.08] as [number,number],region:'locale_river',crossing:'locale_bridge'}}:{}),
    };
  });
}
