#!/system/bin/sh
# Delay to allow SystemUI + display HAL to initialize
sleep 60

# --- CONFIGURATION ---
GAME_LIST_FILE="/sdcard/game_list.txt"
LOG_FILE="/sdcard/MTK_AI_Engine.log"
CURRENT_MODE="NONE"

# External Script Paths
COOLER_PATH="/data/adb/modules/MTK_AI/system/etc/cooler/cooler.sh"
DISABLE_THERMAL_PATH="/data/adb/modules/MTK_AI/system/etc/disable_thermal/disable_thermal.sh"
MAINTENANCE_PATH="/data/adb/modules/MTK_AI/system/etc/auto_frequency/auto_frequency.sh"
SCREEN_OFF_PATH="/data/adb/modules/MTK_AI/system/etc/cooler/powersave.sh"
SCREEN_ON_PATH="/data/adb/modules/MTK_AI/system/etc/cooler/schedutil.sh"
CPUSET_GAMING_PATH="/data/adb/modules/MTK_AI/system/etc/disable_thermal/gaming_cpuset.sh"
CPUSET_NORMAL_PATH="/data/adb/modules/MTK_AI/system/etc/cooler/normal_cpuset.sh"

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
    [ "$(wc -l < $LOG_FILE)" -gt 200 ] &&
        tail -n 200 "$LOG_FILE" > "$LOG_FILE.tmp" &&
        mv "$LOG_FILE.tmp" "$LOG_FILE"
}

# --- THE UNIVERSAL EXECUTION WRAPPER ---
# This function fixes the "Path Not Working" issue
run_external() {
    local TARGET="$1"
    local ARGS="$2"

    if [ -f "$TARGET" ]; then
        log_msg "⚙️ FOUND: $(basename "$TARGET")"
        # 1. Force permissions
        chmod 755 "$TARGET"
        # 2. Execute using Sourcing (.) + Full Path + Root Context
        # This is the most powerful way to run a script in Android
        su -c ". $TARGET $ARGS" >/dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            log_msg "✅ SUCCESS: $(basename "$TARGET") executed."
        else
            log_msg "⚠️ FAILED: $(basename "$TARGET") returned an error."
        fi
    else
        log_msg "❌ MISSING: $TARGET (Path is wrong or file deleted)"
    fi
}

# --- PERFORMANCE MODES ---

apply_gaming_logic() {
    [ "$CURRENT_MODE" = "GAMING" ] && return 
    log_msg "⚡ [MODE] GAMING: Applying 100% Lock (Freq -> Governor)..."
    
    run_external "$CPUSET_GAMING_PATH"
    
    # 1. PRE-LOCK CPU FREQUENCIES
    for policy in /sys/devices/system/cpu/cpufreq/policy*; do
        # Temporarily switch to a neutral governor to unlock frequency writes
        echo "userspace" > "$policy/scaling_governor" 2>/dev/null
        
        # Read absolute hardware max
        MAX_VAL=$(cat "$policy/cpuinfo_max_freq")
        
        # Write values while governor is NOT performance
        echo "$MAX_VAL" > "$policy/scaling_min_freq"
        echo "$MAX_VAL" > "$policy/scaling_max_freq"
        echo "$MAX_VAL" > "$policy/scaling_setspeed" 2>/dev/null
        
        # NOW apply performance to lock it in
        echo "performance" > "$policy/scaling_governor"
    done

    # 2. LOCK GPU FREQUENCY
    GPU_PATH=$(ls -d /sys/class/devfreq/*mali* 2>/dev/null | head -n 1)
    [ -z "$GPU_PATH" ] && GPU_PATH=$(ls -d /sys/class/devfreq/*kgsl* 2>/dev/null | head -n 1)
    
    if [ -n "$GPU_PATH" ]; then
        MAX_GPU=$(tr ' ' '\n' < "$GPU_PATH/available_frequencies" | sort -n | tail -n1)
        # Set values first
        echo "$MAX_GPU" > "$GPU_PATH/min_freq"
        echo "$MAX_GPU" > "$GPU_PATH/max_freq"
        # Set governor last
        echo "performance" > "$GPU_PATH/governor"
    fi

    # 3. Trigger Thermal Script (Crucial when 100% locked)
    run_external "$DISABLE_THERMAL_PATH"
    
    # 4. CPU Core Retention
    for c in /sys/devices/system/cpu/cpu*/core_ctl; do echo 0 > "$c/enable"; done
    
    CURRENT_MODE="GAMING"
    log_msg "✅ All cores locked at 100%."
}

apply_non_gaming_logic() {
    [ "$CURRENT_MODE" = "NORMAL" ] && return
    log_msg "🔋 [MODE] NORMAL: Releasing frequency locks..."

    # Reset CPU to balanced state
    for policy in /sys/devices/system/cpu/cpufreq/policy*; do
        MIN_VAL=$(cat "$policy/cpuinfo_min_freq")
        MAX_VAL=$(cat "$policy/cpuinfo_max_freq")
        
        echo "schedutil" > "$policy/scaling_governor"
        echo "$MIN_VAL" > "$policy/scaling_min_freq"
        echo "$MAX_VAL" > "$policy/scaling_max_freq"
    done

    # Reset GPU
    GPU_PATH=$(ls -d /sys/class/devfreq/*mali* 2>/dev/null | head -n 1)
    [ -n "$GPU_PATH" ] && echo "powersave" > "$GPU_PATH/governor"

    # Maintenance Logic
    run_external "$COOLER_PATH"
    run_external "$MAINTENANCE_PATH"
    run_external "$CPUSET_NORMAL_PATH"
        
    sync; am trim-memory all 2>/dev/null
    CURRENT_MODE="NORMAL"
}

# --- DETECTION ENGINE ---

log_msg "🚀 Universal Engine: MediaTek | XOS | HiOS | ColorOS | MIUI"

# Set a high priority for this shell process to prevent Infinix/Tecno from killing it
renice -n -20 -p $$

su -c "logcat -b events -v threadtime" | while read -r line; do
    
    # TRIGGER 1: Screen Off (Universal)
    # Adds support for Transsion 'lcd_power' and 'screen_state' variants
    if echo "$line" | grep -qE "power_screen_state: \[0,|screen_toggled=0|lcd_power: 0|sys_screen_off"; then
        log_msg "🌙 POWERSAVER MODE 🔋 [EVENT] Screen Off Detected."        
        apply_non_gaming_logic
        run_external "$SCREEN_OFF_PATH"
        continue
    fi
    
    # TRIGGER 2: Screen On
    if echo "$line" | grep -qE "power_screen_state: \[1,|screen_toggled=1|lcd_power: 1|sys_screen_on"; then
        log_msg "☀️ NORMAL MODE [EVENT] Screen On Detected."        
        run_external "$SCREEN_ON_PATH"
        continue
    fi
    
    # TRIGGER 3: Thermal (Battery & System)
    # Infinix/Tecno often use 'thermal_threshold_status' or 'mtk_thermal'
    if echo "$line" | grep -qE "thermal_changed|thermal_status_changed|thermal_threshold_status|mtk_thermal_temp"; then
        # Universal extraction: look for any number after a sensor name or bracket
        TEMP_RAW=$(echo "$line" | grep -oE '[0-9]{2}\.[0-9]+' | head -n 1)
        LEVEL=$(echo "$line" | grep -oE '\[[0-9],' | tr -d ' [,' | head -n 1)
        
        log_msg "🌡️ [THERMAL] Level: ${LEVEL:-N/A} | Temp: ${TEMP_RAW:-N/A}°C"
        run_external "$MAINTENANCE_PATH" "$TEMP_RAW"
        continue
    fi

    # TRIGGER 4: App Focus (Gaming Logic)
    # Infinix/Tecno: monitor_focus_event or am_resume_activity
    # Xiaomi/Oplus: wm_on_resume_called / am_on_resume_called
    if echo "$line" | grep -qE "input_focus|wm_on_resume_called|top_resumed_app_focus|am_on_resume_called|monitor_focus_event|am_resume_activity"; then
        
        # Multi-ROM Package Extraction
        # This handles the slightly different spacing found in XOS/HiOS logcats
        DETECTED_PKG=$(echo "$line" | grep -oE '[a-zA-Z0-9._]+\/[a-zA-Z0-9._]+' | cut -d'/' -f1 | tail -n 1)
        
        # Fallback for standard AOSP/Oplus style
        if [ -z "$DETECTED_PKG" ]; then
            DETECTED_PKG=$(echo "$line" | sed -n 's/.* \([^/ ]*\)\/[^/ ]*.*/\1/p' | grep -oE '[a-zA-Z0-9._]+' | head -n 1)
        fi

        # Filter and Mode Switch
        [ -z "$DETECTED_PKG" ] || ! echo "$DETECTED_PKG" | grep -q "\." && continue
        case "$DETECTED_PKG" in *launcher*|*systemui*|*settings*|*google*|*transsion*) apply_non_gaming_logic; continue ;; esac

        IS_GAME=false
        [ -f "$GAME_LIST_FILE" ] && grep -q "^$DETECTED_PKG$" "$GAME_LIST_FILE" && IS_GAME=true

        if [ "$IS_GAME" = true ]; then
            apply_gaming_logic
        else
            apply_non_gaming_logic
        fi
    fi
done
