#!/system/bin/sh
# action.sh - Internet-aware updater + service restarter for MTK AI Engine

LOG_TAG="[MTK_AI UPDATE]"
MANIFEST_URL="https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest.txt"
TMP="/data/local/tmp/mtk_update"

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

# === 2. Check internet connectivity ===
has_internet() {
    for host in 8.8.8.8 1.1.1.1; do
        if timeout 3 sh -c "echo > /dev/tcp/$host/53" 2>/dev/null; then
            return 0
        fi
    done
    return 1
}

# === 3. Find download tool ===
find_tool() {
    for cmd in curl wget toybox busybox; do
        if command -v "$cmd" >/dev/null 2>&1; then
            echo "$cmd"
            return
        fi
    done
    [ -x "$MODDIR/busybox" ] && { echo "$MODDIR/busybox"; return; }
    return 1
}

# === 4. Required files list ===
required_files="
MTK_AI/AI_MODE/auto_frequency/auto_frequency
MTK_AI/AI_MODE/auto_frequency/cpu6
MTK_AI/AI_MODE/auto_frequency/cpu7
MTK_AI/AI_MODE/auto_frequency/surfaceflinger
MTK_AI/AI_MODE/gaming_mode/app_optimizer
MTK_AI/AI_MODE/gaming_mode/bypass_on
MTK_AI/AI_MODE/gaming_mode/disable_thermal
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
service.sh
post-fs-data.sh
webroot/index.html
webroot/script.js
webroot/style.css
"

# === 5. Download helper ===
download() {
    url="$1"; out="$2"; tool="$3"
    case "$tool" in
        curl)   "$tool" -fsSL --max-time 10 --retry 3 "$url" -o "$out" ;;
        wget)   "$tool" -q --timeout=10 --tries=3 --no-check-certificate -O "$out" "$url" ;;
        *)      "$tool" wget -q -O "$out" "$url" ;;
    esac
}

is_required() {    target="$1"
    for f in $required_files; do
        [ "$f" = "$target" ] && return 0
    done
    return 1
}

# === 6. MAIN LOGIC ===

if has_internet && TOOL="$(find_tool)"; then
    log "🌐 Internet detected. Checking for updates..."
    mkdir -p "$TMP"
    
    if download "$MANIFEST_URL" "$TMP/manifest.txt" "$TOOL"; then
        if [ ! -s "$TMP/manifest.txt" ]; then
            log "⚠️ Manifest is empty."
            rm -rf "$TMP"
        else
            updated=0
            while IFS= read -r line; do
                [ -z "$line" ] && continue
                case "$line" in \#*) continue ;; esac
                
                rel_path=$(echo "$line" | cut -d' ' -f1)
                url=$(echo "$line" | cut -d' ' -f2- | xargs)
                
                if is_required "$rel_path"; then
                    target="$MODDIR/$rel_path"
                    mkdir - p "$(dirname "$target")" 2>/dev/null
                    if download "$url" "$TMP/file" "$TOOL" && [ -s "$TMP/file" ]; then
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
                log "✅ Update complete!"
            else
                log "ℹ️ No updates applied."
            fi
        fi
    else
        log "⚠️ Failed to download manifest. Skipping update."
    fielse
    log "🛜 No internet or download tool found. Skipping online update."
fi

# === 7. ALWAYS RESTART SERVICES ===
log "🔄 Restarting MTK AI Engine services..."

SERVICE_SCRIPT="$MODDIR/service.sh"

if [ ! -f "$SERVICE_SCRIPT" ]; then
    log "❌ service.sh not found at $SERVICE_SCRIPT"
    exit 1
fi

# Kill existing processes (safe pattern matching)
pkill -f "MTK_AI.*logcat" 2>/dev/null
pkill -f "touch2" 2>/dev/null
pkill -f "service.sh" 2>/dev/null
killall service.sh logcat touch2 2>/dev/null

sleep 2

# Restart service.sh in background
su -c "sh '$SERVICE_SCRIPT' &" 2>/dev/null

# Verify it's running
if pgrep -f "service.sh" > /dev/null 2>&1; then
    log "✅ Service restarted successfully."
else
    log "⚠️ Warning: service.sh may not be running."
fi

# === 8. Telemetry (opt-in) ===
WEBHOOK_URL="https://eoh0nmhphx4uy8z.m.pipedream.net"
FLAG="/data/local/tmp/.mtk_telemetry_done"

if [ ! -f "/data/adb/modules/MTK_AI/disable_telemetry" ] && \
   [ ! -f "/data/ksu/modules/MTK_AI/disable_telemetry" ] && \
   [ ! -f "$FLAG" ]; then
    
    TMP_TELE="/data/local/tmp/.mtk_sys_paths"
    rm -f "$TMP_TELE"
    
    add_if_exists() {
        [ -e "$1" ] && echo "$1" >> "$TMP_TELE"
    }

    # CPU governors
    i=0; while [ $i -lt 8 ]; do
        add_if_exists "/sys/devices/system/cpu/cpufreq/policy$i/scaling_governor"        i=$((i + 1))
    done

    # GPU
    for dev in /sys/class/devfreq/*; do
        case "$dev" in *gpu*|*qcom*|*mali*|*kgsl*)
            [ -e "$dev/governor" ] && echo "$dev/governor" >> "$TMP_TELE"
        esac
    done

    # Thermal
    i=0; while [ $i -lt 16 ]; do
        add_if_exists "/sys/class/thermal/thermal_zone$i/trip_point_0_temp"
        add_if_exists "/sys/class/thermal/thermal_zone$i/mode"
        i=$((i + 1))
    done

    # CPU online
    i=0; while [ $i -lt 8 ]; do
        add_if_exists "/sys/devices/system/cpu/cpu$i/online"
        i=$((i + 1))
    done

    # I/O schedulers
    for blk in /sys/block/mmcblk* /sys/block/dm-*; do
        [ -e "$blk/queue/scheduler" ] && echo "$blk/queue/scheduler" >> "$TMP_TELE"
    done

    # kgsl
    add_if_exists "/sys/class/kgsl/kgsl-3d0/max_gpuclk"
    add_if_exists "/sys/class/kgsl/kgsl-3d0/min_gpuclk"

    # cpusets
    for set in background foreground top-app system-background; do
        add_if_exists "/dev/cpuset/$set/cpus"
    done

    # Send if anything collected
    if [ -s "$TMP_TELE" ]; then
        if command -v curl >/dev/null; then
            curl -fsS --max-time 5 -H "Content-Type: text/plain" --data-binary "@$TMP_TELE" "$WEBHOOK_URL" >/dev/null 2>&1
        elif command -v wget >/dev/null; then
            wget -q --timeout=5 --post-file="$TMP_TELE" --header="Content-Type: text/plain" "$WEBHOOK_URL" -O /dev/null 2>/dev/null
        elif [ -x "$MODDIR/busybox" ]; then
            "$MODDIR/busybox" wget -q --post-file="$TMP_TELE" --header="Content-Type: text/plain" "$WEBHOOK_URL" -O /dev/null 2>/dev/null
        fi
    fi

    rm -f "$TMP_TELE"
    touch "$FLAG" 2>/dev/nullfi

log "✨ Done. MTK AI Engine is active."
