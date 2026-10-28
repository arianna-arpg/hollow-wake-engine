// Isolated experiment verification; production files and accepted fixtures remain unchanged.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { root, sha256, listFiles, writeJSON } from "../../scripts/reference-utils.mjs";
const snapshot = (directory) => Object.fromEntries(listFiles(directory).map((file) => [file, sha256(fs.readFileSync(path.join(directory, file)))]));
const c = JSON.parse(fs.readFileSync(path.join(path.resolve(process.argv[2]), "build-verification.json"))), receipt = path.join(c.directory, "unit-verification-v2.json");
assert(!fs.existsSync(receipt));
const from = pathToFileURL(path.join(root, "dist") + path.sep).href, to = pathToFileURL(path.join(c.candidate, "dist") + path.sep).href, loader = path.join(c.directory, "verified-candidate-loader-v2.mjs"), mapping = path.join(c.directory, "unit-runtime-mapping-v2.jsonl");
fs.writeFileSync(loader, `import fs from 'node:fs';export async function resolve(specifier,context,nextResolve){const result=await nextResolve(specifier,context);if(result.url.startsWith(${JSON.stringify(from)})){const target=${JSON.stringify(to)}+result.url.slice(${from.length});fs.appendFileSync(${JSON.stringify(mapping)},JSON.stringify({from:result.url,to:target})+${JSON.stringify("\n")});return {...result,url:target};}return result;}
`, { flag: "wx" });
assert.deepEqual(snapshot(path.join(root, "dist")), c.baselineRuntime);
assert.deepEqual(snapshot(path.join(c.candidate, "dist")), c.candidateRuntime);
const tests = fs.readdirSync("test").filter((f) => f.endsWith(".test.mjs")).sort().map((f) => "test/" + f), log = path.join(c.directory, "unit-tests-v2.txt"), fd = fs.openSync(log, "wx");
let passed = false;
writeJSON(receipt, { status: "running", pid: process.pid, tests, loaderSha256: sha256(fs.readFileSync(loader)) });
try {
  cp.execFileSync(process.execPath, ["--experimental-loader", pathToFileURL(loader).href, "--test", ...tests], { cwd: root, windowsHide: true, stdio: ["ignore", fd, fd] });
  const text = fs.readFileSync(log, "utf8"), counts = [...text.matchAll(/^(?:#|ℹ) tests (\d+)\r?$/gm)].map((m) => Number(m[1]));
  assert(counts.includes(850));
  const mapped = fs.readFileSync(mapping, "utf8").trim().split("\n").map(JSON.parse);
  assert(mapped.some((m) => m.from.endsWith("/item-rules.js")));
  assert(mapped.every((m) => m.to.startsWith(to)));
  passed = true;
} finally {
  fs.closeSync(fd);
  assert.deepEqual(snapshot(path.join(root, "dist")), c.baselineRuntime);
  assert.deepEqual(snapshot(path.join(c.candidate, "dist")), c.candidateRuntime);
  writeJSON(receipt, { status: passed ? "completed" : "failed", passed, tests: 850, candidateRuntimeMapSha256: sha256(JSON.stringify(c.candidateRuntime)), productionRuntimeUnchanged: true, loader, loaderSha256: sha256(fs.readFileSync(loader)), mapping, log, logSha256: sha256(fs.readFileSync(log)) });
  console.log({ passed, receipt });
}
