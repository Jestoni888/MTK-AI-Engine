#!/system/bin/sh

CPU_SYS="/sys/devices/system/cpu"
TARGET_TEMP_FILE="/sys/class/power_supply/battery/temp"
LOG_FILE="/sdcard/MTK_AI_Engine/MTK_AI_Engine.log"

# Create log file if it doesn't exist
[ -f "$LOG_FILE" ] || touch "$LOG_FILE"

# Temperature to Max Frequency (%) mapping
get_max_perc() {
    temp=$1
    case $temp in
        25) echo 100 ;;
        26) echo 98 ;;
        27) echo 96 ;;
        28) echo 94 ;;
        29) echo 92 ;;
        30) echo 90 ;;
        31) echo 88 ;;
        32) echo 86 ;;
        33) echo 84 ;;
        34) echo 82 ;;
        35) echo 80 ;;
        36) echo 78 ;;
        37) echo 76 ;;
        38) echo 74 ;;
        39) echo 72 ;;
        40) echo 70 ;;
        41) echo 68 ;;
        42) echo 66 ;;
        43) echo 64 ;;
        44) echo 62 ;;
        45) echo 60 ;;
        46) echo 58 ;;
        47) echo 56 ;;
        48) echo 54 ;;
        49) echo 52 ;;
        50) echo 50 ;;
        *)  
            if [ "$temp" -lt 35 ]; then
                echo 100
            else
                echo 25
            fi
            ;;
    esac
}

# Read battery temperature in °C
get_batt_temp() {
    if [ -f "$TARGET_TEMP_FILE" ]; then
        temp=$(cat "$TARGET_TEMP_FILE")
        echo $((temp / 10))  # Convert from tenths of °C
    else
        echo 0
    fi
}

# Function to log messages with timestamp (without seconds)
log() {
    timestamp=$(date "+%Y-%m-%d %H:%M")
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

# --- One-shot execution ---
current_temp=$(get_batt_temp)
max_perc=$(get_max_perc "$current_temp")
log "Battery Temp: ${current_temp}°C → Max CPU Freq: ${max_perc}%"

for policy in $CPU_SYS/cpufreq/policy*; do
    [ -d "$policy" ] || continue

    if [ -f "$policy/cpuinfo_max_freq" ] && [ -w "$policy/scaling_max_freq" ]; then
        max_freq=$(cat "$policy/cpuinfo_max_freq")
        target_max=$(( max_freq * max_perc / 100 ))
        chmod 644 "$policy/scaling_max_freq"
        echo "$target_max" > "$policy/scaling_max_freq"
        chmod 000 "$policy/scaling_max_freq"
        log "Policy $(basename $policy): Max set to $target_max Hz"
    fi
done
