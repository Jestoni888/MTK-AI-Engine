#!/system/bin/sh

OUT="/data/adb/modules/MTK_AI/MTK_AI/AI_MODE/normal_mode/stock_tweaks.sh"

echo '#!/bin/bash' > "$OUT"
sysctl -a 2>/dev/null | grep '^vm\.' | while read -r line; do
    key=$(echo "$line" | cut -d= -f1 | xargs)
    val=$(echo "$line" | cut -d= -f2- | xargs)
    echo "sysctl -w ${key}=\"${val}\"" >> "$OUT"
done

chmod +x "$OUT"
echo "Created $OUT"
