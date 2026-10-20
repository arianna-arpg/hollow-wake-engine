import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, sha256, writeJSON, listFiles } from './reference-utils.mjs';
import { run, nativeEnvironment } from './native-tools.mjs';

const artifacts = path.join(root, '.artifacts');
const verified = JSON.parse(fs.readFileSync(path.join(artifacts, 'native-latest.json')));
const build = path.resolve(verified.directory), report = verified.report;
assert.ok(path.relative(artifacts, build).startsWith('native-lifecycle-') && path.dirname(build) === artifacts);
assert.equal(report.platform, process.platform); assert.equal(report.arch, process.arch);
assert.equal(report.mutants.length, 2, 'Native negative controls are required before packaging');
for (const [file, hash] of Object.entries(report.sources)) assert.equal(sha256(fs.readFileSync(path.join(root, file))), hash, `Reverify changed source: ${file}`);
const win = process.platform === 'win32', libraryName = win ? 'hwe_lifecycle.dll' : 'libhwe_lifecycle.so';
assert.equal(sha256(fs.readFileSync(path.join(build, libraryName))), report.librarySha256, 'Reverify changed binary');
const output = fs.mkdtempSync(path.join(artifacts, 'native-package-')), staging = path.join(output, 'staging');
const copies = [
  [path.join(build, libraryName), `bin/${libraryName}`],
  [path.join(root, 'native/include/hwe_lifecycle.h'), 'include/hwe_lifecycle.h'],
  [path.join(root, 'native/bindings/dotnet/Lifecycle.cs'), 'bindings/dotnet/Lifecycle.cs'],
  [path.join(root, 'docs/native-lifecycle.md'), 'README.md'],
  [path.join(root, 'LICENSE.md'), 'LICENSE.md'], [path.join(root, 'NOTICE.md'), 'NOTICE.md'],
  [path.join(build, 'verification.json'), 'verification.json'],
];
if (win) copies.push([path.join(build, 'hwe_lifecycle.lib'), 'lib/hwe_lifecycle.lib']);
for (const [source, dest] of copies) {
  const file = path.join(staging, dest); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(source, file);
}
const manifest = { schemaVersion: 1, name: 'hollow-wake-lifecycle-experimental', version: '0.1.0', abi: 65536,
  platform: process.platform, arch: process.arch, capability: 'hollow-wake-lifecycle-leaves/v1',
  files: Object.fromEntries(listFiles(staging).map(file => [file, sha256(fs.readFileSync(path.join(staging, file)))])) };
writeJSON(path.join(staging, 'manifest.json'), manifest);
const archive = path.join(output, `hollow-wake-lifecycle-0.1.0-${process.platform}-${process.arch}.tar.gz`);
run('tar', ['-czf', archive, '-C', staging, '.'], output);
const installed = path.join(output, 'installed'); fs.mkdirSync(installed);
run('tar', ['-xzf', archive, '-C', installed], output);
assert.deepEqual(listFiles(installed), [...Object.keys(manifest.files), 'manifest.json'].sort());
for (const [file, hash] of Object.entries(manifest.files)) assert.equal(sha256(fs.readFileSync(path.join(installed, file))), hash, `Archive integrity: ${file}`);

// Both consumers compile against the extracted package, with no source-tree runtime imports.
const consumer = path.join(output, 'consumer'); fs.mkdirSync(consumer);
const env = nativeEnvironment(output), include = path.join(installed, 'include');
const cpp = path.join(consumer, win ? 'consumer.exe' : 'consumer');
fs.copyFileSync(path.join(root, 'native/test/header.cpp'), path.join(consumer, 'consumer.cpp'));
fs.copyFileSync(path.join(installed, 'bin', libraryName), path.join(consumer, libraryName));
const logs = [];
logs.push(run(win ? 'cl.exe' : process.env.CXX ?? 'c++', win
  ? ['/nologo', '/W4', '/WX', '/std:c++17', '/EHsc', '/MT', `/I${include}`, path.join(consumer, 'consumer.cpp'), path.join(installed, 'lib/hwe_lifecycle.lib'), `/Fe:${cpp}`, `/Fo:${consumer}${path.sep}`]
  : ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', include, path.join(consumer, 'consumer.cpp'), path.join(consumer, libraryName), '-Wl,-rpath,$ORIGIN', '-o', cpp], consumer, env));
run(cpp, [], consumer, env);
fs.copyFileSync(path.join(root, 'native/test/interop/Program.cs'), path.join(consumer, 'Program.cs'));
fs.copyFileSync(path.join(installed, 'bindings/dotnet/Lifecycle.cs'), path.join(consumer, 'Lifecycle.cs'));
fs.copyFileSync(path.join(root, 'native/test/interop/NuGet.Config'), path.join(consumer, 'NuGet.Config'));
fs.writeFileSync(path.join(consumer, 'Consumer.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><AllowUnsafeBlocks>true</AllowUnsafeBlocks><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>\n');
writeJSON(path.join(output, 'global.json'), { sdk: { version: report.dotnetSdk, rollForward: 'disable' } });
const managedEnv = { ...process.env, DOTNET_CLI_HOME: path.join(output, 'dotnet-home'), DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1' };
logs.push(run('dotnet', ['restore', 'Consumer.csproj', '--configfile', 'NuGet.Config'], consumer, managedEnv));
logs.push(run('dotnet', ['build', 'Consumer.csproj', '--no-restore', '-c', 'Release'], consumer, managedEnv));
const result = run('dotnet', [path.join(consumer, 'bin/Release/net8.0/Consumer.dll'), path.join(installed, 'bin', libraryName),
  path.join(root, 'baseline/milestone-two/lifecycle.json'), path.join(build, 'vectors.json')], consumer, managedEnv);
const tested = JSON.parse(result.trim());
for (const field of ['comparisons', 'numeric', 'bitExact', 'warmedManagedAllocationBytes']) assert.equal(tested[field], report[field], `Packed consumer: ${field}`);
logs.push(result);
const receipt = { archive, archiveBytes: fs.statSync(archive).size, archiveSha256: sha256(fs.readFileSync(archive)),
  manifest, consumer: tested, distribution: 'Experimental lifecycle leaves only; not a Unity/Godot/Unreal package' };
writeJSON(path.join(output, 'package-verification.json'), receipt);
fs.writeFileSync(path.join(output, 'package-verification.txt'), logs.join('\n'));
writeJSON(path.join(artifacts, 'native-package-latest.json'), { directory: output, receipt });
console.log(JSON.stringify(receipt, null, 2));
