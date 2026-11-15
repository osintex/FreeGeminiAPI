#!/usr/bin/env bash
# FreeGeminiAPI launcher & service controller

# Locate canonical repository path
if [ -n "$FREEGEMINI_DIR" ] && [ -f "$FREEGEMINI_DIR/server.js" ]; then
    APP_DIR="$FREEGEMINI_DIR"
elif [ -f "$HOME/.gemini/antigravity/scratch/FreeGeminiAPI/server.js" ]; then
    APP_DIR="$HOME/.gemini/antigravity/scratch/FreeGeminiAPI"
else
    # Fallback to script location if invoked directly from inside the repo
    APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
fi

SERVER_JS="$APP_DIR/server.js"
LOG_FILE="$APP_DIR/server.log"

if [ ! -f "$SERVER_JS" ]; then
    echo "[-] Error: server.js not found at $SERVER_JS"
    exit 1
fi

case "$1" in
    bg|background|daemon)
        pkill -f "$SERVER_JS" 2>/dev/null
        nohup node "$SERVER_JS" > "$LOG_FILE" 2>&1 < /dev/null &
        PID=$!
        disown "$PID" 2>/dev/null
        sleep 1
        if kill -0 "$PID" 2>/dev/null; then
            echo "[+] FreeGeminiAPI запущен в фоне (PID: $PID)."
            echo "[+] Логи: $LOG_FILE"
        else
            echo "[-] Ошибка запуска. Проверь логи: cat $LOG_FILE"
        fi
        ;;
    stop)
        if pkill -f "$SERVER_JS" 2>/dev/null; then
            echo "[+] FreeGeminiAPI остановлен."
        else
            echo "[-] Процесс FreeGeminiAPI не найден."
        fi
        ;;
    status)
        PIDS=$(pgrep -f "$SERVER_JS" | tr '\n' ' ')
        if [ -n "$PIDS" ]; then
            echo "[+] FreeGeminiAPI работает (PID: $PIDS)"
            curl -s http://127.0.0.1:9656/health
            echo ""
        else
            echo "[-] FreeGeminiAPI не запущен."
        fi
        ;;
    logs)
        if [ -f "$LOG_FILE" ]; then
            tail -f "$LOG_FILE"
        else
            echo "[-] Файл логов пока не создан ($LOG_FILE)."
        fi
        ;;
    install)
        TARGET="$HOME/.local/bin/freegemini"
        mkdir -p "$HOME/.local/bin"
        ln -sf "$APP_DIR/scripts/freegemini.sh" "$TARGET"
        echo "[+] Симлинк установлен: $TARGET -> $APP_DIR/scripts/freegemini.sh"
        ;;
    *)
        exec node "$SERVER_JS"
        ;;
esac
