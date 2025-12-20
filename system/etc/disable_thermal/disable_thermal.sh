#!/system/bin/sh
# --- Persistent Script to Set Background Process Limit ---
# This is designed to be run on boot via a tool like Magisk or an init.d manager.

SETTING_KEY="activity_manager_max_process_limit"
LIMIT_VALUE="0" # Value for "No background processes"

PROP_KEY="persist.sys.background_process_limit"
PROP_LIMIT_VALUE="0"

echo "Running persistent script to force Background Process Limit to 0..."

# 1. Force the Global Setting (most likely key)
/system/bin/settings put global $SETTING_KEY $LIMIT_VALUE

# 2. Force the System Property (your device's key)
/system/bin/setprop $PROP_KEY $PROP_LIMIT_VALUE

# 3. Wait a few seconds and force it again to beat the OEM service
/system/bin/settings put global $SETTING_KEY $LIMIT_VALUE
/system/bin/setprop $PROP_KEY $PROP_LIMIT_VALUE

echo "Background Process Limits should be set to 0. Check Developer Options."

# Ensure the script is executed with root privileges
if [[ $EUID -ne 0 ]]; then
   echo "This script requires root privileges. Please run with 'su -c ./set_ppm_policies.sh' or use 'su' before execution."
   exit 1
fi

# --- Configuration ---
LOG_FILE="/sdcard/MTK_AI_Engine.log"
PPM_PATH="/proc/ppm/policy_status"

# --- Logging Function ---
# Logs a timestamped message to the LOG_FILE
log_action() {
    local message="$1"
    # Get current timestamp
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[$timestamp] $message" >> "$LOG_FILE"
}

# --- Initialization and Root Check ---
# Log script start
log_action "=================================================="
log_action "Script execution started."

# Ensure the script is executed with root privileges
if [[ $EUID -ne 0 ]]; then
   local error_msg="This script requires root privileges. Please run with 'su -c ./set_ppm_policies.sh' or use 'su' before execution."
   echo "$error_msg"
   log_action "ERROR: $error_msg" # Log the error
   log_action "Script execution failed (Missing root)."
   exit 1
fi

log_action "Root privileges confirmed. Proceeding with PPM settings."


# --- Current Status Check ---
echo "--- Current PPM Policy Status ---"
# Check if PPM_PATH exists before trying to read it
if [ -f "$PPM_PATH" ]; then
    current_status=$(cat "$PPM_PATH")
    echo "$current_status"
    log_action "Current PPM Policy Status:\n$current_status"
else
    local warning_msg="WARNING: PPM_PATH ($PPM_PATH) not found."
    echo "$warning_msg"
    log_action "$warning_msg"
fi
echo "---------------------------------"


# --- Policy Definitions ---
# Define the policies and their desired status (1=enabled, 0=disabled)
declare -A policies
policies[0]=0  # PPM_POLICY_PTPOD
policies[1]=0  # PPM_POLICY_UT
policies[2]=0  # PPM_POLICY_FORCE_LIMIT
policies[3]=0  # PPM_POLICY_PWR_THRO
policies[4]=0  # PPM_POLICY_THERMAL
policies[5]=0  # PPM_POLICY_DLPT
policies[6]=0  # PPM_POLICY_HARD_USER_LIMIT: disabled (As requested)
policies[7]=0  # PPM_POLICY_USER_LIMIT
policies[8]=0  # PPM_POLICY_LCM_OFF
policies[9]=1  # PPM_POLICY_SYS_BOOST: enabled (As requested)

log_action "Defined target policies: ${!policies[@]} to ${policies[@]}"

echo "Applying new PPM Policy settings..."
log_action "Starting to apply policies."


# --- Policy Application Loop ---
# Loop through the policies and apply the status
for idx in "${!policies[@]}"; do
    status=${policies[$idx]}
    
    # Write the index and status (1 or 0) to the policy_status file
    echo "$idx $status" > "$PPM_PATH" 2>/dev/null
    
    # Check if the operation was successful (policies may not exist on all kernels)
    if [ $? -eq 0 ]; then
        local success_msg="Policy [$idx] set to $status."
        echo "$success_msg"
        log_action "$success_msg"
    else
        local warning_msg="Warning: Could not set policy [$idx] to $status (File write failed or policy unavailable)."
        echo "$warning_msg"
        log_action "$warning_msg"
    fi
done

echo "---------------------------------"


# --- New Status Check ---
echo "--- New PPM Policy Status ---"
if [ -f "$PPM_PATH" ]; then
    new_status=$(cat "$PPM_PATH")
    echo "$new_status"
    log_action "New PPM Policy Status after applying settings:\n$new_status"
else
    # The warning for path not found was logged earlier, just echo the message again.
    echo "WARNING: PPM_PATH ($PPM_PATH) not found. Cannot check new status."
fi
echo "---------------------------"

echo "Script execution complete. Check $LOG_FILE for details."
log_action "Script execution complete."
log_action "=================================================="
disable_oppo_elf() {
  pm disable com.coloros.oppoguardelf/com.coloros.powermanager.fuelgaue.GuardElfAIDLService
  pm disable com.coloros.oppoguardelf/com.coloros.oppoguardelf.OppoGuardElfService
}

# GPU
serialize_jobs none

# DRAM
dram_freq 0

lock_value 2 /sys/kernel/fpsgo/common/force_onoff
lock_value 0 /sys/kernel/fpsgo/fbt/switch_idleprefer


lock_value() {
  if [[ -f $2 ]];then
    chmod 644 $2
    echo $1 > $2
    chmod 444 $2
  fi
}

thermal_basic(){
echo 95 75 > /proc/driver/thermal/clatm_gpu_threshold
echo 3 117000 0 mtktscpu-sysrst 85000 0 cpu_adaptive_0 76000 0 cpu_adaptive_1 0 0 no-cooler 0 0 > /proc/driver/thermal/tzcpu
echo 4 120000 0 mtk-cl-kshutdown02 110000 0 no-cooler 100000 0 no-cooler 90000 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 1000 > /proc/driver/thermal/tzbtspa
echo 2 100000 90000 80000 85000 93000 85000 235000 2000 230000 2000 500 500 13500 > /proc/driver/thermal/clctm
echo 0 3 4 11 3 15 1 15 > /proc/driver/thermal/clatm_cpu_min_opp
echo 1 3 4 5 0 0 0 0 > /proc/driver/thermal/clatm_cpu_min_opp
}

# Disable thermal restrictions (path may vary)
echo 0 > /sys/class/thermal/thermal_zone0/mode
echo 0 > /sys/class/thermal/thermal_zone1/mode
echo 0 > /sys/devices/system/cpu/perf/enable
echo 0 > /sys/devices/system/cpu/perf/fuel_gauge_enable
echo 0 > /sys/devices/system/cpu/perf/gpu_pmu_enable
echo 120 > /sys/module/ged/parameters/g_fb_dvfs_threshold
echo 1 > /proc/perfmgr/syslimiter/syslimiter_force_disable
echo 0 > /proc/perfmgr/boost_ctrl/cpu_ctrl/cfp_enable
echo 0 > /sys/kernel/eara_thermal/enable
lock_value 0 /sys/kernel/fpsgo/common/fpsgo_enable
# 0: 0ff 1:on 2:free
echo 2 > /sys/kernel/fpsgo/common/force_onoff
echo 250 > /sys/kernel/fpsgo/fbt/thrm_activate_fps
lock_value 0 /sys/kernel/fpsgo/fbt/limit_cfreq
lock_value 0 /sys/kernel/fpsgo/fbt/limit_rfreq
lock_value 0 /sys/kernel/fpsgo/fbt/limit_cfreq_m
lock_value 0 /sys/kernel/fpsgo/fbt/limit_rfreq_m

echo 0 > /sys/module/fbt_cpu/parameters/boost_affinity
echo 0 > /sys/module/fbt_cpu/parameters/boost_affinity_90
echo 0 > /sys/module/fbt_cpu/parameters/boost_affinity_120

lock_value 120 /sys/kernel/fpsgo/fbt/thrm_temp_th
echo -1 > /sys/kernel/fpsgo/fbt/thrm_limit_cpu
echo -1 > /sys/kernel/fpsgo/fbt/thrm_sub_cpu

echo 0 > /sys/devices/system/cpu/sched/hint_enable

echo 0 > /proc/sys/kernel/slide_boost_enabled
echo 0 > /proc/sys/kernel/launcher_boost_enabled

# thermal_basic

serialize_jobs none

for i in 0 4 7; do
  chmod 444 /sys/devices/system/cpu/cpufreq/policy$i/scaling_min_freq
  chmod 444 /sys/devices/system/cpu/cpufreq/policy$i/scaling_max_freq
done

for i in 3 4 5 6; do
  echo $i 0 0 > /proc/gpufreq/gpufreq_limit_table
done

for i in 3 4 5 6; do
  echo $i 0 0 > /proc/gpufreq/gpufreq_limit_table
done
set_stune background 0 0
set_stune foreground 0 0
set_stune nnapi-hal 0 0
set_stune io 0 0
sched_isolation_disable

echo enable 0 > /proc/perfmgr/tchbst/user/usrtch
hide_value /proc/perfmgr/boost_ctrl/cpu_ctrl/perfserv_iso_cpu 0
hide_value /proc/perfmgr/boost_ctrl/cpu_ctrl/perfserv_freq
hide_value /proc/perfmgr/boost_ctrl/cpu_ctrl/current_freq

process_opt() {
  change_task_cpuset system_server top-app
  change_task_cpuset kswapd0 foreground
  change_task_cpuset surfaceflinger foreground
}

echo 8000000 > /proc/sys/kernel/sched_latency_ns
echo 2000000 > /proc/sys/kernel/sched_min_granularity_ns

ctl_off cpu0
ctl_off cpu4
ctl_off cpu7
process_opt &
