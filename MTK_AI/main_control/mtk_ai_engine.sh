#!/system/bin/sh
. /data/adb/modules/MTK_AI/MTK_AI/AI_MODE/auto_frequency/auto_frequency
S=$(cat /sdcard/MTK_AI_Engine/automode 2>/dev/null|tr -d '[:space:]')
case $S in 0)D=lite_mode;;1)D=mtk_ai_engine;;2)D=dumpsys_mode;;*)exit 0;;esac
ps|grep -v grep|grep -qw $D&&exit 0
export LD_LIBRARY_PATH=/data/adb/modules/MTK_AI/lib64:$LD_LIBRARY_PATH
setsid /data/adb/modules/MTK_AI/main_control/$D >/dev/null 2>&1&
setsid /data/adb/modules/MTK_AI/script_runner/mtk_ai_manual >/dev/null 2>&1&
setsid /data/adb/modules/MTK_AI/script_runner/boost_color_apply.sh >/dev/null 2>&1&
setsid /data/adb/modules/MTK_AI/MTK_AI/AI_MODE/normal_mode/powersavex >/dev/null 2>&1&
resolution