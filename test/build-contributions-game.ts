// Qualification observer: rebuild complete candidate contribution sources from
// copied authored inputs before the live adapter runs. No scalar-sheet snapshot
// supplies the candidate's class, passive, equipment or container calculations.
import assert from 'node:assert/strict';
import type {World} from '../src/engine/world';

export const buildChecks={prepared:0,unchanged:0,matched:0};
export function observeBuildContributions(world:World){
 const runtime=(world as any).sdkBuildContributions;assert(runtime);
 const rebuild=runtime.rebuild.bind(runtime);
 runtime.rebuild=(input:any,sink:any)=>{
  const raw=()=>JSON.stringify({base:input.baseAttrs,allocated:[...input.allocated],choices:input.choices,classDef:input.classDef,
   equipped:input.equipped,containers:input.containers,relicEnabled:input.relicEnabled,relicEmpowerment:input.relicEmpowerment});
  const before=raw(),cast=world.player.casting,clock=world.time;
  const copied=structuredClone({baseAttrs:input.baseAttrs,allocated:input.allocated,choices:input.choices,
   equipped:input.equipped,containers:input.containers,relicEnabled:input.relicEnabled,relicEmpowerment:input.relicEmpowerment});
  const sources=new Map<string,unknown>(sink.sheet.sourceNames().map((id:string)=>[id,structuredClone(sink.sheet.getSourceMods(id))]));
  const savedSources=JSON.stringify([...sources]);
  let attributes:unknown,conduits:unknown;
  const candidate=rebuild({...copied,classDef:input.classDef},{relicEffectsSuppressed:sink.relicEffectsSuppressed,
   conduits:(value:unknown)=>{conduits=value;},attributes:(value:unknown,mods:unknown)=>{attributes=value;sources.set('attributes',mods);},
   sheet:{setSource:(id:string,mods:unknown)=>sources.set(id,mods),removeSource:(id:string)=>sources.delete(id)},
  });
  buildChecks.prepared++;
  assert.equal(raw(),before);assert.equal(world.player.casting,cast);assert.equal(world.time,clock);
  assert.equal(JSON.stringify(sink.sheet.sourceNames().map((id:string)=>[id,sink.sheet.getSourceMods(id)])),savedSources);
  buildChecks.unchanged++;
  const actual=rebuild(input,sink);
  assert.deepEqual(attributes,input.attrs);assert.deepEqual(conduits,world.player.wornConduits);
  assert.deepEqual([...sources],sink.sheet.sourceNames().map((id:string)=>[id,sink.sheet.getSourceMods(id)]));
  const projection=(r:any)=>({passives:r.passiveMods,gear:[...r.gearSheetMods],containers:[...r.containerSheetMods],
   pieces:[...r.containerPieceMods].map(([item,mods]:any)=>[item.uid,mods]),grafts:r.passiveBuild.grafts});
  assert.deepEqual(projection(candidate),projection(actual));
  for(const item of candidate.containerPieceMods.keys())assert(!actual.containerPieceMods.has(item),'candidate retained a live item');
  buildChecks.matched++;
  return actual;
 };
}
