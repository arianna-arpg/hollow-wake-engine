import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

/** A replaceable HOST example, deliberately outside the SDK runtime. Stores
 * detached character investment, not live combat or a whole-game save. */
export function createFileCharacterStore(filename) {
 const destination=resolve(filename);let tail=Promise.resolve();
 return Object.freeze({
  async load(){await tail;try{const text=await readFile(destination,'utf8');if(Buffer.byteLength(text)>4*1024*1024)throw Error('Character file exceeds limit');return JSON.parse(text);}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  save(value){
   const text=JSON.stringify(value);if(Buffer.byteLength(text)>4*1024*1024)throw Error('Character file exceeds limit');
   const operation=tail.then(async()=>{await mkdir(dirname(destination),{recursive:true});const temporary=destination+'.'+randomUUID()+'.tmp';
    try{await writeFile(temporary,text,{flag:'wx'});await rename(temporary,destination);}
    finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}});
   tail=operation.catch(()=>{});return operation;
  },
 });
}
