import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const background = readFileSync(new URL('./background.js', import.meta.url), 'utf8');

assert.match(background, /Infer it from BOTH the public bio\/profile and the user's high-quality tweet samples/);
assert.match(background, /Manual high-quality samples CAN inform positioning through repeated topics/);
assert.match(background, /must be derived primarily from the conclusions of high-quality tweet samples and performance context/);
assert.match(background, /Never paste raw sample lines into either textarea/);
assert.match(background, /Strategy derived from high-quality samples/);

console.log('persona prompt rule checks passed');
