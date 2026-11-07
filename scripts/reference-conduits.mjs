import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync, gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {root, verifyReference, sha256, writeJSON} from './reference-utils.mjs';

const game = path.join(root, '.reference');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const baseline = path.join(root, 'baseline/conduits');
const capture = process.argv[2] === '--capture';
const captureContent=process.argv[2]==='--capture-content';
assert(process.argv.length === (capture || captureContent ? 3 : 2));
if (capture) assert(!fs.existsSync(baseline), 'Original observations are already frozen');
const catalogue=path.join(root,'content/conduits.json');
if(captureContent)assert(!fs.existsSync(catalogue),'The authored conduit catalogue is already frozen');
verifyReference(game, lock);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const parent = fs.realpathSync(path.join(root, '.artifacts'));
const scratch = fs.mkdtempSync(path.join(parent, 'conduit-original-'));
try {
  const source = fs.readFileSync(path.join(root, 'reference/export-conduits.ts'), 'utf8');
  const entry = path.join(scratch, 'original.cjs');
  await build({stdin:{contents:source, loader:'ts', resolveDir:path.join(game,'balance')}, bundle:true,
    platform:'node', format:'cjs', outfile:entry, logLevel:'silent'});
  function observe(name) {
    const file = path.join(scratch, name);
    execFileSync(process.execPath, [entry, file], {cwd:game, windowsHide:true, stdio:['ignore','ignore','inherit']});
    return fs.readFileSync(file);
  }
  const bytes = observe('first.json');
  const {hosts, courses} = JSON.parse(bytes);
  const proof = {sourceCommit:lock.commit, sha256:sha256(bytes), observerSha256:sha256(source),
    actorSha256:lock.files['src/engine/actor.ts'], skillsSha256:lock.files['src/engine/skills.ts'],
    courses:courses.length, checkpoints:courses.reduce((count,c) => count+c.frames.length,0),
    poolPairs:49, authoredSkillHosts:hosts.length, authoredCourses:courses.filter(c=>c.id.startsWith('authored/')).length};
  if (capture) {
    assert(bytes.equals(observe('repeat.json')), 'Original actor replay changed between processes');
    const staged = path.join(scratch, 'baseline');
    fs.mkdirSync(staged);
    fs.writeFileSync(path.join(staged, 'original.json.gz'), gzipSync(bytes));
    writeJSON(path.join(staged, 'acceptance.json'), proof);
    fs.renameSync(staged, baseline);
  } else {
    assert.deepEqual(proof, JSON.parse(fs.readFileSync(path.join(baseline,'acceptance.json'))));
    assert(bytes.equals(gunzipSync(fs.readFileSync(path.join(baseline, 'original.json.gz')))));
  }
  if(!capture){
    const compiler=fs.readFileSync(path.join(root,'reference/export-conduit-catalogue.ts'),'utf8');
    await build({stdin:{contents:compiler,loader:'ts',resolveDir:path.join(game,'balance')},bundle:true,
      platform:'node',format:'cjs',outfile:entry,logLevel:'silent'});
    const authored=observe('catalogue.json');
    if(captureContent){
      assert(authored.equals(observe('repeat-catalogue.json')));
      fs.writeFileSync(catalogue,authored,{flag:'wx'});
    }else assert(authored.equals(fs.readFileSync(catalogue)),'Authored conduit catalogue differs');
    console.log({authoredEntries:JSON.parse(authored).entries.length,catalogueSha256:sha256(authored)});
  }
  console.log(proof);
} finally {
  assert.equal(path.dirname(fs.realpathSync(scratch)),parent);
  fs.rmSync(scratch,{recursive:true});
}
