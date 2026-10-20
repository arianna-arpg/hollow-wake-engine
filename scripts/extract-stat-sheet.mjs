// One-time mechanical extraction. Runtime source is reviewed and maintained directly.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { root, verifyReference } from './reference-utils.mjs';
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'), 'utf8'));
if (fs.existsSync(path.join(root, 'src/stats.ts'))) throw new Error('StatSheet was already extracted and is maintained directly. Refusing to overwrite reviewed refactors.');
verifyReference(path.join(root, '.reference'), lock);
const source = fs.readFileSync(path.join(root, '.reference/src/engine/stats.ts'), 'utf8');
const ast = ts.createSourceFile('stats.ts', source, ts.ScriptTarget.Latest, true);
const node = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'StatSheet');
if (!node) throw new Error('StatSheet declaration missing');
let text = ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, node, ast);
text = text
  .replace('export class StatSheet {', 'export class StatSheet {\n    constructor(private readonly rules: StatRules) {}\n    private generation = 0;\n    get revision(): number { return this.generation; }')
  .replace('this.cache.clear();', 'this.generation++;\n        this.cache.clear();')
  .replaceAll('STAT_DEFS[stat]', 'this.rules.definitions[stat]')
  .replaceAll('staticallyArmed(prefix + id)', 'this.rules.staticallyArmed(prefix + id)')
  .replace('for (const t of STAT_TRADES)', 'for (const t of this.rules.incoming[stat] ?? [])')
  .replace('for (const t of STAT_TRADES)', 'for (const t of this.rules.outgoing[stat] ?? [])')
  .replace('this.sources.set(name, mods);', 'for (const mod of mods) validateModifier(mod);\n        this.sources.set(name, freeze(copy(mods)));')
  .replace('this.baseOverrides.set(stat, value);', "finite(value, stat);\n        this.baseOverrides.set(stat, value);")
  .replace("const key = active.slice().sort().join(',');", "const key = JSON.stringify([...new Set(active)].sort());")
  .replace("const key = entries.map(([k, v]) => k + ':' + v).sort().join('|');",
    "for (const [id, value] of entries) finite(value, id);\n        if (new Set(entries.map(([id]) => id)).size !== entries.length) throw new Error('Duplicate gauge id');\n        const key = JSON.stringify(entries.slice().sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));")
  .replace("return this.sources.get(name);", "const mods = this.sources.get(name); return mods ? copy(mods) : undefined;")
  .replace("key = (noLinks ? '§' : '') + (contextTags && contextTags.size\n                ? stat + '|' + [...contextTags].sort().join(',')\n                : stat);",
    "key = JSON.stringify([noLinks, stat, contextTags ? [...contextTags].sort() : []]);")
  .replace('return fam.ids;', 'return fam.ids;');
if (text.includes('STAT_DEFS') || text.includes('STAT_TRADES') || text.includes("'§'")) throw new Error('Unexpected source shape; review extraction');
fs.writeFileSync(path.join(root, 'src/stats.ts'),
  "// Derived from Hollow Wake StatSheet; provenance is pinned in baseline/source-lock.json.\n"
  + "// Refactors: instance rules, indexed trades, owned modifier arrays, collision-free cache keys.\n"
  + "import { StatRules, modReadsVictim, validateModifier, type Modifier, type SkillTag, type ConditionId, type ArmedFamily } from './stat-rules.js';\n"
  + "import { copy, finite, freeze } from './validation.js';\n\n" + text + '\n');
console.log('Extracted StatSheet with explicit rule ownership.');
