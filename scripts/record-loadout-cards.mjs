import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256,writeJSON} from './reference-utils.mjs';

// Link a specific installable addon and exported game to their accepted run.
// The Windows and Linux recorders can also run on a host holding the ZIPs.
const [desktopFile,workshopDir,addon,output,...extra]=process.argv.slice(2);
assert(output&&!extra.length&&!fs.existsSync(output),'Expected DESKTOP_RECEIPT WORKSHOP_DIRECTORY ADDON_ZIP NEW_RECEIPT');
const read=file=>JSON.parse(fs.readFileSync(file)),hash=file=>sha256(fs.readFileSync(file));
const source=read(path.join(root,'baseline/loadout-cards/acceptance.json'));
const workshopFile=path.join(workshopDir,'verification.json'),desktop=read(desktopFile),game=read(workshopFile);
assert(desktop.passed&&game.passed&&desktop.platform===game.platform&&desktop.arch===game.arch);
assert.equal(desktop.version,read(path.join(root,'package.json')).version);
assert.equal(game.originalCourseSha256,desktop.fixture.sha256);
assert(desktop.observations.independentlyEqualsReference&&desktop.observations.editorEqualsRelease);
assert.equal(hash(addon),game.addonSha256);assert.equal(desktop.package.archiveSha256,game.addonSha256);
for(const [name,digest] of Object.entries(game.archives)){
  assert.equal(path.basename(name),name);assert.equal(hash(path.join(workshopDir,name)),digest);
}
assert(game.checks.some(check=>check.label==='loadout'));
const run=game.loadout;
assert.equal(run.cases,source.visible);assert.equal(run.revision,4);
assert(run.heap.closed&&!run.heap.poisoned&&!run.heap.delivery_failed&&run.heap.peak_bytes>0&&run.heap.peak_bytes<=32*1024*1024);
assert.equal(run.heap.live_bytes,0);assert.equal(run.heap.live_blocks,0);
const {bundleBytes,baseBytes=bundleBytes,rackBytes=0,contentBytes}=desktop.package;
assert(baseBytes<=100*1024 && rackBytes<=5*1024 && rackBytes>=0 && bundleBytes===baseBytes+rackBytes && contentBytes<=2*1024*1024);
const report={passed:true,version:desktop.version,platform:game.platform,arch:game.arch,corpus:source,
  loadout:run,addonSha256:game.addonSha256,archives:game.archives,bundleBytes:desktop.package.bundleBytes,
  contentBytes:desktop.package.contentBytes,workshopProofSha256:hash(workshopFile),desktopProofSha256:hash(desktopFile)};
writeJSON(output,report);console.log({platform:report.platform,cards:run.cases,repliesSha256:run.sha256,peakBytes:run.heap.peak_bytes});
