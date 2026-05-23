# /data/adb/modules/MTK_AI/main_control/mtk_ai_engine
#!/system/bin/sh

STATE="/sdcard/MTK_AI_Engine/automode"
ENGINE="/data/adb/modules/MTK_AI/main_control/mtk_ai_engine"
export LD_LIBRARY_PATH=/data/adb/modules/MTK_AI/lib64:$LD_LIBRARY_PATH
mkdir -p /sdcard/MTK_AI_Engine
[ "$(cat "$STATE" 2>/dev/null | tr -d '[:space:]')" = "1" ] && exec "$ENGINE"