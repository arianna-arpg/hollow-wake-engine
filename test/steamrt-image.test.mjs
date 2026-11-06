import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {root} from '../scripts/reference-utils.mjs';
import {verifySteamContainer,verifySteamImage} from '../scripts/steamrt-image.mjs';

const directory=path.join(root,'experiments/steamrt-godot');
const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name)));
const pin=read('toolchain-lock.json').images.platform;
const config=read('platform-blobs.json');
const manifest=read('platform-manifests.json');
const reference=pin.repository+'@'+pin.manifestDigest;
function inspect(containerd) {
  const image={Id:pin.configDigest,Os:'linux',Architecture:'amd64',RepoDigests:[reference],
    Config:structuredClone(config.config),RootFS:{Type:'layers',Layers:[...config.rootfs.diff_ids]}};
  if(containerd){
    image.Id=pin.manifestDigest;
    image.Descriptor={digest:pin.manifestDigest,mediaType:manifest.mediaType,size:pin.records.find(r=>r.digest===pin.manifestDigest).bytes};
  }
  return image;
}
test('both Docker stores bind the running container to the same pinned root filesystem',()=>{
  for(const containerd of [false,true]){
    const identity=verifySteamImage(pin,inspect(containerd));
    const container={Image:identity.id,Config:{Image:reference}};
    verifySteamContainer(identity,container);
    assert.throws(()=>verifySteamContainer(identity,{...container,Image:'different'}));
    assert.throws(()=>verifySteamContainer(identity,{...container,Config:{Image:'latest'}}));
    assert.throws(()=>verifySteamContainer(identity,{...container,ImageManifestDescriptor:{digest:'different'}}));
  }
});
test('a matching image ID cannot hide a different layer, descriptor or image configuration',()=>{
  for(const mutate of [
    i=>i.RootFS.Layers.reverse(), i=>i.Config.Env.push('UNEXPECTED=yes'),
    i=>i.RepoDigests.splice(0), i=>i.Descriptor.digest='different',
    i=>i.Descriptor.size++, i=>i.Id='unknown'
  ]){
    const image=inspect(true);mutate(image);
    assert.throws(()=>verifySteamImage(pin,image));
  }
});
