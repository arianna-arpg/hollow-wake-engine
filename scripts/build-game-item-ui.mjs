import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
import {inventoryUiControlMain} from '../adapters/hollow-wake/integrate-inventory-ui.mjs';
const argument=name=>{const i=process.argv.indexOf(name);assert.ok(i>=0&&process.argv[i+1],`${name} required`);return path.resolve(process.argv[i+1]);};
const game=argument('--game'),output=argument('--output'),originalItems=process.argv.includes('--original-items');
const originalEscape=process.argv.includes('--original-escape');
assert.ok(!fs.existsSync(output),'Refusing to replace an existing UI build');
const inputs=()=>Object.fromEntries(listFiles(path.join(game,'src')).map(f=>[f,sha256(fs.readFileSync(path.join(game,'src',f)))]));
const before=inputs();
const runtimeDirectory=path.join(game,'node_modules/@hollow-wake/engine/dist');
const runtimeInputs=()=>fs.existsSync(runtimeDirectory)?Object.fromEntries(listFiles(runtimeDirectory).map(f=>[f,sha256(fs.readFileSync(path.join(runtimeDirectory,f)))])):null;
const runtimeBefore=runtimeInputs();
const reference=path.join(root,'.reference/src/engine/itemgen.ts'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
assert.equal(sha256(fs.readFileSync(reference)),lock.files['src/engine/itemgen.ts']);
const originalMain=originalEscape?inventoryUiControlMain(fs.readFileSync(path.join(game,'src/main.ts'),'utf8')):null;
const config=`import fs from 'node:fs';
import base from ${JSON.stringify(pathToFileURL(path.join(game,'vite.config.ts')).href)};
let replaced=false,escapeReplaced=false;
export default {...base,plugins:[...base.plugins,${originalItems?`{name:'original-item-control',enforce:'pre',transform(code,id){
if(id.replaceAll('\\\\','/').endsWith('/src/engine/itemgen.ts')){replaced=true;return fs.readFileSync(${JSON.stringify(reference)},'utf8');}},buildEnd(){if(!replaced)throw new Error('Original item control was not applied');}}`:'{name:"unchanged-item-control"}'},${originalEscape?`{name:'original-escape-control',enforce:'pre',transform(code,id){
if(id.replaceAll('\\\\','/').endsWith('/src/main.ts')){escapeReplaced=true;return ${JSON.stringify(originalMain)};}},buildEnd(){if(!escapeReplaced)throw new Error('Original Escape control was not applied');}}`:'{name:"unchanged-escape-control"}'}]};\n`;
const file=path.join(game,`vite.sdk-${randomUUID()}.config.mjs`);
fs.writeFileSync(file,config,{flag:'wx'});
try {
  execFileSync(process.execPath,[path.join(game,'node_modules/vite/bin/vite.js'),'build','--config',file,'--outDir',output],{cwd:game,stdio:'inherit'});
  assert.deepEqual(inputs(),before,'Game source changed during the UI build');
  assert.deepEqual(runtimeInputs(),runtimeBefore,'Installed SDK changed during the UI build');
  writeJSON(path.join(output,'sdk-build.json'),{originalItems,originalEscape,sourceSha256:before,runtimeSha256:runtimeBefore,originalItemSha256:lock.files['src/engine/itemgen.ts'],originalMainSha256:originalMain===null?null:sha256(originalMain),
    outputs:Object.fromEntries(listFiles(output).map(f=>[f,sha256(fs.readFileSync(path.join(output,f)))]))});
} finally { if(fs.readFileSync(file,'utf8')===config)fs.unlinkSync(file); }
