#!/usr/bin/env node
/**
 * Interactive Chrome login & cookie/token extractor for Google Gemini Web.
 * Zero npm dependencies (uses Node.js 18+ built-in WebSocket & fetch).
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const repoRoot = path.resolve(__dirname, '..');
const { loadDotEnv } = require('../lib/env');
loadDotEnv(path.join(repoRoot, '.env'));

const port = Number(process.env.GEMINI_CHROME_PORT || 9335);
const profileDir = process.env.GEMINI_CHROME_PROFILE || path.join(repoRoot, '.chrome-profile-gemini');
const outPath = process.env.GEMINI_AUTH_PATH || path.join(repoRoot, 'gemini-auth.json');
const targetUrl = 'https://gemini.google.com/app';

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function ask(q) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(q, (ans) => { rl.close(); resolve(ans); }));
}

function resolveChromePath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }

    const linuxPaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/brave-browser'
    ];

    for (const p of linuxPaths) {
        if (fs.existsSync(p)) return p;
    }

    // Windows paths
    if (process.platform === 'win32') {
        const winPaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
        ];
        for (const p of winPaths) {
            if (fs.existsSync(p)) return p;
        }
    }

    // macOS paths
    if (process.platform === 'darwin') {
        const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        if (fs.existsSync(macPath)) return macPath;
    }

    return '';
}

async function devtoolsReady() {
    try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;
    }
}

async function waitDevtools() {
    for (let i = 0; i < 60; i++) {
        const v = await devtoolsReady();
        if (v) return v;
        await sleep(250);
    }
    throw new Error('Chrome DevTools endpoint did not respond on port ' + port);
}

async function getPageTarget() {
    for (let i = 0; i < 40; i++) {
        try {
            const r = await fetch(`http://127.0.0.1:${port}/json`);
            if (r.ok) {
                const targets = await r.json();
                const page = targets.find((t) => t.type === 'page' && /gemini\.google\.com/.test(t.url))
                    || targets.find((t) => t.type === 'page');
                if (page?.webSocketDebuggerUrl) return page;
            }
        } catch {}
        await sleep(300);
    }
    throw new Error('No Chrome page target found');
}

class CDP {
    constructor(wsUrl) {
        if (typeof WebSocket === 'undefined') {
            throw new Error('Node.js 22+ or built-in WebSocket is required.');
        }
        this.ws = new WebSocket(wsUrl);
        this.id = 0;
        this.pending = new Map();
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(JSON.stringify(msg.error)));
                else resolve(msg.result);
            }
        };
    }

    ready() {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState === 1) return resolve();
            this.ws.onopen = () => resolve();
            this.ws.onerror = (err) => reject(err);
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.id;
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    close() {
        try { this.ws.close(); } catch {}
    }
}

async function main() {
    console.log('[c4] Starting Gemini Web Chrome Auth extraction...');
    const chrome = resolveChromePath();
    if (!chrome) {
        console.error('[-] Could not find Chrome/Chromium executable. Set CHROME_PATH environment variable.');
        process.exit(1);
    }

    console.log(`[+] Using browser: ${chrome}`);
    console.log(`[+] Profile directory: ${profileDir}`);

    const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        targetUrl
    ];

    const proc = spawn(chrome, args, { stdio: 'ignore', detached: true });
    proc.unref();

    console.log(`[+] Waiting for DevTools on port ${port}...`);
    await waitDevtools();

    console.log('[+] Chrome opened. Please log into your Google Account in the opened window.');
    console.log('[+] After signing in and reaching https://gemini.google.com/app:');
    await ask('Press [Enter] here in terminal when you are fully logged in...');

    const page = await getPageTarget();
    console.log(`[+] Connected to page: ${page.url}`);

    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.ready();

    // 1. Extract cookies
    const cookieRes = await cdp.send('Network.getCookies', {
        urls: ['https://gemini.google.com', 'https://google.com', 'https://accounts.google.com']
    });

    const cookies = cookieRes.cookies || [];
    const cookieMap = {};
    const cookiePairs = [];

    for (const c of cookies) {
        cookieMap[c.name] = c.value;
        cookiePairs.push(`${c.name}=${c.value}`);
    }

    const cookieHeader = cookiePairs.join('; ');
    const secure1psid = cookieMap['__Secure-1PSID'] || '';
    const secure1psidts = cookieMap['__Secure-1PSIDTS'] || '';
    const secure1psidcc = cookieMap['__Secure-1PSIDCC'] || '';

    if (!secure1psid) {
        console.warn('[-] Warning: __Secure-1PSID cookie not found. Are you logged in?');
    } else {
        console.log('[+] Found __Secure-1PSID session cookie.');
    }

    // 2. Extract SNlM0e and build label from page context
    const evalRes = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
            const wiz = window.WIZ_global_data || {};
            const html = document.documentElement ? document.documentElement.innerHTML : "";
            const snlMatch = html.match(/"SNlM0e":\\s*"([^"]+)"/);
            const cfbMatch = html.match(/"cfb2h":\\s*"([^"]+)"/);
            const fsidMatch = html.match(/"FdrFJe":\\s*"([^"]+)"/);
            return {
                snlm0e: wiz.SNlM0e || (snlMatch ? snlMatch[1] : ""),
                bl: wiz.cfb2h || (cfbMatch ? cfbMatch[1] : ""),
                fsid: wiz.FdrFJe || (fsidMatch ? fsidMatch[1] : "")
            };
        })()`,
        returnByValue: true
    });

    const pageTokens = evalRes.result?.value || {};
    let snlm0e = pageTokens.snlm0e || '';
    let bl = pageTokens.bl || 'boq_gemini-web-uiserver_20261113.11_p0';
    let fsid = pageTokens.fsid || '';

    // If not extracted via page evaluation, try fetching the page HTML directly with our cookies
    if (!snlm0e && cookieHeader) {
        console.log('[*] Extracting SNlM0e token via HTTP fetch...');
        try {
            const resp = await fetch('https://gemini.google.com/app', {
                headers: {
                    'Cookie': cookieHeader,
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
                }
            });
            const text = await resp.text();
            const snlMatch = text.match(/"SNlM0e":\s*"([^"]+)"/);
            const cfbMatch = text.match(/"cfb2h":\s*"([^"]+)"/);
            if (snlMatch) snlm0e = snlMatch[1];
            if (cfbMatch) bl = cfbMatch[1];
        } catch (e) {
            console.warn('[-] HTTP fetch fallback failed:', e.message);
        }
    }

    cdp.close();

    const authConfig = {
        cookies: cookieHeader,
        secure_1psid: secure1psid,
        secure_1psidts: secure1psidts,
        secure_1psidcc: secure1psidcc,
        snlm0e: snlm0e,
        bl: bl,
        fsid: fsid,
        updated_at: new Date().toISOString()
    };

    fs.writeFileSync(outPath, JSON.stringify(authConfig, null, 2), 'utf8');
    console.log(`\n[+] Successfully saved Gemini credentials to: ${outPath}`);
    console.log(`[+] SNlM0e token: ${snlm0e ? (snlm0e.slice(0, 15) + '...') : 'none (will refresh on start)'}`);
    console.log(`[+] Build label: ${bl}`);
    console.log('\nReady! You can now run: npm start');
}

main().catch((err) => {
    console.error('[-] Auth extraction failed:', err);
    process.exit(1);
});
