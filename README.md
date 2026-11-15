# FreeGeminiAPI

<p align="center">
  <strong>Локальный OpenAI-compatible API proxy для Google Gemini Web Chat (gemini.google.com)</strong>
</p>

<p align="center">
  <img alt="Node.js 18 plus" src="https://img.shields.io/badge/node-18%2B-339933.svg" />
  <img alt="Zero Dependencies" src="https://img.shields.io/badge/dependencies-0-blue.svg" />
  <img alt="OpenAI compatible" src="https://img.shields.io/badge/OpenAI-compatible-111111.svg" />
</p>

**FreeGeminiAPI** поднимает локальный API-сервер для веб-версии **Google Gemini** (`gemini.google.com`).

Он позволяет использовать модели, доступные в веб-интерфейсе Google Gemini (включая **Gemini 2.0 Flash**, **Gemini 2.0 Pro Experimental**, **Gemini Advanced / Argon**, режим **Thinking / Reasoning**), в любых инструментах с поддержкой OpenAI API:
- Open WebUI
- Antigravity / Cline / Claude Code / Cursor / Aider
- LiteLLM
- Любые скрипты на Python / cURL

---

## ⚡ Быстрый старт

### 1. Авторизация через браузер
Запустите скрипт авторизации. Он откроет окно браузера для входа в ваш Google-аккаунт:

```bash
cd FreeGeminiAPI
npm run auth
```

1. В открывшемся окне войдите в свой Google-аккаунт на `https://gemini.google.com/app`.
2. После входа вернитесь в терминал и нажмите **Enter**.
3. Скрипт сам вытащит сессионные куки (`__Secure-1PSID`, `__Secure-1PSIDTS`) и токен `SNlM0e`, сохранив их в `gemini-auth.json`.

*(Либо скопируйте `auth.example.json` в `gemini-auth.json` и вставьте куки вручную).*

### 2. Запуск локального сервера

```bash
npm start
```

Сервер поднимется на:
```
http://127.0.0.1:9656/v1
```

---

## 🧪 Проверка работы

### Проверка состояния (Doctor)
```bash
npm run doctor
```

### Запрос через cURL (OpenAI-compatible)

```bash
curl http://127.0.0.1:9656/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [{"role": "user", "content": "Привет! Кто ты?"}]
  }'
```

### Стриминг (SSE)

```bash
curl -N http://127.0.0.1:9656/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash-thinking",
    "stream": true,
    "messages": [{"role": "user", "content": "Объясни квантовую запутанность простыми словами"}]
  }'
```

---

## 🧠 Доступные модели

| ID модели | Название | Описание |
|---|---|---|
| `gemini-2.0-flash` | Gemini 2.0 Flash | Быстрая модель по умолчанию |
| `gemini-2.0-flash-thinking` | Gemini 2.0 Flash Thinking | Модель с расширенным выводом рассуждений (`reasoning_content`) |
| `gemini-2.0-pro-exp` | Gemini 2.0 Pro Experimental | Экспериментальная Pro-модель из веб-интерфейса |
| `gemini-advanced` | Gemini Advanced (Argon) | Доступ к возможностям Gemini Advanced |
| `gemini-1.5-pro` | Gemini 1.5 Pro | Модель с широким контекстом |

---

## 🔌 Подключение к Open WebUI / клиентам

В настройках клиента укажите:
- **Base URL:** `http://127.0.0.1:9656/v1`
- **API Key:** любой (например `dummy` или оставьте пустым, если не настроен `PROXY_API_KEY`)
