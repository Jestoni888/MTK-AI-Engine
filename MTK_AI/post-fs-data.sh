#!/system/bin/sh
# Auto Backup boot & super.img + Auto-remove previous backups
# Compatible: Magisk / KernelSU / APatch

LOG_TAG="[img-backup]"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="/data/adb/backup"
LOG_FILE="$LOG_DIR/backup_${TIMESTAMP}.log"
TARGET_DIR="$LOG_DIR"
SAFE_FLAG="$LOG_DIR/.safe_boot_marker"

mkdir -p "$LOG_DIR" 2>/dev/null
log() { echo "$LOG_TAG $@" | tee -a "$LOG_FILE"; }

# 1️⃣ SAFE BOOT CHECK
if [ ! -f "$SAFE_FLAG" ]; then
    log "⚠️ Unsafe boot detected (bootloop or first run). Skipping backup."
    exit 0
fi

# 1. Detect SD (fallback safely if not mounted yet)
SD_MOUNT=$(grep -E '/dev/block/vold|mmcblk' /proc/mounts 2>/dev/null | awk '{print $2}' | grep -E '/storage/|/mnt/' | head -1)
if [ -n "$SD_MOUNT" ] && [ -d "$SD_MOUNT" ]; then
    TARGET_DIR="$SD_MOUNT/AndroidBackups"
    mkdir -p "$TARGET_DIR" 2>/dev/null
    [ -d "$TARGET_DIR" ] || TARGET_DIR="$LOG_DIR"
    log "SD detected -> $TARGET_DIR"
else
    log "SD not ready. Using fallback: $TARGET_DIR"
fi

mkdir -p "$TARGET_DIR"

# 2. AUTO-CLEANUP: Remove previous backups
log "Cleaning up previous boot & super backups..."
rm -f "$TARGET_DIR"/boot_*.img "$TARGET_DIR"/super_*.img 2>/dev/null
log "Cleanup complete."

# 3. Robust partition resolver (mksh safe)
resolve_part() {
    local pattern="$1"
    local dev=""
    if [ -L "/dev/block/by-name/$pattern" ]; then
        dev="/dev/block/by-name/$pattern"
    else
        # Unquoted allows shell glob expansion (boot* -> boot_a/boot_b/boot)
        dev=$(ls -d /dev/block/by-name/$pattern 2>/dev/null | head -n 1)
    fi
    if [ -L "$dev" ]; then
        dev=$(readlink -f "$dev" 2>/dev/null || readlink "$dev")
    fi
    [ -b "$dev" ] && echo "$dev"
}

# 4. Backup function
backup_part() {
    local label="$1"
    local pattern="$2"
    local dev=$(resolve_part "$pattern")

    if [ -z "$dev" ]; then
        log "[FAIL] $label: No partition found matching '$pattern'"
        return 1
    fi

    local out="$TARGET_DIR/${label}_${TIMESTAMP}.img"
    log "Backing up $label ($dev) -> $out"

    dd if="$dev" of="$out" bs=1M conv=fsync >> "$LOG_FILE" 2>&1
    local exit_code=$?

    if [ $exit_code -eq 0 ] && [ -s "$out" ]; then
        local mb=$(du -k "$out" | awk '{printf "%.0f", $1/1024}')
        log "[OK] $label: ${mb}MB"
    else
        log "[FAIL] $label: dd failed (exit $exit_code) or empty"
        rm -f "$out" 2>/dev/null
        return 1
    fi
}

# 5. Execute backups
backup_part "boot" "boot*"
backup_part "super" "super"

# 6️⃣ ✅ CONSUME SAFE BOOT FLAG (Moved to end as requested)
rm -f "$SAFE_FLAG" 2>/dev/null
log "🗑️ Safe boot marker consumed."

log "Backup process complete."

########################################
# 1. Copy cooler.sh into system overlay
########################################

TARGET_DIR="/data/adb/modules/$(basename $MODDIR)/system/etc/cooler"
TARGET_FILE="$TARGET_DIR/cooler.sh"

mkdir -p "$TARGET_DIR"

cp -af "$MODDIR/cooler/cooler.sh" "$TARGET_FILE"

chmod 0755 "$TARGET_FILE"
chown 0:0 "$TARGET_FILE"


########################################
# 2. Extra script you provided
########################################

# Create backup folder
mkdir -p /data/local/tmp/cooler_backup
chmod 755 /data/local/tmp/cooler_backup

# Unlock settings XML for editing (ROM protection workarounds)
chmod 0666 /data/system/users/0/settings_system.xml 2>/dev/null
chmod 0666 /data/system/users/0/settings_global.xml 2>/dev/null

# Some ROMs like MIUI / ColorOS / RealmeUI enforce vendor config restrictions
chmod -R 0777 /data/vendor/ 2>/dev/null
chmod -R 0777 /mnt/vendor/ 2>/dev/null
exit 0
