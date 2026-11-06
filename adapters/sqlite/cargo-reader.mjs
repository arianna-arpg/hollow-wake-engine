import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

/** Node host adapter. Other hosts can use the same database and manifest.
 * A read transaction spans all queries on this handle. Close it when done. */
export function openCargoCatalogue() {
  const manifest=JSON.parse(fs.readFileSync(new URL('./catalog.json',import.meta.url),'utf8'));
  if(manifest.format!=='cargo-sqlite/v1')throw Error('Unknown cargo database format');
  const file=fileURLToPath(new URL('./cargo-display.sqlite3',import.meta.url));
  const fd=fs.openSync(file,'r'),sum=createHash('sha256'),buffer=Buffer.allocUnsafe(65536);
  try{
    if(fs.fstatSync(fd).size!==manifest.bytes)throw Error('Incorrect cargo database size');
    let size;
    while((size=fs.readSync(fd,buffer,0,buffer.length,null))>0)sum.update(buffer.subarray(0,size));
    if(sum.digest('hex')!==manifest.sha256)throw Error('Incorrect cargo database digest');
  }finally{fs.closeSync(fd);}
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    db.exec('BEGIN');
    const query=db.prepare('SELECT payload FROM faces WHERE kind=? AND id=?');
    let closed=false;
    return Object.freeze({
      config:manifest.config,
      read({table,id}){
        if(closed)throw Error('Cargo catalogue is closed');
        const row=query.get(table,id);return row?JSON.parse(row.payload):null;
      },
      close(){if(!closed){db.close();closed=true;}},
    });
  }catch(error){db.close();throw error;}
}
