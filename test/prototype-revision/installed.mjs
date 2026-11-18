import assert from 'node:assert/strict';import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createInventoryInspector} from '@hollow-wake/characters/inspection';
import {createCharacterBuilds,characterSkillQueries} from '@hollow-wake/character-builds';
const json=url=>JSON.parse(fs.readFileSync(url));
const builds=json(new URL(import.meta.resolve('@hollow-wake/character-builds/builds.json')));
const p=json(new URL(import.meta.resolve('@hollow-wake/characters/inspection.json')));
const expected=json(new URL('./revision-observations.json',import.meta.url));assert(expected.originalOnly);
const accepted=json(new URL('./revision-acceptance.json',import.meta.url));
const{sourceCommit,buildContentId,terms,...authored}=p;
assert.equal(sourceCommit,accepted.sourceCommit);
assert.equal(createHash('sha256').update(JSON.stringify(authored)+'\n').digest('hex'),accepted.fixtures.inspection.sha256,'Compiled inspection differs from original-only capture');
const inspector=createInventoryInspector(builds,p);let checks=0;
const itemCourse=JSON.parse(gunzipSync(fs.readFileSync(new URL('./revision-items.json.gz',import.meta.url))));
assert(itemCourse.originalOnly);assert.equal(itemCourse.itemsId,builds.items.id);
for(const[n,row]of itemCourse.cases.entries()){
 assert.deepEqual(inspector.item(row.item),row.expected.observation,row.label);
 assert.deepEqual(inspector.compare(row.item,itemCourse.cases[(n+itemCourse.cases.length-1)%itemCourse.cases.length].item),row.expected.comparison,row.label+' compare');checks++;
}
for(const[kind,rows]of Object.entries(p.cards))for(const[id,c]of Object.entries(rows)){
 assert.deepEqual(inspector.card(kind,id,'full'),{name:c.name,description:c.description,hasFullDetail:!!c.references.length,references:c.references});
 assert.deepEqual(inspector.card(kind,id).references,[]);checks++;
}
for(const[skill,rows]of Object.entries(p.trees))for(const[id,c]of Object.entries(rows)){
 assert.deepEqual(inspector.treeNode(skill,id,'full'),{name:c.name,description:c.description,hasFullDetail:!!c.references.length,references:c.references});checks++;
}
for(const[id,s]of Object.entries(p.stats)){
 assert.deepEqual(inspector.stat(id,'full'),{name:s.name,description:s.description,base:s.base,percent:s.percent,hasFullDetail:!!s.detail&&s.detail!==s.description,detail:s.detail!==s.description?s.detail:null});
 assert.equal(inspector.stat(id).detail,null);checks++;
}
for(const row of expected.triggers){assert.deepEqual(inspector.triggerReferences(row.mods),row.result);checks++;}
const def=builds.definitions.skills.decoy,inst={def,level:20,rarity:'legendary',bonusLevels:0,sockets:Array(5).fill(null),treeNodes:[expected.decoy.node]};
assert.deepEqual([...characterSkillQueries.skillContextTags(inst)],expected.decoy.tags);
assert(!expected.decoy.tags.includes('buff'),'The authored tag removal was lost');
// The actual compiled build service must admit supports using the revised tags.
const service=createCharacterBuilds(builds),cls=builds.definitions.classes[0];
const input={level:40,classId:cls.id,baseAttrs:Object.fromEntries(builds.passives.attributes.map(a=>[a.id,0])),allocated:[],choices:{},grafts:{},equipped:{},containers:{},features:[],relicEnabled:false,relicEmpowerment:0,
 learned:[{gem:{kind:'skill',skillId:'decoy',level:20,rarity:'legendary',sockets:Array(5).fill(null),treeNodes:[def.tree.nodes[0].id,expected.decoy.node]}}]};
const token=service.open(input,['decoy',null,null,null,null,null,null,null]);
for(const[id,fits]of Object.entries(expected.decoy.supports)){assert.equal(service.canSocket(token,'decoy',id),fits,id);checks++;}
assert.equal(inspector.card('skills','__proto__'),null);assert.equal(inspector.treeNode('__proto__','x'),null);assert.equal(inspector.stat('__proto__'),null);
assert.throws(()=>inspector.card('quests','anything'));assert.throws(()=>inspector.stat('life','invalid'));
assert.throws(()=>inspector.triggerReferences([{stat:'proc_x',kind:'flat',value:NaN}]));
assert.throws(()=>inspector.card('skills',{}));
const refStat=Object.keys(p.refs)[0];
assert.deepEqual(inspector.triggerReferences([{stat:refStat,kind:'flat',value:0},{stat:refStat,kind:'flat',value:-1},{stat:refStat,kind:'increased',value:1}]),[]);
assert.throws(()=>createInventoryInspector(builds,{...p,buildContentId:'wrong'}));
assert.throws(()=>createInventoryInspector(builds,{...p,sourceCommit:undefined}));
const card=inspector.card('skills','decoy');card.description='changed';assert.notEqual(inspector.card('skills','decoy').description,card.description);
p.cards.skills.decoy.description='outside write';assert.notEqual(inspector.card('skills','decoy').description,p.cards.skills.decoy.description);
const unsupported=structuredClone(builds);unsupported.definitions.skills.decoy.tree.nodes[5].over={tags:{add:['buff']}};
assert.notDeepEqual([...characterSkillQueries.skillContextTags({...inst,def:unsupported.definitions.skills.decoy})],expected.decoy.tags,'Decoy fault was not detected');
console.log(JSON.stringify({passed:true,source:inspector.sourceCommit,inspectionChecks:checks,itemCases:itemCourse.cases.length,decoySupports:Object.keys(expected.decoy.supports).length,
 contracts:['unknown-ids','closed-category','closed-detail','finite-modifiers','string-ids','positive-flat-only','matching-content','pinned-source','detached-output','owned-input','decoy-fault']}));
