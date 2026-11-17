#!/usr/bin/env node

/**
 * Automates Claude Code CLI (@anthropic-ai/claude-code) configuration
 * to use the local FreeGeminiAPI proxy server (Anthropic Messages API on :9656).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HOME = os.homedir();
const LOCAL_BIN = path.join(HOME, '.local', 'bin');
const LAUNCHER_PATH = path.join(LOCAL_BIN, 'claude-free');
const LAUNCHER_ALT = path.join(LOCAL_BIN, 'claude-gemini');

console.log('==================================================');
console.log('[c4] Setting up Claude Code CLI for FreeGeminiAPI');
console.log('==================================================');

// 1. Ensure ~/.local/bin exists
if (!fs.existsSync(LOCAL_BIN)) {
    fs.mkdirSync(LOCAL_BIN, { recursive: true });
}

// 2. Check if claude is installed
let claudeBinary = null;
try {
    claudeBinary = execSync('which claude 2>/dev/null', { encoding: 'utf-8' }).trim();
} catch {}

if (!claudeBinary) {
    console.warn('[!] Предупреждение: утилита `claude` не найдена в $PATH.');
    console.log('[*] Установите Claude Code глобально через npm:');
    console.log('    npm install -g @anthropic-ai/claude-code\n');
} else {
    console.log(`[+] Обнаружен Claude Code: ${claudeBinary}`);
}

// 3. Create wrapper launcher script
const launcherScript = `#!/usr/bin/env bash
# FreeGeminiAPI launcher for Claude Code
# Routes all Anthropic Messages API calls through local Gemini proxy

export ANTHROPIC_BASE_URL="http://127.0.0.1:9656"
export ANTHROPIC_API_KEY="freegemini"
export CLAUDE_CODE_USE_BEDROCK=0
export CLAUDE_CODE_USE_VERTEX=0

# Check if FreeGeminiAPI is running
if ! curl -s --max-time 1 http://127.0.0.1:9656/health >/dev/null 2>&1; then
    echo "[!] FreeGeminiAPI не запущен на http://127.0.0.1:9656"
    echo "[*] Запустите: freegemini bg"
    echo ""
fi

exec claude "$@"
`;

fs.writeFileSync(LAUNCHER_PATH, launcherScript, { mode: 0o755 });
fs.writeFileSync(LAUNCHER_ALT, launcherScript, { mode: 0o755 });
console.log(`[+] Создан скрипт запуска: ${LAUNCHER_PATH}`);
console.log(`[+] Симлинк/алиас: ${LAUNCHER_ALT}`);

// 4. Update Shell RC files (.bashrc, .zshrc) with convenient aliases
const shellFiles = [path.join(HOME, '.bashrc'), path.join(HOME, '.zshrc')];
const aliasBlock = `\n# FreeGeminiAPI Claude Code Integration\nalias claude-free='ANTHROPIC_BASE_URL="http://127.0.0.1:9656" ANTHROPIC_API_KEY="freegemini" claude'\n`;

for (const shFile of shellFiles) {
    if (fs.existsSync(shFile)) {
        const content = fs.readFileSync(shFile, 'utf-8');
        if (!content.includes('claude-free')) {
            fs.appendFileSync(shFile, aliasBlock, 'utf-8');
            console.log(`[+] Добавлен алиас \`claude-free\` в ${shFile}`);
        }
    }
}

// 5. Configure Claude Code config directory if present (~/.claude)
const claudeConfigDir = path.join(HOME, '.claude');
if (!fs.existsSync(claudeConfigDir)) {
    fs.mkdirSync(claudeConfigDir, { recursive: true });
}

const settingsFile = path.join(claudeConfigDir, 'settings.json');
let settings = {};
if (fs.existsSync(settingsFile)) {
    try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    } catch {}
}

settings.apiKeyHelper = 'echo freegemini';
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
console.log(`[+] Настройки Claude Code обновлены: ${settingsFile}`);

console.log('\n--------------------------------------------------');
console.log('[✔] Claude Code успешно настроен для работы с FreeGeminiAPI!');
console.log('--------------------------------------------------');
console.log('Для запуска выполните любую команду:');
console.log('  1. claude-free');
console.log('  2. claude-gemini');
console.log('  3. ANTHROPIC_BASE_URL="http://127.0.0.1:9656" ANTHROPIC_API_KEY="freegemini" claude');
console.log('--------------------------------------------------\n');
