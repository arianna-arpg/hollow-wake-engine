import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {renderStatContext,integrateStatContext} from '../adapters/hollow-wake/integrate-stat-context.mjs';import {statContextObserverFaults,changeStatContextSource} from './stat-context-observer-faults.mjs';
const source=fs.readFileSync(path.join(root,'.reference/src/engine/stats.ts'),'utf8').replaceAll('\r\n','\n'),normal=renderStatContext(source),directory=fs.mkdtempSync(path.join(root,'.artifacts/stat-context-overlay-')),results=[];
assert.equal(renderStatContext(source.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),normal);
assert.throws(()=>renderStatContext(normal),/binding collision/);results.push('repeat-install');
for(const fault of statContextObserverFaults){assert.throws(()=>renderStatContext(changeStatContextSource(source,fault)),/Unreviewed StatSheet boundary/);results.push(fault[0]);}
for(const symbol of ['TagContextCache','engineStatContextKeys']){assert.throws(()=>renderStatContext(source+'\n// '+symbol),/binding collision/);results.push(symbol+'-collision');}
const game=path.join(directory,'game'),file=path.join(game,'src/engine/stats.ts');fs.mkdirSync(path.dirname(file),{recursive:true});
fs.writeFileSync(file,changeStatContextSource(source,statContextObserverFaults[0]));const before=sha256(fs.readFileSync(file));assert.throws(()=>integrateStatContext(game));assert.equal(sha256(fs.readFileSync(file)),before);results.push('atomic-preflight');
fs.writeFileSync(file,source);integrateStatContext(game,false);assert.equal(fs.readFileSync(file,'utf8'),source);integrateStatContext(game);assert.equal(fs.readFileSync(file,'utf8'),normal);
const report={passed:true,directory,faults:results.length,results,lfCrlfEquivalent:true,sourceEditsConstrained:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/stat-context-overlay-verification.json'),report);console.log(report);
