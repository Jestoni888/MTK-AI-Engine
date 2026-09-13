#!/system/bin/sh

OUT="/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/normal_mode/stock_tweaks.sh"

# Note: Changed to #!/system/bin/sh for better Android compatibility, 
# as some devices don't have /bin/bash symlinked by default.
echo '#!/system/bin/sh' > "$OUT"

# Search for BOTH vm. and kernel.sched_ parameters
sysctl -a 2>/dev/null | grep -E '^(vm\.|kernel\.sched_)' | while read -r line; do
    key=$(echo "$line" | cut -d= -f1 | xargs)
    val=$(echo "$line" | cut -d= -f2- | xargs)
    echo "sysctl -w ${key}=\"${val}\"" >> "$OUT"
done

chmod +x "$OUT"
echo "Created $OUT"
