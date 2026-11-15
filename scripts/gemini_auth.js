#!/usr/bin/env node

/**
 * Universal Gemini Web Login & Token Extractor.
 * Supports Firefox (via WebDriver BiDi) and Chromium/Chrome/Brave/Edge (via CDP).
 * Zero npm dependencies (uses Node.js 18+ built-in WebSocket & fetch).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outPath = process.env.GEMINI_AUTH_PATH || path.join(repoRoot, 'gemini-auth.json');
const targetUrl = 'https://gemini.google.com/app';
const port = Number(process.env.GEMINI_AUTH_PORT || 9444);

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function detectBrowser() {
    // Check user preference override
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
// Firefox Authentication (WebDriver BiDi)
// --------------------------------------------------------------------------
async function authWithFirefox(browserPath) {
    const profileDir = path.join(repoRoot, '.firefox-profile-gemini');
    fs.mkdirSync(profileDir, { recursive: true });

    console.log(`[+] Запуск Firefox: ${browserPath}`);
    console.log(`[+] Профиль: ${profileDir}`);

    const args = [
        `--remote-debugging-port=${port}`,
        '--remote-allow-system-access',
        '-profile', profileDir,
        '-no-remote',
        targetUrl
    ];

    const proc = spawn(browserPath, args, { stdio: 'ignore' });
    proc.on('error', err => console.error('[-] Firefox error:', err.message));

    console.log('[*] Ожидание подключения к Firefox BiDi...');
    let ws = null;
    for (let i = 0; i < 20; i++) {
        await sleep(1000);
        try {
            ws = await new Promise((resolve, reject) => {
                const s = new WebSocket(`ws://127.0.0.1:${port}/session`);
                s.onopen = () => resolve(s);
                s.onerror = (e) => reject(e);
            });
            break;
        } catch {}
    }

    if (!ws) {
        proc.kill();
        throw new Error('Не удалось подключиться к порту отладки Firefox.');
    }

    console.log('[✔] Подключено к Firefox WebDriver BiDi.');
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
                        if (data.type === 'error') {
                            reject(new Error(data.message || data.error));
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

    // Initialize session
    await sendCommand('session.new', { capabilities: {} });

    // Poll for cookies
    let captured = null;
    const startTime = Date.now();
    const timeoutMs = 5 * 60 * 1000; // 5 minutes

    while (Date.now() - startTime < timeoutMs) {
        await sleep(2000);
        try {
            const cookieRes = await sendCommand('storage.getCookies', {});
            const cookies = (cookieRes && cookieRes.cookies) ? cookieRes.cookies : [];

            const psid = cookies.find(c => c.name === '__Secure-1PSID');
            const psidts = cookies.find(c => c.name === '__Secure-1PSIDTS');
            const psidcc = cookies.find(c => c.name === '__Secure-1PSIDCC');

            if (psid && psid.value) {
                console.log('\n[✔] Обнаружен вход в Google! __Secure-1PSID найден.');

                // Get browsing context to evaluate SNlM0e
                let snlm0e = '';
                try {
                    const tree = await sendCommand('browsingContext.getTree', {});
                    if (tree.contexts && tree.contexts.length > 0) {
                        const ctx = tree.contexts[0].context;
                        const evalRes = await sendCommand('script.evaluate', {
                            expression: '(() => (window.WIZ_global_data && window.WIZ_global_data.SNlM0e) || "")()',
                            target: { context: ctx },
                            awaitPromise: true
                        });
                        if (evalRes && evalRes.result && evalRes.result.value) {
                            snlm0e = evalRes.result.value;
                        }
                    }
                } catch (err) {
                    // Script evaluation fallback
                }

                const cookieHeader = cookies
                    .filter(c => c.domain.includes('google.com'))
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
        } catch (err) {
            // Still waiting or page navigating
        }
    }

    try { ws.close(); } catch {}
    try { proc.kill(); } catch {}

    if (!captured) {
        throw new Error('Таймаут ожидания входа в Gemini.');
    }

    return captured;
}

// --------------------------------------------------------------------------
// Chromium / Chrome / Brave Authentication (CDP)
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
// Main Universal Runner
// --------------------------------------------------------------------------
async function runUniversalAuth() {
    console.log('==================================================');
    console.log('[c4] FreeGeminiAPI — Авторизация Google Gemini');
    console.log('==================================================');

    const browser = detectBrowser();
    if (!browser) {
        console.error('[-] Не найден поддерживаемый браузер (Firefox, Chrome, Chromium, Brave).');
        console.error('[-] Установите Firefox или Chromium, либо задайте BROWSER=/path/to/browser');
        process.exit(1);
    }

    console.log(`[+] Обнаружен браузер: ${browser.type.toUpperCase()} (${browser.path})`);

    let authData;
    if (browser.type === 'firefox') {
        authData = await authWithFirefox(browser.path);
    } else {
        authData = await authWithChromium(browser.path);
    }

    fs.writeFileSync(outPath, JSON.stringify(authData, null, 2), 'utf-8');
    console.log(`[✔] Учетные данные успешно сохранены в: ${outPath}`);
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

module.exports = { runUniversalAuth, detectBrowser };
