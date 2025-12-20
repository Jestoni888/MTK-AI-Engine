#!/system/bin/sh

# --- LOGGING FUNCTIONS ---
LOG_FILE="/sdcard/MTK_AI_Engine.log"

# Function to log a message with timestamp
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $1" >> "$LOG_FILE"
}

# Function to log a warning message with timestamp
log_warn() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN] $1" >> "$LOG_FILE"
}

# Function to log an error message with timestamp, print to stderr, and exit
log_error() {
    local message="$1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $message" >> "$LOG_FILE"
    echo "ERROR: $message" >&2 # Also print error to console
    exit 1
}

# --- START OF SCRIPT ---
log "--- Script Execution Started ---"
log "Log file path: $LOG_FILE"

# Ensure the script is executed with root privileges
if [[ $EUID -ne 0 ]]; then
    # Print error to console and log, then exit
    log_error "This script requires root privileges. Please run with 'su -c ./set_ppm_policies.sh' or use 'su' before execution."
fi

PPM_PATH="/proc/ppm/policy_status"

# Check if the PPM path exists
if [ ! -w "$PPM_PATH" ]; then
    log_error "PPM path ($PPM_PATH) does not exist or is not writable. Script cannot proceed."
fi

echo "--- Current PPM Policy Status ---"
log "Reading current PPM policy status from $PPM_PATH"
current_status=$(cat "$PPM_PATH" 2>/dev/null)
echo "$current_status"
echo "---------------------------------"
log "Current Status:\n$current_status"

# Define the policies and their desired status (1=enabled, 0=disabled)
declare -A policies
policies[0]=1  # PPM_POLICY_PTPOD: enabled
policies[1]=1  # PPM_POLICY_UT: enabled
policies[2]=1  # PPM_POLICY_FORCE_LIMIT: enabled
policies[3]=1  # PPM_POLICY_PWR_THRO: enabled
policies[4]=1  # PPM_POLICY_THERMAL: enabled
policies[5]=1  # PPM_POLICY_DLPT: enabled
policies[6]=1  # PPM_POLICY_HARD_USER_LIMIT: enabled (As requested)
policies[7]=1  # PPM_POLICY_USER_LIMIT: enabled
policies[8]=1  # PPM_POLICY_LCM_OFF: enabled
policies[9]=0  # PPM_POLICY_SYS_BOOST: enabled (As requested)

echo "Applying new PPM Policy settings..."
log "Applying new PPM Policy settings..."

# Loop through the policies and apply the status
for idx in "${!policies[@]}"; do
    status=${policies[$idx]}
    policy_setting="$idx $status"
    
    # Write the index and status (1 or 0) to the policy_status file
    echo "$policy_setting" > "$PPM_PATH" 2>/dev/null
    
    # Check if the operation was successful (policies may not exist on all kernels)
    if [ $? -eq 0 ]; then
        echo "Policy [$idx] set to $status."
        log "SUCCESS: Policy [$idx] set to $status. Wrote: '$policy_setting'"
    else
        echo "Warning: Could not set policy [$idx] to $status. Kernel may not support this policy."
        log_warn "FAILED: Could not set policy [$idx] to $status. Wrote: '$policy_setting'. Check kernel support."
    fi
done

echo "---------------------------------"
echo "--- New PPM Policy Status ---"
log "Reading new PPM policy status from $PPM_PATH"
new_status=$(cat "$PPM_PATH" 2>/dev/null)
echo "$new_status"
echo "---------------------------"
log "New Status:\n$new_status"

echo "Script execution complete. Check log file at $LOG_FILE"
log "--- Script Execution Complete ---"

# Function to restore writable nodes
restore_value() {
    if [[ -f $2 ]]; then
        chmod 644 $2
        echo $1 > $2
        chmod 444 $2
    fi
}

echo "[*] Restoring thermal, CPU, GPU, PPM, FPSGO…"

# Re-enable Oppo ELF services
pm enable com.coloros.oppoguardelf/com.coloros.powermanager.fuelgaue.GuardElfAIDLService
pm enable com.coloros.oppoguardelf/com.coloros.oppoguardelf.OppoGuardElfService

# Re-enable thermal zones
echo enabled > /sys/class/thermal/thermal_zone0/mode
echo enabled > /sys/class/thermal/thermal_zone1/mode

# Re-enable performance modules
echo 1 > /sys/devices/system/cpu/perf/enable
echo 1 > /sys/devices/system/cpu/perf/fuel_gauge_enable
echo 1 > /sys/devices/system/cpu/perf/gpu_pmu_enable

# Restore GED dvfs threshold (typical stock value)
echo 40 > /sys/module/ged/parameters/g_fb_dvfs_threshold

# Re-enable system limiter
echo 0 > /proc/perfmgr/syslimiter/syslimiter_force_disable

# Re-enable boost controls
echo 1 > /proc/perfmgr/boost_ctrl/cpu_ctrl/cfp_enable

# Restore EARA
echo 1 > /sys/kernel/eara_thermal/enable

# FPSGO restore
restore_value 1 /sys/kernel/fpsgo/common/fpsgo_enable
echo 1 > /sys/kernel/fpsgo/common/force_onoff
restore_value 1 /sys/kernel/fpsgo/fbt/limit_cfreq
restore_value 1 /sys/kernel/fpsgo/fbt/limit_rfreq

# Restore FBT CPU affinity boosts
echo 1 > /sys/module/fbt_cpu/parameters/boost_affinity
echo 1 > /sys/module/fbt_cpu/parameters/boost_affinity_90
echo 1 > /sys/module/fbt_cpu/parameters/boost_affinity_120

# Restore thermal throttle temperature logic
echo 85 > /sys/kernel/fpsgo/fbt/thrm_temp_th
echo 0 > /sys/kernel/fpsgo/fbt/thrm_limit_cpu
echo 0 > /sys/kernel/fpsgo/fbt/thrm_sub_cpu

# Restore scheduler features
echo 1 > /sys/devices/system/cpu/sched/hint_enable
echo 1 > /proc/sys/kernel/slide_boost_enabled
echo 1 > /proc/sys/kernel/launcher_boost_enabled

# Restore CPU frequency permissions
for i in 0 4 7; do
    chmod 644 /sys/devices/system/cpu/cpufreq/policy$i/scaling_min_freq
    chmod 644 /sys/devices/system/cpu/cpufreq/policy$i/scaling_max_freq
done

# Restore gpufreq default (remove user limits)
for i in 3 4 5 6; do
    echo $i -1 -1 > /proc/gpufreq/gpufreq_limit_table
done

# Restore PPM policies
for i in 'hard_userlimit_cpu_freq' 'hard_userlimit_freq_limit_by_others'; do
    echo 0 0 > /proc/ppm/policy/$i
    echo 1 0 > /proc/ppm/policy/$i
    echo 2 0 > /proc/ppm/policy/$i
    chmod 444 /proc/ppm/policy/$i
done

# Restore stune groups
set_stune background 1 1
set_stune foreground 1 1
set_stune nnapi-hal 1 1
set_stune io 1 1

# Restore cpu governors (remove ctl_off)
ctl_on cpu0
ctl_on cpu4
ctl_on cpu7

# Restore scheduler latency defaults
echo 24000000 > /proc/sys/kernel/sched_latency_ns
echo 6000000  > /proc/sys/kernel/sched_min_granularity_ns

# MediaTek Cooling Script with correct Mali GPU path

BACKUP="/data/local/tmp/cooler_backup"
CPU_ROOT="/sys/devices/system/cpu"
THERMAL="/sys/class/thermal"
MTK_BOOST_DIR="/proc/perfmgr"

backup() {
    [ -f "$1" ] || return
    local key=$(echo "$1" | sed 's|/|_|g')
    [ ! -f "$BACKUP/$key" ] && cat "$1" > "$BACKUP/$key"
}

restore() {
    for f in $BACKUP/*; do
        original=$(echo "$f" | sed 's|_|/|g')
        [ -f "$original" ] && cat "$f" > "$original"
    done
}

limit_cpu_mtk() {
    for policy in /sys/devices/system/cpu/cpufreq/policy*; do
        MAXF="$policy/scaling_max_freq"
        backup "$MAXF"
        echo "800000" > "$MAXF" 2>/dev/null
    done
}

limit_gpu_mali() {
    for mali in /sys/class/devfreq/*mali*; do
        [ -d "$mali" ] || continue

        MAX="$mali/max_freq"
        MIN="$mali/min_freq"

        if [ -f "$MAX" ]; then
            backup "$MAX"
            echo "200000000" > "$MAX"
        fi

        if [ -f "$MIN" ]; then
            backup "$MIN"
            echo "100000000" > "$MIN"
        fi
    done
}

disable_mtk_boosts() {
    for f in /proc/perfmgr/*/*boost*; do
        [ -f "$f" ] || continue
        backup "$f"
        echo 0 > "$f" 2>/dev/null
    done
}

relax_thermal() {
    for t in $THERMAL/thermal_zone*/trip_point_*_temp; do
        [ -f "$t" ] || continue
        backup "$t"
        cur=$(cat "$t")
        new=$((cur + 5000))
        echo "$new" > "$t" 2>/dev/null
    done
}

kill_load() {
    for app in $(cmd package list packages -3 | cut -f2 -d:); do
        am kill "$app" 2>/dev/null
    done
}

case "$1" in
    apply)
        limit_cpu_mtk
        limit_gpu_mali
        disable_mtk_boosts
        relax_thermal
        kill_load
        ;;
    restore)
        restore
        ;;
    *)
        echo "Usage: cooler.sh {apply|restore}"
        ;;
esac

echo "[*] Restore complete"
