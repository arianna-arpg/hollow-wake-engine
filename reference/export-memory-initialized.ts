import fs from 'node:fs';
import {World} from '../src/engine/world';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeAccount} from '../src/meta/account';
import {memoryCatalog,awakenMemoryFromDrop} from '../src/meta/memoryUnlocks';
void World;
const output={
 skills:Object.values(SKILLS).map(row=>({id:row.id,name:row.name,noDrop:row.noDrop,dropWeight:row.dropWeight})),
 supports:Object.values(SUPPORTS).map(row=>({id:row.id,name:row.name,weight:row.weight})),
 catalog:memoryCatalog(),
 awakening:Object.keys(SKILLS).map(id=>{
  const account=makeAccount(),result=awakenMemoryFromDrop(account,id,'legendary');
  return {id,result,discovered:account.unlockedSkills.has(id),secondary:account.memorySecondary.has('skill:'+id)};
 }),
};
fs.writeFileSync(process.argv[2],JSON.stringify(output)+'\n',{flag:'wx'});
