import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {root} from './reference-utils.mjs';
import {readPrototypeContent} from './prototype-content.mjs';
import {buildCharacterBuilds} from './compile-character-builds.mjs';
import {buildCharacterSession} from './compile-character-session.mjs';

const parent=fs.realpathSync(path.join(root,'.artifacts'));
const work=fs.mkdtempSync(path.join(parent,'parity-size-owned-'));
const engineAliases=Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).exports)
  .filter(([,target])=>typeof target==='string'||target.import)
  .map(([key,target])=>['@hollow-wake/engine'+(key==='.'?'':key.slice(1)),path.resolve(root,typeof target==='string'?target:target.import)]));
try {
  for(const [name,profile] of [['october',undefined],['november',readPrototypeContent()]]) {
    const builds=path.join(work,name+'-builds'),characters=path.join(work,name+'-characters');
    const compiled=await buildCharacterBuilds(builds,profile);
    buildCharacterSession(characters,profile);
    const result=await build({stdin:{contents:'import {createCharacterKit} from '+JSON.stringify(path.join(characters,'index.js').replaceAll('\\','/'))+';globalThis.makeCharacterKit=createCharacterKit;',resolveDir:root},
      bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,write:false,metafile:true,
      alias:{...engineAliases,'@hollow-wake/character-builds':path.join(builds,'index.js')}});
    const inputs=Object.values(result.metafile.outputs)[0].inputs;
    console.log(JSON.stringify({profile:name,browserBytes:result.outputFiles[0].contents.length,
      contentBytes:Buffer.byteLength(JSON.stringify(compiled.pack)),
      largestModules:Object.entries(inputs).sort((a,b)=>b[1].bytesInOutput-a[1].bytesInOutput).slice(0,12).map(([file,row])=>({file,bytes:row.bytesInOutput}))},null,2));
  }
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)),parent);
  fs.rmSync(work,{recursive:true,maxRetries:3});
}
