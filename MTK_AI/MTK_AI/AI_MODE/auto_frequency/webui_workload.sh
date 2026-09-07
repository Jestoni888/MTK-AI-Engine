#!/system/bin/sh

# --- NOTIFICATION FUNCTION ---
# Uses UID 2000 to bypass SELinux restrictions
notify_status() {
        ICON="file:///data/local/tmp/icon.png"
        TITLE="Notice"
        
    local status_msg="$1"

    # --- Post Notification ---
    # Cleaned up: Removed CPU, Temp, and Gov info. 
    # Now purely displays the compilation status passed to it.
    su -lp 2000 -c "cmd notification post -t '$TITLE' -i '$ICON' -S bigtext mtk_ai_tag '$status_msg'" >/dev/null 2>&1
}

# ==========================================
# 🚀 COMPILATION ENGINE
# ==========================================
_compile_single_app() {
    local pkg="$1"
    local filter="$2"
    local force_clean="$3"

    # 1. Force clean if requested (Official Android reset)
    if [ "$force_clean" = "1" ]; then
        cmd package compile --reset "$pkg" >/dev/null 2>&1
    fi

    # 2. Method 1: Modern & Forced (Best for immediate results)
    if cmd package compile -m "$filter" -f "$pkg" >/dev/null 2>&1; then
        return 0
    fi

    # 3. Method 2: Legacy Direct Command
    if pm compile -m "$filter" "$pkg" >/dev/null 2>&1; then
        return 0
    fi

    # 4. Method 3: Official Dexopt Fallback
    pm dexopt "$pkg" "$filter" bg-dexopt >/dev/null 2>&1
    return 0
}

compile_apps() {
    local mode="$1"        # "single", "bulk", "bulk_user", "bulk_system"
    local pkg="$2"         # package name (for single)
    local filter="$3"      # e.g., "speed-profile"
    local force_clean="$4" # "1" or "0"

    # Dynamically detect physical CPU cores to prevent thermal throttling
    local cores=$(grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 4)
    setprop dalvik.vm.dex2oat-threads "$cores"

    if [ "$mode" = "bulk" ] || [ "$mode" = "bulk_user" ] || [ "$mode" = "bulk_system" ]; then
        local apps=""
        
        if [ "$mode" = "bulk_user" ]; then
            notify_status "🎯 Initializing USER apps compilation..."
            apps=$(pm list packages -3 | sed 's/package://')
        elif [ "$mode" = "bulk_system" ]; then
            notify_status "🎯 Initializing SYSTEM apps compilation..."
            apps=$(pm list packages -s | sed 's/package://')
        else
            notify_status "🎯 Initializing ALL apps compilation..."
            apps=$(pm list packages | sed 's/package://')
        fi
        
        local total=$(echo "$apps" | wc -l)
        local count=0
        
        for p in $apps; do
            count=$((count + 1))
            # Update notification with current package and progress
            notify_status "⏳ Compiling ($count/$total): $p"
            _compile_single_app "$p" "$filter" "$force_clean"
        done
        notify_status "✅ Done: Bulk compilation completed successfully."
    else
        notify_status "⏳ Compiling: $pkg with $filter"
        _compile_single_app "$pkg" "$filter" "$force_clean"
        notify_status "✅ Done: $pkg compiled with $filter successfully."
    fi
}

# Legacy wrapper for backward compatibility (reads filter from your JS config)
start_compile() {
    local filter="speed-profile"
    if [ -f /sdcard/MTK_AI_Engine/dex2oat.conf ]; then
        filter=$(grep "^filter=" /sdcard/MTK_AI_Engine/dex2oat.conf | cut -d= -f2)
    fi
    compile_apps "bulk" "" "$filter" "0"
}

stop_compile() {
    # Force kill the main compiler command
    pkill -9 -f "cmd package compile" >/dev/null 2>&1
    
    # Force kill all spawned dex2oat processes (single clean command)
    killall -9 dex2oat dex2oat32 dex2oat64 >/dev/null 2>&1
    
    notify_status "🛑 Compilation processes stopped."
    pkill -f webui_workload.sh
}
# ==========================================
# ==========================================
# 🚀 COMMAND ROUTER (Triggered by WebUI)
# ==========================================
# This listens for the arguments passed from dex2oat.js 
# and executes the corresponding function.

case "$1" in
    compile_apps)
        # $2=mode, $3=pkg, $4=filter, $5=force_clean
        compile_apps "$2" "$3" "$4" "$5"
        ;;
    start_compile)
        start_compile
        ;;
    stop_compile)
        stop_compile
        ;;
    *)
        # If called without arguments (e.g., by the system loop), do nothing or run default
        ;;
esac

exit 0