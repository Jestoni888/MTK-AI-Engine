#!/system/bin/sh

# /data/adb/modules/MTK_AI/main_control/mtk_ai_engine.sh

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
LOG="$MODDIR/service.log"

# Wait for boot
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 5
done

# Log function
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

# Cleanup lock
su -c "rm -f $MODDIR/.running.lock" 2>/dev/null
log_msg "MTK_AI daemon started"

if [ ! -d "$MODDIR" ]; then
    echo "❌ Error: $MODDIR not found!"
    exit 1
fi

# ✅ SAFE: Only make scripts executable (not 777!)
find "$MODDIR" -mindepth 1 \
  ! -name "service.sh" \
  ! -name "post-fs-data" \
  ! -name "post-fs-data.sh" \
  ! -name "customize.sh" \
  ! -name "module.prop" \
  ! -name "uninstall.sh" \
  -exec chmod 777 {} +
  
# Start HTTP server
if [ -x "$BB" ]; then
    "$BB" httpd -p 8080 -h "$MODDIR/webroot/" -f 2>/dev/null &
    log_msg "HTTP server started on port 8080"
else
    log_msg "⚠ Busybox not found, HTTP server disabled"
fi

# Run restore values script if exists
if [ -f "/data/adb/service.d/99_mtk_ai_restore_values.sh" ]; then
    sh /data/adb/service.d/99_mtk_ai_restore_values.sh &
    log_msg "Restore values script started"
fi

# Start global script runner
GLOBAL="$MODDIR/script_runner/automatrix"
if [ -x "$GLOBAL" ]; then
    setsid "$GLOBAL" > /dev/null 2>&1 &
    log_msg "Global script runner started"
else
    log_msg "⚠ Global script not found: $GLOBAL"
fi

# Start main engine
ENGINE="$MODDIR/main_control/mtk_ai_engine.sh"
if [ -x "$ENGINE" ]; then
    setsid "$ENGINE" > /dev/null 2>&1 &
    log_msg "MTK_AI Engine started"
else
    log_msg "⚠ Engine not found: $ENGINE"
fi

# ✅ FIXED: Performance mode with proper export order
if grep -qx "performance" /sdcard/MTK_AI_Engine/current_profile 2>/dev/null; then
    log_msg "Performance profile detected, starting performance mode..."
    
    export LD_LIBRARY_PATH=/data/adb/modules/MTK_AI/lib64:$LD_LIBRARY_PATH
    export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin:$PATH"
    
    nohup sh /data/adb/modules/MTK_AI/main_control/performance.sh </dev/null >/dev/null 2>&1 &
    log_msg "Performance script started"
    
    cd /data/adb/modules/MTK_AI && setsid ./main_control/mode "performance mode" </dev/null >/dev/null 2>&1 &
    log_msg "Performance mode binary started"
else
    log_msg "Performance profile not active"
fi

log_msg "MTK_AI service initialization complete"
