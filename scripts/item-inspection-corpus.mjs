import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {root} from './reference-utils.mjs';

export function inspectionCases() {
  const {rows}=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-four/items.json.gz'))));
  const cases=rows.map(({label,item})=>({label,item}));
  const source=cases.find(row=>row.item.affixes.length>1 && row.item.rarity==='rare').item;
  for(const [crafted,locked] of [[true,false],[false,true],[true,true]]){
    const item=structuredClone(source);
    Object.assign(item.affixes[0],{crafted,locked});
    cases.push({label:'markers/'+[crafted,locked].join('/'),item});
  }
  return cases;
}

// Arrays retain gameplay order. Dictionary property enumeration is not part
// of the portable output contract.
export function observationDigest(rows) {
  const digest=createHash('sha256');
  for(const row of rows)digest.update(JSON.stringify(row,(_key,value)=>{
    if(!value || typeof value!=='object' || Array.isArray(value))return value;
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]]));
  })+'\n');
  return digest.digest('hex');
}
