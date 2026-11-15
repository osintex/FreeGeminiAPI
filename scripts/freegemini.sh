#!/usr/bin/env bash
# FreeGeminiAPI launcher & service controller

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_JS="$SCRIPT_DIR/server.js"
LOG_FILE="$SCRIPT_DIR/server.log"

case "$1" in
    bg|background|daemon)
        pkill -f "$SERVER_JS" 2>/dev/null
        nohup node "$SERVER_JS" > "$LOG_FILE" 2>&1 &
        echo "[+] FreeGeminiAPI запущен в фоне (PID: $!)."
        echo "[+] Логи: $LOG_FILE"
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
        cp "${BASH_SOURCE[0]}" "$TARGET"
        chmod +x "$TARGET"
        echo "[+] Установлен в $TARGET"
        echo "[+] Теперь можно вызывать команду: freegemini"
        ;;
    *)
        exec node "$SERVER_JS"
        ;;
esac
