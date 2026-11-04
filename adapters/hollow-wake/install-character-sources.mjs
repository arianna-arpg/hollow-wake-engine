import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function identityMatches(left,right) {
  return left && right && left.dev===right.dev && left.ino===right.ino;
}

/** Replace reviewed existing files in one disposable host checkout. The lock
 * serializes installers. Concurrent editor changes are detected before each
 * rename and are never overwritten during rollback. */
export function installCharacterSources(game, changes) {
  const root=fs.realpathSync(game);
  const seen=new Set();
  const entries=changes.map(({file,before,after},i)=>{
    assert(!path.isAbsolute(file)&&!file.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'),file);
    const target=path.join(root,file);
    assert.equal(fs.realpathSync(target),target,'Host sources must be regular in-tree files');
    assert(!seen.has(target),'Duplicate host source');seen.add(target);
    const old=fs.lstatSync(target,{bigint:true});
    assert(old.isFile()&&Buffer.isBuffer(before)&&Buffer.isBuffer(after)&&!before.equals(after),file);
    assert(fs.readFileSync(target).equals(before),'Host source differs: '+file);
    return {file,target,before,after,old,index:String(i)};
  });
  const lock=path.join(root,'.hollow-wake-character-install');
  fs.mkdirSync(lock);
  let keep=false;
  const applied=[];
  const current=entry=>{
    const info=fs.lstatSync(entry.target,{bigint:true,throwIfNoEntry:false});
    return identityMatches(info,entry.old)&&fs.readFileSync(entry.target).equals(entry.before);
  };
  try {
    for (const e of entries) {
      const options={flag:'wx',mode:Number(e.old.mode)};
      fs.writeFileSync(path.join(lock,e.index+'.original'),e.before,options);
      const draft=path.join(lock,e.index+'.candidate');
      fs.writeFileSync(draft,e.after,options);
      e.published=fs.statSync(draft,{bigint:true});
    }
    fs.writeFileSync(path.join(lock,'sources.json'),JSON.stringify(entries.map(e=>e.file)),{flag:'wx'});
    for (const e of entries) {
      assert(current(e),'Source changed during character installation: '+e.file);
      fs.renameSync(path.join(lock,e.index+'.candidate'),e.target);
      applied.push(e);
    }
  } catch (cause) {
    const failures=[];
    for (const e of applied.reverse()) {
      try {
        const actual=fs.lstatSync(e.target,{bigint:true,throwIfNoEntry:false});
        if (identityMatches(actual,e.published)&&fs.readFileSync(e.target).equals(e.after)) {
          fs.renameSync(path.join(lock,e.index+'.original'),e.target);
        } else {
          failures.push(new Error('Changed during rollback: '+e.file));
        }
      } catch (err) {failures.push(err);}
    }
    if(failures.length){
      keep=true;
      throw new AggregateError([cause,...failures],'Character installation stopped. Original copies retained in '+lock);
    }
    throw cause;
  } finally {
    if(!keep){
      // Only unlink our named temporary files, never an unfamiliar directory entry.
      for (const e of entries) for (const suffix of ['.original','.candidate']) fs.rmSync(path.join(lock,e.index+suffix),{force:true});
      fs.rmSync(path.join(lock,'sources.json'),{force:true});
      fs.rmdirSync(lock);
    }
  }
}
