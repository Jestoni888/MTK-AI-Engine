#!/system/bin/sh
# --- MTK DYNAMIC THERMAL & VOLTAGE GUARDIAN ---

# 1. PATH CONFIGURATION
TARGET_TEMP_FILE="/sys/class/power_supply/battery/temp"
LOG_FILE="/sdcard/MTK_AI_Engine.log"
CPU_SYS="/sys/devices/system/cpu"

# MediaTek specific voltage nodes
EEM_PATHS="
/proc/eem/EEM_DET_B/eem_offset
/proc/eem/EEM_DET_BL/eem_offset
/proc/eem/EEM_DET_L/eem_offset
/proc/eem/EEM_DET_CCI/eem_offset
/proc/eemg/EEMG_DET_GPU/eemg_offset
/proc/eemg/EEMG_DET_GPU_HI/eemg_offset
"

# 2. LOGIC FUNCTIONS
get_batt_temp() {
    [ -f "$TARGET_TEMP_FILE" ] && echo $(( $(cat $TARGET_TEMP_FILE) / 10 )) || echo 0
}

# Accurate Mapping based on your specific profile
get_config() {
    temp=$1
    case $temp in
        31) echo "95 0"   ;;
        32) echo "90 0"   ;;
        33) echo "85 0"   ;;
        34) echo "80 -1"  ;;
        35) echo "75 -2"  ;;
        36) echo "70 -3"  ;;
        37) echo "65 -4"  ;;
        38) echo "60 -5"  ;;
        39) echo "55 -6"  ;;
        40) echo "50 -7"  ;;
        41) echo "45 -8"  ;;
        42) echo "40 -9"  ;;
        43) echo "35 -10" ;;
        44) echo "30 -11" ;;
        45) echo "25 -12" ;;
        *) 
            if [ "$temp" -le 30 ]; then echo "100 0"; 
            else echo "25 -12"; fi 
            ;;
    esac
}

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 3. MAIN EXECUTION
T=$(get_batt_temp)
CONFIG=$(get_config "$T")
PERC=$(echo $CONFIG | cut -d' ' -f1)
VOLT=$(echo $CONFIG | cut -d' ' -f2)

log_msg "🌡️ Temp: ${T}°C | ⚙️ Freq Limit: ${PERC}% | ⚡ Voltage Offset: ${VOLT}"

# --- Apply Voltage Offsets ---
for node in $EEM_PATHS; do
    if [ -f "$node" ]; then
        chmod 644 "$node" 2>/dev/null
        echo "$VOLT" > "$node"
    fi
done

# --- Apply CPU Frequency Limits ---
for policy in $CPU_SYS/cpufreq/policy*; do
    [ -d "$policy" ] || continue
    
    # 1. Ensure Min Frequency is allowed to drop to floor (0 allows deep sleep/cool down)
    [ -w "$policy/scaling_min_freq" ] && echo 0 > "$policy/scaling_min_freq"

    # 2. Set Scaling Max based on percentage
    if [ -f "$policy/cpuinfo_max_freq" ]; then
        max_val=$(cat "$policy/cpuinfo_max_freq")
        target_val=$(( max_val * PERC / 100 ))
        
        # Unlock and Apply
        chmod 644 "$policy/scaling_max_freq" 2>/dev/null
        echo "$target_val" > "$policy/scaling_max_freq"
    fi
done

sync
