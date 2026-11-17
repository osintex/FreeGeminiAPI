#!/usr/bin/env node

/**
 * Universal Gemini Web Login & Token Extractor.
 * Supports:
 *  1. Firefox Native Stealth (clean profile without RemoteAgent / WebDriver debugging, bypasses Google bot detection)
 *  2. Chromium / Chrome / Brave / Edge (via CDP with AutomationControlled disabled)
 *  3. Manual Token Paste fallback (for headless / SSH environments)
 * Zero external npm dependencies (uses Node.js 18+ built-in fetch & SQLite / Python3 fallback).
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const repoRoot = path.resolve(__dirname, '..');
const outPath = process.env.GEMINI_AUTH_PATH || path.join(repoRoot, 'gemini-auth.json');
const targetUrl = 'https://gemini.google.com/app';
const port = Number(process.env.GEMINI_AUTH_PORT || 9444);

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function detectBrowser() {
    if (process.env.BROWSER) {
        return { type: process.env.BROWSER.toLowerCase().includes('firefox') ? 'firefox' : 'chromium', path: process.env.BROWSER };
    }

    // Check Firefox
    const firefoxPaths = ['/usr/bin/firefox', '/bin/firefox'];
    for (const p of firefoxPaths) {
        if (fs.existsSync(p)) return { type: 'firefox', path: p };
    }

    // Check Chromium family
    const chromiumPaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/brave-browser',
        '/usr/bin/microsoft-edge'
    ];
    for (const p of chromiumPaths) {
        if (fs.existsSync(p)) return { type: 'chromium', path: p };
    }

    return null;
}

// --------------------------------------------------------------------------
// Cookie Reader for Firefox Profile (SQLite)
// --------------------------------------------------------------------------
function readFirefoxCookies(profileDir) {
    const dbPath = path.join(profileDir, 'cookies.sqlite');
    if (!fs.existsSync(dbPath)) return [];

    // 1. Native Node.js 22.5+ node:sqlite
    try {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(dbPath, { readOnly: true });
        const rows = db.prepare("SELECT name, value, host FROM moz_cookies WHERE host LIKE '%google.com%'").all();
        db.close();
        if (rows && rows.length > 0) {
            return rows.map(r => ({ name: r.name, value: r.value, domain: r.host }));
        }
    } catch {}

    // 2. Python3 sqlite3 fallback
    try {
        const pyCode = "import sqlite3, json, sys\n" +
            "try:\n" +
            "    con = sqlite3.connect(f'file:{sys.argv[1]}?immutable=1', uri=True)\n" +
            "    cur = con.cursor()\n" +
            "    cur.execute(\"SELECT name, value, host FROM moz_cookies WHERE host LIKE '%google.com%'\")\n" +
            "    print(json.dumps([{'name': r[0], 'value': r[1], 'domain': r[2]} for r in cur.fetchall()]))\n" +
            "except:\n" +
            "    print('[]')";
        const out = execFileSync('python3', ['-c', pyCode, dbPath], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const parsed = JSON.parse(out.trim() || '[]');
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}

    // 3. sqlite3 CLI fallback
    try {
        const out = execFileSync('sqlite3', [
            `file:${dbPath}?immutable=1`,
            "SELECT name || '|' || value || '|' || host FROM moz_cookies WHERE host LIKE '%google.com%';"
        ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const lines = out.split('\n').filter(Boolean);
        const list = [];
        for (const line of lines) {
            const parts = line.split('|');
            if (parts.length >= 3) {
                list.push({ name: parts[0], value: parts[1], domain: parts[2] });
            }
        }
        if (list.length > 0) return list;
    } catch {}

    return [];
}

async function extractSnlm0eFromWeb(cookieHeader) {
    try {
        const resp = await fetch('https://gemini.google.com/app', {
            headers: {
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'
            }
        });
        const html = await resp.text();
        const snlMatch = html.match(/"SNlM0e":\s*"([^"]+)"/);
        return snlMatch ? snlMatch[1] : '';
    } catch {
        return '';
    }
}

// --------------------------------------------------------------------------
// Firefox Authentication (Stealth / Native Profile)
// Does NOT use --remote-debugging-port to avoid Google's "RemoteAgent" blocker
// --------------------------------------------------------------------------
async function authWithFirefox(browserPath) {
    const profileDir = path.join(repoRoot, '.firefox-profile-gemini');
    fs.mkdirSync(profileDir, { recursive: true });

    // Enforce clean stealth preferences in profile
    const userJs = path.join(profileDir, 'user.js');
    const stealthPrefs = `
user_pref("dom.webdriver.enabled", false);
user_pref("marionette.enabled", false);
user_pref("app.update.auto", false);
user_pref("browser.shell.checkDefaultBrowser", false);
`;
    fs.writeFileSync(userJs, stealthPrefs, 'utf8');

    console.log(`[+] Запуск Firefox: ${browserPath}`);
    console.log(`[+] Профиль: ${profileDir}`);

    const args = [
        '-profile', profileDir,
        '-no-remote',
        targetUrl
    ];

    const proc = spawn(browserPath, args, { stdio: 'ignore' });
    proc.on('error', err => console.error('[-] Ошибка запуска Firefox:', err.message));

    console.log('--------------------------------------------------');
    console.log('Пожалуйста, войдите в Google Аккаунт в открывшемся окне.');
    console.log('(Браузер запущен без отладочных портов, защита Google не ругается).');
    console.log('Скрипт автоматически перехватит сессию после входа в Gemini.');
    console.log('--------------------------------------------------');

    let captured = null;
    const startTime = Date.now();
    const timeoutMs = 7 * 60 * 1000; // 7 minutes

    while (Date.now() - startTime < timeoutMs) {
        await sleep(1500);

        const cookies = readFirefoxCookies(profileDir);
        const psid = cookies.find(c => c.name === '__Secure-1PSID');
        const psidts = cookies.find(c => c.name === '__Secure-1PSIDTS');
        const psidcc = cookies.find(c => c.name === '__Secure-1PSIDCC');

        if (psid && psid.value) {
            console.log('\n[✔] Обнаружен вход в Google! __Secure-1PSID найден.');
            console.log('[*] Получение токена SNlM0e...');

            // Allow extra 1.5s for remaining cookies
            await sleep(1500);
            const freshCookies = readFirefoxCookies(profileDir);

            const cookieHeader = freshCookies
                .filter(c => c.domain.includes('google.com'))
                .map(c => `${c.name}=${c.value}`)
                .join('; ');

            const snlm0e = await extractSnlm0eFromWeb(cookieHeader);

            captured = {
                cookies: cookieHeader,
                secure_1psid: psid.value,
                secure_1psidts: psidts ? psidts.value : '',
                secure_1psidcc: psidcc ? psidcc.value : '',
                snlm0e: snlm0e,
                updated_at: new Date().toISOString()
            };
            break;
        }

        // If user closed Firefox manually before finding cookie, break to prompt
        if (proc.exitCode !== null) {
            // Check one last time
            const lastCookies = readFirefoxCookies(profileDir);
            const lastPsid = lastCookies.find(c => c.name === '__Secure-1PSID');
            if (lastPsid && lastPsid.value) {
                const cookieHeader = lastCookies
                    .filter(c => c.domain.includes('google.com'))
                    .map(c => `${c.name}=${c.value}`)
                    .join('; ');
                const snlm0e = await extractSnlm0eFromWeb(cookieHeader);
                captured = {
                    cookies: cookieHeader,
                    secure_1psid: lastPsid.value,
                    secure_1psidts: '',
                    secure_1psidcc: '',
                    snlm0e: snlm0e,
                    updated_at: new Date().toISOString()
                };
            }
            break;
        }
    }

    try { proc.kill('SIGTERM'); } catch {}

    if (!captured) {
        throw new Error('Вход не был завершен или куки не найдены в профиле Firefox.');
    }

    return captured;
}

// --------------------------------------------------------------------------
// Chromium / Chrome / Brave Authentication (CDP + AutomationControlled masked)
// --------------------------------------------------------------------------
async function authWithChromium(browserPath) {
    const profileDir = path.join(repoRoot, '.chrome-profile-gemini');
    fs.mkdirSync(profileDir, { recursive: true });

    console.log(`[+] Запуск Chromium: ${browserPath}`);
    console.log(`[+] Профиль: ${profileDir}`);

    const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        targetUrl
    ];

    const proc = spawn(browserPath, args, { stdio: 'ignore' });
    proc.on('error', err => console.error('[-] Chromium error:', err.message));

    console.log('[*] Ожидание подключения к Chrome DevTools...');
    let wsUrl = null;
    for (let i = 0; i < 20; i++) {
        await sleep(1000);
        try {
            const resp = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (resp.ok) {
                const data = await resp.json();
                wsUrl = data.webSocketDebuggerUrl;
                if (wsUrl) break;
            }
        } catch {}
    }

    if (!wsUrl) {
        proc.kill();
        throw new Error('Не удалось подключиться к порту отладки Chromium.');
    }

    const ws = await new Promise((resolve, reject) => {
        const s = new WebSocket(wsUrl);
        s.onopen = () => resolve(s);
        s.onerror = (e) => reject(e);
    });

    console.log('[✔] Подключено к Chrome DevTools Protocol.');
    console.log('--------------------------------------------------');
    console.log('Пожалуйста, войдите в Google Аккаунт в открывшемся окне.');
    console.log('Скрипт автоматически перехватит сессию после входа.');
    console.log('--------------------------------------------------');

    let msgId = 1;
    function sendCommand(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            const handler = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.id === id) {
                        ws.removeEventListener('message', handler);
                        if (data.error) {
                            reject(new Error(data.error.message || 'CDP Error'));
                        } else {
                            resolve(data.result);
                        }
                    }
                } catch (e) {
                    reject(e);
                }
            };
            ws.addEventListener('message', handler);
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    let captured = null;
    const startTime = Date.now();
    const timeoutMs = 5 * 60 * 1000;

    while (Date.now() - startTime < timeoutMs) {
        await sleep(2000);
        try {
            const cookieRes = await sendCommand('Network.getCookies', { urls: ['https://gemini.google.com', 'https://google.com'] });
            const cookies = (cookieRes && cookieRes.cookies) ? cookieRes.cookies : [];

            const psid = cookies.find(c => c.name === '__Secure-1PSID');
            const psidts = cookies.find(c => c.name === '__Secure-1PSIDTS');
            const psidcc = cookies.find(c => c.name === '__Secure-1PSIDCC');

            if (psid && psid.value) {
                console.log('\n[✔] Обнаружен вход в Google! __Secure-1PSID найден.');

                let snlm0e = '';
                try {
                    const evalRes = await sendCommand('Runtime.evaluate', {
                        expression: '(() => (window.WIZ_global_data && window.WIZ_global_data.SNlM0e) || "")()',
                        returnByValue: true
                    });
                    if (evalRes && evalRes.result && evalRes.result.value) {
                        snlm0e = evalRes.result.value;
                    }
                } catch {}

                const cookieHeader = cookies
                    .map(c => `${c.name}=${c.value}`)
                    .join('; ');

                captured = {
                    cookies: cookieHeader,
                    secure_1psid: psid.value,
                    secure_1psidts: psidts ? psidts.value : '',
                    secure_1psidcc: psidcc ? psidcc.value : '',
                    snlm0e: snlm0e,
                    updated_at: new Date().toISOString()
                };
                break;
            }
        } catch {}
    }

    try { ws.close(); } catch {}
    try { proc.kill(); } catch {}

    if (!captured) {
        throw new Error('Таймаут ожидания входа в Gemini.');
    }

    return captured;
}

// --------------------------------------------------------------------------
// Manual Cookie Fallback
// --------------------------------------------------------------------------
async function manualCookieAuth() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (q) => new Promise(res => rl.question(q, res));

    console.log('\n[!] Ручной ввод авторизации:');
    console.log('1. Откройте в своём обычном браузере: https://gemini.google.com/app');
    console.log('2. Нажмите F12 -> Application -> Cookies -> https://gemini.google.com');
    console.log('3. Скопируйте значение cookie: __Secure-1PSID');

    const psid = (await question('\nВставьте значение __Secure-1PSID: ')).trim();
    rl.close();

    if (!psid) {
        throw new Error('Значение __Secure-1PSID не может быть пустым.');
    }

    const cookieHeader = `__Secure-1PSID=${psid}`;
    console.log('[*] Проверка и получение SNlM0e токена...');
    const snlm0e = await extractSnlm0eFromWeb(cookieHeader);

    return {
        cookies: cookieHeader,
        secure_1psid: psid,
        secure_1psidts: '',
        secure_1psidcc: '',
        snlm0e: snlm0e,
        updated_at: new Date().toISOString()
    };
}

// --------------------------------------------------------------------------
// Main Universal Runner
// --------------------------------------------------------------------------
async function runUniversalAuth() {
    console.log('==================================================');
    console.log('[c4] FreeGeminiAPI — Авторизация Google Gemini');
    console.log('==================================================');

    const browser = detectBrowser();
    if (!browser) {
        console.warn('[!] Графический браузер не обнаружен в системе.');
        return await manualCookieAuth();
    }

    console.log(`[+] Обнаружен браузер: ${browser.type.toUpperCase()} (${browser.path})`);

    let authData;
    try {
        if (browser.type === 'firefox') {
            authData = await authWithFirefox(browser.path);
        } else {
            authData = await authWithChromium(browser.path);
        }
    } catch (err) {
        console.warn(`[-] Автоматический вход завершился с ошибкой: ${err.message}`);
        console.log('[*] Переключение на ручной ввод токена...');
        authData = await manualCookieAuth();
    }

    fs.writeFileSync(outPath, JSON.stringify(authData, null, 2), 'utf-8');
    console.log(`\n[✔] Учетные данные успешно сохранены в: ${outPath}`);
    console.log(`[✔] SNlM0e: ${authData.snlm0e ? authData.snlm0e.slice(0, 15) + '...' : 'будет получен при первом запросе'}`);
    console.log('[✔] Авторизация завершена. Готово к работе!');
    return authData;
}

if (require.main === module) {
    runUniversalAuth().catch(err => {
        console.error('[-] Ошибка авторизации:', err.message);
        process.exit(1);
    });
}

module.exports = { runUniversalAuth, detectBrowser, readFirefoxCookies };
