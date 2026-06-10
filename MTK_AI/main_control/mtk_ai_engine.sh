#!/system/bin/sh
# MTK AI Engine - Single Instance Runner (grep lock)

STATE="/sdcard/MTK_AI_Engine/automode"
DAEMON="mtk_ai_engine"

[ "$(cat "$STATE" 2>/dev/null | tr -d '[:space:]')" != "1" ] && exit 0
ps 2>/dev/null | grep -v grep | grep -qw "$DAEMON" && exit 0

export LD_LIBRARY_PATH=/data/adb/modules/MTK_AI/lib64:$LD_LIBRARY_PATH
nohup "/data/adb/modules/MTK_AI/main_control/$DAEMON"
