/**
 * Copy web assets into www/ for Capacitor.
 * Run: node scripts/build-www.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');

const entries = [
  'index.html',
  'app.js',
  'sw.js',
  'manifest.json',
  'version.json',
  'css',
  'js',
  'pages',
  'data',
  'icons'
];

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copy(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copy(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

rmDir(out);
fs.mkdirSync(out, { recursive: true });

for (const entry of entries) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) {
    console.warn('skip missing', entry);
    continue;
  }
  copy(src, path.join(out, entry));
}

console.log('www/ ready');
