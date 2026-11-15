#!/usr/bin/env bash
# FreeGeminiAPI launcher & service controller for Linux / Unix

# Resolve canonical repository path through symlinks
REAL_PATH="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
APP_DIR="$(cd "$(dirname "$REAL_PATH")/.." 2>/dev/null && pwd)"

if [ -n "$FREEGEMINI_DIR" ] && [ -f "$FREEGEMINI_DIR/server.js" ]; then
    APP_DIR="$FREEGEMINI_DIR"
fi

SERVER_JS="$APP_DIR/server.js"
LOG_FILE="$APP_DIR/server.log"

if [ ! -f "$SERVER_JS" ]; then
    echo "[-] Ошибка: server.js не найден по пути $SERVER_JS"
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
    restart)
        $0 stop
        sleep 1
        $0 bg
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
    systemd)
        UNIT_DIR="$HOME/.config/systemd/user"
        UNIT_FILE="$UNIT_DIR/freegemini.service"
        NODE_BIN="$(which node)"
        mkdir -p "$UNIT_DIR"
        cat <<EOF > "$UNIT_FILE"
[Unit]
Description=FreeGeminiAPI Proxy Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=3
Environment=PORT=9656
Environment=HOST=127.0.0.1

[Install]
WantedBy=default.target
EOF
        systemctl --user daemon-reload
        echo "[+] Юнит systemd создан: $UNIT_FILE"
        echo "[+] Для автозапуска выполни:"
        echo "    systemctl --user enable --now freegemini"
        ;;
    install)
        TARGET="$HOME/.local/bin/freegemini"
        mkdir -p "$HOME/.local/bin"
        ln -sf "$APP_DIR/scripts/freegemini.sh" "$TARGET"
        echo "[+] CLI лаунчер установлен: $TARGET"
        echo "[+] Проверь, что ~/.local/bin есть в \$PATH"
        ;;
    *)
        exec node "$SERVER_JS"
        ;;
esac
