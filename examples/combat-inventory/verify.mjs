import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fs.realpathSync(path.dirname(fileURLToPath(import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'sdk-release.json')));
assert.equal(manifest.capability,'combat-inventory-release/v1');
for(const [file,expected] of Object.entries(manifest.files)){
  assert(/^[a-zA-Z0-9_./-]+$/.test(file)&&!file.startsWith('/')&&file.split('/').every(p=>p&&p!=='.'&&p!=='..'));
  const actual=path.join(root,file);assert(!fs.lstatSync(actual).isSymbolicLink());assert.equal(hash(fs.readFileSync(actual)),expected,'Release file changed: '+file);
}
for(const [name,version] of Object.entries(manifest.packages)){
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json')));
  assert.equal(pkg.version,version,'Install all five archives from this release together');
  assert.equal(Object.keys(pkg.dependencies??{}).length,0,'Unexpected runtime dependency');
}
const work=fs.mkdtempSync(path.join(root,'.verification-owned-'));
const run=(file,cwd)=>{const child=spawnSync(process.execPath,[file],{cwd,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:4*1024*1024,
  env:{...process.env,NODE_PATH:'',TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
  assert(!child.error&&child.status===0,(child.stdout??'')+(child.stderr??String(child.error)));return JSON.parse(child.stdout.trim());};
try {
  for(const file of fs.readdirSync(path.join(root,'verification')))fs.copyFileSync(path.join(root,'verification',file),path.join(work,file));
  fs.cpSync(path.join(root,'host'),path.join(work,'host'),{recursive:true});
  const quickstart=run(path.join(root,'quickstart.mjs'),root),combat=run('combat.mjs',work),adapter=run('adapter.mjs',work);
  assert(quickstart.passed&&combat.passed&&adapter.passed);
  console.log(JSON.stringify({passed:true,release:manifest.version,node:process.version,quickstart,combat,adapter,questsRequired:false,persistenceRequired:false}));
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)),root);assert(!fs.existsSync(path.join(work,'.git')));
  fs.rmSync(work,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
