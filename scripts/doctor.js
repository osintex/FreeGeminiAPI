#!/usr/bin/env node
/**
 * FreeGeminiAPI Diagnostics & Health Check
 */

const fs = require('fs');
const path = require('path');
const { loadDotEnv } = require('../lib/env');

const repoRoot = path.resolve(__dirname, '..');
loadDotEnv(path.join(repoRoot, '.env'));

const authFile = process.env.GEMINI_AUTH_PATH || path.join(repoRoot, 'gemini-auth.json');
const port = Number(process.env.PORT || 9656);

async function runDoctor() {
    console.log('[c4] Running FreeGeminiAPI Doctor Diagnostics...\n');

    // 1. Check Node version
    const nodeVer = process.versions.node;
    console.log(`[1/4] Node.js version: v${nodeVer}`);
    if (parseInt(nodeVer.split('.')[0], 10) < 18) {
        console.error('      [-] Node.js >= 18 is required.');
    } else {
        console.log('      [+] OK (>= 18)');
    }

    // 2. Check Auth file
    console.log(`[2/4] Checking auth file: ${authFile}`);
    if (!fs.existsSync(authFile)) {
        console.error('      [-] Auth file not found! Run: npm run auth');
        return;
    }

    let auth;
    try {
        auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
        const hasCookies = Boolean(auth.cookies && auth.cookies.includes('__Secure-1PSID'));
        if (hasCookies) {
            console.log('      [+] Found valid __Secure-1PSID in cookies.');
        } else {
            console.warn('      [!] __Secure-1PSID not found in cookies string. Auth might fail.');
        }
        console.log(`      [+] Build label: ${auth.bl || 'default'}`);
        console.log(`      [+] Token SNlM0e: ${auth.snlm0e ? auth.snlm0e.slice(0, 15) + '...' : 'will be fetched automatically'}`);
    } catch (e) {
        console.error(`      [-] Could not parse auth JSON: ${e.message}`);
        return;
    }

    // 3. Test Google connectivity & SNlM0e fetch
    console.log('[3/4] Testing Google Gemini Web connectivity...');
    try {
        const resp = await fetch('https://gemini.google.com/app', {
            headers: {
                'Cookie': auth.cookies || '',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
            }
        });
        console.log(`      [+] HTTP Status: ${resp.status}`);
        const html = await resp.text();
        const snl = html.match(/"SNlM0e":\s*"([^"]+)"/);
        if (snl) {
            console.log(`      [+] Successfully verified SNlM0e: ${snl[1].slice(0, 15)}...`);
        } else {
            console.warn('      [!] SNlM0e not found in HTML. Cookies may need a refresh (run npm run auth).');
        }
    } catch (e) {
        console.error(`      [-] Connection error: ${e.message}`);
    }

    // 4. Test local server if running
    console.log(`[4/4] Checking local FreeGeminiAPI server on port ${port}...`);
    try {
        const local = await fetch(`http://127.0.0.1:${port}/health`);
        if (local.ok) {
            const data = await local.json();
            console.log(`      [+] Server is RUNNING on http://127.0.0.1:${port}`);
            console.log(`      [+] Models: ${data.available_models.join(', ')}`);
        } else {
            console.log(`      [!] Server returned status ${local.status}`);
        }
    } catch {
        console.log(`      [*] Server is currently offline. Start it with: npm start`);
    }

    console.log('\n[+] Doctor check complete.');
}

runDoctor();
