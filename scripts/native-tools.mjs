import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root } from './reference-utils.mjs';

export function run(command, args, cwd, env = process.env) {
  try { return execFileSync(command, args, { cwd, env, stdio: 'pipe', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); }
  catch (error) { throw new Error(`${path.basename(command)} failed: ${error.stdout ?? ''}\n${error.stderr ?? ''}`, { cause: error }); }
}
export function nativeEnvironment(output) {
  if (process.platform !== 'win32') return process.env;
  const vswhere = path.join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
  const install = run(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], root).trim();
  if (!install) throw new Error('MSVC C toolchain not found');
  const vcvars = path.join(install, 'VC/Auxiliary/Build/vcvars64.bat');
  if (/["%\r\n]/.test(vcvars)) throw new Error('Unsupported toolchain path');
  const setup = path.join(output, 'compiler-env.cmd');
  fs.writeFileSync(setup, `@echo off\r\ncall "${vcvars}" >nul\r\nif errorlevel 1 exit /b 1\r\nset\r\n`, { flag: 'wx' });
  const text = run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', setup], output);
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf('='); if (index > 0) env[line.slice(0, index)] = line.slice(index + 1);
  }
  return env;
}
export function buildNative(output, source = path.join(root, 'native/src/hwe_lifecycle.c'), checks = true) {
  fs.mkdirSync(output, { recursive: true });
  const env = nativeEnvironment(output), include = path.join(root, 'native/include');
  const win = process.platform === 'win32';
  if (!win && process.platform !== 'linux') throw new Error('Only Windows x64 and Linux native proof builds are configured');
  if (process.arch !== 'x64') throw new Error('This proof currently validates x64 only');
  const compiler = win ? 'cl.exe' : process.env.CC ?? 'cc';
  const library = path.join(output, win ? 'hwe_lifecycle.dll' : 'libhwe_lifecycle.so');
  const flags = win ? ['/nologo', '/W4', '/WX', '/O2', '/fp:strict', '/MT', `/I${include}`]
    : ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', '-fno-fast-math', '-ffp-contract=off', '-fvisibility=hidden', '-I', include];
  const log = [];
  log.push(run(compiler, win ? [...flags, '/std:c11', '/LD', '/DHWE_BUILD_SHARED', source, `/Fe:${library}`, `/Fo:${output}${path.sep}`]
    : [...flags, '-DHWE_BUILD_SHARED', '-fPIC', '-shared', source, '-lm', '-o', library], output, env));
  const contracts = path.join(output, win ? 'contracts.exe' : 'contracts');
  const importLib = win ? path.join(output, 'hwe_lifecycle.lib') : library;
  log.push(run(compiler, win ? [...flags, '/std:c11', path.join(root, 'native/test/contracts.c'), importLib, `/Fe:${contracts}`, `/Fo:${output}${path.sep}`]
    : [...flags, path.join(root, 'native/test/contracts.c'), importLib, '-Wl,-rpath,$ORIGIN', '-lm', '-o', contracts], output, env));
  if (checks) log.push(run(contracts, [], output, env));
  const cpp = path.join(output, win ? 'header.exe' : 'header');
  log.push(run(win ? compiler : process.env.CXX ?? 'c++', win
    ? [...flags, '/std:c++17', '/EHsc', path.join(root, 'native/test/header.cpp'), importLib, `/Fe:${cpp}`, `/Fo:${output}${path.sep}`]
    : ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', include, path.join(root, 'native/test/header.cpp'), importLib, '-Wl,-rpath,$ORIGIN', '-o', cpp], output, env));
  run(cpp, [], output, env);
  if (checks && !win) {
    const sanitized = path.join(output, 'contracts-sanitized');
    log.push(run(compiler, [...flags, '-O1', '-g', '-DHWE_STATIC', '-fsanitize=address,undefined', '-fno-omit-frame-pointer',
      source, path.join(root, 'native/test/contracts.c'), '-lm', '-o', sanitized], output, env));
    log.push(run(sanitized, [], output, { ...env, ASAN_OPTIONS: 'detect_leaks=1:halt_on_error=1', UBSAN_OPTIONS: 'halt_on_error=1' }));
  }
  const compilerVersion = win ? run('cmd.exe', ['/d', '/c', 'cl 2>&1'], output, env).trim()
    : run(compiler, ['--version'], output, env).trim();
  return { library, compilerVersion, log: log.join('\n'), env };
}
