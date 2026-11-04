import {countProcSummons} from '../../dist/proc-delivery.js';

export {countProcSummons};
export function originalCount(actors, owner, key) {
  return actors.filter(m => m.owner === owner && !m.dead && m.sourceSkillId === key).length;
}

export function countWorldSummons(actors, owner, key) {
  let count = 0;
  actors.forEach(actor => {
    if (actor.owner === owner && !actor.dead && actor.sourceSkillId === key) count++;
  });
  return count;
}

/** Identical deterministic rosters and queries for the Node and embedded hosts. */
export function censusFixture(size, density) {
  const owners=[{id:1},{id:2},{id:3}], keys=['__proc:forge','__proc:spark','__proc:missing'];
  const actors=[], counts=new Map(), queries=[];
  for(const owner of owners)for(const key of keys)queries.push({owner,key});
  for(let i=0;i<size;i++) {
    const owner=owners[i%3], dead=i%11===0;
    const key=density==='crowded'||i%7===0?keys[i%2]:undefined;
    actors.push({owner,dead,sourceSkillId:key});
    if(!dead&&key){const group=owner.id+'/'+key;counts.set(group,(counts.get(group)??0)+1);}
  }
  const expected=queries.map(({owner,key})=>counts.get(owner.id+'/'+key)??0);
  for(let i=0;i<queries.length;i++) {
    for(const fn of [originalCount,countProcSummons,countWorldSummons]) {
      if(fn(actors,queries[i].owner,queries[i].key)!==expected[i])throw Error('Incorrect summon count');
    }
  }
  return {actors,queries,expected};
}

export function censusSample(fixture,count,iterations) {
  let sum=0;
  for(let i=0;i<iterations;i++)for(const query of fixture.queries)sum+=count(fixture.actors,query.owner,query.key);
  return sum;
}
