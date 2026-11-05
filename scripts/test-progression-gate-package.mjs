import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { root, sha256, writeJSON } from './reference-utils.mjs';
import { installVocationPackages } from './vocation-package-tools.mjs';
import { buildProgressionGates } from './compile-progression-gates.mjs';
import { readVocationFixture } from './vocation-reference.mjs';
import { npmCli } from './npm-cli.mjs';

const { directory, consumer, sdk, content: catalogue } = installVocationPackages('progression-gate-package-');
const contentDirectory = path.join(directory, 'gate-content');
const pack = buildProgressionGates(contentDirectory);
const npm = (cwd, args) => execFileSync(process.execPath, [
  npmCli(), ...args, '--cache', path.join(root, '.artifacts/npm-cache'),
], { cwd, encoding: 'utf8', windowsHide: true });
const archive = JSON.parse(npm(contentDirectory, ['pack', '--json', '--ignore-scripts', '--pack-destination', directory]))[0];
npm(consumer, ['install', path.join(directory, archive.filename), '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
const specifier = key => '@hollow-wake/engine/progression/' + key;
const contracts = [];
for (const name of ['progression-gates', 'progression-gate-content']) {
  let source = fs.readFileSync(path.join(root, 'test/' + name + '.test.mjs'), 'utf8');
  for (const [key, file] of Object.entries({ gates: 'progression-gates', 'gate-content': 'progression-gate-content' })) {
    source = source.replaceAll("'../dist/" + file + ".js'", JSON.stringify(specifier(key)));
  }
  const filename = name + '.test.mjs';
  fs.writeFileSync(path.join(consumer, filename), source);
  contracts.push(filename);
}
const log = execFileSync(process.execPath, ['--test', ...contracts], { cwd: consumer, encoding: 'utf8', windowsHide: true });
assert(/(?:#|ℹ) pass 16\b/.test(log));
fs.writeFileSync(path.join(directory, 'contracts.txt'), log);

const { fixtures } = JSON.parse(fs.readFileSync(path.join(root, 'baseline/progression-gates/acceptance.json')));
const expected = readVocationFixture('gates', fixtures), observations = JSON.parse(expected);
const helper = fs.readFileSync(path.join(root, fixtures.gates.helper), 'utf8');
assert.equal(sha256(helper), fixtures.gates.helperSha256);
const marker = 'const cls=CLASSES[0],other=CLASSES[1];';
assert.equal(helper.split(marker).length, 2);
const input = `import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as gates from '${specifier('gates')}';
import type {GateRow} from '${specifier('gates')}';
import {ProgressionGateContent} from '${specifier('gate-content')}';
const bytes=fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/progression-gates/gates.json')));
const manifest=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/progression-gates/manifest.json')),'utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
assert.equal(bytes.length,manifest.bytes);
const content=new ProgressionGateContent(JSON.parse(bytes.toString()));
assert.equal(content.pack.contentId,manifest.contentId);
const context=content.context,CLASSES=content.pack.classes;
const {reachedLevelKey,classLevelLedgerKey,vocationUnlockKey,questDoneKey}=context;
const LEDGER_QUESTS_COMPLETED=context.questsCompletedKey;
const kinds=new Map(${JSON.stringify(observations.authored.map(row => [row.id, row.kind]))});
const UNLOCK_CATALOG=content.pack.requirements.map(group=>({id:group.id,kind:kinds.get(group.id),reqAnyOf:group.rows}));
const makeAccount=()=>({ledger:{} as Record<string,number>,features:new Set<string>()});
const gateRowMet=(a:ReturnType<typeof makeAccount>,row:GateRow,owned:(id:string)=>boolean)=>gates.gateRowMet(a,row,owned,context);
const gateRowLabel=(row:GateRow)=>gates.gateRowLabel(row,context);
const gateMet=(a:ReturnType<typeof makeAccount>,rows:readonly GateRow[]|undefined,mode:'any'|'all',owned:(id:string)=>boolean)=>gates.gateMet(a,rows,mode,owned,context);
const gateRowProgress=(a:ReturnType<typeof makeAccount>,row:GateRow,owned:(id:string)=>boolean)=>gates.gateRowProgress(a,row,owned,context);
const {gateLevelNeeds,gateClassLevelNeeds,ledgerPrefixHeld}=gates;
` + marker + helper.split(marker)[1];
fs.writeFileSync(path.join(consumer, 'original-observer.ts'), input);
await build({
  absWorkingDir: consumer, entryPoints: ['original-observer.ts'], bundle: true,
  platform: 'node', format: 'esm', packages: 'external', outfile: path.join(consumer, 'original-observer.mjs'),
});
const output = path.join(directory, 'observations.json');
execFileSync(process.execPath, ['original-observer.mjs', output], { cwd: consumer, windowsHide: true });
assert(fs.readFileSync(output).equals(expected), 'Packed standalone gates differ from the original game');

fs.writeFileSync(path.join(consumer, 'consumer.ts'), `import {
  gateMet,gateRowLabel,gateRowProgress,gateLevelNeeds,gateClassLevelNeeds,type GateAccount,type GateRow
} from '${specifier('gates')}';
import {ProgressionGateContent,type ProgressionGatePack} from '${specifier('gate-content')}';
declare const pack:ProgressionGatePack;
const content=new ProgressionGateContent(pack);
const account:GateAccount={ledger:{},features:new Set<string>()};
const group=content.requirement('example');
const held:boolean=gateMet(account,group.rows,group.mode,()=>false,content.context);
const row:GateRow={classLevel:{classId:'hero',level:3}};
const label:string=gateRowLabel(row,content.context);
const progress:number=gateRowProgress(account,row,()=>false,content.context);
const levels:number[]=gateLevelNeeds(group.rows);
const targets=gateClassLevelNeeds(group.rows);
if(targets[0]){
  const id:string=targets[0].classId;
  // @ts-expect-error Borrowed target fields are read-only.
  targets[0].level=99;
}
// @ts-expect-error Requirement arrays are immutable.
group.rows.push({});
// @ts-expect-error Published rows are read-only.
row.level=1;
// @ts-expect-error Composition is explicit.
gateMet(account,group.rows,'either',()=>false,content.context);
`);
writeJSON(path.join(consumer, 'tsconfig.json'), {
  compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022'], types: [] },
  include: ['consumer.ts'],
});
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: consumer, windowsHide: true });
const browserBytes = {};
for (const [key, file] of Object.entries({ gates: 'progression-gates', 'gate-content': 'progression-gate-content' })) {
  const entry = key + '-browser.mjs', outfile = path.join(directory, entry);
  fs.writeFileSync(path.join(consumer, entry), "export * from '" + specifier(key) + "';");
  const bundled = await build({ absWorkingDir: consumer, entryPoints: [entry], outfile, bundle: true, minify: true, platform: 'browser', format: 'esm', metafile: true });
  const inputs = Object.keys(bundled.metafile.inputs);
  assert(inputs.includes('node_modules/@hollow-wake/engine/dist/' + file + '.js'));
  assert(inputs.every(input => input === entry || [file, 'validation'].includes(path.basename(input, '.js'))));
  browserBytes[key] = fs.statSync(outfile).size;
  assert(browserBytes[key] > 0 && browserBytes[key] <= 5 * 1024, key);
}
const report = {
  passed: true, directory, consumer, contracts: 16, classes: pack.classes.length, requirements: pack.requirements.length,
  observationsSha256: sha256(expected), browserBytes, types: true,
  archives: Object.fromEntries([['sdk', sdk], ['catalogue', catalogue], ['gates', archive]].map(([key, value]) => [
    key, { file: path.join(directory, value.filename), sha256: sha256(fs.readFileSync(path.join(directory, value.filename))) },
  ])),
};
writeJSON(path.join(directory, 'verification.json'), report);
writeJSON(path.join(root, '.artifacts/progression-gate-package-latest.json'), report);
console.log(report);
