import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root, sha256} from './reference-utils.mjs';

// Classic Docker reports the config digest as Image.Id. The containerd store
// reports the manifest digest and its descriptor. Verify the pinned config and
// layer contents in either representation before accepting a container.
export function verifySteamImage(pin, actual) {
  function pinnedRecord(suffix, digest) {
    const record=pin.records.find(item=>item.file.endsWith(suffix));
    assert(record && path.basename(record.file)===record.file);
    const bytes=fs.readFileSync(path.join(root,'experiments/steamrt-godot',record.file));
    assert.equal('sha256:'+sha256(bytes),digest);
    assert.equal(record.digest,digest);
    assert.equal(record.bytes,bytes.length);
    return JSON.parse(bytes);
  }
  const manifest=pinnedRecord('-manifests.json',pin.manifestDigest);
  assert.equal(manifest.config.digest,pin.configDigest);
  const config=pinnedRecord('-blobs.json',pin.configDigest);
  assert.equal(config.config.Labels['os_release.build_id'],pin.buildId);
  assert.equal(config.config.Labels['os_release.variant_id'],pin.variant);
  assert.deepEqual({os:config.os,architecture:config.architecture},pin.platform);
  const reference=pin.repository+'@'+pin.manifestDigest;
  assert(actual.RepoDigests.includes(reference));
  assert.equal(actual.Os,config.os);assert.equal(actual.Architecture,config.architecture);
  assert.equal(actual.RootFS.Type,config.rootfs.type);
  assert.deepEqual(actual.RootFS.Layers,config.rootfs.diff_ids);
  for(const [key,value] of Object.entries(config.config))assert.deepEqual(actual.Config[key],value,key);
  if(actual.Id!==pin.configDigest) {
    assert.equal(actual.Id,pin.manifestDigest);
    assert.equal(actual.Descriptor?.digest,pin.manifestDigest);
    assert.equal(actual.Descriptor.mediaType,manifest.mediaType);
    assert.equal(actual.Descriptor.size,pin.records.find(row=>row.digest===pin.manifestDigest).bytes);
  }
  return {id:actual.Id,reference,manifest:pin.manifestDigest,config:pin.configDigest,layers:config.rootfs.diff_ids};
}

export function verifySteamContainer(image, container) {
  assert.equal(container.Image,image.id);
  assert.equal(container.Config.Image,image.reference);
  if(container.ImageManifestDescriptor)assert.equal(container.ImageManifestDescriptor.digest,image.manifest);
}
