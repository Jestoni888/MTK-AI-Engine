#!/system/bin/sh

CPU_SYS="/sys/devices/system/cpu"
TARGET_TEMP_FILE="/sys/class/power_supply/battery/temp"
EXTERNAL_CFG="/sdcard/MTK_AI_Engine"
LOG_FILE="$EXTERNAL_CFG/MTK_AI_Engine.log"
NOTIFY_ENABLED_FILE="$EXTERNAL_CFG/enable_notifications"
GAMING=

notify_status() {
if [ -f /dev/.mtk_ai_active_game ]; then
    local cpu_limit_pct="$1"

    # Skip if notification toggle is OFF
    [ ! -f "$NOTIFY_ENABLED_FILE" ] && return 0

    # Battery temperature
    RAW_TEMP=$(cat "$TARGET_TEMP_FILE" 2>/dev/null | tr -d '[:space:]')
    [ -z "$RAW_TEMP" ] && RAW_TEMP=0

    case "$RAW_TEMP" in
        ''|*[!0-9]*) RAW_TEMP=0 ;;
    esac

    B_TEMP="$((RAW_TEMP / 10)).$((RAW_TEMP % 10))°C"

    su -lp 2000 -c "cmd notification post -I /data/adb/modules/MTK_AI/icon.png -S bigtext -t 'lite gaming' tag 'Temp: $B_TEMP | CPU: ${cpu_limit_pct}%'" >/dev/null 2>&1
fi
}

# Create log file if it doesn't exist
[ -f "$LOG_FILE" ] || touch "$LOG_FILE"

# Temperature to Max Frequency (%) mapping
get_max_perc() {
    temp=$1

    case "$temp" in
        ''|*[!0-9]*) temp=0 ;;
    esac

    case $temp in
        34) echo 100 ;;
        35) echo 95 ;;
        36) echo 90 ;;
        37) echo 85 ;;
        38) echo 80 ;;
        39) echo 75 ;;
        40) echo 70 ;;
        41) echo 65 ;;
        42) echo 60 ;;
        43) echo 55 ;;
        44) echo 50 ;;
        45) echo 45 ;;
        46) echo 40 ;;
        47) echo 35 ;;
        48) echo 30 ;;
        *)
            if [ "$temp" -lt 33 ]; then
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
        temp=$(cat "$TARGET_TEMP_FILE" 2>/dev/null | tr -d '[:space:]')
        [ -z "$temp" ] && temp=0

        case "$temp" in
            ''|*[!0-9]*) temp=0 ;;
        esac

        echo $((temp / 10))
    else
        echo 0
    fi
}

# Function to log messages with timestamp
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

        log "Policy $(basename "$policy"): Max set to $target_max Hz"
    fi
done

# Show notification once after applying CPU limits
notify_status "$max_perc"
