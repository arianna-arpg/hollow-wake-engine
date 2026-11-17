import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root} from './reference-utils.mjs';import {prepareParityReference} from './prototype-parity-tools.mjs';
const {directory,lock}=prepareParityReference(),target=path.join(root,'.reference/node_modules'),link=path.join(directory,'node_modules');
// Reuse the locked original-observer dependencies. Never install another tree.
if(fs.existsSync(target)){
 if(fs.existsSync(link))assert.equal(fs.realpathSync(link),fs.realpathSync(target),'Unexpected parity dependency directory');
 else fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
}
console.log(JSON.stringify({source:lock.commit,files:Object.keys(lock.files).length,directory}));
