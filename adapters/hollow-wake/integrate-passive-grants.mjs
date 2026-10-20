import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { root, sha256 } from '../../scripts/reference-utils.mjs';
const worldFile = 'src/engine/world.ts', editorFile = 'src/dev/passiveEditor.ts', bridgeFile = 'src/engine/passiveGrantAdapter.ts';
const lf = s => s.replaceAll('\r\n','\n');
const once = (source, before, after) => { assert.equal(source.split(before).length,2,`Ambiguous passive grant anchor: ${before.slice(0,80)}`); return source.replace(before,after); };
function method(source) {
  const ast = ts.createSourceFile(worldFile,source,ts.ScriptTarget.Latest,true);
  const owner = ast.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'World');
  const matches = owner?.members.filter(m => ts.isMethodDeclaration(m) && m.name.getText(ast) === 'recalcSeat') ?? [];
  assert.equal(matches.length,1,'Ambiguous World.recalcSeat');
  const m = matches[0]; return { start:m.getStart(ast),end:m.end,text:source.slice(m.getStart(ast),m.end) };
}
function range(source, begin, end, replacement) {
  assert.equal(source.split(begin).length,2); assert.equal(source.split(end).length,2);
  const a=source.indexOf(begin),b=source.indexOf(end);assert.ok(b>a);return source.slice(0,a)+replacement+source.slice(b);
}
export function renderPassiveGrants(world,editor,referenceWorld,referenceEditor) {
  const source=lf(world), original=method(lf(referenceWorld)), target=method(source);
  assert.equal(target.text,original.text,'Unreviewed recalcSeat; refusing grant patch');
  assert.equal(lf(editor),lf(referenceEditor),'Unreviewed passive editor; refusing refresh patch');
  assert.ok(!source.includes('beginSdkPassiveGrants'),'Grant adapter already applied');
  let body=target.text;
  body=range(body,'    // Effective attributes =','    // GEAR:',
    "    const passiveBuild = beginSdkPassiveGrants(m);\n    const passiveMods = passiveBuild.passiveModifiers;\n    const wornConduits = passiveBuild.conduits;\n    p.wornConduits = wornConduits.length ? wornConduits : undefined;\n");
  body=range(body,'    for (const slot of EQUIP_SLOTS) {\n      const worn = m.equipped[slot.id];\n      if (!worn) continue;\n      const sheetMods: Modifier[] = [];','    // THE CONTAINER FOLD',
    "    for (const slot of EQUIP_SLOTS) {\n      const worn = m.equipped[slot.id];\n      if (worn) gearSheetMods.set(slot.id, passiveBuild.addItemModifiers(compileItemMods(worn)));\n    }\n");
  body=once(body,`        for (const gm of mods) {
          if (isAttributeId(gm.stat)) {
            if (gm.kind === 'flat') attrs[gm.stat] += gm.value;
            else if (gm.kind === 'increased') attrsPct[gm.stat] += gm.value;
          } else {
            sheetMods.push(gm);
          }
        }`, '        sheetMods.push(...passiveBuild.addItemModifiers(mods));');
  body=range(body,'    // THE PERCENT PHASE:','    m.attrs = attrs;', '    const attrs = passiveBuild.attributes() as Attributes;\n');
  body=once(body,'    p.setAttributes(attrs);',"    p.attributeValues = { ...attrs };\n    p.sheet.setSource('attributes', passiveBuild.attributeModifiers());");
  body=once(body,'for (const s of graftSourcesOf(m.allocated, m.choices, PASSIVE_NODES)) {','for (const s of passiveBuild.grafts) {');
  let nextWorld=source.slice(0,target.start)+body+source.slice(target.end);
  nextWorld=once(nextWorld,'type TetherSpec, type ConduitSpec, type ImpactDressSpec,','type TetherSpec, type ImpactDressSpec,');
  nextWorld=once(nextWorld,'choiceLockReason, choiceOptionOf, chosenOf, graftSourcesOf,','choiceLockReason, graftSourcesOf,');
  nextWorld=once(nextWorld,'{ ATTRIBUTE_IDS, ATTRIBUTES,','{ ATTRIBUTES,');
  nextWorld=once(nextWorld,", isAttributeId } from './stats';"," } from './stats';");
  // Preserve the original registration evaluation order: the bridge is the final import.
  const imports=ts.createSourceFile(worldFile,nextWorld,ts.ScriptTarget.Latest,true).statements.filter(ts.isImportDeclaration);
  const importEnd=imports.at(-1).end;
  nextWorld=nextWorld.slice(0,importEnd)+"\nimport { beginSdkPassiveGrants } from './passiveGrantAdapter';"+nextWorld.slice(importEnd);
  let nextEditor="import { refreshSdkPassiveGrants } from '../engine/passiveGrantAdapter';\n"+lf(editor);
  nextEditor=once(nextEditor,'  document.body.append(panel);',`  document.body.append(panel);
  for (const event of ['input', 'change', 'click']) panel.addEventListener(event, refreshSdkPassiveGrants, true);`);
  nextEditor=once(nextEditor,'  const createNodeAt = (x: number, y: number): void => {','  const createNodeAt = (x: number, y: number): void => {\n    refreshSdkPassiveGrants();');
  nextEditor=once(nextEditor,'  const deleteNode = (id: string): void => {','  const deleteNode = (id: string): void => {\n    refreshSdkPassiveGrants();');
  return {world:nextWorld,editor:nextEditor};
}
export function integratePassiveGrants(game,write=true) {
  const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  const reference=Object.fromEntries([worldFile,editorFile].map(file=>{
    const bytes=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(bytes),lock.files[file]);return[file,bytes.toString('utf8')];
  }));
  const world=fs.readFileSync(path.join(game,worldFile),'utf8'),editor=fs.readFileSync(path.join(game,editorFile),'utf8');
  assert.ok(!fs.existsSync(path.join(game,bridgeFile)),'Refusing to overwrite grant bridge');
  const rendered=renderPassiveGrants(world,editor,reference[worldFile],reference[editorFile]);
  if(write) {
    fs.writeFileSync(path.join(game,worldFile),rendered.world.replaceAll('\n',world.includes('\r\n')?'\r\n':'\n'));
    fs.writeFileSync(path.join(game,editorFile),rendered.editor.replaceAll('\n',editor.includes('\r\n')?'\r\n':'\n'));
    fs.copyFileSync(path.join(root,'adapters/hollow-wake/passiveGrantAdapter.ts'),path.join(game,bridgeFile));
  }
  return {files:[worldFile,editorFile,bridgeFile]};
}
