import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {root,sha256} from './reference-utils.mjs';import {captureCraftingFormats} from './crafting-format-reference.mjs';
const baseline=path.join(root,'baseline/crafting-session-formats'),accepted=JSON.parse(fs.readFileSync(path.join(baseline,'acceptance.json')));
const expected=fs.readFileSync(path.join(baseline,'saves.json'));assert.equal(sha256(expected),accepted.sha256);
const result=await captureCraftingFormats();assert(result.bytes.equals(expected));
const report={passed:true,contracts:4,runs:result.runs,publishedCommit:accepted.publishedCommit,capsuleSha256:accepted.capsuleSha256,sources:result.sources,cleaned:true};
fs.writeFileSync(path.join(root,'.artifacts/crafting-formats-reference.json'),JSON.stringify(report,null,2)+'\n');console.log({passed:true,contracts:4,sha256:accepted.sha256,cleaned:true});
