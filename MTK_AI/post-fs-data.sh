#!/system/bin/sh
MODDIR="${0%/*}"
. "${MODDIR}/MTK_AI/AI_MODE/auto_frequency/auto_frequency"
OUT="${MODDIR}/MTK_AI/AI_MODE/normal_mode/stock_tweaks.sh"
press_check 3 && disable_modules
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
