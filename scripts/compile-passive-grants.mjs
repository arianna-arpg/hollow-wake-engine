import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { root,sha256,writeJSON } from './reference-utils.mjs';
export function grantPack() {
  const {pack}=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-nine/passive-grants.json.gz'))));
  const {contentId:_label,...data}=pack;
  return {...data,contentId:`hollow-wake-grants:sha256:${sha256(JSON.stringify(data))}`};
}
export function buildPassiveGrants(destination) {
  fs.mkdirSync(destination,{recursive:true}); const pack=grantPack(),bytes=JSON.stringify(pack)+'\n';
  fs.writeFileSync(path.join(destination,'grants.json'),bytes);
  writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/passive-grants',version:'0.1.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',
    files:['grants.json','manifest.json','LICENSE.md','README.md'],exports:{'./grants.json':'./grants.json','./manifest.json':'./manifest.json'}});
  writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,contentId:pack.contentId,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes),capability:pack.capability});
  fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
  fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake passive grants\n\nExplicit attribute and modifier grants, conduit specifications and graft sources for @hollow-wake/engine/passives/grants. Allocation policy is separate. The SDK computes attribute totals and ordered stat contributions; host effect systems execute conduit pumping, proc payloads and support behavior. This package does not claim those effect runtimes. Load once and share immutable PassiveGrants across rebuilds.\n');
  return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {PassiveGrants}=await import('../dist/passive-grants.js');
  const pack=buildPassiveGrants(path.join(root,'.artifacts/passive-grant-package'));new PassiveGrants(pack);
  console.log({contentId:pack.contentId,nodes:pack.nodes.length,groups:pack.groups.length});
}
