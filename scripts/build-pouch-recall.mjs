import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';
import {itemPack} from './compile-item-content.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';
import {memoryRewardPack} from './compile-memory-rewards.mjs';

export async function writePouchRecall(dir,entry,plugins=[]){
  const pack=JSON.parse(fs.readFileSync(path.join(root,'content/pouch-recall.json')));
  const baseline=path.join(root,'baseline/pouch-recall'),receipt=JSON.parse(fs.readFileSync(path.join(baseline,'acceptance.json')));
  const raw=gunzipSync(fs.readFileSync(path.join(baseline,'observations.json.gz')));
  assert.equal(sha256(raw),receipt.sha256);
  assert.equal(sha256(JSON.stringify(pack)),receipt.contentSha256);
  const start=JSON.parse(raw).profiles[0],items=itemPack(),skills=skillProgressionPack();
  const sizes=Object.fromEntries(Object.entries(items.bases).map(([id,b])=>[id,[b.w,b.h]]));
  for(const id of ['skill_gem','support_gem',...Object.values(pack.kinds).map(k=>k.base)])assert.deepEqual(sizes[id],[1,1]);
  const data={content:pack,start:{skills:start.skills,supports:start.supports},unlockAll:memoryRewardPack().keys.unlockAllFeature,sizes,
    itemId:items.id,skillId:skills.contentId};
  const id='pouch-recall:sha256:'+sha256(JSON.stringify(data));
  const compiled=await build({absWorkingDir:root,entryPoints:[entry],bundle:true,platform:'neutral',format:'iife',globalName:'HollowWakeSession',
    target:'es2022',charset:'utf8',minify:true,tsconfigRaw:{},metafile:true,write:false,plugins});
  assert(Object.values(compiled.metafile.outputs).every(out=>!out.imports.length));
  const code=compiled.outputFiles[0].contents,content=Buffer.from(JSON.stringify({...data,content:JSON.stringify(pack),id}));
  assert(code.length<=28*1024&&content.length<=384*1024);
  fs.writeFileSync(path.join(dir,'pouch-rules.txt'),code);
  fs.writeFileSync(path.join(dir,'pouch-data.json'),content);
  return {codeBytes:code.length,contentBytes:content.length,id};
}
