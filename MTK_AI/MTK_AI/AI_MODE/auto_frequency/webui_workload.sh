#!/system/bin/sh

notify_status() {
    su -lp 2000 -c "cmd notification post -t 'ART Compiler' -i 'file:///data/local/tmp/icon.png' -S bigtext mtk_ai_tag '$1'" >/dev/null 2>&1
}

case "$1" in
    file_bulk)
        fallback_filter="$2"
        force_clean="$3"
        
        filter_file="/sdcard/MTK_AI_Engine/dex2oat_filter.conf"
        list_file="/sdcard/MTK_AI_Engine/compile_apps.txt"

        filter="$fallback_filter"
        [ -f "$filter_file" ] && filter=$(cat "$filter_file" | tr -d '[:space:]')

        if [ ! -f "$list_file" ]; then
            notify_status "❌ Error: Compile package list not found."
            exit 1
        fi

        cores=$(grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 4)
        su -c "setprop dalvik.vm.dex2oat-threads '$cores'"

        total=$(grep -v '^$' "$list_file" | wc -l)
        count=0

        notify_status "🎯 Starting compilation ($total apps) with filter: $filter"

        for p in $(cat "$list_file"); do
            [ -z "$p" ] && continue
            count=$((count + 1))
            notify_status "⏳ Compiling ($count/$total): $p"

            if [ "$force_clean" = "1" ]; then
                su -c "cmd package compile --reset '$p'" >/dev/null 2>&1
            fi

            su -c "cmd package compile -f -m '$filter' '$p'" >/dev/null 2>&1 || \
            su -c "pm compile -f -m '$filter' '$p'" >/dev/null 2>&1 || \
            su -c "pm dexopt '$p' '$filter'" >/dev/null 2>&1
        done

        su -c "cmd package bg-dexopt-job" >/dev/null 2>&1
        rm -f "$list_file" "$filter_file"
        notify_status "✅ Success: All app compilations completed."
        ;;
    stop_compile)
        su -c "pkill -9 -f 'cmd package compile'" >/dev/null 2>&1
        su -c "killall -9 dex2oat dex2oat32 dex2oat64" >/dev/null 2>&1
        rm -f /sdcard/MTK_AI_Engine/compile_apps.txt
        rm -f /sdcard/MTK_AI_Engine/dex2oat_filter.conf
        notify_status "🛑 Compilation processes forcefully stopped."
        pkill -f webui_workload.sh
        ;;
esac

exit 0
