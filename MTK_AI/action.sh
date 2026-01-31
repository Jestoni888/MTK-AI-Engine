#!/system/bin/sh
# action.sh - Replace all MTK_AI core scripts from Pastebin on every run
# Place in: /data/adb/modules/MTK_AI/action.sh

LOG_TAG="[MTK_AI UPDATE]"
MANIFEST_URL="https://pastebin.com/raw/YOUR_MANIFEST_ID"  # 🔴 REPLACE THIS!
MODDIR="/data/adb/modules/MTK_AI"
TMP="/data/local/tmp/mtk_update"

log() { echo "$LOG_TAG $*" >&2; }

log "🔄 Updating all MTK_AI scripts..."

# Full list of paths (exactly as used in your post-fs-data.sh)
required_files="
MTK_AI/AI_MODE/auto_frequency/auto_frequency
MTK_AI/AI_MODE/auto_frequency/cpu6
MTK_AI/AI_MODE/auto_frequency/cpu7
MTK_AI/AI_MODE/auto_frequency/surfaceflinger
MTK_AI/AI_MODE/gaming_mode/app_optimizer
MTK_AI/AI_MODE/gaming_mode/bypass_on
MTK_AI/AI_MODE/gaming_mode/disable_thermal
MTK_AI/AI_MODE/gaming_mode/disable_thermal2
MTK_AI/AI_MODE/gaming_mode/disable_thermal3
MTK_AI/AI_MODE/gaming_mode/gaming_cpuset
MTK_AI/AI_MODE/gaming_mode/gaming_prop
MTK_AI/AI_MODE/gaming_mode/gaming_prop_2
MTK_AI/AI_MODE/gaming_mode/limit
MTK_AI/AI_MODE/gaming_mode/lite_gaming
MTK_AI/AI_MODE/gaming_mode/performance
MTK_AI/AI_MODE/gaming_mode/unlock
MTK_AI/AI_MODE/gaming_mode/unlockfps
MTK_AI/AI_MODE/normal_mode/bypass_off
MTK_AI/AI_MODE/normal_mode/normal_cpuset
MTK_AI/AI_MODE/normal_mode/normal_prop
MTK_AI/AI_MODE/normal_mode/powersave
MTK_AI/AI_MODE/global_mode/charger_check
MTK_AI/AI_MODE/global_mode/perf_disp
MTK_AI/AI_MODE/global_mode/ram_cleaner
MTK_AI/AI_MODE/global_mode/resources_tweaks
MTK_AI/AI_MODE/global_mode/trim_memory
MTK_AI/AI_MODE/global_mode/webview_tweaks
script_runner/display_mode
script_runner/global
script_runner/mtk_ai_manual
script_runner/refresh_rate_locker
script_runner/sf_controller
script_runner/mtk_ai_eem_boot
logcat_detection/logcat
touch_detection/touch2
touch_detection/dumpsys
action.sh
"

mkdir -p "$TMP"

# Download manifest
if ! "$MODDIR/busybox" wget -q --timeout=10 --tries=3 --no-check-certificate -O "$TMP/manifest.txt" "$MANIFEST_URL"; then
    log "❌ Failed to download manifest."
    rm -rf "$TMP"
    exit 1
fi

if [ ! -s "$TMP/manifest.txt" ]; then
    log "❌ Manifest is empty."
    rm -rf "$TMP"
    exit 1
fi

# Replace ONLY the files in required_files (for safety)
while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
        \#*) continue ;;
    esac

    rel_path=$(echo "$line" | cut -d' ' -f1)
    url=$(echo "$line" | cut -d' ' -f2- | xargs)

    # Only process if it's in our known list
    case " $required_files " in
        *" $rel_path "*)
            target="$MODDIR/$rel_path"
            mkdir - p "$(dirname "$target")" 2>/dev/null
            if "$MODDIR/busybox" wget -q --timeout=8 --tries=2 --no-check-certificate -O "$TMP/file" "$url" && [ -s "$TMP/file" ]; then
                cp "$TMP/file" "$target"
                chmod 755 "$target" 2>/dev/null
                log "✅ Updated: $rel_path"
            else
                log "⚠️  Failed: $rel_path"
            fi
            ;;
    esac
done < "$TMP/manifest.txt"

rm -rf "$TMP"
log "✅ All scripts updated. Reboot to apply changes."
