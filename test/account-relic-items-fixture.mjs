import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {sha256} from '../scripts/reference-utils.mjs';
const bytes=fs.readFileSync(new URL('../baseline/account-relic-build/observations.json.gz',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(new URL('../baseline/account-relic-build/acceptance.json',import.meta.url)));
assert.equal(sha256(bytes),manifest.gzipSha256);const decoded=gunzipSync(bytes);assert.equal(sha256(decoded),manifest.sha256);
export const originalRelics=JSON.parse(decoded).rows;
