#!/system/bin/sh
# Example: Setting CPU Governor to 'powersave' when screen is OFF (Requires Root!)

# Define the path to the governor file (CHECK THIS PATH on your device!)

for policy in /sys/devices/system/cpu/cpufreq/policy*; do
                [ -f "$policy/scaling_governor" ] && echo powersave | su -c "tee $policy/scaling_governor"
            done