#!/system/bin/sh
# --- REPAIRED CPUSET SCRIPT ---

LOG_FILE="/sdcard/MTK_AI_Engine.log"
CPUSET_PATH="/dev/cpuset"

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to safely write to nodes
safe_write() {
    local value=$1
    local target=$2
    if [ -f "$target" ]; then
        # Use chmod to ensure writeability, then tee to write
        chmod 666 "$target" 2>/dev/null
        echo "$value" > "$target" 2>/dev/null || su -c "echo $value > $target" 2>/dev/null
        return 0
    fi
    return 1
}

log_msg "STARTING CPUSET REPAIR..."

# 1. Process specific directories
for DIR in top-app foreground background system-background camera sf display; do
    TARGET_DIR="$CPUSET_PATH/$DIR"
    [ -d "$TARGET_DIR" ] || continue
    
    NODE="$TARGET_DIR/cpus"
    
    case "$DIR" in
        "top-app"|"camera"|"foreground")
            safe_write "0-7" "$NODE" && log_msg "♻️ $DIR -> 0-7 (Full Power)"
            ;;
        "sf"|"display")
            safe_write "4-7" "$NODE" && log_msg "♻️ $DIR -> 4-7 (Smoothness)"
            ;;
        *)
            safe_write "0-1" "$NODE" && log_msg "♻️ $DIR -> 0-1 (Efficiency)"
            ;;
    esac
done

# 2. Process any other missed directories in /dev/cpuset
for DIR in $(ls "$CPUSET_PATH"); do
    [ -d "$CPUSET_PATH/$DIR" ] || continue
    # Skip if already handled by the specific list above
    case "$DIR" in
        top-app|foreground|background|system-background|camera|sf|display) continue ;;
    esac
    
    safe_write "0-3" "$CPUSET_PATH/$DIR/cpus" && log_msg "♻️ $DIR -> 0-1 (Default)"
done

# 3. Global Root Lock
safe_write "0-3" "$CPUSET_PATH/cpus" && log_msg "♻️ Root cpuset -> 0-3"

log_msg "✅ CPUSET REPAIR FINISHED"

# DEVFREQ STRICT POWERSAVE MODE
# This removes the performance filters and forces all nodes to save energy
for g in /sys/class/devfreq/*/governor; do
    [ -f "$g" ] || continue
    NAME=$(basename "$(dirname "$g")")
    
    # Check supported governors for the current node
    SUP=$(cat "$(dirname "$g")/available_governors" 2>/dev/null)

    # Force powersave if supported, otherwise fallback to simple_ondemand
    if echo "$SUP" | grep -q "powersave"; then
        chmod 644 "$g" 2>/dev/null
        echo powersave | su -c "tee $g"
        log_msg "🔋 Powersave mode: $NAME → powersave"
    else
        # If powersave isn't a valid option for this kernel node, 
        # use the most efficient alternative available.
        chmod 644 "$g" 2>/dev/null
        echo simple_ondemand | su -c "tee $g" 2>/dev/null
        log_msg "🔋 Powersave mode: $NAME → simple_ondemand (fallback)"
    fi
done
