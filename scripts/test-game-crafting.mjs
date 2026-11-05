import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifyCharacterReference} from './character-reference.mjs';
const [flag,file,...extra]=process.argv.slice(2);assert.equal(flag,'--location');assert(file&&extra.length===0);
const location=JSON.parse(fs.readFileSync(path.resolve(file)));assert(location.craftingDecision,'Prepare a crafting adapter first');
verifyCharacterReference('baseline/crafting/acceptance.json','installed-crafting-',['--game',location.game]);
