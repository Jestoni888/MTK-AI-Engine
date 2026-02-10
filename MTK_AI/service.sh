#!/system/bin/sh

PIDFILE="/data/adb/modules/MTK_AI/engine.pid"

echo $$ > "$PIDFILE"

# Set highest CPU priority
renice -n -20 -p $$

# Prevent Low Memory Killer (LMK) from targeting this process
if [ -f /proc/$$/oom_score_adj ]; then
    echo -1000 > /proc/$$/oom_score_adj
fi

# Move to top-app cpuset to ensure the script isn't throttled
echo $$ > /dev/cpuset/top-app/tasks 2>/dev/null

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

su -c rm -f "$MODDIR/.running.lock"
log "MTK_AI daemon started"

# Fix permissions
chmod 755 "$MODDIR/busybox" 2>/dev/null
chmod 755 "$MODDIR/logcat_detection/logcat" 2>/dev/null
chmod 755 "$MODDIR/touch_detection/touch2" 2>/dev/null
chmod 755 "$MODDIR/touch_detection/dumpsys" 2>/dev/null
chmod 755 "$MODDIR/logcat_detection/dumpsys2" 2>/dev/null
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
su -c 'mkdir -p /sdcard/MTK_AI_Engine && :> /sdcard/MTK_AI_Engine/enable_notifications'
su -c 'mkdir -p /sdcard/MTK_AI_Engine && :> /sdcard/MTK_AI_Engine/enable_limiter'
su -c 'mkdir -p /sdcard/MTK_AI_Engine && :> /sdcard/MTK_AI_Engine/low_power_mode'

CFG_DIR="/sdcard/MTK_AI_Engine/config"
LOGCAT_SCRIPT="$MODDIR/logcat_detection/logcat"
DUMPSYS_SCRIPT="$MODDIR/logcat_detection/dumpsys2"

# Kill any existing detection processes
pkill -f "MTK_AI.*logcat" 2>/dev/null
pkill -f "MTK_AI.*dumpsys2" 2>/dev/null
killall logcat 2>/dev/null
killall dumpsys2 2>/dev/null

# Default to dumpsys (safer fallback)
DETECTION_METHOD="dumpsys"

# Check config files (logcat takes priority if both exist)
if [ -f "$CFG_DIR/enable_logcat" ]; then
    DETECTION_METHOD="logcat"
elif [ -f "$CFG_DIR/enable_dumpsys" ]; then
    DETECTION_METHOD="dumpsys"
fi

# Start selected detection method
case "$DETECTION_METHOD" in
    logcat)
        log_msg "▶️ Starting Logcat detection"
        [ -f "$LOGCAT_SCRIPT" ] && "$LOGCAT_SCRIPT" &
        ;;
    dumpsys|*)
        log_msg "▶️ Starting Dumpsys detection"
        [ -f "$DUMPSYS_SCRIPT" ] && "$DUMPSYS_SCRIPT" &
        ;;
esac
"$MODDIR/script_runner/sf_controller" &
