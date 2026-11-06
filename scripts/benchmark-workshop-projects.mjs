import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {root,sha256} from './reference-utils.mjs';

// Use the same actor workload, native libraries and SQLite extension in a
// single project. Each timed run starts a fresh Godot process and new saves.
const read=file=>JSON.parse(fs.readFileSync(file));
export function prepareWorkshopBenchmark(project,course){
  const loaded=structuredClone(course.rows.map(r=>r.expected.save).find(s=>s?.state.items.length===128));
  const fire=read(path.join(project,'cargo-sample.json')).find(i=>i.gem?.kind==='skill'),ring=loaded.state.items.at(-1);
  loaded.state.items[127]={...fire,x:ring.x,y:ring.y};
  loaded.nextUid=Math.max(loaded.nextUid,fire.uid+1);
  fs.writeFileSync(path.join(project,'benchmark-loaded.json'),JSON.stringify(loaded));
  fs.copyFileSync(path.join(root,'test/godot-inventory/benchmark-rack.gd'),path.join(project,'benchmark-rack.gd'));
  fs.writeFileSync(path.join(project,'benchmark-rack.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://benchmark-rack.gd" id="1"]\n[node name="Measure" type="Node"]\nscript = ExtResource("1")\n');
}

export function compareWorkshopProjects({prior,release,saveDir,godot,install,platform}){
  const accepted=read(path.join(root,'evidence/workshop-rack',platform+'.json')).checksums;
  const priorHash=sha256(fs.readFileSync(prior));
  assert.equal(priorHash,accepted['hollow-wake-workshop-'+platform+'-x64.zip']);
  const runs=[],saves={};
  for(const variant of ['previous','candidate','candidate','previous']){
    install(prior,release,variant);
    const label=variant+runs.length;
    const log=godot(['res://benchmark-rack.tscn','--quit-after','300','--',label]);
    const line=log.split('\n').find(s=>s.startsWith('HWE_BENCH '));assert(line,log.slice(-1000));
    const row=JSON.parse(line.slice(10));
    for(const [size,result] of Object.entries(row)){
      assert.equal(result.file,'bench-'+label+'-'+size+'.sqlite3');
      assert.equal(result.actionUs.length,32);assert(result.actionUs.every(t=>Number.isInteger(t)&&t>0));
      assert.equal(result.storageUs.length,result.actionUs.length);
      assert(result.storageUs.every((us,i)=>Number.isInteger(us)&&us>0&&us<=result.actionUs[i]));
      const db=new DatabaseSync(path.join(saveDir,result.file),{readOnly:true});
      try{
        assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
        const data=db.prepare('SELECT revision,crafting,stash FROM slots WHERE slot=1').get();
        assert.equal(data.revision,result.revision);assert.equal(JSON.parse(data.crafting).nextUid,result.uid+1);
        assert.equal(result.saveSha256,sha256(data.crafting));
        assert.equal(result.saveBytes,Buffer.byteLength(data.crafting));
        const digest=sha256(JSON.stringify([data.revision,data.crafting,data.stash]));
        saves[size]??=digest;assert.equal(digest,saves[size],'Durable bytes changed for '+size);
      }finally{db.close();}
    }
    runs.push({variant,...row});
  }
  const summary={};
  for(const variant of ['previous','candidate']){
    summary[variant]={};
    for(const size of ['small','loaded']){
      const timings=runs.filter(r=>r.variant===variant).map(r=>r[size]);
      const times=timings.flatMap(r=>r.actionUs);
      const quantile=(values,q)=>values.toSorted((a,b)=>a-b)[Math.ceil(values.length*q)-1]/1000;
      const writes=timings.flatMap(r=>r.storageUs);
      summary[variant][size]={actions:times.length,p50Ms:quantile(times,.5),p95Ms:quantile(times,.95),
        storageP95Ms:quantile(writes,.95),outsideStorageP95Ms:quantile(times.map((us,i)=>us-writes[i]),.95)};
    }
  }
  return {scope:'Synchronous Godot profile action including skill admission, snapshot, SQLite commit and view update. Startup, rendering and input excluded.',
    previousProjectSha256:priorHash,saveDigests:saves,summary,runs};
}
