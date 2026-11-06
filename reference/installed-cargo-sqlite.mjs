// Copied into an isolated tarball installation by scripts/test-cargo-sqlite.mjs.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {CargoInspector,CargoAtlas} from '@hollow-wake/engine/inventory/cargo-cards';
import {ItemContent} from '@hollow-wake/engine/items';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {openCargoCatalogue} from '@hollow-wake/cargo-sqlite';
import sqlManifest from '@hollow-wake/cargo-sqlite/catalog.json' with {type:'json'};
import pages from '@hollow-wake/cargo-cards/index.json' with {type:'json'};
import itemPack from '@hollow-wake/items/items.json' with {type:'json'};
import skillPack from '@hollow-wake/skill-progression/skill-progression.json' with {type:'json'};
import craftPack from '@hollow-wake/crafting/crafting.json' with {type:'json'};

const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const file=new URL(import.meta.resolve('@hollow-wake/cargo-sqlite/cargo-display.sqlite3'));
const bytes=fs.readFileSync(file),damaged=Buffer.from(bytes);damaged[damaged.length-1]^=1;
try{
  fs.writeFileSync(file,damaged);
  assert.throws(()=>openCargoCatalogue(),/digest/);
}finally{fs.writeFileSync(file,bytes);}
const sql=openCargoCatalogue(),pageBytes=fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/cargo-cards/pages.txt')));
const atlas=new CargoAtlas(pages,(_,r)=>{
  const b=pageBytes.subarray(r.offset,r.offset+r.length);assert.equal(hash(b),r.sha256);return b.toString();
});
assert.deepEqual(sql.config,pages.config);assert.equal(sqlManifest.pageAtlasSha256,pages.sha256);
const itemDefs=new ItemContent(itemPack),rules=new CargoInspector(new SkillProgression(skillPack),new CraftingContent(craftPack,itemDefs),sql.config);
let cards=0,unknown=0;
try{
  for(const line of fs.readFileSync('items.jsonl','utf8').split('\n')){
    const {label,item,view,fit}=JSON.parse(line),expected=rules.inspect(item,view,atlas.read,()=>fit);
    assert.deepEqual(rules.inspect(item,view,sql.read,()=>fit),expected,label);
    if(expected)cards++;else unknown++;
  }
  assert.equal(sql.read({table:'skills',id:"' OR 1=1 --",page:0}),null);
}finally{sql.close();}
sql.close();
assert.throws(()=>sql.read({table:'skills',id:'firebolt',page:11}),/closed/);
assert.equal(hash(fs.readFileSync(file)),sqlManifest.sha256);
fs.writeFileSync('result.json',JSON.stringify({cards,unknown,sha256:sqlManifest.sha256,corruptRefused:true,closedHandleRefused:true})+'\n');
