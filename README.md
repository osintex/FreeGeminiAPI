<p align="center">
  <img src="assets/banner.svg" alt="FreeGeminiAPI Banner" width="100%" />
</p>

<p align="center">
  <strong>Локальный шлюз к веб-версии Google Gemini с поддержкой OpenAI, Codex Responses и Anthropic Messages API</strong><br>
  <em>Бесплатный доступ ко всей линейке моделей Gemini (включая Gemini Advanced / Argon, Gemini Hydrogen, 2.0 Flash Thinking, 2.0 Pro Experimental) через стандартные протоколы с сохранением всех возможностей вашей подписки.</em>
</p>

<p align="center">
  <a href="https://github.com/osintex/FreeGeminiAPI/releases"><img alt="Latest Release" src="https://img.shields.io/github/v/release/osintex/FreeGeminiAPI?color=7c3aed" /></a>
  <img alt="Node.js 18 plus" src="https://img.shields.io/badge/node-18%2B-339933.svg" />
  <img alt="Zero Dependencies" src="https://img.shields.io/badge/dependencies-0-blue.svg" />
  <img alt="OpenAI Chat API" src="https://img.shields.io/badge/OpenAI_Chat-compatible-111111.svg" />
  <img alt="OpenAI Responses API" src="https://img.shields.io/badge/Codex_Responses-compatible-412991.svg" />
  <img alt="Anthropic Messages API" src="https://img.shields.io/badge/Anthropic_Messages-compatible-d97706.svg" />
</p>

---

## ⚡ О проекте

**FreeGeminiAPI** превращает сессию веб-интерфейса Google Gemini в универсальный локальный API-сервер.

Если у вас есть подписка **Google One AI Premium (Gemini Advanced)** или стандартный Google-аккаунт, прокси позволяет использовать веб-модели напрямую в любимых инструментах разработчика — **Codex CLI**, **Claude Code**, **Cline / Roo Code**, **Cursor**, **Aider**, **Open WebUI** — без биллинга Google Cloud / AI Studio и без урезанных квот.

### Ключевые особенности
- 🚀 **Zero Dependencies**: чистый Node.js 18+ без внешних npm-пакетов.
- ⚡ **OpenAI Responses API**: нативная поддержка протокола Responses (`/v1/responses`) для терминального агента **OpenAI Codex CLI (`codex`)**.
-  Claude **Anthropic Messages API**: полная эмуляция протокола Claude (`/v1/messages`), включая стриминг блоков рассуждений (`thinking_delta`) для **Claude Code** и **Cline**.
- 💬 **OpenAI Chat Completions**: стандартный эндпоинт (`/v1/chat/completions`) со стримингом токенов (SSE) для Cursor, Open WebUI и любых скриптов на `openai` SDK.
- 🎯 **Каталог моделей `/model` для Codex**: автоматическая генерация манифеста моделей для интерактивного меню с окном контекста 1,000,000 токенов и уровнями reasoning.
- 🔑 **Авто-логин в любом браузере**: скрипт автоматически находит **Firefox** (через протокол WebDriver BiDi) или **Chromium / Chrome / Brave** (через CDP) и перехватывает сессию при первом запуске.
- 🛠️ **CLI-лаунчер `freegemini`**: быстрое управление процессом в терминале (`freegemini bg`, `status`, `logs`, `stop`).

---

## 🧠 Поддерживаемые модели

| Модель | Назначение | Режим | Окно контекста |
|---|---|---|---|
| `gemini-advanced` | **Gemini Advanced (Argon)** — флагманский кодинг, глубокий рефакторинг | Thinking + Pro | 1,048,576 |
| `gemini-hydrogen` *(алиас `hydrogen`)* | **Gemini Hydrogen** — ультра-низкая задержка (TTFT), максимальная скорость | Fast | 1,048,576 |
| `gemini-2.0-flash-thinking` | **Gemini 2.0 Flash Thinking** — быстрые пошаговые рассуждения | Reasoning | 1,048,576 |
| `gemini-2.0-pro-exp` | **Gemini 2.0 Pro Experimental** — сложные алгоритмы, глубокая логика | Deep Reasoning | 1,048,576 |
| `gemini-2.0-flash` | **Gemini 2.0 Flash** — стандартная модель нового поколения (по умолчанию) | Standard | 1,048,576 |
| `gemini-1.5-pro` | **Gemini 1.5 Pro** — стабильный тяжелый контекст | High Context | 1,048,576 |
| `gemini-1.5-flash` | **Gemini 1.5 Flash** — легкая базовая модель | Fast | 1,048,576 |
| `claude-3-7-sonnet` | Алиас под Claude Code, маршрутизируется в `gemini-advanced` | Thinking | 1,048,576 |
| `claude-3-5-sonnet` | Алиас под Claude Code, маршрутизируется в `gemini-advanced` | Thinking | 1,048,576 |
| `claude-3-5-haiku` | Алиас под Claude Code, маршрутизируется в `gemini-hydrogen` | Fast | 1,048,576 |
| `claude-3-opus` | Алиас под Claude Code, маршрутизируется в `gemini-advanced` | Deep Reasoning | 1,048,576 |

---

## 🚀 Установка и быстрый старт на Linux

Проекту **не требуются** сторонние npm-пакеты (Zero Dependencies). Достаточно стандартного рантайма Node.js 18+ и любого браузера для первичной авторизации.

### 1. Системные зависимости

Установите Node.js и браузер через пакетный менеджер вашего дистрибутива:

```bash
# Arch Linux / Omarchy / Manjaro
sudo pacman -S nodejs git firefox

# Debian / Ubuntu / Mint
sudo apt update && sudo apt install -y nodejs git firefox

# Fedora / RHEL
sudo dnf install -y nodejs git firefox
```

### 2. Клонирование и установка лаунчера

```bash
git clone https://github.com/osintex/FreeGeminiAPI.git
cd FreeGeminiAPI

# Создает команду freegemini в ~/.local/bin
./scripts/freegemini.sh install
```
*(Убедитесь, что каталог `~/.local/bin` добавлен в вашу переменную `$PATH`)*

---

### 3. Первый запуск и авторизация

Запустите сервер:
```bash
freegemini
# или напрямую через Node:
node server.js
```

При первом запуске скрипт автоматически обнаружит установленный браузер (**Firefox** или **Chromium / Chrome**) и откроет окно Google:
1. Войдите в свой Google-аккаунт в открывшемся окне.
2. Прокси автоматически перехватит куки и токен `SNlM0e`, закроет окно и запустит API на `http://127.0.0.1:9656/v1`.

*Для принудительного выбора браузера:*
```bash
BROWSER=firefox node scripts/gemini_auth.js     # использовать Firefox
BROWSER=chromium node scripts/gemini_auth.js    # использовать Chromium/Chrome
```

---

## 🕹️ Управление демоном на Linux (`freegemini`)

Скрипт-лаунчер `freegemini` позволяет управлять фоновым процессом как стандартным системным демоном:

- `freegemini` — запуск на переднем плане с выводом логов запросов в stdout
- `freegemini bg` — запуск демона в фоне (отвязывается от терминала через `nohup`)
- `freegemini status` — проверка статуса, PID процесса и доступности моделей
- `freegemini logs` — чтение фоновых логов в реальном времени (`tail -f`)
- `freegemini restart` — перезапуск демона
- `freegemini stop` — остановка фонового процесса

### Автозапуск через systemd (Linux User Unit)

Для запуска прокси в качестве постоянной фоновой службы:
```bash
freegemini systemd
systemctl --user enable --now freegemini
```
Управление через systemctl:
```bash
systemctl --user status freegemini
journalctl --user -u freegemini -f
```

---

## 🔌 Подключение к инструментам

### 1. OpenAI Codex CLI (`codex`)

Codex CLI работает через нативный протокол Responses API.

#### Настройка в 1 команду:
```bash
node scripts/setup_codex.js
```
Скрипт автоматически создаст `~/.codex/models.json` с полным манифестом моделей (окно контекста 1,000,000 токенов, уровни рассуждений) и сконфигурирует `~/.codex/config.toml`.

#### Ручной конфиг (`~/.codex/config.toml`):
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

Проверка:
```bash
codex exec --skip-git-repo-check "Ответь одним словом: работает?"
```
В интерактивном TUI по нажатию `/model` доступен полный список всех моделей линейки.

---

### 2. Claude Code CLI (`claude`)

FreeGeminiAPI поддерживает нативный протокол Anthropic Messages API (`/v1/messages`).

В `~/.bashrc` или `~/.zshrc`:
```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:9656"
export ANTHROPIC_API_KEY="not-needed"
```

Запуск:
```bash
claude
```
Запросы на `claude-3-7-sonnet` автоматически транслируются в `gemini-advanced` с поддержкой reasoning.

---

### 3. Cline / Roo Code / Cursor / Aider / Open WebUI

- **Base URL:** `http://127.0.0.1:9656/v1`
- **API Key:** любое значение (`dummy`)
- **Модель:** `gemini-advanced`, `gemini-hydrogen` или `gemini-2.0-flash-thinking`

#### Python-пример:
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

---

## 🏗️ Архитектура

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
│  - Multi-protocol normalizer (OpenAI / Claude / Codex) │
│  - Line-delimited stream parser                        │
│  - Multi-turn session continuity manager               │
└───────────────────────────┬────────────────────────────┘
                            │ Batchexecute RPC (StreamGenerate)
                            │ Cookie: __Secure-1PSID; at: SNlM0e
                            ▼
┌────────────────────────────────────────────────────────┐
│          Google Gemini Web Frontend (GFE / Bard)       │
│  https://gemini.google.com/_/BardChatUi/data/...       │
└───────────────────────────┬────────────────────────────┘
```

1. **Batchexecute RPC**: прокси упаковывает запросы в JSPB-массив (`f.req`) и подписывает сессионным токеном `at`.
2. **Stream Parser**: потоковые ответы Google декодируются построчно налету с извлечением текста, блоков рассуждений и сессионных ID.
3. **Session Tracking**: прокси сохраняет тройку `[cid, rid, rcid]` для непрерывности multi-turn диалогов.

---

## 🔒 Изоляция и сетевая модель

- **Локальный loopback**: сервер слушает исключительно `127.0.0.1:9656` и недоступен извне.
- **Хранение сессии**: файл `gemini-auth.json` создается локально, изолирован правами доступа и внесен в `.gitignore`.
- **Без стороннего кода**: никаких внешних npm-пакетов, аналитики или сторонних сервисов. Прямой защищенный канал между локальным клиентом и серверами Google.
