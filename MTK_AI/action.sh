#!/system/bin/sh

SCRIPT_PATH="/data/adb/modules/MTK_AI/action.sh"

for pid in $(pgrep -f "$SCRIPT_PATH"); do
    # Kill all instances except the current running script ($$)
    if [ "$pid" != "$$" ]; then
        kill -9 "$pid" 2>/dev/null
    fi
done
. /data/adb/modules/MTK_AI/MTK_AI/AI_MODE/auto_frequency/auto_frequency
LOG_TAG="[MTK_AI UPDATE]"
MANIFEST_URL="https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest.txt"
TMP="/data/local/tmp/mtk_update"
PROGRESS_FILE="/sdcard/MTK_AI_Engine/.update_progress"
# Ensure MODPATH is set (fallback for standalone testing)
MODPATH="/data/adb/modules/MTK_AI"
cfgpath="${MODPATH}/common/cfg.sh"
volupkey='KEY_VOLUMEUP'
voldownkey='KEY_VOLUMEDOWN'
keylist="${volupkey} ${voldownkey}"
log() {
echo "$LOG_TAG $*"
}
# ==========================================
# NEW: Timeout Key Detection (10 Seconds)
# ==========================================
detect_keys_timeout() {
  local event
  # Wait max 10 seconds for a single key event
  event="$(timeout 10 getevent -lqn -c1 2>/dev/null)"
  
  if [ -z "$event" ]; then
    echo "timeout"
  elif echo "$event" | grep -q "${volupkey}.*DOWN"; then
    echo "yes"
  elif echo "$event" | grep -q "${voldownkey}.*DOWN"; then
    echo "no"
  else
    echo "other"
  fi
}

# ==========================================
# NEW: Prompt and Generate Script
# ==========================================
prompt_maximize() {
echo "****************************************"
echo " Do you want to fully maximize full"
echo " capabilities of your android? EXPERIMENTAL"
echo " installed in /data/adb/service.d/max.sh"
echo " delete it via MT manager if you have issues"
echo " or via cmd: rm -f /data/adb/service.d/max.sh"
echo " reboot after applied & update"
echo "****************************************"
echo
echo "  [VOL+] = YES   [VOL-] = NO"
echo "  (Auto-proceed in 10 seconds)"
echo
local choice
choice=$(detect_keys_timeout)
case "$choice" in
yes)
echo ">> YES selected! Generating max.sh..."
generate_max_script
return 0 # Signal YES
;;
no)
echo ">> NO selected. Proceeding to next commands..."
return 1 # Signal NO
;;
timeout|other)
echo ">> Timeout or invalid key. Proceeding to next commands..."
return 1 # Signal TIMEOUT
;;
esac
}

generate_max_script() {
  local target_dir="/data/adb/service.d"
  local target_file="${target_dir}/max.sh"
  
  mkdir -p "$target_dir"
  
  # Using 'EOF' in quotes prevents variable expansion inside the script
  cat << 'EOF' > "$target_file"
#!/system/bin/sh

# Find *min* files to use as the directory anchor
find /sys -type f -name "*min*" 2>/dev/null | while read -r min_f; do
    max_f=$(find "$(dirname "$min_f")" -maxdepth 1 -name "*max*" -type f 2>/dev/null | head -1)
    
    if [ -n "$max_f" ] && val=$(cat "$max_f" 2>/dev/null); then
        dir=$(dirname "$min_f")
        echo "Path: $dir | Target: $val"
        
        # 1. Temporarily make writable (attempt)
        chmod 644 "$min_f" 2>/dev/null
        chmod 644 "$max_f" 2>/dev/null
        
        # 2. Write to min first (raising the floor), then max
        echo "$val" > "$min_f" 2>/dev/null
        echo "$val" > "$max_f" 2>/dev/null
        
        # 3. Lock them as read-only after applying
        chmod 444 "$min_f" 2>/dev/null
        chmod 444 "$max_f" 2>/dev/null
        
        # 4. Verify if the values were really applied
        r_max=$(cat "$max_f" 2>/dev/null)
        r_min=$(cat "$min_f" 2>/dev/null)
        
        [ "$r_max" = "$val" ] && echo "  [OK] max applied" || echo "  [FAIL] max (read: $r_max)"
        [ "$r_min" = "$val" ] && echo "  [OK] min applied" || echo "  [FAIL] min (read: $r_min)"
        echo "---"
    fi
done
EOF

  chmod 755 "$target_file"
  echo ">> Script successfully generated at:"
  echo "   ${target_file}"
  echo ">> It will execute on every boot."
}

# ==========================================
# ORIGINAL FUNCTIONS (Key Configuration)
# ==========================================
detect_keys() {
  local event
  while true; do
    event="$(getevent -lqn -c1)"
    if echo "${event}" | grep -q "${volupkey}.*DOWN"; then
      echo 'volup' && break
    elif echo "${event}" | grep -q "${voldownkey}.*DOWN"; then
      echo 'voldown' && break
    fi
  done
}

mkcfg() {
  local count
  local key
  count="${1}"
  key="${2}"

  echo "key${count}=${key}" >> "${cfgpath}"
  echo ">> ${key} is selected!"
  echo
}

upd_complete_var() {
  echo "Complete the installation with ${1} keys selected"
}

interactive() {
  local pressed_key
  local complete
  local choice
  local count

  echo '**** Customizing ****'
  echo
  echo '- Use VOL+ to confirm your choice'
  echo '  and VOL- to select next option!'
  echo
  sleep 1

  count=0
  complete="$(upd_complete_var ${count})"
  
  while true; do
    for choice in ${keylist} "${complete}"; do
      echo "> ${choice}"
      pressed_key="$(detect_keys)"
      case "${pressed_key}" in
        volup) break;;
        voldown) continue;;
      esac
    done

    if [[ "${pressed_key}" == 'volup' ]]; then
      if [[ "${choice%_*}" == 'KEY' ]]; then
        count="$((count + 1))" 
        mkcfg "${count}" "${choice}"
        [[ "${count}" == 2 ]] && break
        complete="$(upd_complete_var ${count})"
      else
        break
      fi
    fi
  done
}

fallback() {
  echo '- It looks like your device does'
  echo '  not have volume buttons'
  mkcfg 1 "${voldownkey}"
}

# ==========================================
# MAIN EXECUTION
# ==========================================
main() {
command -v getevent > /dev/null || abort '! `getevent` command missing'
if getevent -il | grep -q 'KEY_VOLUME.'; then
# 1. Run the new Yes/No prompt first
prompt_maximize
local prompt_result=$?

# 2. Only proceed to key configuration if they explicitly said YES (0)
if [ "$prompt_result" -eq 0 ]; then
echo
interactive
fi
# If NO or Timeout (1), it skips 'interactive' and proceeds to the rest of the script below
else
fallback
fi
}
main
thermal
trimmer
hibernation
# === 1. Detect module dir ===
detect_moddir() {
[ -d "/data/adb/modules/MTK_AI" ] && { echo "/data/adb/modules/MTK_AI"; return; }
[ -d "/data/ksu/modules/MTK_AI" ] && { echo "/data/ksu/modules/MTK_AI"; return; }
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
[ -f "$SCRIPT_DIR/module.prop" ] && { echo "$SCRIPT_DIR"; return; }
log "❌ Module dir not found."
exit 1
}
MODDIR="$(detect_moddir)"
log "📁 Module dir: $MODDIR"

# === 2. Check internet using YOUR BUSYBOX ===
has_internet() {
    if [ -x "$MODDIR/busybox" ]; then
        "$MODDIR/busybox" wget -q --timeout=30 --tries=10 -O /dev/null "1.1.1.1" 2>/dev/null
        return $?
    fi
    return 1
}

# === 3. Required files list ===
required_files="
MTK_AI/AI_MODE/auto_frequency/auto_frequency
Xperformance/etc/auto_frequency/auto_frequency.sh
Xperformance/etc/disable_thermal/disable_thermal.sh
Xperformance/etc/cooler/cooler.sh
MTK_AI/AI_MODE/auto_frequency/cpu6
MTK_AI/AI_MODE/auto_frequency/cpu7
MTK_AI/AI_MODE/auto_frequency/webui_workload.sh
MTK_AI/AI_MODE/gaming_mode/app_optimizer
MTK_AI/AI_MODE/gaming_mode/bypass_on
MTK_AI/AI_MODE/gaming_mode/bypass_active
MTK_AI/AI_MODE/gaming_mode/disable_thermal
MTK_AI/AI_MODE/gaming_mode/thermalx
MTK_AI/AI_MODE/gaming_mode/gaming_prop
MTK_AI/AI_MODE/gaming_mode/gaming_prop_2
MTK_AI/AI_MODE/gaming_mode/limit
MTK_AI/AI_MODE/gaming_mode/lite_gaming
MTK_AI/AI_MODE/gaming_mode/performance
MTK_AI/AI_MODE/gaming_mode/unlock
MTK_AI/AI_MODE/gaming_mode/unlockfps
MTK_AI/AI_MODE/normal_mode/bypass_off
MTK_AI/AI_MODE/normal_mode/normal_cpuset
MTK_AI/AI_MODE/normal_mode/normal_prop
MTK_AI/AI_MODE/normal_mode/powersavex
MTK_AI/AI_MODE/global_mode/ram_cleaner
MTK_AI/AI_MODE/global_mode/resources_tweaks
MTK_AI/AI_MODE/global_mode/trim_memory
MTK_AI/AI_MODE/global_mode/webview_tweaks
MTK_AI/AI_MODE/global_mode/module_executer
MTK_AI/AI_MODE/global_mode/per_app
script_runner/display_mode
script_runner/mtk_ai_manual
script_runner/refresh_rate_locker
script_runner/sf_controller
main_control/mtk_ai_engine.sh
action.sh
service.sh
post-fs-data.sh
module.prop
update_checker.sh
.required_files
system.prop
gaming_icon.png
icon.png
webroot/index.html
webroot/application.js
webroot/animationspeed.js
webroot/boostcolor.js
webroot/cpu.js
webroot/cputoggle.js
webroot/dex2oat.js
webroot/eemvoltage.js
webroot/fpsgo.js
webroot/freeze.js
webroot/front.js
webroot/gmsdoze.js
webroot/gpu.js
webroot/devfreq.js
webroot/iotweaks.js
webroot/mtk_ai_engine.js
webroot/spoof.js
webroot/ppmpolicy.js
webroot/refreshrate.js
webroot/resolutionscale.js
webroot/thermalzone.js
webroot/zram.js
webroot/process.js
webroot/dpiresolution.js
webroot/performancetest.js
webroot/maintenance.js
webroot/networktweak.js
webroot/terminalemulator.js
webroot/tweakfinder.js
webroot/modulemanager.js
webroot/profile.js
webroot/renderer.js
webroot/cpuset.js
webroot/setedit.js
webroot/update.js
webroot/hibernator.js
webroot/wifi.js
"

# === 4. Download helper & Hash checkers ===
download() {
url="$1"
out="$2"
"$MODDIR/busybox" wget -q --timeout=30 --tries=10 -O "$out" "$url" 2>/dev/null
}

is_text_file() {
case "$1" in
# 🔥 Added *required_files to the text file extensions list
*.sh|*.js|*.html|*.prop|*.txt|*.cfg|*.conf|*.xml|*.json|*.css|*.md|*required_files) return 0 ;;
esac
_sh=$("$MODDIR/busybox" head -c 2 "$1" 2>/dev/null)
[ "$_sh" = "#!" ] && return 0
return 1
}

get_sha256() {
"$MODDIR/busybox" sha256sum "$1" 2>/dev/null | "$MODDIR/busybox" cut -d' ' -f1 | tr -d '[:space:]' | tr 'A-F' 'a-f'
}

is_required() {
target="$1"
for f in $required_files; do
[ "$f" = "$target" ] && return 0
done
return 1
}

# === 5. MAIN LOGIC ===
# Ensure progress directory exists and reset to 0%
mkdir -p "/sdcard/MTK_AI"
echo "0" > "$PROGRESS_FILE"

if has_internet; then
log "🌐 Internet detected. Checking for updates..."
mkdir -p "$TMP"
if download "$MANIFEST_URL" "$TMP/manifest.txt"; then
if [ ! -s "$TMP/manifest.txt" ]; then
log "⚠️ Manifest is empty."
rm -rf "$TMP"
else
# 🔥 Pre-calculate total files to update for accurate progress percentage
total_files=0
while IFS= read -r line; do
[ -z "$line" ] && continue
case "$line" in \#*) continue ;; esac
rel_path=$(echo "$line" | cut -d' ' -f1)
if is_required "$rel_path"; then
total_files=$((total_files + 1))
fi
done < "$TMP/manifest.txt"

# Prevent division by zero
[ "$total_files" -eq 0 ] && total_files=1

updated=0
checked=0

while IFS= read -r line; do
[ -z "$line" ] && continue
case "$line" in \#*) continue ;; esac
rel_path=$(echo "$line" | cut -d' ' -f1)
url=$(echo "$line" | cut -d' ' -f2- | xargs)

if is_required "$rel_path"; then
checked=$((checked + 1))
target="$MODDIR/$rel_path"
mkdir -p "$(dirname "$target")" 2>/dev/null

needs_update=0

if [ ! -f "$target" ]; then
needs_update=1
log "📥 Missing: $rel_path"
else
if is_text_file "$target"; then
local_hash=$(get_sha256 "$target")
# Download to temp file to check online hash
if download "$url" "$TMP/file_online"; then
online_hash=$(get_sha256 "$TMP/file_online")
if [ -n "$local_hash" ] && [ -n "$online_hash" ] && [ "$local_hash" != "$online_hash" ]; then
needs_update=1
log "🔄 Modified: $rel_path"
else
log "✅ Up-to-date: $rel_path"
fi
else
log "⚠️ Failed to download for check: $rel_path"
fi
else
# Binary file exists, skip downloading
log "✅ Up-to-date (binary): $rel_path"
fi
fi

if [ "$needs_update" -eq 1 ]; then
if [ -f "$TMP/file_online" ] && is_text_file "$target"; then
# We already downloaded it for the hash check, just copy it over
cp -f "$TMP/file_online" "$target"
else
if download "$url" "$TMP/file" && [ -s "$TMP/file" ]; then
cp -f "$TMP/file" "$target"
else
log "⚠️ FAILED to download: $rel_path"
fi
fi

if [ -f "$target" ] && [ -s "$target" ]; then
chmod 755 "$target" 2>/dev/null
updated=$((updated + 1))
log "✅ Updated: $rel_path"
fi
fi

# Clean up temp files for next iteration
rm -f "$TMP/file_online" "$TMP/file" 2>/dev/null

# 🔥 Calculate and write progress (0-100) based on checked files
progress=$((checked * 100 / total_files))
echo "$progress" > "$PROGRESS_FILE"
fi
done < "$TMP/manifest.txt"

rm -rf "$TMP"
# 🔥 Ensure it hits 100% at the end of the loop
echo "100" > "$PROGRESS_FILE"

if [ "$updated" -gt 0 ]; then
log "✅ Update complete! ($updated files updated)"
else
log "ℹ️ No updates applied. All files are up-to-date."
fi
fi
else
log "⚠️ Failed to download manifest. Skipping update."
fi
else
log "🛜 No internet detected. Skipping online update."
fi

# === 6. Sync Icons to Shell-Accessible Location ===
# This bypasses SELinux restrictions on /data/adb/ for the shell user (UID 2000)
# ensuring notifications can read the custom icons.
if [ -f "$MODDIR/gaming_icon.png" ]; then
cp -f "$MODDIR/gaming_icon.png" /data/local/tmp/gaming_icon.png
chmod 777 /data/local/tmp/gaming_icon.png
log "✅ Synced gaming_icon.png to /data/local/tmp/"
fi
if [ -f "$MODDIR/icon.png" ]; then
cp -f "$MODDIR/icon.png" /data/local/tmp/icon.png
chmod 777 /data/local/tmp/icon.png
log "✅ Synced icon.png to /data/local/tmp/"
fi
rm -f "/sdcard/MTK_AI_Engine/.update_status"
log "🏁 action.sh finished."
