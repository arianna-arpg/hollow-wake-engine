import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import {CraftingSession} from '@hollow-wake/engine/crafting/session';
import {WorkshopRack} from '@hollow-wake/engine/skills/workshop-rack';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {ItemContent} from '@hollow-wake/engine/items';
import {itemPack} from './compile-item-content.mjs';
import {craftingPack} from './compile-crafting-content.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';
import {root,sha256} from './reference-utils.mjs';

// Disposable databases only. Compare the shipping checkpoint row with a
// separate account row, preserving the JSON property position on reassembly.
const [out]=process.argv.slice(2);assert(out&&!fs.existsSync(out),'Supply a new report filename');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const source=read('evidence/content-tables/windows.json'),raw=fs.readFileSync(path.join(root,source.raw.file));
assert.equal(sha256(raw),source.raw.sha256);
const course=JSON.parse(gunzipSync(raw)).course;
const s=structuredClone(course.rows.map(r=>r.expected.save).find(s=>s?.state.items.length===128));
const fire=read('examples/godot-inventory/cargo-sample.json').find(i=>i.gem?.kind==='skill'),last=s.state.items.at(-1);
s.state.items[127]={...fire,x:last.x,y:last.y};s.nextUid=Math.max(s.nextUid,fire.uid+1);
const items=new ItemContent(itemPack()),session=new CraftingSession({crafting:new CraftingContent(craftingPack(items),items),
  skills:new SkillProgression(skillProgressionPack()),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}},1,new WorkshopRack());
const cmd=(op,args={})=>session.command({op,profile:1,...args});
assert(cmd('restore',{save:s}).ok);
const snapshots=[];
function capture(label){const r=session.snapshotText(1);assert(r.ok);snapshots.push({label,text:r.text});}
capture('restored');
assert(cmd('learn-skill',{uid:fire.uid,meets:true,blocked:{},slot:4}).result.changed);capture('learn');
assert(cmd('unlearn-skill',{skillId:'firebolt',blocked:{}}).result.changed);capture('return');
// Change lore through the normal forge and salvage actions too.
const forged=cmd('mint',{kind:'forge',options:{baseId:'ring_lapis',ilvl:40,rarity:'rare',fillRandom:true}});
assert(forged.ok&&forged.result.uid);capture('forge');
const broken=cmd('salvage',{uid:forged.result.uid,lane:'break',access:{salvage:true,bench:true,oracle:false,counter:false}});
assert(broken.ok);capture('salvage-and-study');
assert.notDeepEqual(JSON.parse(snapshots.at(-1).text).state.account,JSON.parse(snapshots.at(-2).text).state.account);

const parent=fs.realpathSync(path.join(root,'.artifacts')),scratch=fs.mkdtempSync(path.join(parent,'slot-layout-'));
function exercise(split){
  const file=path.join(scratch,split?'split.db':'current.db'),db=new DatabaseSync(file);
  try{
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA trusted_schema=OFF; PRAGMA synchronous=EXTRA; PRAGMA cache_size=-256;');
    db.exec('CREATE TABLE slots(slot INTEGER PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),crafting TEXT NOT NULL,stash TEXT NOT NULL) STRICT');
    if(split)db.exec('CREATE TABLE accounts(slot INTEGER PRIMARY KEY,body TEXT NOT NULL) STRICT');
    const insert=db.prepare('INSERT INTO slots(slot,revision,crafting,stash) VALUES(1,1,?,?)');
    const update=db.prepare('UPDATE slots SET revision=revision+1,crafting=?,stash=? WHERE slot=1 AND revision=?');
    const readBack=()=>{
      const reader=new DatabaseSync(file,{readOnly:true});
      try{
        const row=reader.prepare('SELECT revision,crafting,stash FROM slots WHERE slot=1').get();
        if(split){
          const save=JSON.parse(row.crafting);
          save.state.account=JSON.parse(reader.prepare('SELECT body FROM accounts WHERE slot=1').get().body);
          row.crafting=JSON.stringify(save);
        }
        return row;
      }finally{reader.close();}
    };
    const stages=[];let previousAccount;
    for(const [index,{label,text}] of snapshots.entries()){
      const save=JSON.parse(text),account=JSON.stringify(save.state.account);
      if(split)save.state.account=null;
      const body=JSON.stringify(save);
      function stage(){
        db.exec('BEGIN IMMEDIATE');
        assert.equal((index?update.run(body,'[]',index):insert.run(body,'[]')).changes,1);
        if(split&&previousAccount!==account)db.prepare('INSERT INTO accounts VALUES(1,?) ON CONFLICT(slot) DO UPDATE SET body=excluded.body').run(account);
      }
      stage();
      const journalBytes=fs.statSync(file+'-journal').size;
      if(index){
        db.exec('ROLLBACK');
        const before=readBack();assert.equal(before.revision,index);assert.equal(before.crafting,snapshots[index-1].text);
        stage();
      }
      db.exec('COMMIT');const after=readBack();
      assert.equal(after.crafting,text);assert.equal(after.revision,index+1);assert.equal(after.stash,'[]');
      stages.push({label,checkpointBytes:Buffer.byteLength(text),boundPayloadBytes:Buffer.byteLength(body)+2+
        (split&&previousAccount!==account?Buffer.byteLength(account):0),journalBytes});
      previousAccount=account;
    }
    db.exec('BEGIN IMMEDIATE');assert.equal(update.run('{}','[]',1).changes,0);db.exec('ROLLBACK');
    assert.equal(readBack().crafting,snapshots.at(-1).text);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    return {sqlite:db.prepare('SELECT sqlite_version() AS v').get().v,pageBytes:db.prepare('PRAGMA page_size').get().page_size,stages};
  }finally{db.close();}
}
try{
  const report={scope:'Storage layout experiment. Sizes describe bound text and the open rollback journal. No device latency or physical write count was measured.',
    sourceSha256:source.raw.sha256,saves:snapshots.map(r=>sha256(r.text)),current:exercise(false),separateAccount:exercise(true)};
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(report.current.stages,report.separateAccount.stages);
}finally{
  const owned=fs.realpathSync(scratch);assert(path.dirname(owned)===parent&&path.basename(owned).startsWith('slot-layout-'));
  fs.rmSync(owned,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
