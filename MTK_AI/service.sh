# /data/adb/modules/MTK_AI/main_control/mtk_ai_engine.sh
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
    sleep 5
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

# Cleanup lock
su -c "rm -f $MODDIR/.running.lock" 2>/dev/null
log_msg "MTK_AI daemon started"

if [ ! -d "$MODDIR" ]; then
    echo "❌ Error: $MODDIR not found!"
    exit 1
fi

# Apply chmod 777 to EVERYTHING (*) except critical Magisk module files
find "$MODDIR" -mindepth 1 \
  ! -name "service.sh" \
  ! -name "post-fs-data" \
  ! -name "post-fs-data.sh" \
  ! -name "customize.sh" \
  ! -name "module.prop" \
  ! -name "uninstall.sh" \
  -exec chmod 777 {} +

# ... (Keep your existing chmod blocks for other scripts) ...
# Start HTTP server
"$BB" httpd -p 8080 -h "$MODDIR/webroot/" -f &

CFG_DIR="/sdcard/MTK_AI_Engine/config"
# Pointing to your custom wrappers
MTK_AI_ENGINE="$MODDIR/main_control/mtk_ai_engine.sh"

        if [ -f "/data/adb/service.d/99_mtk_ai_restore_values.sh" ]; then
            sh /data/adb/service.d/99_mtk_ai_restore_values.sh &
        fi

GLOBAL="$MODDIR/script_runner/global"
nohup "$GLOBAL" > /dev/null 2>&1 &

export MTK_AI_PATH=/data/adb/modules/MTK_AI/main_control:$MTK_AI_PATH
exec /data/adb/modules/MTK_AI/main_control/mtk_ai_engine.sh
