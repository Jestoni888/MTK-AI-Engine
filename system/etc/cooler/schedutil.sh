#!/system/bin/sh
# --- FORCED SCHEDUTIL & TUNABLES SCRIPT ---

# Define the path to the governor file (CHECK THIS PATH on your device!)

for policy in /sys/devices/system/cpu/cpufreq/policy*; do
                [ -f "$policy/scaling_governor" ] && echo schedutil | su -c "tee $policy/scaling_governor"
            done