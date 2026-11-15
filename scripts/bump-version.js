import fs from 'fs';
import path from 'path';

/**
 * Script de versionamiento automático para Milla 7
 * Uso:
 *   node scripts/bump-version.js [patch|minor|major]
 *   node scripts/bump-version.js build
 */

const rootDir = process.cwd();
const pkgPath = path.join(rootDir, 'package.json');
const backendPkgPath = path.join(rootDir, 'backend', 'package.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version || '1.9.65';

const args = process.argv.slice(2);
const type = args[0] || 'patch';

let [major, minor, patch] = currentVersion.split('.').map(n => parseInt(n, 10) || 0);

if (type === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (type === 'minor') {
  minor += 1;
  patch = 0;
} else if (type === 'patch') {
  patch += 1;
}

const newVersion = `${major}.${minor}.${patch}`;

// Actualizar package.json raíz
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Actualizar backend/package.json
if (fs.existsSync(backendPkgPath)) {
  const bPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
  bPkg.version = newVersion;
  fs.writeFileSync(backendPkgPath, JSON.stringify(bPkg, null, 2) + '\n');
}

console.log(`[VERSION] Versión actualizada exitosamente: ${currentVersion} -> ${newVersion}`);

