# FreeGeminiAPI ♊

<p align="center">
  <strong>Локальный шлюз к веб-версии Google Gemini с поддержкой OpenAI, Codex Responses и Anthropic Messages API</strong><br>
  <em>Полноценный доступ к веб-моделям Gemini (включая Gemini Advanced / Argon, Gemini Hydrogen, 2.0 Flash Thinking, 2.0 Pro Experimental) через стандартные протоколы с сохранением всех возможностей вашей подписки.</em>
</p>

<p align="center">
  <img alt="Node.js 18 plus" src="https://img.shields.io/badge/node-18%2B-339933.svg" />
  <img alt="Zero Dependencies" src="https://img.shields.io/badge/dependencies-0-blue.svg" />
  <img alt="OpenAI Chat API" src="https://img.shields.io/badge/OpenAI_Chat-compatible-111111.svg" />
  <img alt="OpenAI Responses API" src="https://img.shields.io/badge/Codex_Responses-compatible-412991.svg" />
  <img alt="Anthropic Messages API" src="https://img.shields.io/badge/Anthropic_Messages-compatible-d97706.svg" />
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-green.svg" />
</p>

---

## 📌 О проекте

**FreeGeminiAPI** превращает веб-интерфейс [gemini.google.com](https://gemini.google.com) в универсальный локальный API-сервер.

Если у вас есть подписка **Google One AI Premium (Gemini Advanced)** или стандартный Google-аккаунт, прокси позволяет использовать веб-модели напрямую в любимых инструментах разработчика — **Codex CLI**, **Claude Code**, **Cline / Roo Code**, **Cursor**, **Aider**, **Open WebUI** — без биллинга Google Cloud / AI Studio и без урезанных квот.

### Ключевые возможности:
- 🚀 **Zero Dependencies**: чистый Node.js 18+ без единого стороннего npm-пакета. Никаких `pip`, компиляторов и раздутых зависимостей.
- ⚡ **OpenAI Responses API**: нативная поддержка протокола OpenAI Responses (`/v1/responses`) для терминального агента **OpenAI Codex CLI (`codex`)**.
-  Claude **Anthropic Messages API**: полная эмуляция протокола Claude (`/v1/messages`), включая стриминг блоков рассуждений (`thinking_delta`) для **Claude Code** и **Cline**.
- 💬 **OpenAI Chat Completions**: стандартный эндпоинт (`/v1/chat/completions`) со стримингом токенов (SSE) для Cursor, Open WebUI и любых скриптов на `openai` SDK.
- 🎯 **Каталог моделей `/model` для Codex**: автоматическая генерация манифеста моделей для интерактивного меню с окном контекста 1,000,000 токенов и уровнями reasoning.
- 🔑 **Авторизация в один клик**: встроенный скрипт перехвата сессии через Chrome DevTools Protocol (CDP).
- 🛠️ **CLI-лаунчер `freegemini`**: управление сервером в терминале (`freegemini bg`, `status`, `logs`, `stop`).

---

## 🧠 Поддерживаемые модели

| Модель | Назначение | Режим | Окно контекста |
|---|---|---|---|
| `gemini-advanced` | **Gemini Advanced (Argon)** — флагманский кодинг, глубокий рефакторинг | Thinking + Pro | 1,048,576 |
| `gemini-hydrogen` *(алиас `hydrogen`)* | **Gemini Hydrogen** — ультра-низкая задержка (TTFT), максимальная скорость | Fast | 1,048,576 |
| `gemini-2.0-flash-thinking` | **Gemini 2.0 Flash Thinking** — быстрые пошаговые рассуждения | Reasoning | 1,048,576 |
| `gemini-2.0-pro-exp` | **Gemini 2.0 Pro Experimental** — сложные алгоритмы, олимпиадная математика | Deep Reasoning | 1,048,576 |
| `gemini-2.0-flash` | **Gemini 2.0 Flash** — стандартная модель нового поколения (по умолчанию) | Standard | 1,048,576 |
| `gemini-1.5-pro` | **Gemini 1.5 Pro** — стабильный тяжелый контекст | High Context | 1,048,576 |
| `gemini-1.5-flash` | **Gemini 1.5 Flash** — легкая базовая модель | Fast | 1,048,576 |
| `claude-3-7-sonnet` | Алиас под Claude Code, маршрутизируется в `gemini-advanced` | Thinking | 1,048,576 |
| `claude-3-5-sonnet` | Алиас под Claude Code, маршрутизируется в `gemini-advanced` | Thinking | 1,048,576 |
| `claude-3-5-haiku` | Алиас под Claude Code, маршрутизируется в `gemini-hydrogen` | Fast | 1,048,576 |
| `claude-3-opus` | Алиас под Claude Code, маршрутизируется в `gemini-advanced` | Deep Reasoning | 1,048,576 |

---

## 🚀 Быстрый старт

### 1. Клонирование
```bash
git clone https://github.com/your-username/FreeGeminiAPI.git
cd FreeGeminiAPI
```

### 2. Авторизация в Google (в один клик)
Запустите сборщик сессии:
```bash
npm run auth
```
1. Откроется изолированное окно Chromium со страницей входа Google.
2. Авторизуйтесь под своим аккаунтом.
3. Скрипт перехватит куки (`__Secure-1PSID`, `__Secure-1PSIDTS`, `__Secure-1PSIDCC`) и токен `SNlM0e`, сохранит их в `gemini-auth.json` и закроет браузер.

> 💡 **Ручная настройка:** можно вручную скопировать `auth.example.json` в `gemini-auth.json` и заполнить значения из DevTools вкладки `Application -> Cookies` на сайте Gemini.

### 3. Запуск сервера
```bash
npm start
```
Сервер готов к работе: `http://127.0.0.1:9656/v1`

### 4. Проверка здоровья
```bash
npm run doctor
```

---

## 🕹️ CLI-утилита `freegemini`

Для удобного запуска в системе установите скрипт-обертку:
```bash
./scripts/freegemini.sh install
```
После этого доступны команды из любой папки:
- `freegemini` — запуск на переднем плане с выводом логов
- `freegemini bg` — запуск в фоне (не закроется вместе с окном терминала)
- `freegemini status` — проверка состояния и список доступных моделей
- `freegemini logs` — чтение фоновых логов в реальном времени (`tail -f`)
- `freegemini stop` — корректная остановка фонового процесса

---

## 🔌 Интеграция с клиентами

### 1. OpenAI Codex CLI (`codex`)

Codex CLI использует нативный протокол Responses API.

#### Быстрая настройка в одну команду:
```bash
npm run setup:codex
```
Команда автоматически:
1. Создаст правильный манифест моделей в `~/.codex/models.json` и кеше `~/.codex/models_cache.json` с 1M контекстом и reasoning-уровнями.
2. Пропишет провайдера `gemini` и `model_catalog_json` в `~/.codex/config.toml`.
3. Сбросит старый демон `app-server`.

#### Ручная настройка (`~/.codex/config.toml`):
```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"

model_provider = "gemini"
model = "gemini-advanced"
model_catalog_json = "/home/USERNAME/.codex/models.json"

[model_providers.gemini]
name = "gemini"
base_url = "http://127.0.0.1:9656/v1"
wire_api = "responses"
supports_websockets = false
```

Проверка работы:
```bash
codex exec --skip-git-repo-check "Ответь одним словом: работает?"
```
В интерактивном TUI команда `/model` покажет полный список моделей Google и Claude.

---

### 2. Claude Code CLI (`claude`)

FreeGeminiAPI нативно реализует протокол Anthropic Messages API (`/v1/messages`) со стримингом и поддержкой ролей.

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:9656"
export ANTHROPIC_API_KEY="not-needed"
claude
```
Запросы на `claude-3-7-sonnet` автоматически будут перенаправлены на `gemini-advanced` с цепочками рассуждений.

---

### 3. Cursor & Aider & Open WebUI (OpenAI Chat API)

В настройках любого OpenAI-совместимого клиента:
- **Base URL:** `http://127.0.0.1:9656/v1`
- **API Key:** `dummy` (или любой ключ)
- **Model:** `gemini-advanced`, `gemini-hydrogen` или `gemini-2.0-flash-thinking`

#### Пример на Python (`openai`):
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:9656/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="gemini-hydrogen",
    messages=[{"role": "user", "content": "Привет! Назови три закона робототехники."}]
)

print(response.choices[0].message.content)
```

#### Потоковый cURL:
```bash
curl -N http://127.0.0.1:9656/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash-thinking",
    "stream": true,
    "messages": [{"role": "user", "content": "Посчитай факториал 10 с ходом мысли."}]
  }'
```

---

## 🏗️ Архитектура и протокол под капотом

```
┌────────────────────────────────────────────────────────┐
│  Клиенты: Codex CLI / Claude Code / Cursor / Aider     │
└───────────────────────────┬────────────────────────────┘
                            │
     ┌──────────────────────┼──────────────────────┐
     │ /v1/responses        │ /v1/messages         │ /v1/chat/completions
     ▼                      ▼                      ▼
┌────────────────────────────────────────────────────────┐
│               FreeGeminiAPI Server (:9656)             │
│  - Zero-dependency Node.js HTTP Server                 │
│  - Prompt Normalizer & Multi-turn Session Tracker      │
│  - Protocol Converters (OpenAI / Responses / Anthropic)│
│  - Line-delimited Chunk & JSPB Envelope Parser         │
└───────────────────────────┬────────────────────────────┘
                            │ Batchexecute RPC (StreamGenerate)
                            │ Cookie: __Secure-1PSID; at: SNlM0e
                            ▼
┌────────────────────────────────────────────────────────┐
│          Google Gemini Web Frontend (GFE / Bard)       │
│  https://gemini.google.com/_/BardChatUi/data/...       │
└────────────────────────────────────────────────────────┘
```

1. **Batchexecute RPC**: веб-интерфейс Gemini работает по внутреннему протоколу Google RPC (`assistant.lamda.BardFrontendService/StreamGenerate`). Прокси упаковывает сообщение в JSPB-массив размером 81 элемент (`f.req`) и подписывает токеном `at`.
2. **Stream Parser**: ответы Google приходят чанками `[["wrb.fr", null, "...JSON..."]]`. Прокси парсит поток построчно, извлекая текст ответа (`candidate[1][0]`), цепочки рассуждений (`candidate[37][0][0]`) и сессионные ID (`cid`, `rid`).
3. **Session Continuity**: сервер автоматически поддерживает контекст многошагового диалога через связку `[cid, rid, rcid]`.

---

## ⚙️ Системная служба systemd (автозапуск на Linux)

Создайте файл `~/.config/systemd/user/free-gemini-api.service`:

```ini
[Unit]
Description=FreeGeminiAPI Proxy Server
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.gemini/antigravity/scratch/FreeGeminiAPI
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=9656
Environment=HOST=127.0.0.1

[Install]
WantedBy=default.target
```

Активация:
```bash
systemctl --user daemon-reload
systemctl --user enable --now free-gemini-api
```

---

## ⚠️ Решение частых проблем (Troubleshooting)

- **Ошибка `401 Unauthorized: Incorrect API key provided: http://127.0.0.1...` в Codex**:
  Вы запустили `sudo codex`. Codex был запущен из-под root, где не был настроен `model_provider`, и запрос ушел на официальный `api.openai.com`. Запускайте Codex без `sudo`.
- **Codex зависает на спиннере при старте**:
  Остались заблокированные сокеты в `/tmp/codex-daemon-*`. Выполните:
  ```bash
  killall -9 codex; rm -rf /tmp/codex-daemon-* ~/.codex/app-server-*
  ```
- **Ошибка `401: Invalid session cookies`**:
  Срок действия Google-кук истек. Перезапустите `npm run auth` и войдите в аккаунт снова.

---

## 🔒 Безопасность

Файл `gemini-auth.json`, профиль браузера `.chrome-profile-gemini/` и логи добавлены в `.gitignore`. При публикации репозитория на GitHub ваши учетные данные **никогда не попадут в коммиты**.

---

## 📄 Лицензия

MIT License.
