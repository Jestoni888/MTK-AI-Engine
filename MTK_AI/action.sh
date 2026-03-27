# /data/adb/modules/MTK_AI/service.sh
#!/system/bin/sh
# action.sh - Full updater + service restarter + telemetry

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
MTK_AI/AI_MODE/normal_mode/powersavex
MTK_AI/AI_MODE/global_mode/charger_check
MTK_AI/AI_MODE/global_mode/ram_cleaner
MTK_AI/AI_MODE/global_mode/resources_tweaks
MTK_AI/AI_MODE/global_mode/trim_memory
MTK_AI/AI_MODE/global_mode/webview_tweaks
MTK_AI/AI_MODE/global_mode/fastcharging
MTK_AI/AI_MODE/global_mode/fastchargingx
MTK_AI/AI_MODE/global_mode/disable_fastcharging
script_runner/display_mode
script_runner/global
script_runner/mtk_ai_manual
script_runner/refresh_rate_locker
script_runner/sf_controller
script_runner/mtk_ai_eem_boot
script_runner/monitor_app_stats
main_control/mtk_ai_engine
main_control/mtk_ai_engine.sh
action.sh
service.sh
post-fs-data.sh
module.prop
system.prop
webroot/index.html
webroot/script.js
webroot/style.css
lib64/libc++_shared.so
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

pkill -f "MTK_AI.*mtk_ai_engine" 2>/dev/null
pkill -f "MTK_AI.*service.sh" 2>/dev/null

export SERVICE=$MODDIR:$SERVICE

exec $MODDIR/service.sh
