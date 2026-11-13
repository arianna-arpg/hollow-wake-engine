// Test/Node host adapter, never imported by the portable engine or browser.
import {DatabaseSync} from 'node:sqlite';
export class SqliteCharacterGroupStore {
 #db;
 constructor(path){
  this.#db=new DatabaseSync(path);this.#db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS character_groups (key TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>0), body TEXT NOT NULL) STRICT;');
 }
 read(key){const row=this.#db.prepare('SELECT revision,body FROM character_groups WHERE key=?').get(key);if(!row)return null;if(row.body.length>5*1024*1024)throw Error('Group exceeds host byte budget');return{revision:row.revision,body:JSON.parse(row.body)};}
 commit(key,expected,body){
  if(!Number.isSafeInteger(expected)||expected<0||expected===Number.MAX_SAFE_INTEGER)throw Error('Invalid group revision');
  const bytes=JSON.stringify(body);if(Buffer.byteLength(bytes)>5*1024*1024)throw Error('Group exceeds host byte budget');
  this.#db.exec('BEGIN IMMEDIATE');let active=true;
  try{
   const row=this.#db.prepare('SELECT revision FROM character_groups WHERE key=?').get(key);
   if((row?.revision??0)!==expected){this.#db.exec('ROLLBACK');active=false;return{status:'conflict'};}
   const revision=expected+1;
   this.#db.prepare('INSERT INTO character_groups(key,revision,body) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(key,revision,bytes);
   this.#db.exec('COMMIT');active=false;return{status:'committed',revision};
  }catch(error){if(active)try{this.#db.exec('ROLLBACK');}catch{}throw error;}
 }
 version(){return this.#db.prepare('SELECT sqlite_version() AS version').get().version;}
 close(){this.#db.close();}
}
