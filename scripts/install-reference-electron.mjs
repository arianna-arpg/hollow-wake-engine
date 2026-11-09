import assert from 'node:assert/strict';import {installReferenceElectron} from './tool-download.mjs';
assert.equal(process.argv.length,3,'Pass the existing Electron install.js path');
try{console.log(await installReferenceElectron(process.argv[2]));}
catch(error){console.error(error.message);process.exitCode=error.exitCode??1;}
