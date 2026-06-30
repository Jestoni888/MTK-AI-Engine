#!/system/bin/sh
### === SINGLE INSTANCE LOCK ===
LOCK_DIR="/data/adb/modules/MTK_AI/.guard"
mkdir -p "$LOCK_DIR"
LOCK_FILE="$LOCK_DIR/performance.pid"

# 1️⃣ Global pgrep check FIRST
# Excludes the current process ($$) to prevent false positives
if pgrep -f "performance.sh" | grep -v "^$$\$" > /dev/null 2>&1; then
    exit 0
else
    # Process didn't exist, delete the .guard directory (cleanup stale locks)
    rm -rf "$LOCK_DIR"
fi

# 3️⃣ Register current process as the single instance
echo $$ > "$LOCK_FILE"
# Auto-clean PID file on normal exit or SIGTERM
trap 'rm -f "$LOCK_FILE"' EXIT
### ============================
# ===============================================================
#  GAME PERFORMANCE BOOSTER – Full Integrated & FIXED Version
# ===============================================================

# ============ 1. GLOBAL VARIABLES ============
LOG_FILE="/sdcard/MTK_AI_Engine/game_booster.log"
GAME_LIST_FILE="/sdcard/MTK_AI_Engine/game_list.txt"
EXCLUDE_FILE="/sdcard/MTK_AI_Engine/exclude_apps.txt"

DEFAULT_GOV="schedutil"
SMOOTH_UP="0"
SMOOTH_DOWN="26000"
GPU_LOCK_FREQ="836000"

BOOST_ACTIVE=false
CURRENT_GAME=""
prev_pkg=""

# ============ 2. ALL FUNCTIONS DEFINED FIRST ============

# -------------------------
# Logging
# -------------------------
log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
    if [ -f "$LOG_FILE" ]; then
        LINES=$(wc -l < "$LOG_FILE")
        if [ "$LINES" -gt 200 ]; then
            tail -n 200 "$LOG_FILE" > "$LOG_FILE.tmp"
            mv "$LOG_FILE.tmp" "$LOG_FILE"
        fi
    fi
}

# -------------------------
# Schedutil tweaks (Used for RESTORE)
# -------------------------
apply_schedutil_tweaks() {
    for path in /sys/devices/system/cpu/cpu*/cpufreq; do
        [ -d "$path" ] || continue
        echo "$DEFAULT_GOV" | su -c "tee $path/scaling_governor"
        [ -f "$path/schedutil/up_rate_limit_us" ] &&
            echo "$SMOOTH_UP" | su -c "tee $path/schedutil/up_rate_limit_us"
        [ -f "$path/schedutil/down_rate_limit_us" ] &&
            echo "$SMOOTH_DOWN" | su -c "tee $path/schedutil/down_rate_limit_us"
    done
    log_msg "✅ Restored schedutil + smoothness"
}

# -------------------------
# GPU restore
# -------------------------
restore_gpu_freq() {
    GPU_PATH=$(ls -d /sys/class/devfreq/*mali* 2>/dev/null | head -n 1)
    [ -z "$GPU_PATH" ] && { log_msg "⚠ GPU path not found"; return; }
    FREQ_LIST="$GPU_PATH/available_frequencies"
    [ ! -f "$FREQ_LIST" ] && { log_msg "⚠ No available_frequencies"; return; }
    MIN=$(tr ' ' '\n' < "$FREQ_LIST" | sort -n | head -n1)
    MAX=$(tr ' ' '\n' < "$FREQ_LIST" | sort -n | tail -n1)
    echo "$MIN" | su -c "tee $GPU_PATH/min_freq"
    echo "$MAX" | su -c "tee $GPU_PATH/max_freq"
    [ -f "$GPU_PATH/cur_freq" ] && echo "$MAX" | su -c "tee $GPU_PATH/cur_freq"
    log_msg "🎨 GPU restored → $MIN - $MAX"
    [ -w /sys/module/ged/parameters/gpu_bottom_freq ] &&
        echo 0 | su -c "tee /sys/module/ged/parameters/gpu_bottom_freq"
    [ -w /sys/module/ged/parameters/gpu_cust_boost_freq ] &&
        echo 0 | su -c "tee /sys/module/ged/parameters/gpu_cust_boost_freq"
    log_msg "🎨 GED restored"
}

# -------------------------
# Memory clean
# -------------------------
clean_memory() {
    sync
    am trim-memory all
    log_msg "🧼 Memory trim executed"
}

# -------------------------
# Boost process priority
# -------------------------
boost_proc() {
    PROC=$1
    PID=$(pidof "$PROC")
    [ -z "$PID" ] && return
    renice -20 -p "$PID" 2>/dev/null
    ionice -c 1 -n 0 -p "$PID" 2>/dev/null
    taskset -p ff "$PID" 2>/dev/null
    log_msg "🔧 Boosted $PROC ($PID)"
}

# -------------------------
# Core control
# -------------------------
disable_core_ctl() {
    for c in /sys/devices/system/cpu/cpu*/core_ctl; do
        [ -d "$c" ] || continue
        echo 0 | su -c "tee $c/enable"
    done
    log_msg "🚫 core_ctl disabled"
}

restore_core_ctl() {
    for c in /sys/devices/system/cpu/cpu*/core_ctl; do
        [ -d "$c" ] || continue
        echo 1 | su -c "tee $c/enable"
    done
    log_msg "♻ core_ctl restored"
}

# -------------------------
# Lock GPU max frequency + GED
# -------------------------
lock_gpu_max() {
    GPU_PATH=$(ls -d /sys/class/devfreq/*mali* 2>/dev/null | head -n 1)
    [ -z "$GPU_PATH" ] && { log_msg "⚠ No GPU path"; return; }
    FREQ_LIST="$GPU_PATH/available_frequencies"
    [ ! -f "$FREQ_LIST" ] && { log_msg "⚠ No available_frequencies"; return; }
    MAX=$(tr ' ' '\n' < "$FREQ_LIST" | sort -n | tail -n1)
    echo "$MAX" | su -c "tee $GPU_PATH/min_freq"
    echo "$MAX" | su -c "tee $GPU_PATH/max_freq"
    [ -f "$GPU_PATH/cur_freq" ] && echo "$MAX" | su -c "tee $GPU_PATH/cur_freq"
    log_msg "🎨 GPU locked to MAX ($MAX)"
    [ -w /sys/module/ged/parameters/gpu_bottom_freq ] &&
        echo "$GPU_LOCK_FREQ" | su -c "tee /sys/module/ged/parameters/gpu_bottom_freq"
    [ -w /sys/module/ged/parameters/gpu_cust_boost_freq ] &&
        echo "$GPU_LOCK_FREQ" | su -c "tee /sys/module/ged/parameters/gpu_cust_boost_freq"
    log_msg "🎨 GED locked to $GPU_LOCK_FREQ"
}

# -------------------------
# Helper: get target frequency for a policy
# -------------------------
get_target_freq() {
    local policy_path="$1"
    local percent="$2"
    local maxf="$policy_path/cpuinfo_max_freq"
    [ -f "$maxf" ] || return 0

    local MAX=$(cat "$maxf")
    local TARGET=$(( MAX * percent / 100 ))

    local FREQ_LIST="$policy_path/scaling_available_frequencies"
    if [ ! -f "$FREQ_LIST" ]; then
        FREQ_LIST="$policy_path/cpuinfo_available_frequencies"
    fi

    if [ -f "$FREQ_LIST" ]; then
        local REAL_TARGET=$(tr ' ' '\n' < "$FREQ_LIST" | sort -n | awk -v val="$TARGET" 'function abs(x){return ((x < 0.0) ? -x : x)} {if (abs($1-val) < abs(min-val)) min=$1} END {print min}')
        echo "$REAL_TARGET"
    else
        echo "$TARGET"
    fi
}

# -------------------------
# Set CPU max frequency (percentage)
# -------------------------
set_cpu_max() {
    PERCENT=$1

    for policy in /sys/devices/system/cpu/cpufreq/policy*; do
        [ -d "$policy" ] || continue

        set_maxf="$policy/scaling_max_freq"
        set_minf="$policy/scaling_min_freq"

        TARGET_FREQ=$(get_target_freq "$policy" "$PERCENT")

        # 1. Set the MAX frequency
        echo "$TARGET_FREQ" | su -c "tee $set_maxf" 2>/dev/null
        log_msg "⚡ CPU Policy $(basename $policy) → Max freq = $TARGET_FREQ ($PERCENT%)"

        # 2. FIX: If 100% is requested, LOCK the MIN frequency to MAX too
        if [ "$PERCENT" -eq 100 ]; then
            echo "$TARGET_FREQ" | su -c "tee $set_minf" 2>/dev/null
            log_msg "⚡ CPU Policy $(basename $policy) → LOCKED MIN freq = $TARGET_FREQ (Full Boost)"
        fi

        # 3. If NOT 100%, restore MIN frequency to its lowest possible value
        if [ "$PERCENT" -ne 100 ]; then
            minf_info="$policy/cpuinfo_min_freq"
            [ -f "$minf_info" ] && MIN_HW=$(cat "$minf_info")
            echo "$MIN_HW" | su -c "tee $set_minf" 2>/dev/null
            log_msg "⚡ CPU Policy $(basename $policy) → Min freq restored to $MIN_HW"
        fi
    done
}

# -------------------------
# Force 120Hz
# -------------------------
FORCE120() {
    settings put system min_refresh_rate 120.0
    settings put global min_refresh_rate 120.0
    settings put system peak_refresh_rate 120.0
    settings put global peak_refresh_rate 120.0
    settings put system user_refresh_rate 120
    settings put global user_refresh_rate 120
    settings put system max_refresh_rate 120
    settings put global max_refresh_rate 120
    settings put system display_refresh_rate 120
    settings put global display_refresh_rate 120
    settings put system dynamic_refresh_rate 0
    settings put global dynamic_refresh_rate 0
    settings put system adaptive_refresh_rate 0
    settings put global adaptive_refresh_rate 0
    settings put system refresh_rate_mode 0
    settings put global refresh_rate_mode 0
    settings put system smart_refresh_enable 0
    settings put global smart_refresh_enable 0
}

# -------------------------
# Restore CPUSET
# -------------------------
restore_cpuset() {
    CPUSET_PATH="/dev/cpuset"
    for DIR in $(ls "$CPUSET_PATH" 2>/dev/null); do
        [ -d "$CPUSET_PATH/$DIR" ] || continue

        case "$DIR" in
            top-app|foreground|*camera*)
                [ -f "$CPUSET_PATH/$DIR/cpus" ] && echo "0-7" > "$CPUSET_PATH/$DIR/cpus" && \
                    log_msg "♻ cpuset restore: $DIR → 0-7"
                ;;
            sf|display)
                [ -f "$CPUSET_PATH/$DIR/cpus" ] && echo "4-7" > "$CPUSET_PATH/$DIR/cpus" && \
                    log_msg "♻ cpuset restore: $DIR → 4-7"
                ;;
            *)
                [ -f "$CPUSET_PATH/$DIR/cpus" ] && echo "0-3" > "$CPUSET_PATH/$DIR/cpus" && \
                    log_msg "♻ cpuset restore: $DIR → 0-3"
                ;;
        esac
    done
    [ -f "$CPUSET_PATH/cpus" ] && echo "0-3" > "$CPUSET_PATH/cpus" && \
        log_msg "♻ Root cpuset restored → 0-3"
}

# -------------------------
# Boost CPUSET (gaming mode)
# -------------------------
boost_cpuset() {
    CPUSET_PATH="/dev/cpuset"
    for DIR in $(ls "$CPUSET_PATH" 2>/dev/null); do
        [ -d "$CPUSET_PATH/$DIR" ] || continue
        case "$DIR" in
            top-app|foreground|*storage*)
                [ -f "$CPUSET_PATH/$DIR/cpus" ] && echo "0-7" | su -c "tee $CPUSET_PATH/$DIR/cpus"
                log_msg "➡️ cpuset boost: $DIR → 0-7"
                ;;
            *)
                [ -f "$CPUSET_PATH/$DIR/cpus" ] && echo "0-3" | su -c "tee $CPUSET_PATH/$DIR/cpus"
                log_msg "🔧 cpuset boost: $DIR → 0-3"
                ;;
        esac
    done
    [ -f "$CPUSET_PATH/cpus" ] && echo "0-3" | su -c "tee $CPUSET_PATH/cpus" && \
        log_msg "🧩 Root cpuset → 0-3"
}

# ============ 3. INITIALIZATION ============
log_msg "🚀 performance.sh started"

COOLER_SCRIPT="/Xperformance/etc/cooler/cooler.sh"
LOG="/sdcard/MTK_AI_Engine/cooler_mtk.log"
sleep 20
sh "$COOLER_SCRIPT" apply >> "$LOG" 2>&1
echo "MTK Cooling Active at $(date)" >> "$LOG"

# Force schedutil governor for all CPUs + tune it
GOV_PATH="/sys/devices/system/cpu"
for cpu in $GOV_PATH/cpu[0-9]*; do
    GOV_FILE="$cpu/cpufreq/scaling_governor"
    if [ -f "$GOV_FILE" ]; then
        echo "schedutil" > "$GOV_FILE"
    fi

    TUNABLE_DIR="$cpu/cpufreq/schedutil"
    if [ -d "$TUNABLE_DIR" ]; then
        echo 26000 > "$TUNABLE_DIR/up_rate_limit_us"
        echo 0 > "$TUNABLE_DIR/down_rate_limit_us"
        echo 1 > "$TUNABLE_DIR/iowait_boost_enable"
    fi
done

# Mediatek battery saver
for g in /sys/class/devfreq/*/governor; do
    [ -f "$g" ] || continue
    SUP=$(cat "$(dirname "$g")/available_governors" 2>/dev/null)
    log_msg "Node: $g | Available: $SUP"
    if echo "$SUP" | grep -q powersave; then
        echo powersave > "$g"
        log_msg "→ Set to powersave"
    else
        log_msg "→ powersave not supported on this node"
    fi
done

# voltage_offset
echo "-12" > /proc/eem/EEM_DET_B/eem_offset 2>/dev/null
echo "-12" > /proc/eem/EEM_DET_BL/eem_offset 2>/dev/null
echo "-12" > /proc/eem/EEM_DET_L/eem_offset 2>/dev/null
echo "-12" > /proc/eem/EEM_DET_CCI/eem_offset 2>/dev/null

# Delay to allow SystemUI + display HAL to initialize
sleep 60

# Run 3 times to defeat aggressive ROM overrides
FORCE120
sleep 5
FORCE120
sleep 10
FORCE120

echo "[120Hz Lock] Applied fully." > /data/local/tmp/120hz_lock.log
log_msg "[120Hz Lock] Applied fully."

# ----------------- THERMAL RESTORE -----------------
if [ -f /data/adb/modules/MTK_AI/system/etc/cooler/cooler.sh ]; then
    sh /data/adb/modules/MTK_AI/system/etc/cooler/cooler.sh
    log_msg "♻ Thermal restored (cooler.sh)"
else
    log_msg "⚠ Thermal restore script not found!"
fi

# ----------------- CPUSET RESTORE -----------------
restore_cpuset

# ============ 4. MAIN LOOP ============
while true; do
    PKG=$(dumpsys window | grep -E 'mCurrentFocus' | awk '{print $3}' | cut -d/ -f1)
    GAME_LIST=$(cat "$GAME_LIST_FILE" 2>/dev/null)
    EXCLUDE_APPS=$(cat "$EXCLUDE_FILE" 2>/dev/null)

    if [ "$PKG" != "$prev_pkg" ]; then
        prev_pkg="$PKG"

        if echo "$GAME_LIST" | grep -q "^$PKG$"; then
            # ----------------- GAME BOOST MODE -----------------
            if [ "$BOOST_ACTIVE" = false ]; then
                log_msg "🎮 Game detected: $PKG → Boosting performance..."

                # Step 1: schedutil governor
                set_cpu_max 100
                for policy in /sys/devices/system/cpu/cpufreq/policy*; do
                    [ -f "$policy/scaling_governor" ] && echo schedutil | su -c "tee $policy/scaling_governor"
                done

                # Disable thermal
                if [ -f /data/adb/modules/MTK_AI/Xperformance/etc/disable_thermal/disable_thermal.sh ]; then
                    su -c "sh /data/adb/modules/MTK_AI/Xperformance/etc/disable_thermal/disable_thermal.sh"
                    log_msg "🔥 Thermal disabled"
                fi

                # Force all cores online
                for cpu in /sys/devices/system/cpu/cpu[0-7]/online; do
                    [ -f "$cpu" ] && echo 1 | su -c "tee $cpu"
                done

                # Disable core control
                disable_core_ctl

                # Step 2: set CPU max to 100%
                set_cpu_max 100

                # Step 3: Switch to performance governor
                for policy in /sys/devices/system/cpu/cpufreq/policy*; do
                    [ -f "$policy/scaling_governor" ] && echo performance | su -c "tee $policy/scaling_governor"
                done

                # Lock GPU max
                lock_gpu_max

                # DEVFREQ GAMING MODE
                for g in /sys/class/devfreq/*/governor; do
                    [ -f "$g" ] || continue
                    NAME=$(basename "$(dirname "$g")")
                    if echo "$NAME" | grep -E 'dvfsrc|mali' >/dev/null; then
                        echo performance | su -c "tee $g"
                        log_msg "⚡ Gaming mode devfreq: $NAME → performance"
                    fi
                done

                # CPUSET adjustments
                boost_cpuset

                BOOST_ACTIVE=true
                CURRENT_GAME="$PKG"
                log_msg "✅ Boost active for $PKG"
            fi

            # ----------------- Boost game process -----------------
            PID=$(pidof "$PKG")
            if [ -n "$PID" ]; then
                renice -20 -p "$PID" 2>/dev/null
                ionice -c 1 -n 0 -p "$PID" 2>/dev/null
                taskset -p ff "$PID" 2>/dev/null
            fi

        else
            # ----------------- GAME CLOSED / RESTORE -----------------
            if [ "$BOOST_ACTIVE" = true ]; then
                log_msg "📴 Game closed ($CURRENT_GAME). Restoring..."

                apply_schedutil_tweaks
                restore_gpu_freq
                restore_core_ctl

                # Mediatek battery saver (powersave)
                for g in /sys/class/devfreq/*/governor; do
                    [ -f "$g" ] || continue
                    SUP=$(cat "$(dirname "$g")/available_governors" 2>/dev/null)
                    log_msg "🔋 Node: $g | Available governors: $SUP"
                    if echo "$SUP" | grep -q powersave; then
                        echo powersave | su -c "tee $g"
                        log_msg "🔋 Set $g → powersave"
                    else
                        log_msg "⚠ powersave not supported on $g"
                    fi
                done

                # Restore thermal
                if [ -f /data/adb/modules/MTK_AI/Xperformance/etc/cooler/cooler.sh ]; then
                    su -c "sh /data/adb/modules/MTK_AI/Xperformance/etc/cooler/cooler.sh"
                    log_msg "♻ Thermal restored"
                fi

                # Restore CPUSET
                restore_cpuset

                BOOST_ACTIVE=false
                CURRENT_GAME=""
            fi

            # ----------------- Non-gaming mode boosts -----------------
            # automatic frequency
            if [ -f /data/adb/modules/MTK_AI/Xperformance/etc/auto_frequency/auto_frequency.sh ]; then
                su -c "sh /data/adb/modules/MTK_AI/Xperformance/etc/auto_frequency/auto_frequency.sh"
                log_msg "↕️ Automatic frequency based on temperature"
            fi

            # Boost foreground app
            APP_PID=$(pidof "$PKG")
            if [ -n "$APP_PID" ]; then
                renice -20 -p "$APP_PID" 2>/dev/null
                taskset -p ff "$APP_PID" 2>/dev/null
                log_msg "🚀 Boosted foreground: $PKG ($APP_PID)"
            fi
        fi
    fi

    # Boost essential daemons
    for p in netd wpa_supplicant wificond rild qcrild vendor.qti.rild netmgrd surfaceflinger; do
        boost_proc "$p"
    done

    clean_memory
    sleep 20
done
