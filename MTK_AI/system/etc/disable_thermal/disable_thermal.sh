#!/system/bin/sh

disable_oppo_elf() {
  pm disable com.coloros.oppoguardelf/com.coloros.powermanager.fuelgaue.GuardElfAIDLService
  pm disable com.coloros.oppoguardelf/com.coloros.oppoguardelf.OppoGuardElfService
}

# GPU
serialize_jobs none

# DRAM
dram_freq 0

# PPM
echo 1 > /proc/ppm/enabled
cat /proc/ppm/policy_status | grep -e '\[.*\]' | while read row
do
  case "$row" in
    *"PPM_POLICY_HARD_USER_LIMIT"*)
      v=1
    ;;
    *)
      v=0
    ;;
  esac
  echo ${row:1:1} $v > /proc/ppm/policy_status
done

lock_value 2 /sys/kernel/fpsgo/common/force_onoff
lock_value 0 /sys/kernel/fpsgo/fbt/switch_idleprefer


lock_value() {
  if [[ -f $2 ]];then
    chmod 644 $2
    echo $1 > $2
    chmod 444 $2
  fi
}

thermal_basic(){
echo 95 75 > /proc/driver/thermal/clatm_gpu_threshold
echo 3 117000 0 mtktscpu-sysrst 85000 0 cpu_adaptive_0 76000 0 cpu_adaptive_1 0 0 no-cooler 0 0 > /proc/driver/thermal/tzcpu
echo 4 120000 0 mtk-cl-kshutdown02 110000 0 no-cooler 100000 0 no-cooler 90000 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 0 0 no-cooler 1000 > /proc/driver/thermal/tzbtspa
echo 2 100000 90000 80000 85000 93000 85000 235000 2000 230000 2000 500 500 13500 > /proc/driver/thermal/clctm
echo 0 3 4 11 3 15 1 15 > /proc/driver/thermal/clatm_cpu_min_opp
echo 1 3 4 5 0 0 0 0 > /proc/driver/thermal/clatm_cpu_min_opp
}

# Disable thermal restrictions (path may vary)
echo 0 > /sys/class/thermal/thermal_zone0/mode
echo 0 > /sys/class/thermal/thermal_zone1/mode
echo 0 > /sys/devices/system/cpu/perf/enable
echo 0 > /sys/devices/system/cpu/perf/fuel_gauge_enable
echo 0 > /sys/devices/system/cpu/perf/gpu_pmu_enable
echo 120 > /sys/module/ged/parameters/g_fb_dvfs_threshold
echo 1 > /proc/perfmgr/syslimiter/syslimiter_force_disable
echo 0 > /proc/perfmgr/boost_ctrl/cpu_ctrl/cfp_enable
echo 0 > /sys/kernel/eara_thermal/enable
lock_value 0 /sys/kernel/fpsgo/common/fpsgo_enable
# 0: 0ff 1:on 2:free
echo 2 > /sys/kernel/fpsgo/common/force_onoff
echo 250 > /sys/kernel/fpsgo/fbt/thrm_activate_fps
lock_value 0 /sys/kernel/fpsgo/fbt/limit_cfreq
lock_value 0 /sys/kernel/fpsgo/fbt/limit_rfreq
lock_value 0 /sys/kernel/fpsgo/fbt/limit_cfreq_m
lock_value 0 /sys/kernel/fpsgo/fbt/limit_rfreq_m

echo 0 > /sys/module/fbt_cpu/parameters/boost_affinity
echo 0 > /sys/module/fbt_cpu/parameters/boost_affinity_90
echo 0 > /sys/module/fbt_cpu/parameters/boost_affinity_120

lock_value 120 /sys/kernel/fpsgo/fbt/thrm_temp_th
echo -1 > /sys/kernel/fpsgo/fbt/thrm_limit_cpu
echo -1 > /sys/kernel/fpsgo/fbt/thrm_sub_cpu

echo 0 > /sys/devices/system/cpu/sched/hint_enable

echo 0 > /proc/sys/kernel/slide_boost_enabled
echo 0 > /proc/sys/kernel/launcher_boost_enabled

# thermal_basic

serialize_jobs none

for i in 0 4 7; do
  chmod 444 /sys/devices/system/cpu/cpufreq/policy$i/scaling_min_freq
  chmod 444 /sys/devices/system/cpu/cpufreq/policy$i/scaling_max_freq
done

for i in 3 4 5 6; do
  echo $i 0 0 > /proc/gpufreq/gpufreq_limit_table
done
for i in 'hard_userlimit_cpu_freq' 'hard_userlimit_freq_limit_by_others'; do
  echo 0 -1 > /proc/ppm/policy/$i
  echo 1 -1 > /proc/ppm/policy/$i
  echo 2 -1 > /proc/ppm/policy/$i
  chmod 444 /proc/ppm/policy/$i
  # cat /proc/ppm/policy/$i
done
for i in 3 4 5 6; do
  echo $i 0 0 > /proc/gpufreq/gpufreq_limit_table
done
set_stune background 0 0
set_stune foreground 0 0
set_stune nnapi-hal 0 0
set_stune io 0 0
sched_isolation_disable

echo enable 0 > /proc/perfmgr/tchbst/user/usrtch
hide_value /proc/perfmgr/boost_ctrl/cpu_ctrl/perfserv_iso_cpu 0
hide_value /proc/perfmgr/boost_ctrl/cpu_ctrl/perfserv_freq
hide_value /proc/perfmgr/boost_ctrl/cpu_ctrl/current_freq

process_opt() {
  change_task_cpuset system_server top-app
  change_task_cpuset kswapd0 foreground
  change_task_cpuset surfaceflinger foreground
}

echo 8000000 > /proc/sys/kernel/sched_latency_ns
echo 2000000 > /proc/sys/kernel/sched_min_granularity_ns

ctl_off cpu0
ctl_off cpu4
ctl_off cpu7
process_opt &
