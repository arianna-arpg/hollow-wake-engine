import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';

const [toolsFlag,toolsFile,originalFlag,originalFile,hashFlag,originalHash,libraryFlag,libraryFile,outputFlag,output,...rest]=process.argv.slice(2);
assert.deepEqual([toolsFlag,originalFlag,hashFlag,libraryFlag,outputFlag,rest.length],
  ['--tools','--original','--sha256','--library','--output',0]);
const read=file=>JSON.parse(fs.readFileSync(file)),hash=file=>sha256(fs.readFileSync(file));
const original=path.resolve(originalFile),out=path.resolve(output),proofFile=path.resolve(libraryFile);
assert(!fs.existsSync(out),'Choose a fresh evidence directory');
assert.equal(hash(original),originalHash,'Original addon is not the accepted archive');
const tools=read(toolsFile),proof=read(proofFile);
assert(proof.passed);assert.equal(hash(proof.library),proof.librarySha256);
for(const [name,digest]of Object.entries(proof.sources))assert.equal(hash(path.join(root,name)),digest,name);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const dir=fs.mkdtempSync(path.join(root,'.artifacts/portable-save-godot-check-'));
const run=args=>execFileSync(tools.python,['-I','-B',...args],{
  cwd:root,env:{...process.env,TEMP:dir,TMP:dir,TMPDIR:dir},stdio:'pipe',encoding:'utf8',
  windowsHide:true,timeout:600000,maxBuffer:4*1024*1024});
try {
  const candidate=path.join(dir,'candidate.zip');
  const code=['import pathlib,sys,zipfile',
    'library=pathlib.Path(sys.argv[2])',
    'with zipfile.ZipFile(sys.argv[1]) as old, zipfile.ZipFile(sys.argv[3],"x",compression=zipfile.ZIP_DEFLATED) as new:',
    ' names=[i.filename for i in old.infolist() if i.filename.endswith("/"+library.name)]',
    ' assert len(names)==1, "Original archive must contain exactly one matching library"',
    ' for item in old.infolist():',
    '  data=library.read_bytes() if item.filename==names[0] else old.read(item)',
    '  new.writestr(item,data)'].join('\n');
  run(['-c',code,original,proof.library,candidate]);
  fs.mkdirSync(out,{recursive:true});
  const file=name=>path.join(out,name+'.json');
  for(const [label,addon]of [['original',original],['shared',candidate]]){
    console.log('Checking '+label+' synchronous save course');
    run([path.join(root,'scripts/check-slot-addon.py'),tools.editor,addon,dir,file(label)]);
  }
  console.log('Checking shared background save course');
  run([path.join(root,'scripts/check-background-store.py'),tools.editor,proofFile,original,dir,file('background')]);
  const comparable=report=>{
    const copy=structuredClone(report);
    delete copy.addonSha256;
    for(const record of [copy.steady,copy.heldReader])
      for(const key of ['samplesUs','medianUs','p95Us','maxUs'])delete record[key];
    return copy;
  };
  assert.deepEqual(comparable(read(file('shared'))),comparable(read(file('original'))));
  const sources=['scripts/test-portable-save-godot.mjs','scripts/check-slot-addon.py',
    'scripts/check-background-store.py','test/godot-inventory/wal-storage.gd',
    'test/godot-inventory/background-storage.gd','baseline/portable-save/source.json',
    'baseline/portable-save/source.json.gz'];
  writeJSON(file('verification'),{passed:true,platform:proof.platform,
    originalAddonSha256:hash(original),sharedLibrarySha256:proof.librarySha256,
    nativeBuildReceiptSha256:hash(proofFile),nativeSources:proof.sources,
    exactContractComparison:true,timingExcluded:true,physicalDeviceClaim:false,
    sources:Object.fromEntries(sources.map(name=>[name,hash(path.join(root,name))])),
    receipts:Object.fromEntries(['original','shared','background'].map(name=>[name+'.json',hash(file(name))]))});
  console.log({passed:true,directory:out,exactContractComparison:true,backgroundCourses:true});
} finally {
  assert.equal(path.dirname(dir),path.join(root,'.artifacts'));
  fs.rmSync(dir,{recursive:true,force:true});
}
