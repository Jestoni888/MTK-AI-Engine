# Mediatek AI Engine
MTK AI Engine is logcat/touch based module
with near zero usages of cpu power because it has no loop/sleep commands, just automatically triggers anything you do in your device.
also gives full features of your android device in all scenarios such as gaming , daily use & screen off to save power


## FEATURES 

- Powersaver mode during screen-off events can be toggled to turning it on/off if you don't want missing notifications or alarms
- Boost colors
- Refresh rate locker / per-app
- Resolution scaling
- GPU frequency slider from min - max output
- CPU governor selection
- Devfreq governor selection
- Render mode selection (Skia VULKAN & Skia GL)
- Touch mode optimization ( auto raise CPU, GPU & refresh rate depends in your input values also automatically down all frequencies & refresh rate to low if limiter is enabled in webui
- Application trimmer in extra storage caches can be toggled on/off in webui 
- Ram cleaner every 30 seconds can be toggled on/off in webui
- Thermal bypass for maximum performance on gaming
- Bypass charging (working only during gaming mode)
- Auto enable developer option & turning on 4X MSAA & Disable hw overlays for smoother gaming experience, can be toggled on/off in webui
- PPM Policy control specifically only for MediaTek devices
- EEM voltage offset slider for CPU, GPU & Cache coherent
- CPUSET groups selections for cpu prioritization setup
- CPU dynamic cgroups share control setup values for each groups of cpus
- Display animation adjustment for those who want faster animation or smoother experience 
- Zram manager up to 20GB extension along with custom swappiness value
- Auto App freezer during gaming & during screen-off, can also automatically unfreeze during normal use suitable for who doesn't want disturbance during gaming sessions
  🆙🆕
- Sysctl kernel tuner editor (Under experimental)
- Global root search with editor & file permission changer (Under experimental) 

## GAMING MODE PER-APP 
- Refresh rate
- Resolution scaling slider
- Cpu governor selection
- Vsync offset slider
- Voltage offset slider
- Render mode skiagl or skiavk

## DISCLAIMER
- Any misconfiguration setup that not supported in your devices will result in instability or further sudden restart/reboot, missed notifications, alarms, laggy. Make a further research for your devices compacompatsetup in webui
- This is only my personal module as a hobby to learn something but I'm gonna share it to everyone for FREE & further information

 ## INSTRUCTIONS
 - Choose universal for safe of bootloops
 - Click action button for online updates (Added notice in module section if there's new updates)
 - Go to webui in maintenance section for 1click configuration setup from github if you don't understand the setup of webui
