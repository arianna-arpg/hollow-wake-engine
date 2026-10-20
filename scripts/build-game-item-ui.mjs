import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
const argument=name=>{const i=process.argv.indexOf(name);assert.ok(i>=0&&process.argv[i+1],`${name} required`);return path.resolve(process.argv[i+1]);};
const game=argument('--game'),output=argument('--output'),originalItems=process.argv.includes('--original-items');
assert.ok(!fs.existsSync(output),'Refusing to replace an existing UI build');
const inputs=()=>Object.fromEntries(listFiles(path.join(game,'src')).map(f=>[f,sha256(fs.readFileSync(path.join(game,'src',f)))]));
const before=inputs();
const reference=path.join(root,'.reference/src/engine/itemgen.ts'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
assert.equal(sha256(fs.readFileSync(reference)),lock.files['src/engine/itemgen.ts']);
const config=`import fs from 'node:fs';
import base from ${JSON.stringify(pathToFileURL(path.join(game,'vite.config.ts')).href)};
let replaced=false;
export default {...base,plugins:[...base.plugins,${originalItems?`{name:'original-item-control',enforce:'pre',transform(code,id){
if(id.replaceAll('\\\\','/').endsWith('/src/engine/itemgen.ts')){replaced=true;return fs.readFileSync(${JSON.stringify(reference)},'utf8');}},buildEnd(){if(!replaced)throw new Error('Original item control was not applied');}}`:'{name:"unchanged-item-control"}'}]};\n`;
const file=path.join(game,`vite.sdk-${randomUUID()}.config.mjs`);
fs.writeFileSync(file,config,{flag:'wx'});
try {
  execFileSync(process.execPath,[path.join(game,'node_modules/vite/bin/vite.js'),'build','--config',file,'--outDir',output],{cwd:game,stdio:'inherit'});
  assert.deepEqual(inputs(),before,'Game source changed during the UI build');
  writeJSON(path.join(output,'sdk-build.json'),{originalItems,sourceSha256:before,originalItemSha256:lock.files['src/engine/itemgen.ts'],
    outputs:Object.fromEntries(listFiles(output).map(f=>[f,sha256(fs.readFileSync(path.join(output,f)))]))});
} finally { if(fs.readFileSync(file,'utf8')===config)fs.unlinkSync(file); }
