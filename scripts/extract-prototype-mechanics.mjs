import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {transform} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {readParitySource,parityDirectory} from './prototype-parity-tools.mjs';

const {lock,files}=readParitySource();
const modules=['castSequence','strikeTiming','groundDevices','buffSource','projectileArts','summonArts','cohortArts','frameArts','channelFormation','summonPacts','battleDoctrines','minionTransmutation'];
const included=new Set(modules.map(name=>'src/engine/'+name+'.ts'));
const damage=new Set(['applyHit','applyDot','mitigateTyped','landLifeDamage','ailmentWoundBasis','skillAbsorbAmount','skillDamageBands']);
const rows=[],external=new Map(),sources={},contracts={};
const ownedBindings={
  Actor:'function(name,team,pos){return w.allocateActor(name,team,pos);}',
  rand:'(a,b)=>a+w.random()*(b-a)',randInt:'(a,b)=>Math.floor(a+w.random()*(b+1-a))',
  chance:'value=>w.random()<value',pick:'values=>values[Math.floor(w.random()*values.length)]',
  cosmeticSkillPaint:'(_owner,actor,id)=>w.host.presentation?.cosmetic?.(actor.id,id)??{}',
  mimicCapture:'(_owner,actor,source,definition)=>w.mimic.capture(actor,source,definition,w.time)',
  SIM_TAP:'{get current(){return w.observers;}}',
};
for(const name of modules){
  const file='src/engine/'+name+'.ts',bytes=files.get(file);assert(bytes,file);sources[file]=sha256(bytes);
  const source=ts.createSourceFile(file,bytes.toString(),ts.ScriptTarget.Latest,true),exports=[];
  for(const node of source.statements)if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){
    if(ts.isClassDeclaration(node)||ts.isFunctionDeclaration(node))exports.push(node.name.text);
    if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations){assert(ts.isIdentifier(d.name));exports.push(d.name.text);}
  }
  const raw=source.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(source).replace(/^export /,'')).join('\n');
  const js=(await transform(raw,{loader:'ts',target:'es2022',legalComments:'none'})).code.replaceAll('Math.random','(() => w.random())');
  const ast=ts.createSourceFile(name+'.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),used=new Set();
  const visit=node=>{if(ts.isIdentifier(node))used.add(node.text);ts.forEachChild(node,visit);};visit(ast);
  const bindings=[],deps=new Set();
  for(const node of source.statements.filter(ts.isImportDeclaration)){
    const clause=node.importClause;if(!clause||clause.isTypeOnly)continue;
    assert(!clause.name,'Default mechanic imports require review');const named=clause.namedBindings;if(!named)continue;assert(ts.isNamedImports(named));
    for(const item of named.elements){if(item.isTypeOnly||!used.has(item.name.text))continue;
      const local=item.name.text,imported=(item.propertyName??item.name).text,dependency=path.posix.normalize(path.posix.join('src/engine',node.moduleSpecifier.text))+'.ts';
      let binding;
      if(ownedBindings[imported])binding=`const ${local} = ${ownedBindings[imported]};`;
      else if(dependency==='src/engine/ai.ts'&&imported==='issueCommand'){
        const bytes=files.get(dependency);sources[dependency]=sha256(bytes);
        const ast=ts.createSourceFile(dependency,bytes.toString(),ts.ScriptTarget.Latest,true);
        const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===imported);assert(declaration);
        binding=(await transform(declaration.getText(ast).replace(/^export /,''),{loader:'ts',target:'es2022'})).code;
      }
      else if(dependency==='src/engine/damage.ts'&&damage.has(imported))binding=`const ${local} = (...args) => w.damage.${imported}(...args);`;
      else if(dependency==='src/engine/world.ts'){assert.equal(imported,'inAoe');binding=`const ${local} = (...args) => w.inAoe(...args);`;}
      else if(included.has(dependency)){deps.add(path.posix.basename(dependency,'.ts'));binding=`const ${local} = library.${imported};`;}
      else{const row={name:local,imported,source:dependency};if(external.has(local))assert.deepEqual(external.get(local),row);else external.set(local,row);binding=`const ${local} = q.${local};`;}
      bindings.push(binding);
    }
  }
  rows.push({name,exports,deps:[...deps],code:`function ${name}(w,q,library) {\n${bindings.join('\n')}\n${js}\nreturn {${exports.join(',')}};\n}\n`});
}
{
  const file='src/engine/world.ts',bytes=files.get(file);sources[file]=sha256(bytes);
  const ast=ts.createSourceFile(file,bytes.toString(),ts.ScriptTarget.Latest,true);
  const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert(world);
  const names=['projectileArts','cohortArts','frameArts','summonArts','channelFormations','battleDoctrines','summonPacts','deviceContacts','losMemo','relocationHosts'];
  const methods=['forwardSummonSockets','resyncMinionSupports','summonCrewSkills','clearTreeFields','clearSummonReleaseFields','movementLocked','tryShellBlock','mintMetaInstance','autonomousMetas','deviceCommandUseful','losCached','echoCeiling','consumeChargeCost',
    'mintAftermath','dropLingerField','layFissure','moveBlast','mintTrailPatch','statTrailSpec','clampGroundTarget',
    'enemiesOf','healAlliesInArea','spawnAftershocks','releaseStruckSummons',
    'updateTerraforms','doctrineGrowths','updateDoodadEffects','isEffectTarget','nearestInReach','effectGrowthLash','chargesThroughSeat'];
  const printer=ts.createPrinter({removeComments:true});
  const methodBodies=methods.map(name=>{
    const member=world.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);assert(member,name);
    let selected=member;
    if(name==='clearTreeFields'){
      const loop=member.body.statements.find(n=>ts.isForOfStatement(n)&&n.getText(ast).includes('treeBuffSources'));assert(loop);
      const replacement=ts.factory.createExpressionStatement(ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'),'retireTreeBuffs'),undefined,[ts.factory.createIdentifier('caster'),ts.factory.createIdentifier('inst')]));
      selected=ts.factory.updateMethodDeclaration(member,member.modifiers,member.asteriskToken,member.name,member.questionToken,member.typeParameters,member.parameters,member.type,
        ts.factory.updateBlock(member.body,member.body.statements.map(n=>n===loop?replacement:n)));
    }
    let body=printer.printNode(ts.EmitHint.Unspecified,selected,ast).replace(/^private /,'').replace(/\bthis\b/g,'w');
    // Only combat-authored, owner-scoped growths enter this clock. Static world
    // fixtures remain with the host and can never be harvested by a doctrine.
    if(['updateTerraforms','updateDoodadEffects'].includes(name))body=body.replaceAll('w.doodads','w.combatGrowthDoodads');
    return body;
  });
  const update=world.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='updateConstructs');assert(update);
  const clauses=[];const collect=n=>{if(ts.isCaseClause(n)&&['trap','mine'].includes(n.expression.text))clauses.push(n);ts.forEachChild(n,collect);};collect(update);
  assert.equal(clauses.length,2);
  methodBodies.push('updateGroundDevice(c,dt){const st=c.construct;switch(st.kind){'+clauses.map(n=>printer.printNode(ts.EmitHint.Unspecified,n,ast).replace(/\bthis\b/g,'w')).join('\n')+'default:return false;}return true;}');
  const helpers=['flattenPulseQueue'].map(name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return fn.getText(ast);}).join('\n');
  const initializers=helpers+'\n'+names.map(name=>{const member=world.members.find(n=>ts.isPropertyDeclaration(n)&&n.name.getText(ast)===name);assert(member?.initializer,name);return `w.${name} = ${member.initializer.getText(ast).replace(/\bthis\b/g,'w')};`;}).join('\n')
    +'\nObject.assign(w, {'+methodBodies.join(',\n')+'});';
  const js=(await transform(initializers,{loader:'ts',target:'es2022',legalComments:'none'})).code;
  const parsed=ts.createSourceFile('controllers.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),used=new Set();
  const visit=n=>{if(ts.isIdentifier(n))used.add(n.text);ts.forEachChild(n,visit);};visit(parsed);
  const bindings=[];
  for(const node of ast.statements.filter(ts.isImportDeclaration)){
    const named=node.importClause?.namedBindings;if(!named||!ts.isNamedImports(named))continue;
    for(const item of named.elements){if(!used.has(item.name.text))continue;
      const local=item.name.text,imported=(item.propertyName??item.name).text,dependency=path.posix.normalize(path.posix.join('src/engine',node.moduleSpecifier.text))+'.ts';
      if(ownedBindings[imported])bindings.push(`const ${local}=${ownedBindings[imported]};`);
      else if(included.has(dependency))bindings.push(`const ${local}=library.${imported};`);
      else if(dependency==='src/engine/damage.ts'&&damage.has(imported))bindings.push(`const ${local}=(...args)=>w.damage.${imported}(...args);`);
      else{const row={name:local,imported,source:dependency};if(external.has(local))assert.deepEqual(external.get(local),row);else external.set(local,row);bindings.push(`const ${local}=q.${local};`);}
    }
  }
  rows.push({name:'controllers',exports:[],deps:[...modules],code:`function controllers(w,q,library){\n${bindings.join('\n')}\n${js}\nreturn {};\n}\n`});
}
{
  // Keep the original delivery families separate. The engine World, menus,
  // quest recording and storage never enter this executable closure.
  const file='src/engine/world.ts',ast=ts.createSourceFile(file,files.get(file).toString(),ts.ScriptTarget.Latest,true);
  const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
  const execute=world.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='executeSkill');
  const dispatch=execute.body.statements.find(n=>ts.isSwitchStatement(n)&&n.expression.getText(ast)==='d.type');assert(dispatch);
  const printer=ts.createPrinter({removeComments:true}),functions=[];
  const locals=['caster','inst','aim','opts','targetInfo','targetSpec','origin','d','tags','extra','useMult','gPow','ventRounds','corpseFeast','flatBonus','aoeScale','arcScale','cosmeticColor'];
  const switchIndex=execute.body.statements.indexOf(dispatch);assert.equal(switchIndex,57,'Review prototype execution phase boundaries');
  const before=execute.body.statements.slice(0,switchIndex);
  const campaign=before.filter(n=>n.getText(ast).includes('metaProgressionActive()'));assert.equal(campaign.length,1);
  const observed=before.filter(n=>n.getText(ast).startsWith('SIM_TAP.current'));assert.equal(observed.length,1);
  const phase=(nodes,preparation=false)=>{
    const converted=ts.transform(ts.factory.createBlock(nodes,true),[context=>node=>{
      let nested=0;
      const visit=n=>{
        if(n.kind===ts.SyntaxKind.ThisKeyword)return ts.factory.createIdentifier('$combatOwner');
        if(ts.isCallExpression(n)&&n.expression.getText(ast)==='this.treeBuffSources.set')return ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('$combatOwner'),'associateTreeBuff'),undefined,n.arguments.map(a=>ts.visitNode(a,visit)));
        if(preparation&&ts.isReturnStatement(n)&&nested===0)return ts.factory.createReturnStatement(ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('completed',ts.visitNode(n.expression,visit))]));
        if(ts.isFunctionLike(n)){nested++;try{return ts.visitEachChild(n,visit,context);}finally{nested--;}}
        return ts.visitEachChild(n,visit,context);
      };return ts.visitNode(node,visit);
    }]);
    try{return printer.printNode(ts.EmitHint.Unspecified,converted.transformed[0],ast).slice(1,-1);}finally{converted.dispose();}
  };
  const observation=ts.createSourceFile('observation.ts','w.observers.cast?.(caster,inst,!!opts.noRepeat);',ts.ScriptTarget.Latest,true).statements[0];
  const preparation=phase(before.filter(n=>!campaign.includes(n)).map(n=>observed.includes(n)?observation:n),true);
  functions.push(`function preparePrototype(caster,inst,aim,opts={}){${preparation}\nreturn {${locals.join(',')},effectTier,fieldAt};}`);
  assert.equal(execute.body.statements[61].kind,ts.SyntaxKind.ForOfStatement);
  assert(ts.isReturnStatement(execute.body.statements[81]));
  functions.push(`function completePrototype(frame){const {${locals.join(',')},effectTier}=frame,def=inst.def;${phase(execute.body.statements.slice(62,81))}}`);
  for(const clause of dispatch.caseBlock.clauses){
    assert(ts.isCaseClause(clause));const name=clause.expression.text;assert(/^[a-zA-Z]+$/.test(name));
    const block=ts.factory.createBlock(clause.statements,true);
    const converted=ts.transform(block,[context=>node=>{
      const visit=n=>{
        if(n.kind===ts.SyntaxKind.ThisKeyword)return ts.factory.createIdentifier('$combatOwner');
        if(ts.isBreakStatement(n)&&!n.label){
          let parent=n.parent;while(parent!==clause&&!ts.isIterationStatement(parent,false)&&!ts.isSwitchStatement(parent))parent=parent.parent;
          if(parent===clause)return ts.factory.createReturnStatement(ts.factory.createIdentifier('fieldAt'));
        }
        return ts.visitEachChild(n,visit,context);
      };return ts.visitNode(node,visit);
    }]);
    try{functions.push(`function ${name}(frame){const {${locals.join(',')}}=frame;const effectTier=frame.effectTier??frame.opts.tier??caster.tier,def=inst.def;let fieldAt=null;${printer.printNode(ts.EmitHint.Unspecified,converted.transformed[0],ast)} return fieldAt;}`);}
    finally{converted.dispose();}
  }
  const helper=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='flattenPulseQueue');assert(helper);
  const corpse=ast.statements.filter(ts.isVariableStatement).flatMap(n=>n.declarationList.declarations).find(n=>n.name.getText(ast)==='CORPSE_CFG');assert(corpse);
  const text=`const $combatOwner=w;const inAoe=(...a)=>w.inAoe(...a),inAoeBody=(...a)=>w.inAoeBody(...a),statusReqs=(...a)=>w.statusReqs(...a);\nconst ${corpse.getText(ast)};\n${helper.getText(ast)}\n${functions.join('\n')}\nconst deliveryFamilies={${dispatch.caseBlock.clauses.map(c=>c.expression.text).join(',')}};\nfunction deliverPrototype(frame){const run=deliveryFamilies[frame.d.type];if(!run)throw Error('Unsupported prototype delivery: '+frame.d.type);return run(frame);}`;
  const js=(await transform(text,{loader:'ts',target:'es2022',legalComments:'none'})).code.replaceAll('Math.random','(() => w.random())');
  const parsed=ts.createSourceFile('deliveries.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),used=new Set();
  const required=new Set();
  const visit=n=>{if(ts.isIdentifier(n))used.add(n.text);
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(parsed)==='$combatOwner')required.add(n.expression.name.text);
    ts.forEachChild(n,visit);};visit(parsed);contracts.deliveries=[...required].sort();
  const bindings=[];
  for(const node of ast.statements.filter(ts.isImportDeclaration)){
    const named=node.importClause?.namedBindings;if(!named||!ts.isNamedImports(named))continue;
    for(const item of named.elements){if(item.isTypeOnly||!used.has(item.name.text))continue;
      const local=item.name.text,imported=(item.propertyName??item.name).text,dependency=path.posix.normalize(path.posix.join('src/engine',node.moduleSpecifier.text))+'.ts';
      if(ownedBindings[imported])bindings.push(`const ${local}=${ownedBindings[imported]};`);
      else if(imported==='rollCount')bindings.push(`const ${local}=(spec,bonus)=>spec===undefined?Math.max(0,1+bonus):typeof spec==='number'?Math.max(0,spec+bonus):Math.max(0,spec[0]+bonus+Math.floor(w.random()*(spec[1]-spec[0]+1)));`);
      else if(included.has(dependency))bindings.push(`const ${local}=library.${imported};`);
      else if(dependency==='src/engine/damage.ts'){
        assert(damage.has(imported),'Unreviewed delivery damage dependency: '+imported);bindings.push(`const ${local}=(...args)=>w.damage.${imported}(...args);`);
      }else{const row={name:local,imported,source:dependency};if(external.has(local))assert.deepEqual(external.get(local),row);else external.set(local,row);bindings.push(`const ${local}=q.${local};`);}
    }
  }
  rows.push({name:'deliveries',exports:['preparePrototype','deliverPrototype','completePrototype'],deps:[...modules],code:`function deliveries(w,q,library){\nfor(const name of ${JSON.stringify(contracts.deliveries)})if(typeof w[name]!=='function')throw Error('Missing prototype delivery service: '+name);\n${bindings.join('\n')}\n${js}\nreturn {preparePrototype,deliverPrototype,completePrototype};\n}\n`});
}
for(const[name,source]of [['damageDialMods','src/data/monsterDamage.ts'],['manaPoolMods','src/data/monsterMana.ts'],['bodyTellSpecs','src/engine/intent.ts'],['DamageTextBursts','src/world/damageText.ts'],['skillFieldVisual','src/engine/skillFieldVisual.ts'],['castingDamageTags','src/engine/castingCues.ts'],['summonKitIds','src/engine/skills.ts']]){
  assert(!external.has(name));external.set(name,{name,imported:name,source});
}
const ordered=[],pending=[...rows];
while(pending.length){const index=pending.findIndex(row=>row.deps.every(dep=>ordered.some(r=>r.name===dep)));assert(index>=0,'Cyclic mechanic factories');ordered.push(...pending.splice(index,1));}
const code='// Mechanically extracted from the separately pinned prototype parity revision.\n'
  +'// All mutable controllers and randomness belong to one combat owner.\n'
  +ordered.map(row=>row.code).join('\n')
  +'export function createPrototypeMechanics(w,q) {\nconst library={};\n'
  +ordered.map(row=>`Object.assign(library,${row.name}(w,q,library));`).join('\n')+'\nreturn Object.freeze(library);\n}\n';
const output='adapters/embedded/combat-prototype-mechanics.mjs',manifest={schemaVersion:1,sourceCommit:lock.commit,sources,
  modules:ordered.map(({name,exports,deps})=>({name,exports,deps})),contracts,queries:[...external.values()].sort((a,b)=>a.name.localeCompare(b.name)),
  alterations:['Instance-owned random source','Shared SDK damage pipeline','Host geometry through the existing combat owner','No original World runtime import',
    'Selected World controller initializers and combat methods bind to the SDK owner','Tree buff retirement uses the existing owner-scoped SDK ledger',
    'Delivery families extracted separately with case-level break converted to return; frame locals supplied by preparation',
    'Preparation and aftermath retain source order; campaign deed recording is omitted and cast observation uses the owner observer',
    'Original actor allocation, presentation lookup and observation tap bind to instance-owned SDK services',
    'Original field aftermath methods and pure pulse-queue helper retain explicit effect layers',
    'Terraform and growth-effect clocks own only transient combat growths; static host scenery is never mutated or harvested'],outputs:{[output]:sha256(code)}};
const acceptance=path.join(parityDirectory,'mechanics-extraction.json');
if(process.argv.includes('--check')){assert.equal(fs.readFileSync(path.join(root,output),'utf8'),code);assert.deepEqual(JSON.parse(fs.readFileSync(acceptance)),manifest);}
else{if(process.argv.includes('--update-draft')){const previous=JSON.parse(fs.readFileSync(acceptance));assert.equal(sha256(fs.readFileSync(path.join(root,output))),previous.outputs[output],'Generated mechanics have other edits');}
  else assert(!fs.existsSync(path.join(root,output)),'Mechanics already extracted; review edits instead of overwriting');fs.writeFileSync(path.join(root,output),code);writeJSON(acceptance,manifest);}
console.log(JSON.stringify({modules:rows.length,queries:external.size,bytes:Buffer.byteLength(code)}));
