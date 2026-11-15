# FreeGeminiAPI ♊

<p align="center">
  <strong>Локальный OpenAI & Responses API прокси для Google Gemini Web Chat (gemini.google.com)</strong><br>
  <em>Бесплатный доступ к веб-моделям Gemini (включая 2.0 Flash, 2.0 Pro Exp, Gemini Advanced / Argon, Thinking Mode) через стандартные API.</em>
</p>

<p align="center">
  <img alt="Node.js 18 plus" src="https://img.shields.io/badge/node-18%2B-339933.svg" />
  <img alt="Zero Dependencies" src="https://img.shields.io/badge/dependencies-0-blue.svg" />
  <img alt="OpenAI Chat API" src="https://img.shields.io/badge/OpenAI_Chat-compatible-111111.svg" />
  <img alt="OpenAI Responses API" src="https://img.shields.io/badge/OpenAI_Responses-compatible-412991.svg" />
  <img alt="Anthropic API" src="https://img.shields.io/badge/Anthropic_Messages-compatible-d97706.svg" />
</p>

---

## 📌 Что это такое

**FreeGeminiAPI** — это легковесный локальный прокси-сервер, который подключается к веб-интерфейсу Google Gemini через вашу браузерную сессию и транслирует его в стандартные протоколы:
1. **OpenAI Chat Completions API** (`/v1/chat/completions`) — поддержка обычных запросов и стриминга (SSE).
2. **OpenAI Responses API** (`/v1/responses`) — прямая совместимость с **Codex CLI (`codex`)**, Cursor и новыми инструментами OpenAI.
3. **Anthropic Messages API** (`/v1/messages`) — прямая совместимость с **Claude Code**, **Cline** и др.

### Зачем это нужно?
- **Веб-модели Google**: доступ к **Gemini 2.0 Flash**, **Gemini 2.0 Pro Experimental**, **Gemini Advanced (Argon)** и режиму рассуждений (**Thinking**), которые часто недоступны в стандартных API или урезаны по квотам.
- **Подписка Gemini Advanced**: если у вас есть подписка Google One AI Premium, прокси автоматически наследует статус подписчика — снимаются жесткие лимиты, включается длинный контекст и Pro-пайплайн.
- **Чистый Node.js**: **0 внешних npm-зависимостей** (zero dependencies). Никаких `pip`, `venv`, C-компиляторов или тяжелых фреймворков.

---

## 🚀 Установка и быстрый старт

### Требования
- **Node.js** версии `>= 18.0.0` (нативная поддержка `fetch`, `WebSocket`, `crypto`).
- Любой браузер на базе Chromium (Google Chrome, Chromium, Brave).

### 1. Клонирование репозитория
```bash
git clone https://github.com/your-username/FreeGeminiAPI.git
cd FreeGeminiAPI
```

### 2. Авторизация в Google (в один клик)
Запустите интерактивный сборщик сессии:
```bash
npm run auth
```
1. Скрипт запустит изолированное окно Chromium и откроет `https://gemini.google.com/app`.
2. Войдите в свой Google-аккаунт.
3. Скрипт **автоматически перехватит** сессионные куки (`__Secure-1PSID`, `__Secure-1PSIDTS`, `__Secure-1PSIDCC`) и токен `SNlM0e`, после чего сохранит их в `gemini-auth.json` и завершит работу.

> 💡 **Ручной способ:** скопируйте `auth.example.json` в `gemini-auth.json` и вставьте значения кук из DevTools браузера вручную.

### 3. Запуск сервера
```bash
npm start
```
Сервер запустится на:
```
http://127.0.0.1:9656/v1
```

### 4. Проверка здоровья (Doctor)
```bash
npm run doctor
```
Скрипт проверит валидность кук, связь с Google и статус локального сервера.

---

## 🛠️ Как это работает (Архитектура)

```
┌────────────────────────────────────────────────────────┐
│  Клиенты (Codex CLI / Open WebUI / Claude Code / cURL) │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP POST (OpenAI / Responses / Messages)
                            ▼
┌────────────────────────────────────────────────────────┐
│               FreeGeminiAPI Server (:9656)             │
│  - Zero-dependency Node.js HTTP Service                │
│  - Protocol Normalizer & Prompt Formatter              │
│  - Stream Parser & SSE Generator                       │
│  - Session & Context Continuity Manager                │
└───────────────────────────┬────────────────────────────┘
                            │ Batchexecute RPC (StreamGenerate)
                            │ Cookie: __Secure-1PSID; at: SNlM0e
                            ▼
┌────────────────────────────────────────────────────────┐
│             Google Gemini Web Backend (GFE)            │
│  https://gemini.google.com/_/BardChatUi/data/...       │
└────────────────────────────────────────────────────────┘
```

1. **CDP Cookie Extraction**: утилита `scripts/gemini_chrome_auth.js` подключается к Chrome через Chrome DevTools Protocol (CDP) по WebSocket и выгружает `Network.getCookies` и DOM-токен `window.WIZ_global_data.SNlM0e`.
2. **Batchexecute RPC**: веб-интерфейс Gemini работает по внутреннему протоколу Google RPC (`assistant.lamda.BardFrontendService/StreamGenerate`). Прокси упаковывает сообщение в JSPB-массив размером 81 элемент (`f.req`) и подписывает токеном `at`.
3. **Line-based Frame Parser**: ответы Google приходят чанками вида `[["wrb.fr", null, "...JSON..."]]`. Сервер налету декодирует текст кандидата (`candidate[1][0]`), цепочку рассуждений (`candidate[37][0][0]`) и идентификаторы сессии (`cid`, `rid`).
4. **Контекст диалога**: прокси сохраняет тройку `[cid, rid, rcid]` для каждого пользователя, обеспечивая непрерывность multi-turn диалогов.

---

## 🧩 Подключение к клиентам

### 1. OpenAI Codex CLI (`codex`)
Codex CLI использует протокол `wire_api = "responses"`. Добавьте провайдера в `~/.codex/config.toml`:

```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"

model_provider = "gemini"
model = "gemini-advanced"

[model_providers.gemini]
name = "gemini"
base_url = "http://127.0.0.1:9656/v1"
wire_api = "responses"
supports_websockets = false
```

Проверка:
```bash
codex exec --skip-git-repo-check "Скажи одним словом: работает?"
```

---

### 2. Open WebUI
В настройках Open WebUI (**Settings -> Connections -> OpenAI API**):
- **URL:** `http://127.0.0.1:9656/v1`
- **Key:** `dummy` (или любой ключ)

---

### 3. Python OpenAI SDK
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:9656/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="gemini-2.0-flash",
    messages=[{"role": "user", "content": "Привет! Назови столицу Японии."}]
)

print(response.choices[0].message.content)
```

---

### 4. Стриминг через cURL
```bash
curl -N http://127.0.0.1:9656/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash-thinking",
    "stream": true,
    "messages": [{"role": "user", "content": "Сколько букв в слове Синхрофазотрон?"}]
  }'
```

---

## 🧠 Поддерживаемые модели

| Модель | Режим | Описание |
|---|---|---|
| `gemini-2.0-flash` | Стандартный | Высокая скорость, повседневные задачи (по умолчанию) |
| `gemini-2.0-flash-thinking` | Reasoning | Режим пошаговых рассуждений с выводом `reasoning_content` |
| `gemini-2.0-pro-exp` | Pro | Экспериментальная флагманская модель Google |
| `gemini-advanced` | Advanced (Argon) | Модель для подписчиков Gemini Advanced |
| `gemini-1.5-pro` | High Context | Модель с максимальным контекстным окном |

---

## ⚙️ Фоновый автозапуск (systemd)

Чтобы прокси всегда работал в фоне на Linux, создайте юнит `~/.config/systemd/user/free-gemini-api.service`:

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

Включение и старт:
```bash
systemctl --user daemon-reload
systemctl --user enable --now free-gemini-api
```

---

## 📤 Публикация на GitHub

1. Создайте новый пустой репозиторий на [GitHub](https://github.com/new) (например `FreeGeminiAPI`).
2. В локальной папке проекта привяжите remote и отправьте код:
```bash
cd FreeGeminiAPI
git remote add origin git@github.com:your-username/FreeGeminiAPI.git
git branch -M main
git push -u origin main
```

> ⚠️ **Безопасность:** файл `gemini-auth.json` и профиль `.chrome-profile-gemini/` уже добавлены в `.gitignore`. Ваши персональные куки **никогда не попадут в репозиторий**.

---

## Лицензия
MIT License. Создано для персонального использования и интеграций.
