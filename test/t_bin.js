const BIN = require('../src/bin.js'); const assert = require('assert');
// 2x3 matris, satır sırası: A A B / B B C ; sütun sırası: A B A B B C
const grid = [['A', 'A', 'B'], ['B', 'B', 'C']];
let l = BIN.layout(grid, 'row'); assert.deepStrictEqual(l.keys, ['A_1', 'A_2', 'B_1', 'B_2', 'B_3', 'C']); assert.strictEqual(l.L, 6);
l = BIN.layout(grid, 'col'); assert.deepStrictEqual(l.keys, ['A_1', 'B_1', 'A_2', 'B_2', 'B_3', 'C']);
l = BIN.layout(grid, 'row');
// 3 kare + başta çöp + ortada 1 bozuk bayt kayması
const S = [0xAA, 0x55], fr = k => [0xAA, 0x55, 0x01, 0x02, k, 0xFF];
const u8 = Uint8Array.from([9, 9, 9, ...fr(0), ...fr(1), 7, ...fr(2)]);
const sc = BIN.scan(u8, 6, S, 0); assert.strictEqual(sc.frames, 3); assert.deepStrictEqual(Array.from(sc.pos), [3, 9, 16]); assert.strictEqual(sc.junk, 3 + 1);
const sp = BIN.spec(l, {name: 'x', src: 'B_1', type: 'u16', endian: 'BE'}); assert.strictEqual(sp.off, 2);
assert.deepStrictEqual(Array.from(BIN.extract(u8, sc.pos, sp)), [0x0102, 0x0102, 0x0102]);
const le = BIN.spec(l, {name: 'x', src: 'B_1', type: 'u16', endian: 'LE'}); assert.strictEqual(BIN.extract(u8, sc.pos, le)[0], 0x0201);
const sg = BIN.spec(l, {name: 'x', src: 'C', type: 'i8'}); assert.strictEqual(BIN.extract(u8, sc.pos, sg)[0], -1);
const bt = BIN.spec(l, {name: 'x', src: 'B_1', type: 'u8', bit: '1-3'}); assert.strictEqual(BIN.extract(u8, sc.pos, bt)[0], (1 >> 1) & 7);
assert.throws(() => BIN.spec(l, {name: 'x', src: 'YOK', type: 'u8'}));
assert.deepStrictEqual(BIN.parseSync('EB 90 0xA5'), [0xEB, 0x90, 0xA5]);
const cg = BIN.counterG([65534, 65535, 0, 3], 2); assert.deepStrictEqual(Array.from(cg.g), [0, 1, 2, 5]); assert.strictEqual(cg.lost, 2);
console.log('t_bin OK');
