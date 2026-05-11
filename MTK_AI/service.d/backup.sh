#!/system/bin/sh
LOG="/data/adb/backup/sync.log"
ADB_DIR="/data/adb/backup"
mkdir -p $ADB_DIR

log() { echo "[$(date +%T)] $1" >> "$LOG"; }
log "=== Sync to SD started ==="

# 1. Wait for backup files to finish writing (dd takes 10-30s)
log "Waiting for backup files..."
for i in $(seq 1 45); do
    ls /data/adb/backup/boot_*.img /data/adb/backup/super_*.img >/dev/null 2>&1 && break
    sleep 2
done

# 2. Robust SD detection (polls /storage for UUID-formatted external SD)
log "Detecting SD card..."
for i in $(seq 1 30); do
    # External SD uses FAT/exFAT UUID format (e.g., 1A2B-3C4D)
    SD=$(find /storage -maxdepth 1 -mindepth 1 -type d 2>/dev/null | grep -E '[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -1)
    [ -n "$SD" ] && break
    sleep 2
done

if [ -z "$SD" ]; then
    log "⚠️ SD not found. Falling back to /sdcard"
    SD="/sdcard"
else
    log "SD found at: $SD"
fi

DEST="$SD/AndroidBackups"
mkdir -p "$DEST" || { log "❌ Failed to create $DEST"; exit 1; }

# 3. Copy & overwrite
for img in /data/adb/backup/boot_*.img /data/adb/backup/super_*.img; do
    if [ -f "$img" ]; then
        cp -f "$img" "$DEST/" 2>/dev/null && log "✅ Copied $(basename "$img")" || log "❌ Copy failed: $(basename "$img")"
    else
        log "⚠️ Backup missing: $(basename "$img")"
    fi
done

# 4. 🧹 DESTINATION CLEANUP (Prevents duplication)
log "Cleaning up old backups in $DEST..."
for prefix in boot super; do
    # Find the newest file for this partition type
    newest=$(ls -t "$DEST"/${prefix}_*.img 2>/dev/null | head -n 1)
    if [ -n "$newest" ]; then
        # Delete all others, keep only the newest
        find "$DEST" -maxdepth 1 -name "${prefix}_*.img" ! -name "$(basename "$newest")" -type f -delete 2>/dev/null
    fi
done
log "Cleanup complete."

# 2. AUTO-CLEANUP: Remove previous backups
log "Cleaning up previous boot & super backups..."
rm -f "$ADB_DIR"/boot_*.img "$ADB_DIR"/backup*.log "$ADB_DIR"/super_*.img 2>/dev/null
log "Cleanup complete."

# 4. Set safe boot flag
touch /data/adb/backup/.safe_boot_marker
log "=== Sync complete ==="