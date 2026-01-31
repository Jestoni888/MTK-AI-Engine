#!/system/bin/sh
#!/data/adb/modules/MTK_AI/busybox sh

MODDIR=/data/adb/modules/MTK_AI
WEBROOT="$MODDIR/webroot"   # ← MUST point to folder containing index.html
LOG="/data/media/0/MTK_AI_Engine/webui.log"

mkdir -p "/data/media/0/MTK_AI_Engine"
chmod 755 "$MODDIR/busybox"

# Stop old instance
pkill -f "busybox.*httpd.*8080" 2>/dev/null

log() { echo "$(date '+%T') $*" >> "$LOG"; }
log "Starting MTK AI WebUI..."

# ✅ Critical: Add -i index.html to auto-serve index.html on /
"$MODDIR/busybox" httpd \
  -f \
  -v \
  -p 127.0.0.1:8080 \
  -h "$WEBROOT" \
  -c "$MODDIR/httpd.conf" \
  -i index.html \          # ← THIS IS THE FIX
  2>>"$LOG" &

log "✅ WebUI: http://localhost:8080/ (now works!)"
log "PID: $!"
echo $! > "$MODDIR/httpd.pid"
