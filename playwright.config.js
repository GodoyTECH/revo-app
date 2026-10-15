import { defineConfig } from '@playwright/test';
import chromiumBinary from '@sparticuz/chromium';
const executablePath = process.env.REVO_CHROMIUM_PATH || (process.platform === 'linux' ? await chromiumBinary.executablePath() : undefined);
export default defineConfig({
 testDir: './tests/browser', workers: 1, timeout: 30000,
 use: { baseURL: 'http://127.0.0.1:4174', headless: true, reducedMotion: 'reduce', launchOptions: { executablePath, args: executablePath ? ['--no-sandbox','--disable-dev-shm-usage'] : [] } },
 webServer: { command: 'node scripts/test-server.mjs', url:'http://127.0.0.1:4174', reuseExistingServer: false, timeout: 60000 },
 reporter: [['list']], outputDir: '/tmp/revo-browser-results'
});
