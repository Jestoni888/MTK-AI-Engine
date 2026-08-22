#!/system/bin/sh
CPU_SYS="/sys/devices/system/cpu"
TARGET_TEMP_FILE="/sys/class/power_supply/battery/temp"
EXTERNAL_CFG="/sdcard/MTK_AI_Engine"
LOG_FILE="$EXTERNAL_CFG/MTK_AI_Engine.log"
NOTIFY_ENABLED_FILE="$EXTERNAL_CFG/enable_notifications"
GPU_LOCK_FILE="$EXTERNAL_CFG/gpu_freq_locked.txt"
GPU_AUTO_DISABLE_FILE="$EXTERNAL_CFG/disable_gpu_auto"
GAMING=

# ============================================================
# GPU Variables
# ============================================================
GPU_BASE=""
GPU_MIN_FREQ_PATH=""
GPU_MAX_FREQ_PATH=""
GPU_OPP_TABLE=""
GPU_DRIVER=""
GPU_OPP_COUNT=0
GPU_MIN_FREQ_MHZ=0
GPU_MAX_FREQ_MHZ=0

# ============================================================
# GPU Detection with detailed logging
# ============================================================
detect_gpu() {
    log "=== GPU Detection Started ==="
    
    # Try each candidate path
    local paths="/sys/devices/platform/13000000.mali/devfreq/13000000.mali \
/sys/devices/platform/soc/13000000.mali/devfreq/13000000.mali \
/sys/class/devfreq/13000000.mali \
/sys/devices/platform/26000000.mali/devfreq/26000000.mali \
/sys/devices/platform/gpu/devfreq/gpu"

    for base in $paths; do
        if [ -d "$base" ]; then
            GPU_BASE="$base"
            GPU_MIN_FREQ_PATH="$base/min_freq"
            GPU_MAX_FREQ_PATH="$base/max_freq"
            log "✅ GPU base found: $base"
            log "   min_freq path: $GPU_MIN_FREQ_PATH"
            log "   max_freq path: $GPU_MAX_FREQ_PATH"
            
            # Check permissions
            if [ -w "$GPU_MIN_FREQ_PATH" ]; then
                log "   ✅ min_freq is writable"
            else
                log "   ❌ min_freq NOT writable"
            fi
            if [ -w "$GPU_MAX_FREQ_PATH" ]; then
                log "   ✅ max_freq is writable"
            else
                log "   ❌ max_freq NOT writable"
            fi
            return 0
        else
            log "   ❌ Not found: $base"
        fi
    done
    
    log "❌ No GPU base path found"
    return 1
}

# ============================================================
# Detect GPU driver and OPP table
# ============================================================
detect_gpu_driver() {
    log "=== GPU Driver Detection ==="
    
    # Check gpufreqv2
    if [ -f "/proc/gpufreqv2/gpu_working_opp_table" ]; then
        GPU_DRIVER="gpufreqv2"
        GPU_OPP_TABLE="/proc/gpufreqv2/gpu_working_opp_table"
        log "✅ Driver: gpufreqv2"
        log "   OPP table: $GPU_OPP_TABLE"
        
        # Show first few lines for debugging
        log "   OPP table content (first 3 lines):"
        head -3 "$GPU_OPP_TABLE" 2>/dev/null | while read line; do
            log "     $line"
        done
        
        # Check if fix_target_opp_index exists
        if [ -f "/proc/gpufreqv2/fix_target_opp_index" ]; then
            log "   ✅ fix_target_opp_index exists"
            log "   Current value: $(cat /proc/gpufreqv2/fix_target_opp_index 2>/dev/null)"
        else
            log "   ❌ fix_target_opp_index NOT found"
        fi
        return 0
    fi
    
    # Check legacy gpufreq
    if [ -f "/proc/gpufreq/gpufreq_opp_dump" ]; then
        GPU_DRIVER="gpufreq"
        GPU_OPP_TABLE="/proc/gpufreq/gpufreq_opp_dump"
        log "✅ Driver: gpufreq (legacy)"
        log "   OPP table: $GPU_OPP_TABLE"
        
        log "   OPP table content (first 3 lines):"
        head -3 "$GPU_OPP_TABLE" 2>/dev/null | while read line; do
            log "     $line"
        done
        return 0
    fi
    
    log "❌ No GPU driver detected"
    return 1
}

# ============================================================
# Parse OPP table
# ============================================================
count_gpu_opps() {
    log "=== Parsing OPP Table ==="
    
    if [ -z "$GPU_OPP_TABLE" ] || [ ! -f "$GPU_OPP_TABLE" ]; then
        GPU_OPP_COUNT=0
        log "❌ No OPP table file"
        return
    fi

    # Count OPP entries
    GPU_OPP_COUNT=$(grep -cE '^\[[0-9]+\].*freq' "$GPU_OPP_TABLE" 2>/dev/null)
    [ -z "$GPU_OPP_COUNT" ] && GPU_OPP_COUNT=0
    
    log "✅ Found $GPU_OPP_COUNT OPP entries"

    # Extract frequencies
    local freqs
    freqs=$(grep -oE 'freq[[:space:]]*[=:][[:space:]]*[0-9]+' "$GPU_OPP_TABLE" \
            | grep -oE '[0-9]+$' | sort -n)

    if [ -n "$freqs" ]; then
        local min_khz max_khz
        min_khz=$(echo "$freqs" | head -1)
        max_khz=$(echo "$freqs" | tail -1)
        GPU_MIN_FREQ_MHZ=$((min_khz / 1000))
        GPU_MAX_FREQ_MHZ=$((max_khz / 1000))
        
        log "✅ Frequency range: ${GPU_MIN_FREQ_MHZ}MHz - ${GPU_MAX_FREQ_MHZ}MHz"
        log "   Min: ${min_khz} KHz"
        log "   Max: ${max_khz} KHz"
        
        # Show first and last OPP
        log "   OPP[0]: $(echo "$freqs" | head -1) KHz"
        log "   OPP[$((GPU_OPP_COUNT-1))]: $(echo "$freqs" | tail -1) KHz"
    else
        log "❌ Could not extract frequencies"
    fi
}

# ============================================================
# Map battery temperature → GPU OPP index
# Lowest temp (34°C) → OPP 0 (max freq)
# Each +1°C → OPP +2
# Highest temp → capped at max OPP index
# ============================================================
get_gpu_opp_index() {
    local temp=$1
    case "$temp" in
        ''|*[!0-9]*) temp=35 ;;
    esac

    if [ "$GPU_OPP_COUNT" -le 0 ]; then
        echo 0
        return
    fi

    local max_idx=$((GPU_OPP_COUNT - 1))
    local opp_idx

    if [ "$temp" -le 34 ]; then
        opp_idx=0                       # coolest → max perf
    else
        # Step of 2 OPPs per degree above 34°C
        opp_idx=$(( (temp - 34) * 2 ))
    fi

    # Clamp to valid range
    [ "$opp_idx" -lt 0 ] && opp_idx=0
    [ "$opp_idx" -gt "$max_idx" ] && opp_idx=$max_idx

    echo "$opp_idx"
}

# ============================================================
# Apply GPU frequency - tries multiple methods
# ============================================================
apply_gpu_freq() {
    local target_opp=$1
    local applied=0
    
    log "=== Applying GPU OPP Index: $target_opp ==="
    
    # Get target frequency in KHz
    local target_freq_khz
    target_freq_khz=$(grep -E "^\[$target_opp\]" "$GPU_OPP_TABLE" \
                      | grep -oE 'freq[[:space:]]*[=:][[:space:]]*[0-9]+' \
                      | grep -oE '[0-9]+$' | head -1)
    
    if [ -z "$target_freq_khz" ]; then
        log "❌ Could not find frequency for OPP $target_opp"
        return 1
    fi
    
    local target_freq_mhz=$((target_freq_khz / 1000))
    log "Target: OPP $target_opp → ${target_freq_mhz}MHz (${target_freq_khz} KHz)"
    
    # Method 1: gpufreqv2 OPP index
    if [ "$GPU_DRIVER" = "gpufreqv2" ] && [ -f "/proc/gpufreqv2/fix_target_opp_index" ]; then
        log "Trying Method 1: gpufreqv2 fix_target_opp_index"
        
        # Try direct write first
        echo "$target_opp" > /proc/gpufreqv2/fix_target_opp_index 2>/dev/null
        local result=$?
        
        if [ $result -eq 0 ]; then
            local current
            current=$(cat /proc/gpufreqv2/fix_target_opp_index 2>/dev/null | tr -d '[:space:]')
            log "   Write result: $result, Current value: $current"
            
            if [ "$current" = "$target_opp" ]; then
                log "✅ Method 1 SUCCESS"
                applied=1
            else
                log "❌ Method 1 FAILED (value didn't stick)"
            fi
        else
            log "❌ Method 1 FAILED (write error: $result)"
        fi
        
        # Try with su if direct failed
        if [ $applied -eq 0 ]; then
            log "   Retrying with su..."
            su -c "echo $target_opp > /proc/gpufreqv2/fix_target_opp_index" 2>/dev/null
            local current
            current=$(cat /proc/gpufreqv2/fix_target_opp_index 2>/dev/null | tr -d '[:space:]')
            if [ "$current" = "$target_opp" ]; then
                log "✅ Method 1 (with su) SUCCESS"
                applied=1
            else
                log "❌ Method 1 (with su) FAILED"
            fi
        fi
    fi
    
    # Method 2: devfreq min/max freq (most reliable)
    if [ $applied -eq 0 ] && [ -n "$GPU_MIN_FREQ_PATH" ] && [ -n "$GPU_MAX_FREQ_PATH" ]; then
        log "Trying Method 2: devfreq min_freq/max_freq"
        
        # Make writable
        chmod 644 "$GPU_MIN_FREQ_PATH" 2>/dev/null
        chmod 644 "$GPU_MAX_FREQ_PATH" 2>/dev/null
        
        # Write frequency
        echo "$target_freq_khz" > "$GPU_MIN_FREQ_PATH" 2>/dev/null
        local min_result=$?
        echo "$target_freq_khz" > "$GPU_MAX_FREQ_PATH" 2>/dev/null
        local max_result=$?
        
        log "   Write results: min=$min_result, max=$max_result"
        
        # Verify
        local current_min current_max
        current_min=$(cat "$GPU_MIN_FREQ_PATH" 2>/dev/null | tr -d '[:space:]')
        current_max=$(cat "$GPU_MAX_FREQ_PATH" 2>/dev/null | tr -d '[:space:]')
        
        log "   Current values: min=$current_min, max=$current_max"
        
        if [ "$current_min" = "$target_freq_khz" ] && [ "$current_max" = "$target_freq_khz" ]; then
            log "✅ Method 2 SUCCESS"
            applied=1
        else
            log "❌ Method 2 FAILED (values didn't stick)"
            
            # Try with su
            log "   Retrying with su..."
            su -c "echo $target_freq_khz > $GPU_MIN_FREQ_PATH" 2>/dev/null
            su -c "echo $target_freq_khz > $GPU_MAX_FREQ_PATH" 2>/dev/null
            
            current_min=$(cat "$GPU_MIN_FREQ_PATH" 2>/dev/null | tr -d '[:space:]')
            current_max=$(cat "$GPU_MAX_FREQ_PATH" 2>/dev/null | tr -d '[:space:]')
            
            if [ "$current_min" = "$target_freq_khz" ] && [ "$current_max" = "$target_freq_khz" ]; then
                log "✅ Method 2 (with su) SUCCESS"
                applied=1
            else
                log "❌ Method 2 (with su) FAILED"
            fi
        fi
        
        # Lock permissions
        chmod 000 "$GPU_MIN_FREQ_PATH" 2>/dev/null
        chmod 000 "$GPU_MAX_FREQ_PATH" 2>/dev/null
    fi
    
    # Method 3: legacy gpufreq
    if [ $applied -eq 0 ] && [ "$GPU_DRIVER" = "gpufreq" ]; then
        log "Trying Method 3: legacy gpufreq_opp_freq"
        
        echo "$target_freq_khz" > /proc/gpufreq/gpufreq_opp_freq 2>/dev/null
        local result=$?
        
        if [ $result -eq 0 ]; then
            log "✅ Method 3 SUCCESS"
            applied=1
        else
            log "❌ Method 3 FAILED"
        fi
    fi
    
    if [ $applied -eq 0 ]; then
        log "❌ ALL METHODS FAILED"
        return 1
    fi
    
    return 0
}

# ============================================================
# Existing functions (unchanged)
# ============================================================
notify_status() {
    if [ -f /dev/.mtk_ai_active_game ]; then
        local cpu_limit_pct="$1"
        [ ! -f "$NOTIFY_ENABLED_FILE" ] && return 0
        RAW_TEMP=$(cat "$TARGET_TEMP_FILE" 2>/dev/null | tr -d '[:space:]')
        [ -z "$RAW_TEMP" ] && RAW_TEMP=0
        case "$RAW_TEMP" in ''|*[!0-9]*) RAW_TEMP=0 ;; esac
        B_TEMP="$((RAW_TEMP / 10)).$((RAW_TEMP % 10))°C"
        su -lp 2000 -c "cmd notification post -I /data/adb/modules/MTK_AI/icon.png -S bigtext -t 'lite gaming' tag 'Temp: $B_TEMP | CPU: ${cpu_limit_pct}%'" >/dev/null 2>&1
    fi
}

[ -f "$LOG_FILE" ] || touch "$LOG_FILE"

get_max_perc() {
    temp=$1
    case "$temp" in ''|*[!0-9]*) temp=0 ;; esac
    case $temp in
        34) echo 100 ;; 35) echo 95 ;; 36) echo 90 ;; 37) echo 85 ;;
        38) echo 80 ;; 39) echo 75 ;; 40) echo 70 ;; 41) echo 65 ;;
        42) echo 60 ;; 43) echo 55 ;; 44) echo 50 ;; 45) echo 45 ;;
        46) echo 40 ;; 47) echo 35 ;; 48) echo 30 ;;
        *)
            if [ "$temp" -lt 33 ]; then echo 100; else echo 25; fi
            ;;
    esac
}

get_batt_temp() {
    if [ -f "$TARGET_TEMP_FILE" ]; then
        temp=$(cat "$TARGET_TEMP_FILE" 2>/dev/null | tr -d '[:space:]')
        [ -z "$temp" ] && temp=0
        case "$temp" in ''|*[!0-9]*) temp=0 ;; esac
        echo $((temp / 10))
    else
        echo 0
    fi
}

log() {
    if [ -f "/sdcard/MTK_AI_Engine/disabl" ]; then
        echo "log disabled"
    else
        timestamp=$(date "+%Y-%m-%d %H:%M")
        echo "[$timestamp] $1" | tee -a "$LOG_FILE"
    fi
}

# ============================================================
# Main execution
# ============================================================
log "=========================================="
log "Script execution started"
log "=========================================="

current_temp=$(get_batt_temp)
max_perc=$(get_max_perc "$current_temp")
log "Battery Temp: ${current_temp}°C → Max CPU Freq: ${max_perc}%"

# CPU throttling
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

# GPU auto-frequency
if [ ! -f "$GPU_AUTO_DISABLE_FILE" ] && [ ! -f "$GPU_LOCK_FILE" ]; then
    log "=== GPU Auto-Frequency Enabled ==="
    
    detect_gpu
    detect_gpu_driver
    count_gpu_opps

    if [ "$GPU_OPP_COUNT" -gt 0 ]; then
        gpu_opp=$(get_gpu_opp_index "$current_temp")
        apply_gpu_freq "$gpu_opp"
        
        log "GPU: OPP $gpu_opp applied (Temp: ${current_temp}°C)"
    else
        log "❌ GPU: No OPPs detected - cannot apply"
    fi
else
    [ -f "$GPU_LOCK_FILE" ] && log "GPU: Manual lock active - skipping auto"
    [ -f "$GPU_AUTO_DISABLE_FILE" ] && log "GPU: Auto-frequency disabled"
fi

notify_status "$max_perc"
log "Script execution completed"
log "=========================================="