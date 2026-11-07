import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';

/** Assemble only the accepted build rows and their original meter observations. */
export async function buildConduitPage(directory,installed,pack,archiveSha256,proof,truth) {
  const tools=path.join(root,'tools/device-conduits');
  const courses=truth.hosts.map(host=>{
    const original=truth.courses.find(c=>c.id==='authored/skill/'+host.id);
    assert(original && original.frames.length===3);
    return {...host,frames:original.frames.map(({mana,poise,shield})=>({mana,poise,shield}))};
  });
  assert.deepEqual(courses.map(c=>c.id).sort(),['ice_shield','stone_communion','wellspring_stance']);
  const options={bundle:true,write:false,target:'es2018',logLevel:'silent',plugins:[{name:'installed-device-sdk',setup(b){
    b.onResolve({filter:/^@hollow-wake\/engine\/resources\/conduits$/},()=>({path:installed}));
  }}]};
  const portable=await build({...options,entryPoints:[path.join(tools,'workload.mjs')],format:'esm'});
  const {createDeviceCourse}=await import('data:text/javascript;base64,'+Buffer.from(portable.outputFiles[0].contents).toString('base64'));
  for(const count of [24,120,480]){
    const test=createDeviceCourse(courses,count);test.block();assert.equal(test.count(),16*count);
  }
  const damaged=structuredClone(courses);damaged[0].frames[1].mana++;
  assert.throws(()=>createDeviceCourse(damaged,3).block(),/Meter mismatch/);
  const data={version:pack.version,archiveSha256,originalSha256:proof.sha256,courses};
  const browser=await build({...options,entryPoints:[path.join(tools,'browser.mjs')],format:'iife',minify:true});
  const html=fs.readFileSync(path.join(tools,'index.html'),'utf8')
    .replace('__COURSE__',()=>JSON.stringify(data).replaceAll('<','\\u003c'))
    .replace('__BUNDLE__',()=>browser.outputFiles[0].text.replaceAll('</script','<\\/script'));
  const name='hollow-wake-conduits-device-'+pack.version+'.html';
  const bytes=Buffer.byteLength(html);
  assert(bytes<24*1024,'Offline conduit course exceeded 24 KiB');
  fs.writeFileSync(path.join(directory,name),html,{flag:'wx'});
  return {file:name,bytes,sha256:sha256(html),originalBuilds:courses.map(c=>c.id)};
}
