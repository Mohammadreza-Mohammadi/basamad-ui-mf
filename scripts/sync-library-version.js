const fs = require('node:fs');
const path = require('node:path');

const rootPackagePath = path.resolve(__dirname, '../package.json');
const libraryPackagePath = path.resolve(__dirname, '../projects/basamad-ui/package.json');

const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
const libraryPackage = JSON.parse(fs.readFileSync(libraryPackagePath, 'utf8'));

libraryPackage.version = rootPackage.version;

fs.writeFileSync(libraryPackagePath, `${JSON.stringify(libraryPackage, null, 2)}\n`);
console.log(`Library version synchronized: ${libraryPackage.version}`);
