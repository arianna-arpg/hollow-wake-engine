// Isolated experiment verification; production files and accepted fixtures remain unchanged.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import assert from "node:assert/strict";
import vm from "node:vm";
import { root, sha256, listFiles, writeJSON } from "../../scripts/reference-utils.mjs";
import { nativeEnvironment } from "../../scripts/native-tools.mjs";
import { build } from "../../.reference/node_modules/esbuild/lib/main.js";
const snapshot = (directory2) => Object.fromEntries(listFiles(directory2).map((file) => [file, sha256(fs.readFileSync(path.join(directory2, file)))]));
const read = (f) => JSON.parse(fs.readFileSync(f)), hash = (f) => sha256(fs.readFileSync(f)), c = read(path.join(path.resolve(process.argv[2]), "build-verification.json")), directory = path.join(c.directory, "native");
assert(!fs.existsSync(directory));
fs.mkdirSync(directory);
const libraryDirectory = path.resolve(process.argv[3]), sessionDirectory = path.resolve(process.argv[4]), proof = read(path.join(libraryDirectory, "verification.json")), prior = read(path.join(sessionDirectory, "verification.json")), library = path.join(libraryDirectory, "hwe_embedded.dll"), input = path.join(sessionDirectory, "input.json"), requests = path.join(sessionDirectory, "requests.jsonl");
assert(proof.passed && prior.passed);
assert.equal(hash(library), proof.librarySha256);
assert.equal(hash(input), prior.inputSha256);
assert.equal(hash(requests), prior.raw["requests.jsonl"]);
for (const [file, expected2] of Object.entries({ ...prior.sourceHashes, ...proof.sourceHashes })) assert.equal(hash(path.join(root, file)), expected2, file);
assert.deepEqual(snapshot(path.join(root, "dist")), c.baselineRuntime);
assert.deepEqual(snapshot(path.join(c.candidate, "dist")), c.candidateRuntime);
const report = { passed: false, productionRuntimeUnchanged: true, library, librarySha256: hash(library), input, requests, inputSha256: hash(input), requestsSha256: hash(requests), bundles: {}, consumers: {}, sources: { ...prior.sourceHashes, ...proof.sourceHashes } };
const lines = (f) => fs.readFileSync(f, "utf8").trim().split(/\r?\n/).map(JSON.parse), expected = lines(path.join(sessionDirectory, "node-original.jsonl"));
for (const mode of ["baseline", "candidate"]) {
  const target = path.join(c[mode], "experiments/embedded-js");
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync("experiments/embedded-js/session.mjs", path.join(target, "session.mjs"));
  const entry = path.join(c[mode], "entry.mjs"), bundle = path.join(c[mode], "bundle.js");
  fs.writeFileSync(entry, `import {create as inner,dispatch} from './experiments/embedded-js/session.mjs';export {dispatch};export function create(input){Math.random=()=>{throw Error('Ambient randomness');};globalThis.fetch=()=>{throw Error('Network use');};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key);}});return inner(input);}
`, { flag: "wx" });
  const result = await build({ entryPoints: [entry], bundle: true, platform: "neutral", format: "iife", globalName: "HollowWakeSession", target: "es2022", minify: false, metafile: true, outfile: bundle });
  for (const output of Object.values(result.metafile.outputs)) assert.equal(output.imports.length, 0);
  for (const file of Object.keys(result.metafile.inputs)) assert(path.resolve(file).startsWith(c[mode] + path.sep), file);
  const context = vm.createContext({ raw: fs.readFileSync(input, "utf8") });
  vm.runInContext(fs.readFileSync(bundle, "utf8"), context);
  vm.runInContext("const controller=HollowWakeSession.create(JSON.parse(raw));", context);
  const actual = [];
  for (const request of lines(requests)) {
    context.request = JSON.stringify(request);
    actual.push(JSON.parse(vm.runInContext("JSON.stringify(HollowWakeSession.dispatch(controller,JSON.parse(request)))", context)));
  }
  assert.deepEqual(actual, expected);
  writeJSON(path.join(directory, mode + "-node.json"), actual);
  report.bundles[mode] = { file: bundle, sha256: hash(bundle), bytes: fs.statSync(bundle).size, requests: actual.length, unbundledOutcomeMatch: true };
}
const env = nativeEnvironment(directory), log = path.join(directory, "build.txt"), fd = fs.openSync(log, "wx"), native = path.join(directory, "consumer.exe"), managed = path.join(directory, "managed"), managedEnv = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1", DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1", DOTNET_CLI_HOME: path.join(directory, "dotnet-home") };
const sdk = cp.execFileSync("dotnet", ["--list-sdks"], { cwd: directory, encoding: "utf8", windowsHide: true }).split(/\r?\n/).map((line) => line.split(" ")[0]).filter((v) => /^8\.\d+\.\d+$/.test(v)).sort((a, b) => Number(a.split(".")[2]) - Number(b.split(".")[2])).at(-1);
assert(sdk);
writeJSON(path.join(directory, "global.json"), { sdk: { version: sdk, rollForward: "disable" } });
try {
  cp.execFileSync("cl.exe", ["/nologo", "/O2", "/W4", "/WX", "/std:c++17", "/utf-8", "/EHsc", "/MT", path.join(root, "experiments/embedded-js/native/consumer.cpp"), "/Fo:" + path.join(directory, "consumer.obj"), "/Fe:" + native, "/link", "/STACK:2097152"], { cwd: directory, env, windowsHide: true, stdio: ["ignore", fd, fd] });
  const intermediate = path.join(directory, "managed-obj") + path.sep;
  cp.execFileSync("dotnet", ["build", path.join(root, "experiments/embedded-js/native/dotnet/Consumer.csproj"), "-c", "Release", "-o", managed, "-p:BaseIntermediateOutputPath=" + intermediate, "-p:MSBuildProjectExtensionsPath=" + intermediate, "-p:NuGetAudit=false", "-p:UseSharedCompilation=false", "--disable-build-servers", "--configfile", path.join(root, "experiments/embedded-js/native/dotnet/NuGet.Config")], { cwd: directory, env: managedEnv, windowsHide: true, stdio: ["ignore", fd, fd], timeout: 12e4 });
} finally {
  fs.closeSync(fd);
}
report.dotnetSdk = sdk;
report.binaryHashes = Object.fromEntries([native, ...listFiles(managed).map((f) => path.join(managed, f))].map((file) => [file, hash(file)]));
for (const mode of ["baseline", "candidate"]) for (const language of ["cpp", "dotnet"]) {
  const label = mode + "-" + language, output = path.join(directory, label + ".jsonl"), log2 = path.join(directory, label + ".txt"), fd2 = fs.openSync(log2, "wx");
  let status;
  try {
    status = cp.spawnSync(language === "cpp" ? native : "dotnet", [...language === "cpp" ? [] : [path.join(managed, "Consumer.dll")], library, report.bundles[mode].file, input, requests, output], { cwd: directory, env: managedEnv, windowsHide: true, stdio: ["ignore", fd2, fd2], timeout: 6e4 });
  } finally {
    fs.closeSync(fd2);
  }
  assert(!status.error, status.error?.message);
  assert.equal(status.signal, null);
  assert.equal(status.status, 0, fs.readFileSync(log2, "utf8"));
  const stats = JSON.parse(fs.readFileSync(log2, "utf8"));
  assert(stats.passed);
  assert.equal(stats.requests, 60);
  assert.equal(stats.liveBytesAfterDispose, 0);
  assert.equal(stats.liveBlocksAfterDispose, 0);
  assert.deepEqual(lines(output), expected);
  report.consumers[label] = stats;
}
assert.deepEqual(snapshot(path.join(root, "dist")), c.baselineRuntime);
assert.deepEqual(snapshot(path.join(c.candidate, "dist")), c.candidateRuntime);
report.raw = Object.fromEntries(fs.readdirSync(directory).filter((f) => /\.(jsonl|txt)$/.test(f) || f.endsWith("-node.json")).map((f) => [f, hash(path.join(directory, f))]));
for (const [file, expectedHash] of Object.entries(report.sources)) assert.equal(hash(path.join(root, file)), expectedHash, file);
for (const [file, expectedHash] of Object.entries(report.binaryHashes)) assert.equal(hash(file), expectedHash, file);
for (const bundle of Object.values(report.bundles)) assert.equal(hash(bundle.file), bundle.sha256);
assert.equal(hash(library), report.librarySha256);
assert.equal(hash(input), report.inputSha256);
assert.equal(hash(requests), report.requestsSha256);
report.inputsUnchanged = true;
report.passed = true;
writeJSON(path.join(directory, "verification.json"), report);
console.log({ passed: true, directory, consumers: report.consumers });
