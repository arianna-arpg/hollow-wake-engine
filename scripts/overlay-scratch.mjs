import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root} from './reference-utils.mjs';

/** Own a synchronous source-check workspace, including failure teardown. */
export function withOverlayScratch(label, check) {
  assert(/^[a-z][a-z-]*$/.test(label));
  const artifacts=path.join(root,'.artifacts');fs.mkdirSync(artifacts,{recursive:true});
  const parent=fs.realpathSync(artifacts),directory=fs.mkdtempSync(path.join(parent,label+'-overlay-owned-'));
  const actual=fs.realpathSync(directory);
  try { return check(directory); }
  finally {
    assert.equal(fs.realpathSync(directory),actual,'Scratch path was replaced');
    assert.equal(path.dirname(actual),parent);
    assert(!fs.lstatSync(directory).isSymbolicLink());
    assert(!fs.existsSync(path.join(actual,'.git')),'Preserve an unexpected repository');
    fs.rmSync(actual,{recursive:true});
  }
}
