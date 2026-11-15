#!/usr/bin/env node
/**
 * FreeGeminiAPI - OpenAI-compatible API server wrapping Google Gemini Web
 * 
 * Exposes /v1/chat/completions (streaming SSE & non-streaming) and /v1/models
 * Compatible with Open WebUI, LiteLLM, Claude Code, Cline, curl, OpenAI SDK.
 * 
 * Pure Node.js (18+), zero npm dependencies.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadDotEnv } = require('./lib/env');

loadDotEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 9656);
const HOST = process.env.HOST || '127.0.0.1';
const PROXY_API_KEY = process.env.PROXY_API_KEY || '';
const AUTH_FILE = process.env.GEMINI_AUTH_PATH || path.join(__dirname, 'gemini-auth.json');
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gemini-2.0-flash';
const FETCH_TIMEOUT_MS = Number(process.env.GEMINI_FETCH_TIMEOUT_MS || 60000);

let authConfig = {
    cookies: '',
    snlm0e: '',
    bl: 'boq_gemini-web-uiserver_20261113.11_p0',
    fsid: ''
};

// Map of user/session -> { cid, rid, rcid, lastUsed }
const sessionCache = new Map();

function loadAuth() {
    if (!fs.existsSync(AUTH_FILE)) {
        console.warn(`[!] Auth file not found: ${AUTH_FILE}`);
        console.warn('[!] Run "npm run auth" or copy auth.example.json to gemini-auth.json');
        return false;
    }
    try {
        const raw = fs.readFileSync(AUTH_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        authConfig = {
            cookies: parsed.cookies || '',
            snlm0e: parsed.snlm0e || '',
            bl: parsed.bl || 'boq_gemini-web-uiserver_20261113.11_p0',
            fsid: parsed.fsid || ''
        };
        console.log(`[+] Loaded Gemini credentials from ${AUTH_FILE}`);
        return true;
    } catch (e) {
        console.error(`[-] Failed to parse ${AUTH_FILE}: ${e.message}`);
        return false;
    }
}

async function refreshTokensIfNeeded() {
    if (!authConfig.cookies) return false;
    if (authConfig.snlm0e) return true;

    console.log('[*] Refreshing SNlM0e token from gemini.google.com/app...');
    try {
        const resp = await fetch('https://gemini.google.com/app', {
            headers: {
                'Cookie': authConfig.cookies,
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
            }
        });
        const html = await resp.text();
        const snlMatch = html.match(/"SNlM0e":\s*"([^"]+)"/);
        const cfbMatch = html.match(/"cfb2h":\s*"([^"]+)"/);
        const fsidMatch = html.match(/"FdrFJe":\s*"([^"]+)"/);

        if (snlMatch) authConfig.snlm0e = snlMatch[1];
        if (cfbMatch) authConfig.bl = cfbMatch[1];
        if (fsidMatch) authConfig.fsid = fsidMatch[1];

        if (authConfig.snlm0e) {
            console.log(`[+] Refreshed SNlM0e: ${authConfig.snlm0e.slice(0, 15)}...`);
            fs.writeFileSync(AUTH_FILE, JSON.stringify(authConfig, null, 2), 'utf8');
            return true;
        } else {
            console.warn('[-] Could not extract SNlM0e from Google. Check your cookies.');
            return false;
        }
    } catch (e) {
        console.error('[-] Error refreshing tokens:', e.message);
        return false;
    }
}

// Model identifiers and capability mapping
const AVAILABLE_MODELS = [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', modelNumber: 1, thinking: false, advanced: false },
    { id: 'gemini-2.0-flash-thinking', name: 'Gemini 2.0 Flash Thinking', modelNumber: 1, thinking: true, advanced: false },
    { id: 'gemini-2.0-pro-exp', name: 'Gemini 2.0 Pro Experimental', modelNumber: 3, thinking: true, advanced: true },
    { id: 'gemini-advanced', name: 'Gemini Advanced (Argon)', modelNumber: 3, thinking: true, advanced: true },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', modelNumber: 3, thinking: false, advanced: true },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', modelNumber: 1, thinking: false, advanced: false }
];

function resolveModelConfig(modelName) {
    const clean = String(modelName || '').toLowerCase().trim();
    const found = AVAILABLE_MODELS.find(m => m.id === clean || m.name.toLowerCase() === clean);
    if (found) return found;
    if (clean.includes('thinking')) {
        return { id: modelName, modelNumber: 1, thinking: true, advanced: false };
    }
    if (clean.includes('pro') || clean.includes('advanced') || clean.includes('argon')) {
        return { id: modelName, modelNumber: 3, thinking: true, advanced: true };
    }
    return { id: modelName || DEFAULT_MODEL, modelNumber: 1, thinking: false, advanced: false };
}

function buildInnerRequest(prompt, lang = 'ru', session = null, thinking = false, modelNumber = 1) {
    const inner = new Array(81).fill(null);
    inner[0] = [prompt, 0, null, null, null, null, 0];
    inner[1] = [lang];
    inner[2] = session ? [session.cid || '', session.rid || '', session.rcid || '', null, null, null, null, null, null, ''] : ['', '', '', null, null, null, null, null, null, ''];
    inner[6] = [1];
    inner[7] = 1; // Streaming
    inner[10] = 1;
    inner[11] = 0;
    inner[17] = [[0]];
    inner[18] = 0;
    inner[27] = 1;
    inner[30] = [4];
    inner[41] = [1];
    inner[53] = 0;
    inner[59] = crypto.randomUUID().toUpperCase();
    inner[61] = [];
    inner[68] = 1;
    inner[79] = modelNumber; // 1 = Flash, 3 = Pro / Advanced
    inner[80] = thinking ? 2 : 1; // Extended thinking flag
    return inner;
}

/**
 * Parses length-prefixed chunks / envelopes from Google's batchexecute stream
 */
function parseStreamChunks(bufferState) {
    const frames = [];
    while (true) {
        const nl = bufferState.buffer.indexOf('\n');
        if (nl === -1) break;
        const line = bufferState.buffer.slice(0, nl).trim();
        bufferState.buffer = bufferState.buffer.slice(nl + 1);

        if (line.startsWith('[["wrb.fr"')) {
            try {
                const parsed = JSON.parse(line);
                frames.push(parsed);
            } catch {}
        }
    }
    return frames;
}

/**
 * Extracts assistant response text, reasoning/thoughts, and session IDs from Google frame
 */
function extractCandidateData(frame) {
    if (!Array.isArray(frame)) return null;
    let text = '';
    let thoughts = '';
    let cid = '';
    let rid = '';
    let rcid = '';
    let isCompleted = false;

    for (const part of frame) {
        if (!Array.isArray(part) || part.length < 3) continue;
        const innerJsonStr = part[2];
        if (typeof innerJsonStr !== 'string') continue;

        try {
            const inner = JSON.parse(innerJsonStr);
            // Session metadata
            const meta = inner?.[1];
            if (Array.isArray(meta)) {
                if (meta[0]) cid = meta[0];
                if (meta[1]) rid = meta[1];
            }

            // Candidates
            const candidates = inner?.[4];
            if (Array.isArray(candidates) && candidates.length > 0) {
                const c = candidates[0];
                rcid = c?.[0] || '';
                
                // Content text
                const rawText = c?.[1]?.[0];
                if (typeof rawText === 'string') text = rawText;

                // Reasoning / thoughts
                const rawThoughts = c?.[37]?.[0]?.[0];
                if (typeof rawThoughts === 'string') thoughts = rawThoughts;

                const indicator = c?.[8]?.[0];
                if (indicator === 2) isCompleted = true;
            }
        } catch {}
    }

    if (!text && !thoughts && !cid) return null;
    return { text, thoughts, cid, rid, rcid, isCompleted };
}

function normalizeResponsesInput(input) {
    if (typeof input === 'string') return [{ role: 'user', content: input }];
    if (!Array.isArray(input)) return [];
    const messages = [];
    for (const item of input) {
        if (!item || typeof item !== 'object') continue;
        if (item.type === 'message' || item.role) {
            let contentStr = '';
            if (typeof item.content === 'string') {
                contentStr = item.content;
            } else if (Array.isArray(item.content)) {
                for (const part of item.content) {
                    if (part?.type === 'input_text' || part?.type === 'text') {
                        contentStr += (part.text || '') + '\n';
                    } else if (typeof part === 'string') {
                        contentStr += part + '\n';
                    }
                }
            }
            messages.push({ role: item.role || 'user', content: contentStr.trim() });
        } else if (item.type === 'input_text') {
            messages.push({ role: 'user', content: item.text || '' });
        }
    }
    return messages;
}

function formatMessagesToPrompt(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return '';
    if (messages.length === 1) return messages[0].content || '';

    // Multi-turn formatting
    const parts = [];
    for (const m of messages) {
        const role = m.role === 'system' ? 'System Instruction' : (m.role === 'assistant' ? 'Model' : 'User');
        parts.push(`[${role}]:\n${m.content || ''}`);
    }
    return parts.join('\n\n');
}

function verifyAuth(req) {
    if (!PROXY_API_KEY) return true;
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === PROXY_API_KEY) return true;
    const apiKey = req.headers['x-api-key'] || '';
    return apiKey === PROXY_API_KEY;
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*'
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        });
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;

    // Health
    if (pathname === '/' || pathname === '/health') {
        return sendJson(res, 200, {
            status: 'ok',
            service: 'FreeGeminiAPI',
            authenticated: Boolean(authConfig.cookies && authConfig.snlm0e),
            default_model: DEFAULT_MODEL,
            available_models: AVAILABLE_MODELS.map(m => m.id)
        });
    }

    if (!verifyAuth(req)) {
        return sendJson(res, 401, { error: { message: 'Unauthorized: invalid or missing proxy API key', type: 'invalid_request_error' } });
    }

    // GET /v1/models
    if (pathname === '/v1/models' && req.method === 'GET') {
        return sendJson(res, 200, {
            object: 'list',
            data: AVAILABLE_MODELS.map(m => ({
                id: m.id,
                object: 'model',
                created: Math.floor(Date.now() / 1000),
                owned_by: 'google',
                permission: [],
                root: m.id,
                parent: null
            }))
        });
    }

    // POST /v1/chat/completions, /v1/messages, /v1/responses
    if ((pathname === '/v1/chat/completions' || pathname === '/v1/messages' || pathname === '/v1/responses') && req.method === 'POST') {
        const isResponsesApi = (pathname === '/v1/responses');
        let bodyRaw = '';
        req.on('data', chunk => { bodyRaw += chunk; });
        req.on('end', async () => {
            let body = {};
            try {
                body = JSON.parse(bodyRaw);
            } catch {
                return sendJson(res, 400, { error: { message: 'Invalid JSON body' } });
            }

            const isStream = Boolean(body.stream);
            const modelConfig = resolveModelConfig(body.model);
            
            let messages = [];
            if (isResponsesApi) {
                messages = normalizeResponsesInput(body.input);
                if (body.instructions) {
                    messages.unshift({ role: 'system', content: body.instructions });
                }
            } else {
                messages = body.messages || [];
            }

            const prompt = formatMessagesToPrompt(messages);
            const userKey = body.user || 'default';
            const session = sessionCache.get(userKey) || null;

            if (!prompt) {
                return sendJson(res, 400, { error: { message: 'Prompt or messages array is required and cannot be empty' } });
            }

            if (!authConfig.cookies) loadAuth();
            await refreshTokensIfNeeded();
            if (!authConfig.cookies || !authConfig.snlm0e) {
                return sendJson(res, 500, {
                    error: {
                        message: 'Gemini auth credentials not ready. Run "npm run auth" or check gemini-auth.json',
                        type: 'auth_error'
                    }
                });
            }

            const reqId = Math.floor(Math.random() * 90000) + 10000;
            const targetEndpoint = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${encodeURIComponent(authConfig.bl)}&_reqid=${reqId}&rt=c`;

            const innerReq = buildInnerRequest(prompt, 'ru', session, modelConfig.thinking, 1);
            const postData = new URLSearchParams();
            postData.append('f.req', JSON.stringify([null, JSON.stringify(innerReq)]));
            postData.append('at', authConfig.snlm0e);

            const requestHeaders = {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'Cookie': authConfig.cookies,
                'Origin': 'https://gemini.google.com',
                'Referer': 'https://gemini.google.com/app',
                'X-Same-Domain': '1',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
            };

            try {
                const upstreamResp = await fetch(targetEndpoint, {
                    method: 'POST',
                    headers: requestHeaders,
                    body: postData.toString()
                });

                if (!upstreamResp.ok) {
                    const errText = await upstreamResp.text();
                    console.error(`[-] Upstream returned HTTP ${upstreamResp.status}:`, errText.slice(0, 200));
                    return sendJson(res, upstreamResp.status, {
                        error: {
                            message: `Google Gemini upstream HTTP error: ${upstreamResp.status}`,
                            upstream_body: errText.slice(0, 300)
                        }
                    });
                }

                const completionId = `chatcmpl-${crypto.randomUUID()}`;
                const respId = `resp_${crypto.randomUUID()}`;
                const msgId = `msg_${crypto.randomUUID()}`;
                const createdTime = Math.floor(Date.now() / 1000);

                if (isStream) {
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*'
                    });

                    if (isResponsesApi) {
                        res.write(`event: response.created\ndata: ${JSON.stringify({
                            type: 'response.created',
                            response: {
                                id: respId,
                                object: 'response',
                                status: 'in_progress',
                                model: modelConfig.id,
                                output: []
                            }
                        })}\n\n`);

                        res.write(`event: response.output_item.added\ndata: ${JSON.stringify({
                            type: 'response.output_item.added',
                            output_index: 0,
                            item: {
                                id: msgId,
                                type: 'message',
                                role: 'assistant',
                                status: 'in_progress',
                                content: []
                            }
                        })}\n\n`);

                        res.write(`event: response.content_part.added\ndata: ${JSON.stringify({
                            type: 'response.content_part.added',
                            output_index: 0,
                            content_index: 0,
                            part: {
                                type: 'output_text',
                                text: '',
                                annotations: []
                            }
                        })}\n\n`);
                    }
                }

                const reader = upstreamResp.body.getReader();
                const decoder = new TextDecoder('utf-8');
                const bufferState = { buffer: '', expectedUnits: null };

                let lastFullText = '';
                let lastFullThoughts = '';
                let finalCid = session?.cid || '';
                let finalRid = session?.rid || '';
                let finalRcid = session?.rcid || '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunkStr = decoder.decode(value, { stream: true });
                    bufferState.buffer += chunkStr;
                    const frames = parseStreamChunks(bufferState);

                    for (const frame of frames) {
                        const parsed = extractCandidateData(frame);
                        if (!parsed) continue;

                        if (parsed.cid) finalCid = parsed.cid;
                        if (parsed.rid) finalRid = parsed.rid;
                        if (parsed.rcid) finalRcid = parsed.rcid;

                        // Calculate text deltas
                        if (parsed.text && parsed.text.length > lastFullText.length) {
                            const delta = parsed.text.slice(lastFullText.length);
                            lastFullText = parsed.text;

                            if (isStream) {
                                if (isResponsesApi) {
                                    res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({
                                        type: 'response.output_text.delta',
                                        output_index: 0,
                                        content_index: 0,
                                        delta: delta
                                    })}\n\n`);
                                } else {
                                    res.write(`data: ${JSON.stringify({
                                        id: completionId,
                                        object: 'chat.completion.chunk',
                                        created: createdTime,
                                        model: modelConfig.id,
                                        choices: [{
                                            index: 0,
                                            delta: { content: delta },
                                            finish_reason: null
                                        }]
                                    })}\n\n`);
                                }
                            }
                        }

                        // Calculate reasoning deltas
                        if (parsed.thoughts && parsed.thoughts.length > lastFullThoughts.length) {
                            const thoughtDelta = parsed.thoughts.slice(lastFullThoughts.length);
                            lastFullThoughts = parsed.thoughts;

                            if (isStream && !isResponsesApi) {
                                res.write(`data: ${JSON.stringify({
                                    id: completionId,
                                    object: 'chat.completion.chunk',
                                    created: createdTime,
                                    model: modelConfig.id,
                                    choices: [{
                                        index: 0,
                                        delta: { reasoning_content: thoughtDelta },
                                        finish_reason: null
                                    }]
                                })}\n\n`);
                            }
                        }
                    }
                }

                // Flush any trailing frame
                bufferState.buffer += '\n';
                const trailingFrames = parseStreamChunks(bufferState);
                for (const frame of trailingFrames) {
                    const parsed = extractCandidateData(frame);
                    if (!parsed) continue;
                    if (parsed.cid) finalCid = parsed.cid;
                    if (parsed.rid) finalRid = parsed.rid;
                    if (parsed.rcid) finalRcid = parsed.rcid;
                    if (parsed.text && parsed.text.length > lastFullText.length) {
                        lastFullText = parsed.text;
                    }
                    if (parsed.thoughts && parsed.thoughts.length > lastFullThoughts.length) {
                        lastFullThoughts = parsed.thoughts;
                    }
                }

                // Save session for multi-turn continuity
                if (finalCid) {
                    sessionCache.set(userKey, {
                        cid: finalCid,
                        rid: finalRid,
                        rcid: finalRcid,
                        lastUsed: Date.now()
                    });
                }

                if (isStream) {
                    if (isResponsesApi) {
                        res.write(`event: response.output_text.done\ndata: ${JSON.stringify({
                            type: 'response.output_text.done',
                            output_index: 0,
                            content_index: 0,
                            text: lastFullText
                        })}\n\n`);

                        res.write(`event: response.content_part.done\ndata: ${JSON.stringify({
                            type: 'response.content_part.done',
                            output_index: 0,
                            content_index: 0,
                            part: {
                                type: 'output_text',
                                text: lastFullText,
                                annotations: []
                            }
                        })}\n\n`);

                        res.write(`event: response.output_item.done\ndata: ${JSON.stringify({
                            type: 'response.output_item.done',
                            output_index: 0,
                            item: {
                                id: msgId,
                                type: 'message',
                                role: 'assistant',
                                status: 'completed',
                                content: [{ type: 'output_text', text: lastFullText, annotations: [] }]
                            }
                        })}\n\n`);

                        res.write(`event: response.completed\ndata: ${JSON.stringify({
                            type: 'response.completed',
                            response: {
                                id: respId,
                                object: 'response',
                                status: 'completed',
                                model: modelConfig.id,
                                output: [
                                    {
                                        id: msgId,
                                        type: 'message',
                                        role: 'assistant',
                                        status: 'completed',
                                        content: [{ type: 'output_text', text: lastFullText, annotations: [] }]
                                    }
                                ],
                                output_text: lastFullText,
                                usage: {
                                    input_tokens: Math.ceil(prompt.length / 4),
                                    output_tokens: Math.ceil(lastFullText.length / 4),
                                    total_tokens: Math.ceil((prompt.length + lastFullText.length) / 4)
                                }
                            }
                        })}\n\n`);
                    } else {
                        res.write(`data: ${JSON.stringify({
                            id: completionId,
                            object: 'chat.completion.chunk',
                            created: createdTime,
                            model: modelConfig.id,
                            choices: [{
                                index: 0,
                                delta: {},
                                finish_reason: 'stop'
                            }]
                        })}\n\n`);
                    }
                    res.write('data: [DONE]\n\n');
                    res.end();
                } else {
                    if (isResponsesApi) {
                        return sendJson(res, 200, {
                            id: respId,
                            object: 'response',
                            created_at: createdTime,
                            status: 'completed',
                            model: modelConfig.id,
                            output: [
                                {
                                    id: msgId,
                                    type: 'message',
                                    role: 'assistant',
                                    status: 'completed',
                                    content: [{ type: 'output_text', text: lastFullText, annotations: [] }]
                                }
                            ],
                            output_text: lastFullText,
                            usage: {
                                input_tokens: Math.ceil(prompt.length / 4),
                                output_tokens: Math.ceil(lastFullText.length / 4),
                                total_tokens: Math.ceil((prompt.length + lastFullText.length) / 4)
                            }
                        });
                    } else {
                        return sendJson(res, 200, {
                            id: completionId,
                            object: 'chat.completion',
                            created: createdTime,
                            model: modelConfig.id,
                            choices: [{
                                index: 0,
                                message: {
                                    role: 'assistant',
                                    content: lastFullText,
                                    ...(lastFullThoughts ? { reasoning_content: lastFullThoughts } : {})
                                },
                                finish_reason: 'stop'
                            }],
                            usage: {
                                prompt_tokens: Math.ceil(prompt.length / 4),
                                completion_tokens: Math.ceil(lastFullText.length / 4),
                                total_tokens: Math.ceil((prompt.length + lastFullText.length) / 4)
                            }
                        });
                    }
                }
            } catch (err) {
                console.error('[-] Error processing completion:', err);
                if (!res.headersSent) {
                    return sendJson(res, 500, { error: { message: err.message, type: 'internal_server_error' } });
                } else {
                    res.end();
                }
            }
        });
        return;
    }

    sendJson(res, 404, { error: { message: `Not found: ${pathname}` } });
});

loadAuth();

server.listen(PORT, HOST, () => {
    console.log(`\n==================================================`);
    console.log(`[c4] FreeGeminiAPI server listening on http://${HOST}:${PORT}`);
    console.log(`[+] Base URL: http://${HOST}:${PORT}/v1`);
    console.log(`[+] Default model: ${DEFAULT_MODEL}`);
    console.log(`[+] Auth status: ${authConfig.cookies ? 'CONFIGURED' : 'NOT CONFIGURED (run npm run auth)'}`);
    console.log(`==================================================\n`);
});
