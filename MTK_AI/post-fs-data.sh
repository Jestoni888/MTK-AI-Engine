#!/system/bin/sh
MODDIR="${0%/*}"
. "${MODDIR}/MTK_AI/AI_MODE/auto_frequency/auto_frequency"
OUT="${MODDIR}/MTK_AI/AI_MODE/normal_mode/stock_tweaks.sh"
press_check 3 && ultimate_rescue
# Note: Changed to #!/system/bin/sh for better Android compatibility,
# as some devices don't have /bin/bash symlinked by default.
echo '#!/system/bin/sh' > "$OUT"

# 1. Search for BOTH vm. and kernel.sched_ parameters
sysctl -a 2>/dev/null | grep -E '^(vm\.|kernel\.sched_)' | while read -r line; do
key=$(echo "$line" | cut -d= -f1 | xargs)
val=$(echo "$line" | cut -d= -f2- | xargs)
echo "sysctl -w ${key}=\"${val}\"" >> "$OUT"
done

# 2. Backup current CPU governor for all online cores
echo "" >> "$OUT"
echo "# --- Current CPU Governor Backup ---" >> "$OUT"
find /sys/ -type f -name "scaling_governor" | while IFS= read -r cpu_path; do
# Use tr to safely strip newlines/spaces instead of xargs
governor=$(cat "$cpu_path" 2>/dev/null | tr -d '[:space:]')
if [ -n "$governor" ]; then
echo "echo '${governor}' > ${cpu_path}" >> "$OUT"
fi
done

# 3. Backup PPM policy status
if [ -d "/proc/ppm" ] && [ -f "/proc/ppm/policy_status" ]; then
    echo "" >> "$OUT"
    echo "# --- PPM Policy Status Backup ---" >> "$OUT"
    echo "if [ -d \"/proc/ppm\" ]; then" >> "$OUT"
    
    while IFS= read -r line; do
        # Extract index (e.g., [0] -> 0) and status (enabled/disabled)
        idx=$(echo "$line" | awk '{print $1}' | tr -d '[]')
        status=$(echo "$line" | awk '{print $NF}')
        
        # Convert status to 1 or 0 based on your usage format
        if [ "$status" = "enabled" ]; then
            val=1
        elif [ "$status" = "disabled" ]; then
            val=0
        else
            continue
        fi
        
        if [ -n "$idx" ]; then
            echo "    echo $idx $val > /proc/ppm/policy_status" >> "$OUT"
        fi
    done < /proc/ppm/policy_status
    
    echo "fi" >> "$OUT"
fi

chmod +x "$OUT"
echo "Created $OUT"

# 4. Backup current DVFS frequencies (Universal for all SoCs)
DVFS_OUT="${MODDIR}/MTK_AI/AI_MODE/normal_mode/default_dvfs.sh"
echo '#!/system/bin/sh' > "$DVFS_OUT"
echo "" >> "$DVFS_OUT"
echo "# --- Universal DVFS Frequency Backup ---" >> "$DVFS_OUT"

# Universal find: Excludes PIDs and CPU paths, checks all list file formats
find /sys /proc -path "/proc/[0-9]*" -prune -o -type f \( -iname "available_frequencies" -o -iname "*_freq_table" -o -iname "*_opp_dump" -o -iname "*_opp_table" \) -print 2>/dev/null | grep -vE '/(cpufreq|policy[0-9]+|ppm)/' | while read -r f; do
    dir=$(dirname "$f")
    
    # Define target patterns for max, min, and set across all SoCs
    max_targets="max_freq hw_max_freq scaling_max_freq gpu_max_clock gpu_cap_rate gpufreq_opp_freq"
    min_targets="min_freq hw_min_freq scaling_min_freq gpu_min_clock gpu_floor_rate"
    set_targets="set_freq"
    
    found_max=0
    for t in $max_targets; do
        if [ -f "$dir/$t" ]; then
            cur=$(cat "$dir/$t" 2>/dev/null | tr -d '[:space:]')
            if [ -n "$cur" ]; then
                # Generate restore command with strict chmod sequence
                echo "chmod 644 '$dir/$t' 2>/dev/null; echo '$cur' > '$dir/$t' 2>/dev/null; chmod 444 '$dir/$t' 2>/dev/null" >> "$DVFS_OUT"
                found_max=1
                break
            fi
        fi
    done
    
    found_min=0
    for t in $min_targets; do
        if [ -f "$dir/$t" ]; then
            cur=$(cat "$dir/$t" 2>/dev/null | tr -d '[:space:]')
            if [ -n "$cur" ]; then
                echo "chmod 644 '$dir/$t' 2>/dev/null; echo '$cur' > '$dir/$t' 2>/dev/null; chmod 444 '$dir/$t' 2>/dev/null" >> "$DVFS_OUT"
                found_min=1
                break
            fi
        fi
    done
    
    # If neither max nor min were found, fallback to set_freq
    if [ "$found_max" -eq 0 ] && [ "$found_min" -eq 0 ]; then
        for t in $set_targets; do
            if [ -f "$dir/$t" ]; then
                cur=$(cat "$dir/$t" 2>/dev/null | tr -d '[:space:]')
                if [ -n "$cur" ]; then
                    echo "chmod 644 '$dir/$t' 2>/dev/null; echo '$cur' > '$dir/$t' 2>/dev/null; chmod 444 '$dir/$t' 2>/dev/null" >> "$DVFS_OUT"
                    break
                fi
            fi
        done
    fi
done

chmod +x "$DVFS_OUT"
echo "Created $DVFS_OUT"
