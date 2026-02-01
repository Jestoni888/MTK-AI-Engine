#!/system/bin/sh

MODDIR="/data/adb/modules/MTK_AI"
BB="$MODDIR/busybox"
LOG="$MODDIR/service.log"

# Wait for boot
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 30
done

log() {
    echo "[$($DATE '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"
}

log "MTK_AI daemon started"

# Fix permissions
chmod 755 "$MODDIR/busybox" 2>/dev/null
chmod 755 "$MODDIR/logcat_detection/logcat" 2>/dev/null
chmod 755 "$MODDIR/touch_detection/touch2" 2>/dev/null
chmod 755 "$MODDIR/touch_detection/dumpsys" 2>/dev/null
chmod 755 "$MODDIR/script_runner/sf_controller" 2>/dev/null
chmod +x "$MODDIR/webroot/" 2>/dev/null
#MTK_AI_MODE PERMISSIONS
#auto frequency
chmod 755 "$MODDIR/MTK_AI/AI_MODE/auto_frequency/auto_frequency" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/auto_frequency/cpu6" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/auto_frequency/cpu7" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/auto_frequency/surfaceflinger" 2>/dev/null

#gaming mode
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/app_optimizer" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/bypass_on" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/disable_thermal" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/disable_thermal2" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/disable_thermal3" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/gaming_cpuset" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/gaming_prop" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/gaming_prop_2" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/limit" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/lite_gaming" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/performance" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/unlock" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/unlockfps" 2>/dev/null

#normal mode
chmod 755 "$MODDIR/MTK_AI/AI_MODE/normal_mode/bypass_off" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/normal_mode/normal_cpuset" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/normal_mode/normal_prop" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/normal_mode/powersave" 2>/dev/null

#global mode
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/charger_check" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/perf_disp" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/ram_cleaner" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/resources_tweaks" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/trim_memory" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/webview_tweaks" 2>/dev/null

#script runner
chmod 755 "$MODDIR/script_runner/display_mode" 2>/dev/null
chmod 755 "$MODDIR/script_runner/global" 2>/dev/null
chmod 755 "$MODDIR/script_runner/mtk_ai_manual" 2>/dev/null
chmod 755 "$MODDIR/script_runner/refresh_rate_locker" 2>/dev/null
chmod 755 "$MODDIR/script_runner/sf_controller" 2>/dev/null
chmod 755 "$MODDIR/script_runner/mtk_ai_eem_boot" 2>/dev/null

# Start HTTP server (non-critical, runs in background)
busybox httpd -p 8080 -h "$MODDIR/webroot/" -f &

LOGCAT_BIN="$MODDIR/logcat_detection/logcat"
SF_BIN="$MODDIR/script_runner/sf_controller"
LOGCAT_PID_FILE="$MODDIR/logcat.pid"
SF_PID_FILE="$MODDIR/sf_controller.pid"

# Function to start a protected process and save its PID
start_protected() {
    local bin="$1"
    local pid_file="$2"
    local name="$3"

    # Launch binary
    "$bin" &
    local NEW_PID=$!

    # Save PID
    echo "$NEW_PID" > "$pid_file"

    # Apply OOM protection (critical for survival)
    if [ -w "/proc/$NEW_PID/oom_score_adj" ]; then
        echo "-1000" > "/proc/$NEW_PID/oom_score_adj"
    fi

    echo "[$name] Started (PID: $NEW_PID)"
}

# Function to ensure a process is running
ensure_running() {
    local bin="$1"
    local pid_file="$2"
    local name="$3"

    if [ -f "$pid_file" ]; then
        OLD_PID=$(cat "$pid_file")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            return 0  # Already running
        else
            echo "[$name] PID $OLD_PID is dead. Restarting..."
        fi
    else
        echo "[$name] No PID file. Starting fresh..."
    fi

    start_protected "$bin" "$pid_file" "$name"
}

# Main loop: keep both services alive
while true; do
    ensure_running "$LOGCAT_BIN" "$LOGCAT_PID_FILE" "LOGCAT"
    ensure_running "$SF_BIN" "$SF_PID_FILE" "SF_CONTROLLER"
    sleep 10
done
