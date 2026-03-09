#!/system/bin/sh

PIDFILE="/data/adb/modules/Tweaker/engine.pid"
echo $$ > "$PIDFILE"

# Set highest CPU priority
renice -n -20 -p $$ 2>/dev/null

# Prevent Low Memory Killer (LMK)
if [ -f /proc/$$/oom_score_adj ]; then
    echo -1000 > /proc/$$/oom_score_adj
fi

# Move to top-app cpuset
echo $$ > /dev/cpuset/top-app/tasks 2>/dev/null

MODDIR="/data/adb/modules/Tweaker"
BB="$MODDIR/busybox"
LOG="$MODDIR/service.log"

# Wait for boot
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 30
done

log_msg() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" >> "$LOG"
    
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
log_msg "Tweak finder started"

# Fix permissions
chmod 755 "$MODDIR/detection/logcat" 2>/dev/null
chmod 755 "$MODDIR/busybox" 2>/dev/null
chmod 755 "$MODDIR/webroot/app.js" 2>/dev/null

LOGCAT="$MODDIR/detection/logcat"

# === LAUNCH DETECTION SCRIPT (Solid Pattern) ===
launch_detection_script() {
    local script_path="$1"
    local label="$2"    
    [ ! -x "$script_path" ] && { log_msg "❌ $label not executable: $script_path"; return 1; }
    
    log_msg "▶️ Starting $label..."
    
    local abs_path="$($BB readlink -f "$script_path" 2>/dev/null || echo "$script_path")"
    
    (
        export PATH="/system/bin:/system/xbin:/sbin:/vendor/bin:$BB:$PATH"
        cd "$MODDIR" || exit 1
        nohup "$abs_path" --daemonized >/dev/null 2>&1 &
        disown 2>/dev/null || true
    )
    
    sleep 0.5
    
    local sname=$($BB basename "$script_path")
    $BB pgrep -f "$sname" >/dev/null 2>&1 && \
        log_msg "✅ $label OK (PID: $($BB pgrep -f "$sname" | head -1))" || \
        log_msg "⚠️ $label may have failed"
}

# ============================================
# 🚀 LAUNCH LOGCAT
# ============================================

log_msg "═══════════════════════════════════════"
log_msg "🚀 Launching Detection Services"
log_msg "═══════════════════════════════════════"

# ── Launch Logcat Monitor ──
launch_detection_script "$MODDIR/detection/logcat" "Logcat Monitor"

# ============================================
# 🔒 CREATE LOCK FILE
# ============================================

LOCKFILE="$MODDIR/.running.lock"
echo "$$" > "$LOCKFILE"
log_msg "🔒 Lock file created: $LOCKFILE"

# ============================================
# 🛑 CLEANUP ON EXIT
# ============================================

cleanup() {
    log_msg "🛑 Shutting down Tweak Finder..."    
    # Kill child processes
    pkill -P $$ 2>/dev/null
    
    # Kill detection scripts
    $BB pgrep -f "logcat" | while read pid; do
        kill "$pid" 2>/dev/null
    done
    
    # Remove lock and pid files
    rm -f "$LOCKFILE" "$PIDFILE" 2>/dev/null
    log_msg "✅ Cleanup complete"
}

trap cleanup EXIT INT TERM

# ============================================
# 🔍 WATCHDOG (Keep Services Alive)
# ============================================

log_msg "👁️ Starting watchdog..."

while true; do
    # Check lock file
    if [ ! -f "$LOCKFILE" ]; then
        log_msg "⚠️ Lock file missing! Recreating..."
        echo "$$" > "$LOCKFILE"
    fi
    
    # Check logcat monitor
    if ! $BB pgrep -f "logcat" >/dev/null 2>&1; then
        log_msg "⚠️ Logcat died! Restarting..."
        launch_detection_script "$LOGCAT"
    fi
    
    # Heartbeat log
    log_msg "💓 Watchdog alive"
    
    sleep 30
done
# ============================================
# 🏁 FINAL CLEANUP
# ============================================

log_msg "═══════════════════════════════════════"
log_msg "🏁 Tweak Finder service ended"
log_msg "═══════════════════════════════════════"

cleanup
exit 0
