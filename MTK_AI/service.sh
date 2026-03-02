#!/system/bin/sh

PIDFILE="/data/adb/modules/MTK_AI/engine.pid"
echo $$ > "$PIDFILE"

# Set highest CPU priority
renice -n -20 -p $$ 2>/dev/null

# Prevent Low Memory Killer (LMK)
if [ -f /proc/$$/oom_score_adj ]; then
    echo -1000 > /proc/$$/oom_score_adj
fi

# Move to top-app cpuset
echo $$ > /dev/cpuset/top-app/tasks 2>/dev/null

MODDIR="/data/adb/modules/MTK_AI"
BB="$MODDIR/busybox"
# FIX 1: Define LOG correctly and use it consistently
LOG="$MODDIR/service.log"

# Wait for boot
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 30
done

# FIX 2: Corrected log_msg function to use $LOG instead of $LOG_FILE
log_msg() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" >> "$LOG"
    
    # Log rotation
    if [ -f "$LOG" ]; then
        local lines=$(wc -l < "$LOG")
        if [ "$lines" -gt 200 ]; then
            tail -n 200 "$LOG" > "$LOG.tmp"
            mv "$LOG.tmp" "$LOG"
        fi
    fi
}
chmod 755 "$MODDIR/script_runner/monitor_app_stats" 2>/dev/null
# Cleanup lock
su -c "rm -f $MODDIR/.running.lock" 2>/dev/null
log_msg "MTK_AI daemon started"

# Fix permissions (Ensure your custom binaries are executable)
chmod 755 "$MODDIR/busybox" 2>/dev/null
chmod 755 "$MODDIR/logcat_detection/logcat" 2>/dev/null
chmod 755 "$MODDIR/logcat_detection/dumpsys2" 2>/dev/null
# ... (Keep your existing chmod blocks for other scripts) ...
# Start HTTP server
"$BB" httpd -p 8080 -h "$MODDIR/webroot/" -f &

su -c 'mkdir -p /sdcard/MTK_AI_Engine && :> /sdcard/MTK_AI_Engine/enable_notifications'

CFG_DIR="/sdcard/MTK_AI_Engine/config"
# Pointing to your custom wrappers
LOGCAT_SCRIPT="$MODDIR/logcat_detection/logcat"
DUMPSYS_SCRIPT="$MODDIR/logcat_detection/dumpsys2"

        if [ -f "/data/adb/service.d/99_mtk_ai_restore_values.sh" ]; then
            sh /data/adb/service.d/99_mtk_ai_restore_values.sh &
        fi

# Kill existing processes
pkill -f "MTK_AI.*logcat" 2>/dev/null
pkill -f "MTK_AI.*dumpsys2" 2>/dev/null
# Be careful killing system logcat, only kill if it's your custom one running in background
# killall logcat 2>/dev/null 

# === LAUNCH DETECTION SCRIPT (Solid Pattern) ===
launch_detection_script() {
    local script_path="$1"
    local label="$2"
    
    [ ! -x "$script_path" ] && { log_msg "❌ $label not executable: $script_path"; return 1; }
    
    log_msg "▶️ Starting $label..."
    
    local abs_path="$($BB readlink -f "$script_path" 2>/dev/null || echo "$script_path")"
    
    # Detach using solid pattern (no su -c since we're already root)
    (
        export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin:$BB:$PATH"
        cd "$MODDIR" || exit 1
        nohup sh "$abs_path" --daemonized >/dev/null 2>&1 &
        disown 2>/dev/null || true
    )
    
    sleep 0.5
    
    local sname=$($BB basename "$script_path")
    $BB pgrep -f "$sname" >/dev/null 2>&1 && \
        log_msg "✅ $label OK (PID: $($BB pgrep -f "$sname" | head -1))" || \
        log_msg "⚠️ $label may have failed"
}

# === DETECTION METHOD SELECTION ===
DETECTION_METHOD="logcat"
[ -f "$CFG_DIR/enable_dumpsys" ] && [ ! -f "$CFG_DIR/enable_logcat" ] && DETECTION_METHOD="dumpsys"
log_msg "🎯 Detection method: $DETECTION_METHOD"

case "$DETECTION_METHOD" in
    logcat)
        launch_detection_script "$MODDIR/logcat_detection/logcat" "Custom Logcat detection"
        ;;
    dumpsys)
        launch_detection_script "$MODDIR/logcat_detection/dumpsys2" "Custom Dumpsys detection"
        ;;
    *)
        log_msg "❌ Unknown detection method: $DETECTION_METHOD"
        ;;
esac

# DIAGNOSTIC: Print path info to your log so you can see what's happening
log_msg "Current PATH: $PATH"
log_msg "Which logcat resolves to: $(which logcat 2>/dev/null || echo 'Not found')"log_msg "Which dumpsys resolves to: $(which dumpsys 2>/dev/null || echo 'Not found')"
