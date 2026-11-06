import assert from 'node:assert/strict';

/** Inventory for the next composition step. The native root manifest is
 * preserved by the archive assembler and authenticated by the archive hash. */
export function composedAddon(archiveSha256,parent,capability,files,manifestSha256) {
  assert(/^[a-z][a-z0-9-]*$/.test(capability));
  const inventory={...parent.files};
  for(const [name,digest] of Object.entries({...files,'manifest.json':manifestSha256})) {
    assert(/^[a-zA-Z0-9_.-]+$/.test(name)&&name!=='.'&&name!=='..');
    const member=capability+'/'+name;assert(!Object.hasOwn(inventory,member),'Capability already present: '+member);inventory[member]=digest;
  }
  return {archiveSha256,files:inventory};
}
