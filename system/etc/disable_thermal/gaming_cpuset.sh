#!/system/bin/sh
# --- FULLY REPAIRED & ROBUST CPUSET LOGIC ---

LOG_FILE="/sdcard/MTK_AI_Engine.log"
CPUSET_PATH="/dev/cpuset"

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# --- THE FORCE-WRITE FUNCTION ---
# This is the secret to fixing the "Permission Denied" error
apply_cpuset() {
    local val="$1"
    local node="$2"
    local name="$3"

    if [ -f "$node" ]; then
        # 1. Force the file to be writeable (Breaks kernel locks)
        chmod 666 "$node" 2>/dev/null
        
        # 2. Attempt write using multiple methods
        echo "$val" > "$node" 2>/dev/null || \
        su -c "echo $val > $node" 2>/dev/null || \
        su -c "tee $node <<<$val" >/dev/null 2>&1

        # 3. Verify if it actually worked
        local result=$(cat "$node")
        if [ "$result" = "$val" ]; then
            log_msg "✅ $name: $val (Success)"
        else
            log_msg "❌ $name: Failed to lock (Kernel Overwrite)"
        fi
    fi
}

log_msg "🚀 Starting Advanced CPUSET Optimization..."

# --- 1. CORE PERFORMANCE GROUPS ---
# top-app: The active game/app
# foreground: UI elements
# camera/storage: Critical data paths
for target in top-app foreground storage; do
    for dir in $(ls "$CPUSET_PATH" | grep "$target"); do
        apply_cpuset "0-7" "$CPUSET_PATH/$dir/cpus" "Performance-$dir"
    done
done

# --- 2. SMOOTHNESS GROUPS ---
# sf: SurfaceFlinger (The screen renderer)
# display: Display driver
for target in sf display; do
    for dir in $(ls "$CPUSET_PATH" | grep "$target"); do
        apply_cpuset "4-7" "$CPUSET_PATH/$dir/cpus" "Smoothness-$dir"
    done
done

# --- 3. BACKGROUND GROUPS ---
# background / system-background / restricted
# Move these to Little cores (0-3) to stop them from stealing power from the game
for dir in $(ls "$CPUSET_PATH"); do
    # Skip the performance and smoothness dirs we already handled
    case "$dir" in
        top-app*|foreground*|storage*|sf*|display*) continue ;;
    esac
    
    [ -d "$CPUSET_PATH/$dir" ] && \
    apply_cpuset "0-1" "$CPUSET_PATH/$dir/cpus" "Background-$dir"
done

# --- 4. GLOBAL ROOT LOCK ---
apply_cpuset "0-1" "$CPUSET_PATH/cpus" "Global-Root"

log_msg "🎯 All commands executed."

# DEVFREQ GAMING MODE
            for g in /sys/class/devfreq/*/governor; do
                [ -f "$g" ] || continue
                NAME=$(basename "$(dirname "$g")")
                if echo "$NAME" | grep -E 'dvfsrc|mali' >/dev/null; then
                    echo performance | su -c "tee $g"
                    log_msg "⚡ Gaming mode devfreq: $NAME → performance"
                fi
            done
            
