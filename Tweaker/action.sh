#!/system/bin/sh
# action.sh

LOG_TAG="[Tweaker UPDATE]"
MANIFEST_URL="https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest2.txt"
TMP="/data/local/tmp/tweaker_update"

log() {
    echo "$LOG_TAG $*"
}

# === 1. Detect module dir ===
detect_moddir() {
    [ -d "/data/adb/modules/Tweaker" ] && { echo "/data/adb/modules/Tweaker"; return; }
    [ -d "/data/ksu/modules/Tweaker" ] && { echo "/data/ksu/modules/Tweaker"; return; }
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
action.sh
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
log "🔄 Tweaker services..."

SERVICE_SCRIPT="$MODDIR/service.sh"

if [ ! -f "$SERVICE_SCRIPT" ]; then
    log "❌ service.sh not found at $SERVICE_SCRIPT"    exit 1
fi

pkill -f "Tweaker.*logcat" 2>/dev/null
pkill -f "touch" 2>/dev/null
pkill -f "service.sh" 2>/dev/null
killall service.sh logcat touch2 2>/dev/null

sleep 2

su -c "sh '$SERVICE_SCRIPT' &" 2>/dev/null

if pgrep -f "service.sh" > /dev/null 2>&1; then
    log "✅ Service restarted successfully."
else
    log "⚠️ Warning: service.sh may not be running."
fi
