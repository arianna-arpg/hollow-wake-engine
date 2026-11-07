import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';

const capture=process.argv[2]==='--capture';
assert(process.argv.length===(capture?3:2));
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const baseline=path.join(root,'baseline/vestiges'),content=path.join(root,'content/vestiges.json');
if(capture)assert(!fs.existsSync(baseline)&&!fs.existsSync(content),'Capture requires a new baseline');
verifyReference(game,lock);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const parent=fs.realpathSync(path.join(root,'.artifacts')),scratch=fs.mkdtempSync(path.join(parent,'vestige-reference-'));
try{
  const src=fs.readFileSync(path.join(root,'reference/export-vestiges.ts'),'utf8'),entry=path.join(scratch,'source.cjs');
  await build({stdin:{contents:src,loader:'ts',resolveDir:path.join(game,'balance')},bundle:true,platform:'node',format:'cjs',outfile:entry,logLevel:'silent'});
  const collect=name=>{
    const files=['-course','-pack'].map(s=>path.join(scratch,name+s+'.json'));
    execFileSync(process.execPath,[entry,...files],{cwd:game,windowsHide:true,stdio:['ignore','ignore','inherit']});
    return files.map(f=>fs.readFileSync(f));
  };
  const [raw,pack]=collect('original'),{effects,words,steps}=JSON.parse(raw),defs=JSON.parse(pack);
  const proof={sourceCommit:lock.commit,observerSha256:sha256(src),worldSha256:lock.files['src/engine/world.ts'],
    sha256:sha256(raw),contentSha256:sha256(pack),vestiges:defs.vestiges.length,epitaphs:defs.epitaphs.length,
    categoryEffects:effects.length,wordChecks:words.length,actionCourses:steps.length};
  if(capture){
    const repeat=collect('repeat');assert(raw.equals(repeat[0])&&pack.equals(repeat[1]));
    const stage=path.join(scratch,'baseline');fs.mkdirSync(stage);
    fs.writeFileSync(path.join(stage,'original.json.gz'),gzipSync(raw));writeJSON(path.join(stage,'acceptance.json'),proof);
    fs.writeFileSync(content,pack,{flag:'wx'});
    try{fs.renameSync(stage,baseline);}
    catch(error){
      // This capture created the content with exclusive ownership. Preserve any subsequent edit.
      if(fs.existsSync(content)&&fs.readFileSync(content).equals(pack))fs.unlinkSync(content);
      throw error;
    }
  }else{
    assert.deepEqual(proof,JSON.parse(fs.readFileSync(path.join(baseline,'acceptance.json'))));
    assert(raw.equals(gunzipSync(fs.readFileSync(path.join(baseline,'original.json.gz'))))&&pack.equals(fs.readFileSync(content)));
  }
  console.log(proof);
}finally{assert.equal(path.dirname(fs.realpathSync(scratch)),parent);fs.rmSync(scratch,{recursive:true});}
