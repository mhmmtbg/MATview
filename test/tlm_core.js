// Telemetri modülünün çekirdeğini (src/tlm/telemetri.html içindeki <script id="tp-core">) Node'da yükler.
const fs = require('fs'), path = require('path');
module.exports = function loadTP() {
  if (globalThis.TP) return globalThis.TP;
  const h = fs.readFileSync(path.join(__dirname, '../src/tlm/telemetri.html'), 'utf8');
  const m = /<script id="tp-core">([\s\S]*?)<\/script>/.exec(h);
  if (!m) throw new Error('tp-core bulunamadı');
  new Function(m[1])();
  return globalThis.TP;
};
