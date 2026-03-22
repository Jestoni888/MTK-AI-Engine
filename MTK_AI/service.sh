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
chmod 777 "$MODDIR/busybox" 2>/dev/null
chmod 777 "$MODDIR/logcat_detection/logcat" 2>/dev/null
chmod 777 "$MODDIR/logcat_detection/logcat.sh" 2>/dev/null
chmod 777 "$MODDIR/logcat_detection/dumpsys2" 2>/dev/null
chmod 777 "$MODDIR/touch_detection/touch2" 2>/dev/null
chmod 777 "$MODDIR/touch_detection/touch2.sh" 2>/dev/null
chmod 777 "$MODDIR/MTK_AI/AI_MODE/normal_mode/normal_prop" 2>/dev/null
chmod 777 "$MODDIR/MTK_AI/AI_MODE/global_mode/fastcharging" 2>/dev/null
chmod 777 "$MODDIR/MTK_AI/AI_MODE/global_mode/disable_fastcharging" 2>/dev/null
chmod 777 "$MODDIR/MTK_AI/AI_MODE/normal_mode/powersavex" 2>/dev/null
chmod 777 "$MODDIR/lib64/libc++_shared.so" 2>/dev/null
chmod 777 "$MODDIR/MTK_AI/AI_MODE/global_mode/fastchargingx" 2>/dev/null
rm -f "$MODDIR/touch_detection/dumpsys"
# ... (Keep your existing chmod blocks for other scripts) ...
# Start HTTP server
"$BB" httpd -p 8080 -h "$MODDIR/webroot/" -f &

CFG_DIR="/sdcard/MTK_AI_Engine/config"
# Pointing to your custom wrappers
LOGCAT_SCRIPT="$MODDIR/logcat_detection/logcat.sh"
TOUCH="$MODDIR/touch_detection/touch2.sh"

        if [ -f "/data/adb/service.d/99_mtk_ai_restore_values.sh" ]; then
            sh /data/adb/service.d/99_mtk_ai_restore_values.sh &
        fi

# Kill existing processes
pkill -f "MTK_AI.*logcat" 2>/dev/null
pkill -f "MTK_AI.*dumpsys2" 2>/dev/null
# Be careful killing system logcat, only kill if it's your custom one running in background
# killall logcat 2>/dev/null 

# === LAUNCH DETECTION SCRIPT (Solid Pattern) ===

sh "$LOGCAT_SCRIPT" &
sh "$TOUCH" &
