// Compiled against the pinned, renderer-free skill functions. A source host
// can supply indexed records synchronously. Godot supplies verified pages.
import {makeSkillInstance,instanceDelivery,instanceSummon,summonCrewOf,supportFitsInstOrCrew} from 'hollow-wake-source/skills';
import 'hollow-wake-source/minion-families';

export function fitPage(id,count){
  let hash=0;for(const ch of id)hash=(Math.imul(hash,31)+ch.codePointAt(0))>>>0;
  return hash%count;
}
function required(read,table,id){
  if(typeof id!=='string'||!id.length||id.length>512)throw Error('invalid-support-query');
  const row=read(table,id);if(!row)throw Error('unknown-'+table);return row;
}
export function fitSupport(bar,support,read){
  if(!Array.isArray(bar)||bar.length>8||support?.kind!=='support')throw Error('invalid-support-query');
  const def=required(read,'supports',support.supportId),rows=[];
  for(const [slot,gem] of bar.entries()){
    if(gem===null)continue;
    if(gem.kind!=='skill'||!Number.isSafeInteger(gem.level)||gem.level<1||!Array.isArray(gem.sockets)||gem.sockets.length>1024)
      throw Error('invalid-support-query');
    const inst=makeSkillInstance(required(read,'skills',gem.skillId),gem.level,gem.sockets.length);
    for(const key of ['rarity','empowermentRank','replenishmentPaused','granted','attunedForm','treeNodes'])
      if(gem[key]!==undefined)inst[key]=gem[key];
    let occupied=0;
    for(const [i,row] of gem.sockets.entries())if(row!==null){
      occupied++;inst.sockets[i]={def:required(read,'supports',row.supportId),level:row.level,rolled:row.rolled};
    }
    const d=instanceDelivery(inst);
    const crew=summonCrewOf(d.type==='summon'?d:instanceSummon(inst),id=>read('monsters',id),id=>read('skills',id));
    rows.push({slot,skillId:gem.skillId,fits:supportFitsInstOrCrew(def,inst,crew,support.rolled),sockets:gem.sockets.length,occupied});
  }
  return rows;
}

/** Synchronous range port. The loader verifies the digest from the index
 * before returning UTF-8 JSON. Each reader owns its four parsed pages. */
export function createSupportReader(index,loadVerifiedPage){
  if(index?.format!=='workshop-support-pages/v1'||index.pages?.length!==128||typeof loadVerifiedPage!=='function')throw Error('invalid-support-index');
  let end=0;
  const ranges=index.pages.map(({offset,length,sha256})=>{
    if(offset!==end||!Number.isSafeInteger(length)||length<1||length>48*1024||!(/^[0-9a-f]{64}$/).test(sha256))throw Error('invalid-support-index');
    end+=length;return Object.freeze({offset,length,sha256});
  });
  if(end!==index.bytes||end>2*1024*1024)throw Error('invalid-support-index');
  const pages=new Map();
  return (bar,support)=>fitSupport(bar,support,(table,id)=>{
    const n=fitPage(id,ranges.length);
    let page=pages.get(n);
    if(!page){
      const raw=loadVerifiedPage(ranges[n],n);
      if(raw?.sha256!==ranges[n].sha256||typeof raw.text!=='string'||raw.text.length>ranges[n].length)throw Error('invalid-support-page');
      page=JSON.parse(raw.text);
      for(const key of ['skills','supports','monsters'])if(!page[key]||typeof page[key]!=='object'||Array.isArray(page[key]))throw Error('invalid-support-page');
      if(pages.size===4)pages.delete(pages.keys().next().value);
      pages.set(n,page);
    }
    return Object.hasOwn(page[table],id)?page[table][id]:undefined;
  });
}
