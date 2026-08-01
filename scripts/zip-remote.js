const fs = require('node:fs');
const path = require('node:path');
const { ZipArchive } = require('archiver');

const { version } = require('../projects/basamad-ui/package.json');

const distDir = path.resolve(__dirname, '../dist/basamad-ui-mf/browser');
const outDir = path.resolve(__dirname, `../remote-entries/basamad-ui/v${version}`);
const zipPath = path.join(outDir, `basamad-ui-v${version}.zip`);

async function createVersionedRemoteZip() {
    if (!fs.existsSync(distDir)) {
        throw new Error(`Remote build output not found: ${distDir}`);
    }

    fs.mkdirSync(outDir, { recursive: true });

    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }

    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = new ZipArchive({ zlib: { level: 9 } });

        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(distDir, false);
        archive.finalize().catch(reject);
    });

    const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
    console.log(`Versioned remote created: ${zipPath} (${sizeMB} MB)`);
}

createVersionedRemoteZip().catch((error) => {
    console.error(error);
    process.exit(1);
});
