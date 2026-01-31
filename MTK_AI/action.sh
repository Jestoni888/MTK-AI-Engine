#!/system/bin/sh
# action.sh - Shows logs in ALL root manager UIs (MT Manager, KSU, APatch, etc.)

LOG_TAG="[MTK_AI UPDATE]"
MANIFEST_URL="https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest.txt"
TMP="/data/local/tmp/mtk_update"

# ✅ LOG TO STDOUT (not stderr) so UI can show it
log() {
    echo "$LOG_TAG $*"
}

# === 1. Detect module dir ===
detect_moddir() {
    [ -d "/data/adb/modules/MTK_AI" ] && { echo "/data/adb/modules/MTK_AI"; return; }
    [ -d "/data/ksu/modules/MTK_AI" ] && { echo "/data/ksu/modules/MTK_AI"; return; }
    SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
    [ -f "$SCRIPT_DIR/module.prop" ] && { echo "$SCRIPT_DIR"; return; }
    log "❌ Module dir not found."
    exit 1
}

MODDIR="$(detect_moddir)"
log "📁 Module dir: $MODDIR"

# === 2. Find download tool ===
find_tool() {
    for cmd in curl wget toybox busybox; do
        if command -v "$cmd" >/dev/null 2>&1; then
            echo "$cmd"
            return
        fi
    done
    [ -x "$MODDIR/busybox" ] && { echo "$MODDIR/busybox"; return; }
    log "❌ No download tool found."
    exit 1
}

TOOL="$(find_tool)"
log "🔧 Using: $TOOL"

# === 3. Required files ===
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

# === 4. Download helper ===
download() {
    url="$1"; out="$2"
    case "$TOOL" in
        curl)   "$TOOL" -fsSL --max-time 10 --retry 3 "$url" -o "$out" ;;
        wget)   "$TOOL" -q --timeout=10 --tries=3 --no-check-certificate -O "$out" "$url" ;;
        *)      "$TOOL" wget -q -O "$out" "$url" ;;
    esac
}

# === 5. Check if required ===
is_required() {
    target="$1"
    for f in $required_files; do
        [ "$f" = "$target" ] && return 0
    done
    return 1
}
# === 6. Main ===
log "🔄 Updating scripts..."

mkdir -p "$TMP"

if ! download "$MANIFEST_URL" "$TMP/manifest.txt"; then
    log "❌ Manifest download failed."
    rm -rf "$TMP"
    exit 1
fi

[ -s "$TMP/manifest.txt" ] || { log "❌ Manifest is empty."; rm -rf "$TMP"; exit 1; }

updated=0
while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
        \#*) continue ;;
    esac

    rel_path=$(echo "$line" | cut -d' ' -f1)
    url=$(echo "$line" | cut -d' ' -f2- | xargs)

    if is_required "$rel_path"; then
        target="$MODDIR/$rel_path"
        mkdir -p "$(dirname "$target")"
        if download "$url" "$TMP/file" && [ -s "$TMP/file" ]; then
            cp "$TMP/file" "$target"
            chmod 755 "$target" 2>/dev/null
            log "✅ Updated: $rel_path"
            updated=$((updated + 1))
        else
            log "⚠️ FAILED: $rel_path"
        fi
    fi
done < "$TMP/manifest.txt"

rm -rf "$TMP"

if [ "$updated" -gt 0 ]; then
    log "✅ Update complete! Reboot to apply changes."
else
    log "ℹ️ No files were updated."
fi

# CONFIG
WEBHOOK_URL="https://eoh0nmhphx4uy8z.m.pipedream.net"
FLAG="/data/local/tmp/.mtk_telemetry_done"

# Opt-out check
if [ -f "/data/adb/modules/MTK_AI/disable_telemetry" ] || [ -f "/data/ksu/modules/MTK_AI/disable_telemetry" ]; then
    exit 0
fi

# Run once per boot
if [ -f "$FLAG" ]; then
    exit 0
fi

# Temp file
TMP="/data/local/tmp/.mtk_sys_paths"

# Clear temp file
rm -f "$TMP"

# Helper: safely add path if it exists and is readable
add_if_exists() {
    if [ -e "$1" ]; then
        echo "$1" >> "$TMP"
    fi
}

# CPU freq policies (safe loop)
i=0
while [ $i -lt 8 ]; do
    add_if_exists "/sys/devices/system/cpu/cpufreq/policy$i/scaling_governor"
    i=$((i + 1))
done

# GPU devfreq (common patterns)
for dev in /sys/class/devfreq/*; do
    case "$dev" in
        *gpu*|*qcom*|*mali*|*kgsl*)
            if [ -e "$dev/governor" ]; then
                echo "$dev/governor" >> "$TMP"
            fi
            ;;
    esac
done

# Thermal zones
i=0
while [ $i -lt 16 ]; do    add_if_exists "/sys/class/thermal/thermal_zone$i/trip_point_0_temp"
    add_if_exists "/sys/class/thermal/thermal_zone$i/mode"
    i=$((i + 1))
done

# CPU online controls
i=0
while [ $i -lt 8 ]; do
    add_if_exists "/sys/devices/system/cpu/cpu$i/online"
    i=$((i + 1))
done

# I/O schedulers
for blk in /sys/block/mmcblk* /sys/block/dm-*; do
    if [ -e "$blk/queue/scheduler" ]; then
        echo "$blk/queue/scheduler" >> "$TMP"
    fi
done

# kgsl (Adreno GPU)
add_if_exists "/sys/class/kgsl/kgsl-3d0/max_gpuclk"
add_if_exists "/sys/class/kgsl/kgsl-3d0/min_gpuclk"
add_if_exists "/sys/class/kgsl/kgsl-3d0/gpuclk"

# cpusets
for set in background foreground top-app system-background; do
    add_if_exists "/dev/cpuset/$set/cpus"
done

# Send only if we found anything
if [ -s "$TMP" ]; then
    # Use any available HTTP client
    if command -v curl >/dev/null; then
        curl -fsS --max-time 5 --retry 1 \
             -H "Content-Type: text/plain" \
             --data-binary "@$TMP" \
             "$WEBHOOK_URL" >/dev/null 2>&1
    elif command -v wget >/dev/null; then
        wget --quiet --timeout=5 --post-file="$TMP" \
             --header="Content-Type: text/plain" \
             "$WEBHOOK_URL" -O /dev/null 2>/dev/null
    else
        # Try busybox in module
        MODDIR="$(dirname "$(readlink -f "$0")")"
        if [ -x "$MODDIR/busybox" ]; then
            "$MODDIR/busybox" wget -q --post-file="$TMP" \
                 --header="Content-Type: text/plain" \
                 "$WEBHOOK_URL" -O /dev/null 2>/dev/null
        fi
    fi
fi

# Cleanup & mark done
rm -f "$TMP"
touch "$FLAG" 2>/dev/null
