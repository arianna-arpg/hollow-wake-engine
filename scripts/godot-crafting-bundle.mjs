import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';

// Private to this closed embedded VM. These typed method and callback names
// never cross the host wire, appear as data keys, or use computed lookup.
const internalMethods=/^(?:skillOfGemItem|supportOfGemItem|skillGemPayloadOf|supportGemPayloadOf|makeSkillGemItem|makeSupportGemItem|hasOwnSupport|validTreeNodes|itemGridSize|bagWidth|bagHeight|craftableAffixesFor|salvageItem|salvageBulk|salvageLockSet|craftSocket|craftAffix|rerollAffix|craftSlots|bagSkillSupport|restoreGrantState|packSkillGemPayload|packSupportGemPayload|writeBackSupportGem|rebuildAnyItem|footprintOpen|canPlace|autoPlace|inspectLoadout|craftedCount|baseBonusFor|eachItemLine|tieredBaseName|compileItemMods|epitaphFor|foldOwnStats|resolveUniqueChoices|firstFit|swapBlocker|supportState|retainedSkillPayload|retainedItem|configureEquipment)$/;

export async function craftingBundle(directory,withRack,plugins=[]){
  const entry=withRack==='vestiges'?'vestige-entry.mjs':withRack==='supports'?'support-entry.mjs':withRack?'rack-entry.mjs':'entry.mjs';
  const result=await build({absWorkingDir:directory,entryPoints:[entry],
    bundle:true,platform:'neutral',format:'iife',globalName:'HollowWakeSession',target:'es2022',
    charset:'utf8',minify:true,mangleProps:internalMethods,tsconfigRaw:{},metafile:true,write:false,plugins});
  const bytes=result.outputFiles[0].contents,inputs=Object.keys(result.metafile.inputs);
  assert(Object.values(result.metafile.outputs).every(o=>o.imports.length===0));
  assert.equal(inputs.some(f=>f.endsWith('/workshop-rack.js')),Boolean(withRack));
  assert.equal(inputs.some(f=>f.endsWith('/workshop-supports.js')),withRack==='supports'||withRack==='vestiges');
  assert(!inputs.some(f=>f.includes('content-table-compiler')));
  // A quoted port name survives ordinary minification and may be read using
  // ports[name]. Mangle only names confined to static property access.
  for(const match of result.outputFiles[0].text.matchAll(/["'](\w+)["']/g)){
    assert(!internalMethods.test(match[1]),'Dynamic method cannot be renamed: '+match[1]);
  }
  return {bytes,inputs};
}

export async function workshopBundles(directory,plugins=[]){
  const base=await craftingBundle(directory,false,plugins),rack=await craftingBundle(directory,true,plugins);
  // Versioned reads and bounded station quotes stay within the measured 102 KiB
  // base ceiling; optional gameplay families keep their independent deltas.
  assert(base.bytes.length<=102*1024,'Base workshop exceeds 102 KiB: '+base.bytes.length);
  assert(rack.bytes.length-base.bytes.length<=5*1024,'Optional learned rack exceeds 5 KiB');
  const support=await craftingBundle(directory,'supports',plugins);
  assert(support.bytes.length-rack.bytes.length<=5*1024,'Optional socket custody exceeds 5 KiB');
  const vestiges=await craftingBundle(directory,'vestiges',plugins);
  assert(vestiges.bytes.length-support.bytes.length<=6*1024,'Optional vestige transactions exceed 6 KiB');
  return {base,rack,support,vestiges};
}

// Workspace consumption uses the same public package exports as an installed
// consumer. Only the two host-side composition files occupy different paths.
export function workspaceBridges(root){
  return [{name:'workshop-bridges',setup(builder){
    builder.onResolve({filter:/^\.\/pouch-session\.mjs$/},()=>({path:path.join(root,'adapters/embedded/pouch-session.mjs')}));
    builder.onResolve({filter:/^\.\/(?:session|number-wire)\.mjs$/},args=>({
      path:path.join(root,'adapters',args.path==='./session.mjs'?'embedded/crafting-session.mjs':'godot/shared/number-wire.mjs')}));
  }}];
}
