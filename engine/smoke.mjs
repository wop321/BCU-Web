import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as engine from './dist/bcu-engine.js';

const prefix = new URL('../web/assets/org/unit/000/f/000_f', import.meta.url);
const read = ext => readFile(new URL(prefix.href + ext), 'utf8');
const [cut, model, animation] = await Promise.all(['.imgcut', '.mamodel', '00.maanim'].map(read));
const image = { naturalWidth: 4096, naturalHeight: 4096 };
const id = engine.createAnimation(cut, model, animation, image);
assert.ok(engine.animationLength(id) > 0);
const frames = [0, 4.5, 10, 15, 30, 59].map(frame => ({frame, parts: JSON.parse(engine.animationParts(id, frame))}));
assert.ok(frames.every(frame => frame.parts.length > 0));
assert.ok(frames.every(frame => frame.parts.every(part => part.every(Number.isFinite))));
assert.ok(frames.some(frame => JSON.stringify(frame.parts) !== JSON.stringify(frames[0].parts)));
assert.ok(Math.abs(engine.unitLevelMultiplier(Array(20).fill(20).join(','), 1) - 1) < 1e-5);
assert.ok(Math.abs(engine.unitLevelMultiplier(Array(20).fill(20).join(','), 10) - 2.8) < 1e-5);
console.log(JSON.stringify({engine: engine.engineVersion(), length: engine.animationLength(id), frames}));
engine.disposeAnimation(id);
