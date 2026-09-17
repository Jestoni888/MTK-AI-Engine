#!/system/bin/sh
MODDIR="${0%/*}"
. "${MODDIR}/MTK_AI/AI_MODE/auto_frequency/auto_frequency"
OUT="/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/normal_mode/stock_tweaks.sh"

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

for cpu_path in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    if [ -f "$cpu_path" ]; then
        governor=$(cat "$cpu_path" 2>/dev/null | xargs)
        if [ -n "$governor" ]; then
            echo "echo '${governor}' > ${cpu_path}" >> "$OUT"
        fi
    fi
done

chmod +x "$OUT"
echo "Created $OUT"
