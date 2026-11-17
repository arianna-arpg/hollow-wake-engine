import {test} from 'node:test';import assert from 'node:assert/strict';
import {sha256} from '../scripts/reference-utils.mjs';
import {assertExtractionRevision} from '../scripts/check-maintained-extraction.mjs';
test('extraction revision verifies both frozen control and reviewed port without exempting other files',()=>{
 const revisions={files:{'src/port.ts':{beforeSha256:sha256('original'),afterSha256:sha256('reviewed')}}};
 assertExtractionRevision('src/port.ts','original','reviewed',revisions);
 assert.throws(()=>assertExtractionRevision('src/port.ts','different original','reviewed',revisions),/original extraction changed/);
 assert.throws(()=>assertExtractionRevision('src/port.ts','original','different port',revisions),/maintained revision changed/);
 assert.throws(()=>assertExtractionRevision('src/port.ts','original','original',revisions),/maintained revision changed/);
 assertExtractionRevision('src/unchanged.ts','original','original',revisions);
 assert.throws(()=>assertExtractionRevision('src/unchanged.ts','original','reviewed',revisions),/unreviewed extraction change/);
});
