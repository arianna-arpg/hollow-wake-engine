import assert from 'node:assert/strict';
export const statContextObserverFaults = [
  ['unsorted-context', "[...contextTags].sort().join(',')", "[...contextTags].join(',')"],
  ['changed-separator', "[...contextTags].sort().join(',')", "[...contextTags].sort().join(';')"],
  ['empty-context-distinguished', 'contextTags && contextTags.size', 'contextTags'],
  ['context-discarded', 'contextTags && contextTags.size', 'false && contextTags && contextTags.size'],
  ['baseline-prefix-lost', "(noLinks ? '§' : '')", "''"],
  ['extra-cache-bypass-lost', '(!extra || !extra.length) && baseValue === undefined', 'baseValue === undefined'],
  ['base-cache-bypass-lost', '(!extra || !extra.length) && baseValue === undefined', '(!extra || !extra.length)'],
  ['value-cache-disabled', '(!extra || !extra.length) && baseValue === undefined', 'false'],
];
export function changeStatContextSource(source, fault) {
  const [name, needle, replacement] = fault;
  assert.equal(source.split(needle).length - 1, 1, name);
  return source.replace(needle, replacement);
}
