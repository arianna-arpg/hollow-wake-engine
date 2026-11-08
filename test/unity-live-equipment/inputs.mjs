import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from '../../scripts/reference-utils.mjs';
const raw=fs.readFileSync(root+'/baseline/live-equipment/v2/observations.json.gz');
assert.equal(sha256(raw),JSON.parse(fs.readFileSync(root+'/baseline/live-equipment/v2/acceptance.json')).gzipSha256);
const original=JSON.parse(gunzipSync(raw));
const old=JSON.parse(gunzipSync(fs.readFileSync(root+'/evidence/embedded-js/windows-persistent-session-raw.json.gz')));
const config=JSON.parse(old.session['requests.jsonl'].split('\n')[0]).config;
config.character={classId:'magician',passivePoints:1};config.skill={id:'ruin',level:5,sockets:0,treePoints:0};
config.resources={life:68,mana:117};
const items=['ring_lapis','ring_coral','amulet_opal'].map((base,index)=>({
 ...original.rows.find(row=>row.name==='equip-'+base+'-during-cast').initialItems[0],
 uid:4294967297+index,x:index*2,y:0
}));
const state={board:{w:16,h:16},items,overflow:[],equipped:{},essences:{},
 account:{features:[],ledger:{},craftLore:{},progression:true}};
fs.writeFileSync(process.argv[2],JSON.stringify({config:JSON.stringify(config),state:JSON.stringify(state)}),{flag:'wx'});
