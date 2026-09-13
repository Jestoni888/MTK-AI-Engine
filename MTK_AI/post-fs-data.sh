#!/system/bin/sh

OUT="/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/normal_mode/stock_tweaks.sh"

# Note: Changed to #!/system/bin/sh for better Android compatibility, 
# as some devices don't have /bin/bash symlinked by default.
echo '#!/system/bin/sh' > "$OUT"

# 1. Search for BOTH vm. and kernel.sched_ parameters
sysctl -a 2>/dev/null | grep -E '^(vm\.|kernel\.sched_)' | while read -r line; do
    key=$(echo "$line" | cut -d= -f1 | xargs)
    val=$(echo "$line" | cut -d= -f2- | xargs)
    echo "sysctl -w ${key}=\"${val}\"" >> "$OUT"
done

# 2. Backup currently active thermal services
echo "" >> "$OUT"
echo "# --- Active Thermal Services Backup ---" >> "$OUT"

# Dynamically find all init services containing 'thermal' that are currently 'running'
# awk extracts the property name, sed removes the 'init.svc.' prefix to get the pure service name
getprop | grep 'init.svc.' | grep 'thermal' | grep '\[running\]' | awk -F'[][]' '{print $2}' | sed 's/^init\.svc\.//' | while read -r svc; do
    if [ -n "$svc" ]; then
        echo "start $svc" >> "$OUT"
    fi
done

chmod +x "$OUT"
echo "Created $OUT"
