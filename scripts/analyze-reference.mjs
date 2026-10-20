import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { root, listFiles, writeJSON, verifyReference } from './reference-utils.mjs';
const reference = path.join(root, '.reference');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'), 'utf8'));
verifyReference(reference, lock);
const files = listFiles(path.join(reference, 'src')).filter(f => f.endsWith('.ts')).map(f => `src/${f}`);
const known = new Set(files);
const graph = new Map();
const unresolved = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(reference, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edges = [];
  for (const node of source.statements) {
    if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
    const spec = node.moduleSpecifier.text;
    if (!spec.startsWith('.')) continue;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    const target = [base, `${base}.ts`, `${base}/index.ts`, base.replace(/\.js$/, '.ts')].find(f => known.has(f));
    if (!target) { unresolved.push({ file, spec }); continue; }
    const clause = node.importClause;
    const typeOnly = !!(node.isTypeOnly || clause?.isTypeOnly ||
      (!clause?.name && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
        && clause.namedBindings.elements.length && clause.namedBindings.elements.every(e => e.isTypeOnly)));
    edges.push({ target, typeOnly });
  }
  graph.set(file, { lines: text.split(/\r?\n/).length, edges });
}
const roots = ['src/engine/stats.ts', 'src/engine/skills.ts', 'src/engine/inventory.ts',
  'src/engine/skillPreview.ts', 'src/data/passives.ts', 'src/data/vocations.ts', 'src/engine/world.ts'];
const summaries = roots.map(file => {
  const seen = new Set([file]), queue = [file], parent = new Map();
  for (let i = 0; i < queue.length; i++) for (const edge of graph.get(queue[i]).edges) {
    if (!edge.typeOnly && !seen.has(edge.target)) { seen.add(edge.target); parent.set(edge.target, queue[i]); queue.push(edge.target); }
  }
  const pathTo = target => {
    const result = [target];
    while (parent.has(target)) { target = parent.get(target); result.unshift(target); }
    return result;
  };
  return {
    file, lines: graph.get(file).lines,
    direct: graph.get(file).edges,
    staticRuntimeClosure: seen.size,
    groups: Object.fromEntries([...new Set(queue.map(f => f.split('/')[1]))].sort().map(group => [group, queue.filter(f => f.split('/')[1] === group).length])),
    exampleBoundaryPaths: ['meta', 'world', 'ui', 'render'].flatMap(group => {
      const target = queue.find(f => f.startsWith(`src/${group}/`));
      return target ? [pathTo(target)] : [];
    }),
  };
});
writeJSON(path.join(root, 'baseline/dependency-inventory.json'), {
  sourceCommit: lock.commit, sourceFiles: files.length,
  method: 'TypeScript AST of static imports/exports. Type-only declarations are reported separately and excluded from runtime reachability. Side-effect imports count. Runtime callbacks, dynamic imports and module side effects require further behavioral tracing; these counts are not a minimal extraction set.',
  roots: summaries, unresolved,
});
console.log(summaries.map(s => `${s.file}: ${s.staticRuntimeClosure} statically reachable runtime modules`).join('\n'));
