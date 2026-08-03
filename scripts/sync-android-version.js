/**
 * Sync versionName/versionCode in android/app/build.gradle from version.json
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const versionJson = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
const version = String(versionJson.version || '0.5.0');
const parts = version.split('.').map((n) => parseInt(n, 10) || 0);
// Android rejects install-over if versionCode decreases.
// Product versions are 0.x while we climb to 1.0.0 — keep codes above the old 2.x line
// and encode minor.patch so each release bumps uniquely: 0.5.1 → 21501.
const versionCode = 21000 + parts[1] * 100 + parts[2];

const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');

gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);

fs.writeFileSync(gradlePath, gradle);

const configPath = path.join(root, 'js', 'config.js');
let config = fs.readFileSync(configPath, 'utf8');
config = config.replace(/APP_VERSION:\s*'[^']*'/, `APP_VERSION: '${version}'`);
fs.writeFileSync(configPath, config);

console.log(`Android version synced: ${version} (${versionCode})`);
