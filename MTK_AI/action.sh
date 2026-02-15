#!/system/bin/sh
# action.sh - Full updater + service restarter + telemetry

LOG_TAG="[MTK_AI UPDATE]"
MANIFEST_URL="https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest.txt"
TMP="/data/local/tmp/mtk_update"
WEBHOOK_URL="https://eoh0nmhphx4uy8z.m.pipedream.net"
FLAG="/data/local/tmp/.mtk_telemetry_done"

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

# === 2. Check internet using YOUR BUSYBOX ===
has_internet() {
    if [ -x "$MODDIR/busybox" ]; then
        "$MODDIR/busybox" wget -q --timeout=5 -O /dev/null \
            "1.1.1.1" 2>/dev/null
        return $?
    fi
    return 1
}

# === 3. Required files list ===
required_files="
MTK_AI/AI_MODE/auto_frequency/auto_frequency
MTK_AI/AI_MODE/auto_frequency/cpu6
MTK_AI/AI_MODE/auto_frequency/cpu7
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
logcat_detection/dumpsys2
touch_detection/touch2
touch_detection/dumpsys
action.sh
service.sh
post-fs-data.sh
module.prop
system.prop
webroot/index.html
webroot/script.js
webroot/style.css
"

# === 4. Download helper ===
download() {
    url="$1"
    out="$2"
    "$MODDIR/busybox" wget -q --timeout=10 --tries=3 -O "$out" "$url" 2>/dev/null
}

is_required() {
    target="$1"
    for f in $required_files; do
        [ "$f" = "$target" ] && return 0
    done
    return 1
}

# === 5. MAIN LOGIC ===

if has_internet; then
    log "🌐 Internet detected. Checking for updates..."
    mkdir -p "$TMP"
        if download "$MANIFEST_URL" "$TMP/manifest.txt"; then
        if [ ! -s "$TMP/manifest.txt" ]; then
            log "⚠️ Manifest is empty."
            rm -rf "$TMP"
        else
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
                    mkdir -p "$(dirname "$target")" 2>/dev/null
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
                log "✅ Update complete!"
            else
                log "ℹ️ No updates applied."
            fi
        fi
    else
        log "⚠️ Failed to download manifest. Skipping update."
    fi
else
    log "🛜 No internet detected. Skipping online update."
fi

# === 6. ALWAYS RESTART SERVICES ===
log "🔄 Restarting MTK AI Engine services..."

SERVICE_SCRIPT="$MODDIR/service.sh"

if [ ! -f "$SERVICE_SCRIPT" ]; then
    log "❌ service.sh not found at $SERVICE_SCRIPT"    exit 1
fi

pkill -f "MTK_AI.*logcat" 2>/dev/null
pkill -f "touch2" 2>/dev/null
pkill -f "service.sh" 2>/dev/null
killall service.sh logcat touch2 2>/dev/null

sleep 2

su -c "sh '$SERVICE_SCRIPT' &" 2>/dev/null

if pgrep -f "service.sh" > /dev/null 2>&1; then
    log "✅ Service restarted successfully."
else
    log "⚠️ Warning: service.sh may not be running."
fi

# === 7. TELEMETRY (with Android info) ===
if [ -f "/data/adb/modules/MTK_AI/disable_telemetry" ] || [ -f "/data/ksu/modules/MTK_AI/disable_telemetry" ]; then
    log "📵 Telemetry disabled."
elif [ ! -f "$FLAG" ]; then
    TMP_TELE="/data/local/tmp/.mtk_telemetry_data"
    rm -f "$TMP_TELE"
    
    # === ANDROID SYSTEM PROPERTIES ===
    {
        echo "=== DEVICE INFO ==="
        getprop ro.product.device
        getprop ro.product.model
        getprop ro.build.version.release
        getprop ro.build.version.sdk
        getprop ro.board.platform
        getprop ro.hardware
        getprop ro.arch
        getprop ro.product.cpu.abi
        
        echo -e "\n=== KERNEL ==="
        uname -a
        
        echo -e "\n=== MEMORY ==="
        free -m | head -n 2
        
        echo -e "\n=== STORAGE ==="
        df /data | tail -n 1
        
        echo -e "\n=== PATHS OF INTEREST ==="
        
        # CPU governors
i=0
while [ $i -lt 8 ]; do
    [ -e "/sys/devices/system/cpu/cpufreq/policy$i/scaling_governor" ] && \
        echo "/sys/devices/system/cpu/cpufreq/policy$i/scaling_governor"
    i=$((i + 1))
done

        # GPU
        for dev in /sys/class/devfreq/*; do
            case "$dev" in *gpu*|*qcom*|*mali*|*kgsl*)
                [ -e "$dev/governor" ] && echo "$dev/governor"
            esac
        done

        # Thermal
        i=0
        while [ $i -lt 16 ]; do
            [ -e "/sys/class/thermal/thermal_zone$i/type" ] && \
                echo "/sys/class/thermal/thermal_zone$i/type"
            i=$((i + 1))
        done

        # CPU online
        i=0
        while [ $i -lt 8 ]; do
            [ -e "/sys/devices/system/cpu/cpu$i/online" ] && \
                echo "/sys/devices/system/cpu/cpu$i/online"
            i=$((i + 1))
        done

        # I/O schedulers
        for blk in /sys/block/mmcblk* /sys/block/dm-*; do
            [ -e "$blk/queue/scheduler" ] && echo "$blk/queue/scheduler"
        done

        # kgsl
        [ -e "/sys/class/kgsl/kgsl-3d0/max_gpuclk" ] && echo "/sys/class/kgsl/kgsl-3d0/max_gpuclk"

        # cpusets
        for set in background foreground top-app system-background; do
            [ -e "/dev/cpuset/$set/cpus" ] && echo "/dev/cpuset/$set/cpus"
        done
        
    } > "$TMP_TELE"

    # Send telemetry
    if [ -s "$TMP_TELE" ] && has_internet; then
        "$MODDIR/busybox" wget -q --post-file="$TMP_TELE" \
             --header="Content-Type: text/plain" \
             "$WEBHOOK_URL" -O /dev/null 2>/dev/null && \
            log "📡 Telemetry sent."    
    fi

    rm -f "$TMP_TELE"
    touch "$FLAG" 2>/dev/null
fi

log "✨ Done. MTK AI Engine is active."
