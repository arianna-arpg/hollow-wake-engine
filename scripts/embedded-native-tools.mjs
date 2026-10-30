import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {root, writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';

/** Development builds only; no implicit cross-compilation or target claim. */
function toolchain(directory, upstream, sanitize) {
  assert(['win32', 'linux'].includes(process.platform)); assert.equal(process.arch, 'x64');
  const windows = process.platform === 'win32'; assert(!sanitize || !windows);
  const env = nativeEnvironment(directory), cc = windows ? 'cl.exe' : process.env.CC ?? 'cc';
  const cxx = windows ? cc : process.env.CXX ?? 'c++';
  const instrumentation = sanitize ? ['-O1', '-g', '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-sanitize-recover=all'] : [];
  const flags = windows ? ['/nologo', '/O2', '/std:c11', '/fp:strict', '/MT', '/experimental:c11atomics', '/I' + upstream]
    : ['-std=gnu11', '-O2', '-D_GNU_SOURCE', '-funsigned-char', '-fno-fast-math', '-ffp-contract=off',
      '-fvisibility=hidden', '-fPIC', '-pthread', '-isystem', upstream, ...instrumentation];
  const descriptor = fs.openSync(path.join(directory, 'build.txt'), 'wx'), commands = [];
  const run = (command, args) => {
    commands.push({command, args});
    execFileSync(command, args, {cwd: directory, env, windowsHide: true, stdio: ['ignore', descriptor, descriptor], timeout: 180000});
  };
  const finish = () => {fs.closeSync(descriptor); writeJSON(path.join(directory, 'build-commands.json'), commands);};
  const banner = command => {
    const result = spawnSync(command, windows ? [] : ['--version'], {cwd: directory, env, windowsHide: true, encoding: 'utf8'});
    assert(!result.error); assert.equal(result.signal, null); if (!windows) assert.equal(result.status, 0);
    return (result.stdout + result.stderr).trim();
  };
  return {windows, env, cc, cxx, flags, instrumentation, commands, run, finish, banner};
}

export function buildEmbeddedExecutable(directory, upstream, source, stem) {
  const t = toolchain(directory, upstream, false), suffix = t.windows ? '.obj' : '.o';
  const ownObject = path.join(directory, stem + suffix), upstreamObject = path.join(directory, 'quickjs-amalgam' + suffix);
  const binary = path.join(directory, stem + (t.windows ? '.exe' : ''));
  try {
    t.run(t.cc, t.windows ? [...t.flags, '/W4', '/WX', '/c', source, '/Fo:' + ownObject]
      : [...t.flags, '-Wall', '-Wextra', '-Werror', '-c', source, '-o', ownObject]);
    t.run(t.cc, t.windows ? [...t.flags, '/c', path.join(upstream, 'quickjs-amalgam.c'), '/Fo:' + upstreamObject]
      : [...t.flags, '-c', path.join(upstream, 'quickjs-amalgam.c'), '-o', upstreamObject]);
    t.run(t.cc, t.windows ? ['/nologo', '/MT', ownObject, upstreamObject, '/Fe:' + binary]
      : [ownObject, upstreamObject, '-lm', '-ldl', '-pthread', '-o', binary]);
  } finally {t.finish();}
  return {binary, env: t.env, compilerBanner: t.banner(t.cc), commands: t.commands, compilerFlags: t.flags};
}

export function buildEmbeddedLibrary(directory, upstream, {sanitize = false} = {}) {
  const t = toolchain(directory, upstream, sanitize), source = path.join(root, 'experiments/embedded-js/native');
  const library = path.join(directory, t.windows ? 'hwe_embedded.dll' : 'libhwe_embedded.so');
  const native = path.join(directory, t.windows ? 'consumer.exe' : 'consumer'), suffix = t.windows ? '.obj' : '.o';
  const ownObject = path.join(directory, 'hwe_embedded' + suffix), upstreamObject = path.join(directory, 'quickjs-amalgam' + suffix);
  try {
    t.run(t.cc, t.windows ? [...t.flags, '/W4', '/WX', '/DHWE_JS_BUILD_SHARED', '/c', path.join(source, 'hwe_embedded.c'), '/Fo:' + ownObject]
      : [...t.flags, '-Wall', '-Wextra', '-Werror', '-DHWE_JS_BUILD_SHARED', '-c', path.join(source, 'hwe_embedded.c'), '-o', ownObject]);
    t.run(t.cc, t.windows ? [...t.flags, '/c', path.join(upstream, 'quickjs-amalgam.c'), '/Fo:' + upstreamObject]
      : [...t.flags, '-c', path.join(upstream, 'quickjs-amalgam.c'), '-o', upstreamObject]);
    t.run(t.cc, t.windows ? ['/nologo', '/MT', '/LD', ownObject, upstreamObject, '/Fe:' + library]
      : ['-shared', ownObject, upstreamObject, '-Wl,-z,defs,-z,relro,-z,now', '-lm', '-ldl', '-pthread', ...t.instrumentation, '-o', library]);
    t.run(t.cxx, t.windows ? ['/nologo', '/O2', '/W4', '/WX', '/std:c++17', '/utf-8', '/EHsc', '/MT', path.join(source, 'consumer.cpp'),
      '/Fo:' + path.join(directory, 'consumer.obj'), '/Fe:' + native, '/link', '/STACK:2097152']
      : ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', '-fno-fast-math', '-ffp-contract=off',
        ...t.instrumentation, path.join(source, 'consumer.cpp'), '-ldl', '-pthread', '-o', native]);
  } finally {t.finish();}
  const exported = execFileSync(t.windows ? 'dumpbin.exe' : 'nm', t.windows ? ['/exports', library]
    : ['-D', '--defined-only', '--format=posix', library], {cwd: directory, env: t.env, windowsHide: true, encoding: 'utf8'});
  fs.writeFileSync(path.join(directory, 'exports.txt'), exported, {flag: 'wx'});
  const names = t.windows ? [...exported.matchAll(/^\s+\d+\s+[\dA-F]+\s+[\dA-F]+\s+(\S+)\s*$/gm)].map(match => match[1]).sort()
    : exported.trim().split(/\r?\n/).map(line => line.split(/\s+/)[0]).sort();
  assert.deepEqual(names, ['cancel', 'copy_response', 'create', 'destroy', 'layout', 'metrics', 'release_response', 'submit'].map(name => 'hwe_js_' + name + '_v1').sort());
  return {library, native, env: t.env, compilerBanner: t.banner(t.cc), cppCompilerBanner: t.banner(t.cxx),
    commands: t.commands, compilerFlags: t.flags, exportedFunctions: names, sanitize};
}

/** Build the shared managed consumer in a private output tree. */
export function buildEmbeddedManagedConsumer(directory) {
  const source = path.join(root, 'experiments/embedded-js/native/dotnet');
  const managed = path.join(directory, 'managed'), intermediate = path.join(directory, 'managed-obj') + path.sep;
  const env = {...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_CLI_HOME: path.join(directory, 'dotnet-home')};
  const sdk = execFileSync('dotnet', ['--list-sdks'], {cwd: directory, env, windowsHide: true, encoding: 'utf8'})
    .split(/\r?\n/).map(line => line.split(' ')[0]).filter(version => /^8\.\d+\.\d+$/.test(version))
    .sort((a, b) => {const aa = a.split('.').map(Number), bb = b.split('.').map(Number); return aa[1] - bb[1] || aa[2] - bb[2];}).at(-1);
  assert(sdk, 'Install the .NET 8 SDK, including its offline targeting packs');
  assert(!fs.existsSync(path.join(directory, 'global.json')), 'Managed consumer needs a fresh build directory');
  writeJSON(path.join(directory, 'global.json'), {sdk: {version: sdk, rollForward: 'disable'}});
  const args = ['build', path.join(source, 'Consumer.csproj'), '-c', 'Release', '-o', managed,
    '-p:BaseIntermediateOutputPath=' + intermediate, '-p:MSBuildProjectExtensionsPath=' + intermediate,
    '-p:NuGetAudit=false', '-p:UseSharedCompilation=false', '--disable-build-servers', '--configfile', path.join(source, 'NuGet.Config')];
  const log = path.join(directory, 'dotnet-build.txt'), fd = fs.openSync(log, 'wx');
  try {execFileSync('dotnet', args, {cwd: directory, env, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 120000});}
  finally {fs.closeSync(fd);}
  assert.equal(execFileSync('dotnet', ['--version'], {cwd: directory, env, windowsHide: true, encoding: 'utf8'}).trim(), sdk);
  return {dll: path.join(managed, 'Consumer.dll'), env, sdk, args, log};
}
