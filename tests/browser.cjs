const { spawnSync } = require('node:child_process');
const path = require('node:path');

for (const suite of ['attendance-browser.cjs', 'settings-browser.cjs']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, suite)], { stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}
