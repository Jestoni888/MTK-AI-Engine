#!/system/bin/sh
# Magisk post-fs-data script
MODDIR="/data/adb/modules/MTK_AI"
# Using the module ID folder name for the meta path
METAMOD_TARGET="/data/adb/metamodule/mnt/MTK_AI"
CFG_DIR="/sdcard/MTK_AI_Engine"

# Start Web Server
# Use the full path to magisk/ksu busybox to be safe
$MODDIR/busybox httpd -p 8080 -h "$MODDIR/webroot"

# Fix permissions every boot (safe and fast)
chmod 755 "$MODDIR/service.d/"*.sh 2>/dev/null
chmod 755 "$MODDIR/logcat_detection/logcat" 2>/dev/null
chmod 755 "$MODDIR/touch_detection/touch2" 2>/dev/null
chmod 755 "$MODDIR/touch_detection/dumpsys" 2>/dev/null
chmod 755 "$MODDIR/logcat_detection/dumpsys2" 2>/dev/null
chmod 755 "$MODDIR/script_runner/sf_controller" 2>/dev/null

cp "$MODDIR/vendor/etc/qt.cfg" "$METAMOD_TARGET/vendor/etc/qt.cfg"
set_perm_recursive "$MODPATH" 0 0 0755 0644

#MTK_AI_MODE PERMISSIONS
#auto frequency
chmod 755 "$MODDIR/MTK_AI/AI_MODE/auto_frequency/auto_frequency" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/auto_frequency/cpu6" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/auto_frequency/cpu7" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/auto_frequency/surfaceflinger" 2>/dev/null

#gaming mode
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/app_optimizer" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/bypass_on" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/disable_thermal" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/disable_thermal2" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/disable_thermal3" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/gaming_cpuset" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/gaming_prop" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/gaming_prop_2" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/limit" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/lite_gaming" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/performance" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/unlock" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/gaming_mode/unlockfps" 2>/dev/null

#normal mode
chmod 755 "$MODDIR/MTK_AI/AI_MODE/normal_mode/bypass_off" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/normal_mode/normal_cpuset" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/normal_mode/normal_prop" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/normal_mode/powersave" 2>/dev/null

#global mode
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/charger_check" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/perf_disp" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/ram_cleaner" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/resources_tweaks" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/trim_memory" 2>/dev/null
chmod 755 "$MODDIR/MTK_AI/AI_MODE/global_mode/webview_tweaks" 2>/dev/null

#script runner
chmod 755 "$MODDIR/script_runner/display_mode" 2>/dev/null
chmod 755 "$MODDIR/script_runner/global" 2>/dev/null
chmod 755 "$MODDIR/script_runner/mtk_ai_manual" 2>/dev/null
chmod 755 "$MODDIR/script_runner/refresh_rate_locker" 2>/dev/null
chmod 755 "$MODDIR/script_runner/sf_controller" 2>/dev/null
chmod 755 "$MODDIR/script_runner/mtk_ai_eem_boot" 2>/dev/null
