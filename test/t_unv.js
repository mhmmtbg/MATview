const U = require('../src/unv.js'), assert = require('assert'), fs = require('fs');
const f = U.parse(fs.readFileSync(__dirname + '/../ornek/ornek.unv', 'utf8'), 'ornek.unv');
assert.strictEqual(f.length, 8); assert.strictEqual(f[0].npts, 500); assert.ok(f[5].is_complex && f[5].y_im.length === 500); assert.strictEqual(f[7].spacing, 0);
assert.ok(Math.abs(U.grms(f[0]) - 3.327) < 1e-3); assert.strictEqual(U.grms(f[5]), null); assert.strictEqual(U.chanName(f[0], 1), '01 | Kanal PSD 1');
assert.strictEqual(U.parse('    -1\n    58b\n', 'x').bin58, 1);
console.log('t_unv OK');
