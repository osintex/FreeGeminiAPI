#!/usr/bin/env node

/**
 * Automates Codex CLI (~/.codex) configuration for FreeGeminiAPI.
 * Generates ~/.codex/models.json and configures ~/.codex/config.toml.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HOME = os.homedir();
const CODEX_DIR = path.join(HOME, '.codex');
const MODELS_FILE = path.join(CODEX_DIR, 'models.json');
const CACHE_FILE = path.join(CODEX_DIR, 'models_cache.json');
const CONFIG_FILE = path.join(CODEX_DIR, 'config.toml');

console.log('[+] Setting up Codex CLI for FreeGeminiAPI...');

if (!fs.existsSync(CODEX_DIR)) {
    fs.mkdirSync(CODEX_DIR, { recursive: true });
}

// Fetch base model template from Codex or use default schema
let baseModel = {
    slug: 'gemini-advanced',
    display_name: 'Gemini Advanced (Argon)',
    description: 'Google Gemini Advanced with extended thinking (Argon) and 1M context.',
    priority: 1,
    context_window: 1048576,
    max_context_window: 1048576,
    visibility: 'list',
    supported_in_api: true,
    shell_type: 'shell_command',
    tool_mode: 'standard',
    prefer_websockets: false,
    supports_parallel_tool_calls: true,
    input_modalities: ['text', 'image'],
    supports_image_detail_original: true,
    supports_search_tool: false,
    supports_experimental_context: false,
    use_responses_lite: false,
    supports_reasoning_effort_updates: true,
    default_reasoning_level: 'high',
    supported_reasoning_levels: [
        { effort: 'low', description: 'Fast responses with lighter reasoning' },
        { effort: 'medium', description: 'Balances speed and reasoning depth' },
        { effort: 'high', description: 'Deep reasoning for complex coding tasks' }
    ]
};

try {
    const raw = execSync('codex debug models 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.models) && parsed.models.length > 0) {
        baseModel = parsed.models[0];
    }
} catch {
    // Fallback to built-in schema
}

const geminiModels = [
    {
        id: 'gemini-advanced',
        name: 'Gemini Advanced (Argon)',
        desc: 'Google Gemini Advanced with extended thinking (Argon) and 1M context.',
        thinking: true,
        priority: 1
    },
    {
        id: 'gemini-hydrogen',
        name: 'Gemini Hydrogen',
        desc: 'Google Gemini Hydrogen fast low-latency tier with 1M context.',
        thinking: false,
        priority: 2
    },
    {
        id: 'gemini-2.0-flash-thinking',
        name: 'Gemini 2.0 Flash Thinking',
        desc: 'Gemini 2.0 Flash with reasoning/thinking enabled and 1M context.',
        thinking: true,
        priority: 3
    },
    {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        desc: 'Fast next-gen Gemini model with 1M context window.',
        thinking: false,
        priority: 4
    },
    {
        id: 'gemini-2.0-pro-exp',
        name: 'Gemini 2.0 Pro Experimental',
        desc: 'Gemini 2.0 Pro Experimental with deep reasoning for complex code and math.',
        thinking: true,
        priority: 5
    },
    {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        desc: 'Gemini 1.5 Pro with 1M context window.',
        thinking: false,
        priority: 6
    },
    {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        desc: 'Fast and lightweight Gemini model with 1M context.',
        thinking: false,
        priority: 7
    },
    {
        id: 'gemini-4-argon',
        name: 'Gemini 4 Argon',
        desc: 'c4 Argon frontier model.',
        thinking: true,
        priority: 8
    },
    {
        id: 'claude-3-7-sonnet',
        name: 'Claude 3.7 Sonnet (via Gemini)',
        desc: 'Claude 3.7 Sonnet alias routed via Gemini Advanced.',
        thinking: true,
        priority: 9
    },
    {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet (via Gemini)',
        desc: 'Claude 3.5 Sonnet alias routed via Gemini Advanced.',
        thinking: true,
        priority: 10
    },
    {
        id: 'claude-3-5-haiku',
        name: 'Claude 3.5 Haiku (via Gemini)',
        desc: 'Claude 3.5 Haiku alias routed via Gemini Hydrogen/Flash.',
        thinking: false,
        priority: 11
    },
    {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus (via Gemini)',
        desc: 'Claude 3 Opus alias routed via Gemini Advanced.',
        thinking: true,
        priority: 12
    }
];

const catalog = [];
for (const item of geminiModels) {
    const m = Object.assign({}, baseModel, {
        slug: item.id,
        display_name: item.name,
        description: item.desc,
        priority: item.priority,
        context_window: 1048576,
        max_context_window: 1048576,
        visibility: 'list',
        supported_in_api: true,
        shell_type: 'shell_command',
        tool_mode: 'standard',
        prefer_websockets: false,
        supports_parallel_tool_calls: true,
        input_modalities: ['text', 'image']
    });

    if (item.thinking) {
        m.default_reasoning_level = 'high';
        m.supported_reasoning_levels = [
            { effort: 'low', description: 'Fast responses with lighter reasoning' },
            { effort: 'medium', description: 'Balances speed and reasoning depth' },
            { effort: 'high', description: 'Deep reasoning for complex coding tasks' }
        ];
        m.supports_reasoning_effort_updates = true;
    } else {
        m.default_reasoning_level = 'none';
        m.supported_reasoning_levels = [];
        m.supports_reasoning_effort_updates = false;
    }

    catalog.push(m);
}

fs.writeFileSync(MODELS_FILE, JSON.stringify({ models: catalog }, null, 2), 'utf-8');
fs.writeFileSync(CACHE_FILE, JSON.stringify({ models: catalog }, null, 2), 'utf-8');
console.log(`[+] Saved ${catalog.length} models to ${MODELS_FILE}`);

// Update config.toml
let configContent = '';
if (fs.existsSync(CONFIG_FILE)) {
    configContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
}

const geminiProviderSection = `[model_providers.gemini]
name = "gemini"
base_url = "http://127.0.0.1:9656/v1"
wire_api = "responses"
supports_websockets = false`;

if (!configContent.includes('model_provider = "gemini"')) {
    configContent = `model_provider = "gemini"\nmodel = "gemini-advanced"\nmodel_catalog_json = "${MODELS_FILE}"\n\n` + configContent;
} else if (!configContent.includes('model_catalog_json =')) {
    configContent = configContent.replace(/model_provider\s*=\s*"gemini"/, `model_provider = "gemini"\nmodel_catalog_json = "${MODELS_FILE}"`);
}

if (!configContent.includes('[model_providers.gemini]')) {
    configContent += `\n\n${geminiProviderSection}\n`;
}

fs.writeFileSync(CONFIG_FILE, configContent.trim() + '\n', 'utf-8');
console.log(`[+] Updated ${CONFIG_FILE}`);

// Kill stale app-server daemon
try {
    execSync('pkill -f "codex app-server" 2>/dev/null');
} catch {}

console.log('[✔] Codex CLI is now configured to use FreeGeminiAPI with /model support!');
