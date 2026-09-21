#!/system/bin/sh

# /data/adb/modules/MTK_AI/main_control/mtk_ai_engine.sh
LOCK_DIR="/data/adb/modules/MTK_AI/.guard"

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

# Wait for boot
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 3
done

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
fi
ENGINE="$MODDIR/main_control/mtk_ai_engine.sh"
    setsid "$ENGINE" > /dev/null 2>&1 &

