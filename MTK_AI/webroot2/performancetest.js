// tweakanalyzer.js - Device Performance & VM Tweak Analyzer (FULL VERSION)
(function() {
'use strict';
const execFn = window.exec || async function(cmd, timeout = 10000) {
    return new Promise(resolve => {
        const cb = `perf_exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const t = setTimeout(() => { delete window[cb]; resolve(''); }, timeout);
        window[cb] = (_, res) => { clearTimeout(t); delete window[cb]; resolve(res || ''); };
        if (window.ksu) ksu.exec(cmd, `window.${cb}`);
        else { clearTimeout(t); resolve(''); }
    });
};

// 🔍 Test State
let results = {
    storage: 0, cpuFreq: [], cpuStability: 0, gpuFPS: 0,
    ramSpeed: 0, zramRatio: 0, thermalDelta: 0, thermalProfile: ''
};
let testRunning = false;
let testDuration = 30000;

// 🎛️ VM Tweak State
const vmTweaks = {
    watermark_scale_factor: {
        path: '/proc/sys/vm/watermark_scale_factor',
        title: 'Watermark Scale Factor',
        icon: '🌊',
        info: 'Controls how aggressively the kernel reclaims memory. Higher values prevent CMA/hardware allocation stalls.',
        min: 10, max: 500, step: 10, default: 100,
        unit: '', currentValue: 0
    },
    min_free_kbytes: {
        path: '/proc/sys/vm/min_free_kbytes',
        title: 'Min Free Kbytes',
        icon: '💾',
        info: 'Forces the kernel to keep a minimum pool of free RAM. Prevents memory fragmentation.',
        min: 4096, max: 262144, step: 4096, default: 65536,
        unit: ' kB', currentValue: 0
    }
};

// =====================================================================
// 📡 CMD TWEAKS STATE (EXPANDED)
// =====================================================================
const cmdTweaks = {
    // === 📶 NETWORK / WIFI ===
    wifi_hiperf: {
        category: 'network', title: 'WiFi High-Perf Mode', icon: '📶',
        info: 'Disables WiFi power-save throttling. Keeps WiFi at max throughput for gaming/streaming.',
        apply: 'cmd wifi force-hi-perf-mode enabled',
        revert: 'cmd wifi force-hi-perf-mode disabled',
        read: 'dumpsys wifi | grep -i "mForceHiPerfMode"',
        parse: (r) => /mForceHiPerfMode=\s*(true|enabled)/i.test(r) ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    wifi_scan_always: {
        category: 'network', title: 'WiFi Scan Always Available', icon: '📡',
        info: 'Keeps WiFi scanning active even when WiFi is off. Improves location accuracy, uses battery.',
        apply: 'settings put global wifi_scan_always_enabled 1',
        revert: 'settings put global wifi_scan_always_enabled 0',
        read: 'settings get global wifi_scan_always_enabled',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    netd_dns: {
        category: 'network', title: 'Fast DNS Resolver', icon: '🌐',
        info: 'Sets Google + Cloudflare DNS for faster lookups. Reduces page load latency.',
        apply: 'settings put global private_dns_specifier dns.google',
        revert: 'settings delete global private_dns_specifier',
        read: 'settings get global private_dns_specifier',
        parse: (r) => r.trim() || 'OFF',
        type: 'toggle', default: false
    },
    mobile_data_always_on: {
        category: 'network', title: 'Mobile Data Always Active', icon: '📱',
        info: 'Keeps mobile data active while connected to WiFi for faster network switching.',
        apply: 'settings put global mobile_data_always_on 1',
        revert: 'settings put global mobile_data_always_on 0',
        read: 'settings get global mobile_data_always_on',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    wifi_verbose_logging: {
        category: 'network', title: 'WiFi Verbose Logging', icon: '📝',
        info: 'Increases WiFi logging detail. Useful for debugging connection drops.',
        apply: 'settings put global wifi_verbose_logging_enabled 1',
        revert: 'settings put global wifi_verbose_logging_enabled 0',
        read: 'settings get global wifi_verbose_logging_enabled',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    captive_portal_disable: {
        category: 'network', title: 'Disable Captive Portal Detection', icon: '🚫',
        info: 'Stops Android from constantly checking internet connectivity. Saves battery/data.',
        apply: 'settings put global captive_portal_mode 0',
        revert: 'settings put global captive_portal_mode 1',
        read: 'settings get global captive_portal_mode',
        parse: (r) => r.trim() === '0' ? 'DISABLED' : 'ENABLED',
        type: 'toggle', default: false
    },
    bluetooth_absolute_volume: {
        category: 'network', title: 'Bluetooth Absolute Volume', icon: '🎧',
        info: 'Syncs Bluetooth device volume with system volume. Disable if volume is too loud/quiet.',
        apply: 'settings put global bluetooth_absolute_volume 1',
        revert: 'settings put global bluetooth_absolute_volume 0',
        read: 'settings get global bluetooth_absolute_volume',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: true
    },

    // === 🔋 BATTERY ===
    low_power: {
        category: 'battery', title: 'System Low Power Mode', icon: '🔋',
        info: 'Enables Android\'s built-in battery saver. Reduces CPU/GPU, network, animations.',
        apply: 'settings put global low_power 1',
        revert: 'settings put global low_power 0',
        read: 'settings get global low_power',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    doze_enable: {
        category: 'battery', title: 'Doze Mode (Aggressive Idle)', icon: '💤',
        info: 'Enables Doze. Deeply suspends apps when screen off. Saves battery, delays notifications.',
        apply: 'cmd deviceidle enable',
        revert: 'cmd deviceidle disable',
        read: 'cmd deviceidle enabled',
        parse: (r) => /Deep:.\s*true/i.test(r) ? 'ON' : 'OFF',
        type: 'toggle', default: true
    },
    app_standby_rare: {
        category: 'battery', title: 'App Standby (Rare Bucket)', icon: '🧊',
        info: 'Forces unused apps into "rare" bucket. Limits their background jobs/network. Saves battery.',
        apply: 'cmd app standby set-bucket com.google.android.gms rare',
        revert: 'cmd app standby set-bucket com.google.android.gms active',
        read: 'cmd app standby get-bucket com.google.android.gms',
        parse: (r) => r.trim() || 'unknown',
        type: 'toggle', default: false
    },
    wake_lock_restrict: {
        category: 'battery', title: 'Restrict Wake Locks (SystemUI)', icon: '🔒',
        info: 'Prevents SystemUI from holding wake locks. Saves battery, may delay some notifications.',
        apply: 'cmd appops set com.android.systemui WAKE_LOCK ignore',
        revert: 'cmd appops set com.android.systemui WAKE_LOCK allow',
        read: 'cmd appops get com.android.systemui WAKE_LOCK',
        parse: (r) => /ignore/i.test(r) ? 'RESTRICTED' : 'ALLOWED',
        type: 'toggle', default: false
    },
    stay_awake_plugged: {
        category: 'battery', title: 'Stay Awake While Plugged In', icon: '🔌',
        info: 'Prevents screen from sleeping while charging (AC, USB, or Wireless).',
        apply: 'settings put global stay_on_while_plugged_in 7', // 1=USB, 2=AC, 4=Wireless, 7=All
        revert: 'settings put global stay_on_while_plugged_in 0',
        read: 'settings get global stay_on_while_plugged_in',
        parse: (r) => r.trim() !== '0' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    screen_timeout_30s: {
        category: 'battery', title: 'Screen Timeout (30s)', icon: '⏱️',
        info: 'Sets screen timeout to 30 seconds to save battery.',
        apply: 'settings put system screen_off_timeout 30000',
        revert: 'settings put system screen_off_timeout 60000',
        read: 'settings get system screen_off_timeout',
        parse: (r) => r.trim() === '30000' ? '30s' : (r.trim() || 'default'),
        type: 'toggle', default: false
    },
    adaptive_charging: {
        category: 'battery', title: 'Adaptive Charging', icon: '🛡️',
        info: 'Slows down charging overnight to preserve long-term battery health.',
        apply: 'settings put global adaptive_charging_enabled 1',
        revert: 'settings put global adaptive_charging_enabled 0',
        read: 'settings get global adaptive_charging_enabled',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },

    // === 🚀 PERFORMANCE ===
    max_cached_procs: {
        category: 'performance', title: 'Max Cached Processes', icon: '📦',
        info: 'Increases cached app limit. More apps stay in RAM for faster switching. Uses more RAM.',
        apply: 'cmd device_config put activity_manager max_cached_processes 64',
        revert: 'cmd device_config reset activity_manager max_cached_processes',
        read: 'cmd device_config get activity_manager max_cached_processes',
        parse: (r) => r.trim() || 'default',
        type: 'toggle', default: false
    },
    iorap_readahead: {
        category: 'performance', title: 'IORAP Readahead', icon: '⚡',
        info: 'Enables IORAP readahead for faster app launches. Pre-reads commonly used files at boot.',
        apply: 'cmd device_config put runtime_native_boot iorap_readahead_enable true',
        revert: 'cmd device_config put runtime_native_boot iorap_readahead_enable false',
        read: 'cmd device_config get runtime_native_boot iorap_readahead_enable',
        parse: (r) => r.trim() === 'true' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    iorap_perfetto: {
        category: 'performance', title: 'IORAP Perfetto Tracing', icon: '📊',
        info: 'Enables Perfetto-based boot tracing for IORAP. Learns app launch patterns for optimization.',
        apply: 'cmd device_config put runtime_native_boot iorap_perfetto_enable true',
        revert: 'cmd device_config put runtime_native_boot iorap_perfetto_enable false',
        read: 'cmd device_config get runtime_native_boot iorap_perfetto_enable',
        parse: (r) => r.trim() === 'true' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    phantom_procs: {
        category: 'performance', title: 'Max Phantom Processes (A12+)', icon: '👻',
        info: 'Increases phantom process limit. Prevents apps from being killed by Android 12+ restrictions.',
        apply: 'cmd device_config put activity_manager max_phantom_processes 32',
        revert: 'cmd device_config reset activity_manager max_phantom_processes',
        read: 'cmd device_config get activity_manager max_phantom_processes',
        parse: (r) => r.trim() || 'default',
        type: 'toggle', default: false
    },
    bg_dexopt: {
        category: 'performance', title: 'Background DEX Optimization', icon: '🧬',
        info: 'Triggers background DEX compilation. Speeds up future app launches. One-shot job.',
        apply: 'cmd package bg-dexopt-job',
        revert: null,
        read: null,
        parse: null,
        type: 'oneshot', default: false
    },
    trim_caches: {
        category: 'performance', title: 'Trim App Caches (4GB)', icon: '🧹',
        info: 'Clears cached data across all apps. Frees storage without losing app data.',
        apply: 'cmd package trim-caches 4G',
        revert: null,
        read: null,
        parse: null,
        type: 'oneshot', default: false
    },
    anim_window: {
        category: 'performance', title: 'Window Animation Scale', icon: '🎬',
        info: 'Reduces window animation duration. Makes UI feel snappier.',
        apply: 'settings put global window_animation_scale 0.5',
        revert: 'settings put global window_animation_scale 1.0',
        read: 'settings get global window_animation_scale',
        parse: (r) => r.trim() || '1.0',
        type: 'toggle', default: false
    },
    anim_transition: {
        category: 'performance', title: 'Transition Animation Scale', icon: '🎞️',
        info: 'Reduces transition animation duration. Faster app switching feel.',
        apply: 'settings put global transition_animation_scale 0.5',
        revert: 'settings put global transition_animation_scale 1.0',
        read: 'settings get global transition_animation_scale',
        parse: (r) => r.trim() || '1.0',
        type: 'toggle', default: false
    },
    anim_animator: {
        category: 'performance', title: 'Animator Duration Scale', icon: '✨',
        info: 'Reduces animator duration. Faster UI element animations.',
        apply: 'settings put global animator_duration_scale 0.5',
        revert: 'settings put global animator_duration_scale 1.0',
        read: 'settings get global animator_duration_scale',
        parse: (r) => r.trim() || '1.0',
        type: 'toggle', default: false
    },
    force_4x_msaa: {
        category: 'performance', title: 'Force 4x MSAA', icon: '🎨',
        info: 'Forces 4x Multisample Anti-Aliasing in OpenGL ES 2.0 apps. Better visuals, higher GPU load.',
        apply: 'settings put global force_4x_msaa 1',
        revert: 'settings put global force_4x_msaa 0',
        read: 'settings get global force_4x_msaa',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    disable_usb_audio_routing: {
        category: 'performance', title: 'Disable USB Audio Auto-Routing', icon: '🔌',
        info: 'Prevents Android from automatically switching audio to USB devices. Fixes audio lag in games.',
        apply: 'settings put global usb_audio_automatic_routing_disabled 1',
        revert: 'settings put global usb_audio_automatic_routing_disabled 0',
        read: 'settings get global usb_audio_automatic_routing_disabled',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    gfxinfo_framerate: {
        category: 'performance', title: 'Show GPU Rendering Profile', icon: '📊',
        info: 'Displays on-screen bars showing frame rendering times. Great for performance monitoring.',
        apply: 'settings put global gfxinfo_framerate 1',
        revert: 'settings put global gfxinfo_framerate 0',
        read: 'settings get global gfxinfo_framerate',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    zram_compaction: {
        category: 'performance', title: 'Force ZRAM Compaction', icon: '💾',
        info: 'Enables aggressive memory compaction in ZRAM to free up usable RAM during heavy gaming.',
        apply: 'cmd device_config put activity_manager use_compaction true',
        revert: 'cmd device_config reset activity_manager use_compaction',
        read: 'cmd device_config get activity_manager use_compaction',
        parse: (r) => r.trim() === 'true' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    skia_gl_renderer: {
        category: 'performance', title: 'Force Skia OpenGL Renderer', icon: '🖼️',
        info: 'Forces the HWUI to use OpenGL (skiagl) instead of Vulkan. Preferred for gaming compatibility.',
        apply: 'settings put global debug.hwui.renderer "skiagl"',
        revert: 'settings put global debug.hwui.renderer "skiavk"',
        read: 'settings get global debug.hwui.renderer',
        parse: (r) => /skiagl/i.test(r) ? 'OPENGL' : 'OTHER',
        type: 'toggle', default: false
    },
    restrict_background_network: {
        category: 'performance', title: 'Restrict Background Network', icon: '🛑',
        info: 'Blocks background apps from using network, preventing wakeups and resource contention during gaming.',
        apply: 'cmd netpolicy set restrict-background true',
        revert: 'cmd netpolicy set restrict-background false',
        read: 'cmd netpolicy get restrict-background',
        parse: (r) => /true/i.test(r) ? 'RESTRICTED' : 'ALLOWED',
        type: 'toggle', default: false
    },

    // === ⚖️ BALANCED / UI ===
    display_density: {
        category: 'balance', title: 'Display Density (DPI)', icon: '🖥️',
        info: 'Sets display density. Lower = larger UI elements, higher = more screen real estate.',
        apply: 'cmd display set-density 420',
        revert: 'cmd display set-density 0',
        read: 'cmd display get-density',
        parse: (r) => r.trim() || 'default',
        type: 'toggle', default: false
    },
    stats_logging: {
        category: 'balance', title: 'Stats Logging', icon: '📈',
        info: 'Enables system stats logging. Useful for debugging, minor overhead.',
        apply: 'cmd stats enable-logging',
        revert: 'cmd stats disable-logging',
        read: 'cmd stats',
        parse: (r) => /enabled/i.test(r) ? 'ON' : 'OFF',
        type: 'toggle', default: true
    },
    overlay_list: {
        category: 'balance', title: 'Refresh Runtime Overlays', icon: '🎨',
        info: 'Refreshes runtime resource overlays. One-shot command to apply theme changes.',
        apply: 'cmd overlay list',
        revert: null,
        read: null,
        parse: null,
        type: 'oneshot', default: false
    },
    dark_mode: {
        category: 'balance', title: 'Force Dark Mode', icon: '🌙',
        info: 'Forces system-wide dark theme across all apps that support it.',
        apply: 'cmd uimode night yes',
        revert: 'cmd uimode night no',
        read: 'cmd uimode night',
        parse: (r) => /yes/i.test(r) ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    disable_auto_brightness: {
        category: 'balance', title: 'Disable Auto Brightness', icon: '☀️',
        info: 'Locks manual brightness, preventing the system from adjusting it automatically (saves CPU cycles).',
        apply: 'settings put system screen_brightness_mode 0',
        revert: 'settings put system screen_brightness_mode 1',
        read: 'settings get system screen_brightness_mode',
        parse: (r) => r.trim() === '0' ? 'MANUAL' : 'AUTO',
        type: 'toggle', default: false
    },
    immersive_mode: {
        category: 'balance', title: 'Immersive Mode (Full)', icon: '📺',
        info: 'Hides both status and navigation bars. Swipe from edges to reveal them.',
        apply: 'settings put secure policy_control immersive.full=*',
        revert: 'settings put secure policy_control null',
        read: 'settings get secure policy_control',
        parse: (r) => r.includes('immersive.full=*') ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    font_scale_large: {
        category: 'balance', title: 'Larger Font Scale (1.15x)', icon: '🔤',
        info: 'Increases system font size slightly for better readability.',
        apply: 'settings put system font_scale 1.15',
        revert: 'settings put system font_scale 1.0',
        read: 'settings get system font_scale',
        parse: (r) => r.trim() === '1.15' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },

    // === 🛡️ PRIVACY / SECURITY ===
    disable_usage_stats: {
        category: 'privacy', title: 'Disable Usage Stats Collection', icon: '📉',
        info: 'Prevents Android from collecting and sending app usage statistics.',
        apply: 'settings put secure statsd_enabled 0',
        revert: 'settings put secure statsd_enabled 1',
        read: 'settings get secure statsd_enabled',
        parse: (r) => r.trim() === '0' ? 'DISABLED' : 'ENABLED',
        type: 'toggle', default: false
    },
    adb_notify_disable: {
        category: 'privacy', title: 'Hide USB Debugging Notification', icon: '🤫',
        info: 'Removes the persistent "USB debugging connected" notification.',
        apply: 'settings put global adb_notify 0',
        revert: 'settings put global adb_notify 1',
        read: 'settings get global adb_notify',
        parse: (r) => r.trim() === '0' ? 'HIDDEN' : 'VISIBLE',
        type: 'toggle', default: false
    },
    disable_automatic_updates: {
        category: 'privacy', title: 'Disable Automatic System Updates', icon: '🚫',
        info: 'Prevents the system from automatically downloading and installing OTA updates.',
        apply: 'settings put global ota_disable_automatic_update 1',
        revert: 'settings put global ota_disable_automatic_update 0',
        read: 'settings get global ota_disable_automatic_update',
        parse: (r) => r.trim() === '1' ? 'DISABLED' : 'ENABLED',
        type: 'toggle', default: false
    },

    // === 🛠️ DEVELOPER / DEBUGGING ===
    show_touches: {
        category: 'developer', title: 'Show Touches / Taps', icon: '👆',
        info: 'Displays a visual indicator (white circle) where you touch the screen.',
        apply: 'settings put system show_touches 1',
        revert: 'settings put system show_touches 0',
        read: 'settings get system show_touches',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    pointer_location: {
        category: 'developer', title: 'Pointer Location', icon: '📍',
        info: 'Shows current touch coordinates and path. Useful for testing and gaming analysis.',
        apply: 'settings put system pointer_location 1',
        revert: 'settings put system pointer_location 0',
        read: 'settings get system pointer_location',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    show_layout_bounds: {
        category: 'developer', title: 'Show Layout Bounds', icon: '📐',
        info: 'Draws rectangles around UI elements to show margins, padding, and clipping.',
        apply: 'settings put global show_layout_bounds 1',
        revert: 'settings put global show_layout_bounds 0',
        read: 'settings get global show_layout_bounds',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    show_cpu_usage: {
        category: 'developer', title: 'Show CPU Usage Overlay', icon: '⚙️',
        info: 'Displays a real-time overlay of CPU usage per core and load.',
        apply: 'settings put system show_cpu_usage 1',
        revert: 'settings put system show_cpu_usage 0',
        read: 'settings get system show_cpu_usage',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    enable_adb_wifi: {
        category: 'developer', title: 'Enable ADB over WiFi', icon: '📶',
        info: 'Allows wireless debugging connection without USB cable (requires initial USB setup).',
        apply: 'settings put global adb_wifi_enabled 1',
        revert: 'settings put global adb_wifi_enabled 0',
        read: 'settings get global adb_wifi_enabled',
        parse: (r) => r.trim() === '1' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },
    keep_screen_on_dev: {
        category: 'developer', title: 'Keep Screen On (Developer)', icon: '☀️',
        info: 'Alternative to battery stay-awake, forces screen to never sleep via max timeout.',
        apply: 'settings put system screen_off_timeout 2147483647',
        revert: 'settings put system screen_off_timeout 60000',
        read: 'settings get system screen_off_timeout',
        parse: (r) => r.trim() === '2147483647' ? 'ON' : 'OFF',
        type: 'toggle', default: false
    },

    // === ⚡ SYSTEM ONE-SHOT ACTIONS ===
    battery_reset: {
        category: 'system', title: 'Reset Battery Stats', icon: '🔋',
        info: 'Resets the battery statistics tracker. Does not physically calibrate the battery.',
        apply: 'cmd battery reset',
        revert: null,
        read: null,
        parse: null,
        type: 'oneshot', default: false
    },
    location_toggle_off: {
        category: 'system', title: 'Disable Location Globally', icon: '📍',
        info: 'Turns off all location services instantly via shell command.',
        apply: 'cmd location set-enabled false',
        revert: 'cmd location set-enabled true',
        read: 'cmd location is-enabled',
        parse: (r) => /true/i.test(r) ? 'ON' : 'OFF',
        type: 'toggle', default: true
    },
    refresh_overlays: {
        category: 'system', title: 'Force Refresh Overlays', icon: '🎨',
        info: 'Forces the system to reload all runtime resource overlays (themes).',
        apply: 'cmd overlay reload',
        revert: null,
        read: null,
        parse: null,
        type: 'oneshot', default: false
    },
    clear_dns_cache: {
        category: 'system', title: 'Clear DNS Cache', icon: '🌐',
        info: 'Flushes the system DNS resolver cache. Fixes weird connectivity issues.',
        apply: 'cmd resolver flushdefaultnet',
        revert: null,
        read: null,
        parse: null,
        type: 'oneshot', default: false
    }
};

// 🎯 PRESETS — combine multiple tweaks
const cmdPresets = {
    gaming: {
        label: '🎮 Gaming Mode',
        color: '#ef4444',
        keys: [
            'wifi_hiperf', 'max_cached_procs', 'iorap_readahead', 'iorap_perfetto', 
            'phantom_procs', 'anim_window', 'anim_transition', 'anim_animator', 
            'disable_usb_audio_routing', 'force_4x_msaa', 'skia_gl_renderer', 
            'restrict_background_network', 'zram_compaction'
        ],
        actions: { 
            doze_enable: 'revert', 
            wake_lock_restrict: 'revert',
            disable_auto_brightness: 'apply' // Lock brightness to prevent OS interference
        }
    },
    battery: {
        label: '🔋 Battery Saver',
        color: '#10b981',
        keys: [
            'low_power', 'doze_enable', 'wake_lock_restrict', 'captive_portal_disable', 
            'screen_timeout_30s', 'adaptive_charging', 'restrict_background_network'
        ],
        actions: { 
            wifi_hiperf: 'revert', 
            anim_window: 'revert', 
            anim_transition: 'revert', 
            anim_animator: 'revert', 
            mobile_data_always_on: 'revert',
            skia_gl_renderer: 'revert'
        }
    },
    balanced: {
        label: '⚖️ Balanced',
        color: '#3b82f6',
        keys: [
            'iorap_readahead', 'iorap_perfetto', 'max_cached_procs', 'stats_logging', 
            'bluetooth_absolute_volume', 'zram_compaction'
        ],
        actions: {}
    },
    privacy: {
        label: '🛡️ Privacy Focus',
        color: '#8b5cf6',
        keys: [
            'disable_usage_stats', 'adb_notify_disable', 'disable_oem_unlock', 
            'disable_automatic_updates', 'captive_portal_disable', 'location_toggle_off'
        ],
        actions: { wifi_scan_always: 'revert' }
    },
    ui_clean: {
        label: '🎨 Clean UI',
        color: '#f59e0b',
        keys: [
            'dark_mode', 'immersive_mode', 'anim_window', 'anim_transition', 
            'anim_animator', 'disable_auto_brightness'
        ],
        actions: { 
            show_touches: 'revert', 
            pointer_location: 'revert', 
            show_layout_bounds: 'revert', 
            show_cpu_usage: 'revert' 
        }
    },
    developer: {
        label: '🛠️ Developer Debug',
        color: '#64748b',
        keys: [
            'show_touches', 'pointer_location', 'show_layout_bounds', 'show_cpu_usage', 
            'gfxinfo_framerate', 'enable_adb_wifi', 'keep_screen_on_dev'
        ],
        actions: {}
    }
};

let cmdTweakStates = {};
// =====================================================================
// 🔍 DYNAMIC TUNABLE SCANNER
// =====================================================================
const TUNABLE_CATEGORIES = {
    battery: {
        label: '🔋 Battery', color: '#10b981',
        keywords: ['power', 'battery', 'wakeup', 'wake_lock', 'sleep', 'suspend', 'low_power', 'powersave', 'idle', 'standby', 'runtime_pm', 'autosuspend', 'enable'],
        infoFn: (p) => p.includes('wakeup') ? 'Wake-up source control. Disable unused sources to save battery.' :
                      p.includes('autosuspend') ? 'Runtime PM. Suspends idle devices to save power.' :
                      'Battery-related tunable.'
    },
    performance: {
        label: '🚀 Performance', color: '#ef4444',
        keywords: ['cpufreq', 'devfreq', 'scaling', 'governor', 'performance', 'boost', 'gpu', 'thermal', 'max_freq', 'min_freq', 'sched', 'uclamp', 'nr_run', 'bus', 'bandwidth'],
        infoFn: (p) => p.includes('cpufreq') ? 'CPU frequency scaling. Higher min = snappier, lower max = cooler.' :
                      p.includes('sched') ? 'Scheduler tunable. Affects task placement and CPU hints.' :
                      p.includes('thermal') ? 'Thermal threshold. Lower = earlier throttling.' :
                      'Performance tunable.'
    },
    balance: {
        label: '⚖️ Balanced', color: '#3b82f6',
        keywords: ['vm', 'kernel', 'io', 'net', 'fs', 'debug', 'qos', 'block'],
        infoFn: (p) => p.includes('/vm/') ? 'Virtual memory tunable.' :
                      p.includes('/kernel/') ? 'Kernel behavior tunable.' :
                      p.includes('/block/') ? 'I/O scheduler tunable.' :
                      'General system tunable.'
    }
};

let discoveredTunables = [];
let tunableScanRunning = false;

async function scanTunables() {
    if (tunableScanRunning) return;
    tunableScanRunning = true;
    const container = document.getElementById('tunable-container');
    const statusEl = document.getElementById('tunable-status');
    const scanBtn = document.getElementById('tunable-scan-btn');
    if (!container || !statusEl) { tunableScanRunning = false; return; }

    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Scanning...';
    statusEl.innerHTML = '<span style="color:#8b5cf6;">🔍 Scanning /sys, /proc, /dev...</span>';
    container.innerHTML = '';
    discoveredTunables = [];

    const roots = ['/sys', '/proc', '/dev'];
    let allFiles = [];

    for (const root of roots) {
        try {
            statusEl.innerHTML = `<span style="color:#8b5cf6;">🔍 Scanning ${root}...</span>`;
            const cmd = `find ${root} -maxdepth 6 -type f -readable 2>/dev/null | head -n 2000`;
            const res = await execFn(`su -c "${cmd}"`, 20000);
            if (res) {
                const files = res.split('\n').map(f => f.trim()).filter(f => f);
                allFiles = allFiles.concat(files);
            }
        } catch (e) { console.warn(`Scan failed for ${root}:`, e); }
    }

    const noisePatterns = [
        /\/log$/, /\/uevent$/, /\/aliases$/, /\/modalias$/, /\/of_node\//,
        /\/subsystem$/, /\/driver\//, /\/module\//, /\.bin$/, /\.ko$/, /\.img$/,
        /\/proc\/[0-9]+/, /\/dev\/socket/, /\/dev\/__properties__/, /\/dev\/ashmem/,
        /\/dev\/binder/, /\/dev\/hwbinder/, /\/dev\/vndbinder/
    ];

    const candidates = allFiles.filter(f => !noisePatterns.some(p => p.test(f)));

    for (const path of candidates) {
        const lp = path.toLowerCase();
        let category = 'balance';
        let matched = false;
        for (const kw of TUNABLE_CATEGORIES.performance.keywords) {
            if (lp.includes(kw)) { category = 'performance'; matched = true; break; }
        }
        if (!matched) {
            for (const kw of TUNABLE_CATEGORIES.battery.keywords) {
                if (lp.includes(kw)) { category = 'battery'; matched = true; break; }
            }
        }
        const cat = TUNABLE_CATEGORIES[category];
        discoveredTunables.push({
            path, category, label: cat.label, color: cat.color,
            info: cat.infoFn(path), currentValue: null, loaded: false
        });
    }

    const order = { performance: 0, battery: 1, balance: 2 };
    discoveredTunables.sort((a, b) => order[a.category] - order[b.category]);

    statusEl.innerHTML = `<span style="color:#10b981;">✓ Found ${discoveredTunables.length} tunables</span>`;
    renderTunables('all');
    scanBtn.disabled = false;
    scanBtn.textContent = '🔄 Re-scan';
    tunableScanRunning = false;
}

function renderTunables(filter = 'all') {
    const container = document.getElementById('tunable-container');
    if (!container) return;
    container.innerHTML = '';
    const filtered = filter === 'all' ? discoveredTunables : discoveredTunables.filter(t => t.category === filter);

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#666;padding:20px;font-size:12px;">No tunables found. Click "Scan All" first.</div>';
        return;
    }

    const CHUNK = 80;
    let rendered = 0;
    function renderChunk() {
        const end = Math.min(rendered + CHUNK, filtered.length);
        for (let i = rendered; i < end; i++) {
            const t = filtered[i];
            const row = document.createElement('div');
            row.style.cssText = 'background:rgba(0,0,0,0.25);border-radius:10px;padding:10px;margin-bottom:8px;border-left:3px solid ' + t.color + ';';
            row.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;">
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                            <span style="background:${t.color}22;color:${t.color};padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;">${t.label}</span>
                            <span style="color:#8b92b4;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.path}">${t.path.split('/').pop()}</span>
                        </div>
                        <div style="color:#555;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.path}">${t.path}</div>
                    </div>
                    <span id="tunable-val-${i}" style="color:#f59e0b;font-size:11px;font-weight:bold;white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis;">...</span>
                </div>
                <div style="color:#8b92b4;font-size:9px;line-height:1.3;margin-bottom:6px;">${t.info}</div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <input type="text" id="tunable-input-${i}" placeholder="new value"
                           style="flex:1;padding:5px 8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:5px;color:#fff;font-size:11px;outline:none;">
                    <button class="tunable-apply-btn" data-idx="${i}"
                            style="padding:5px 10px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;">Apply</button>
                </div>
                <div id="tunable-fb-${i}" style="font-size:9px;margin-top:4px;min-height:12px;color:#666;"></div>
            `;
            container.appendChild(row);
            loadTunableValue(i, t);
        }
        rendered = end;
        container.querySelectorAll('.tunable-apply-btn').forEach(btn => {
            if (!btn.dataset.bound) {
                btn.dataset.bound = '1';
                btn.addEventListener('click', () => applyTunable(parseInt(btn.dataset.idx)));
            }
        });
        if (rendered < filtered.length) {
            const moreBtn = document.createElement('button');
            moreBtn.textContent = `Load more (${filtered.length - rendered} remaining)`;
            moreBtn.style.cssText = 'width:100%;padding:8px;background:rgba(139,92,246,0.2);color:#c4b5fd;border:1px solid rgba(139,92,246,0.4);border-radius:6px;font-size:11px;cursor:pointer;margin-top:4px;';
            moreBtn.onclick = () => { moreBtn.remove(); renderChunk(); };
            container.appendChild(moreBtn);
        }
    }
    renderChunk();
}

async function loadTunableValue(idx, t) {
    const valEl = document.getElementById(`tunable-val-${idx}`);
    const inputEl = document.getElementById(`tunable-input-${idx}`);
    if (!valEl) return;
    try {
        const res = await execFn(`cat ${t.path} 2>/dev/null`, 2000);
        const val = (res || '').trim().replace(/\n/g, ' ').slice(0, 60);
        t.currentValue = val; t.loaded = true;
        if (valEl) valEl.textContent = val || '(empty)';
        if (inputEl) inputEl.placeholder = val || 'enter value';
    } catch (e) {
        if (valEl) { valEl.textContent = '(unreadable)'; valEl.style.color = '#666'; }
    }
}

async function applyTunable(idx) {
    const t = discoveredTunables[idx];
    if (!t) return;
    const inputEl = document.getElementById(`tunable-input-${idx}`);
    const fbEl = document.getElementById(`tunable-fb-${idx}`);
    const valEl = document.getElementById(`tunable-val-${idx}`);
    const newVal = inputEl.value.trim();
    if (!newVal) { fbEl.style.color = '#f59e0b'; fbEl.textContent = '⚠ Enter a value first'; return; }

    fbEl.style.color = '#8b92b4'; fbEl.textContent = 'Applying...';
    try {
        const safeVal = newVal.replace(/'/g, "'\\''");
        await execFn(`su -c "echo '${safeVal}' > ${t.path}"`, 5000);
        const verify = await execFn(`cat ${t.path} 2>/dev/null`, 2000);
        const actual = (verify || '').trim().replace(/\n/g, ' ').slice(0, 60);
        if (actual === newVal || actual.includes(newVal)) {
            fbEl.style.color = '#10b981'; fbEl.textContent = `✓ Applied: ${actual}`;
            t.currentValue = actual;
            if (valEl) valEl.textContent = actual;
            inputEl.value = '';
        } else {
            fbEl.style.color = '#ef4444'; fbEl.textContent = `✗ Failed (got: ${actual || 'no change'})`;
        }
    } catch (e) {
        fbEl.style.color = '#ef4444'; fbEl.textContent = `✗ Error: ${e.message || 'write denied'}`;
    }
}

// =====================================================================
// 🎨 UI FUNCTIONS
// =====================================================================
function bindClickHandler() {
    const btn = document.getElementById('performance-test-btn');
    if (!btn) { console.warn('TweakAnalyzer: Button not found'); return; }
    btn.addEventListener('click', () => showPerfModal());
}

async function readCurrentVmValues() {
    for (const key in vmTweaks) {
        const tweak = vmTweaks[key];
        try {
            const val = await execFn(`cat ${tweak.path} 2>/dev/null`, 3000);
            tweak.currentValue = parseInt(val?.trim()) || tweak.default;
        } catch (e) { tweak.currentValue = tweak.default; }
    }
}

async function readCmdTweakStates() {
    for (const key in cmdTweaks) {
        const t = cmdTweaks[key];
        if (!t.read) { cmdTweakStates[key] = 'N/A'; continue; }
        try {
            const res = await execFn(t.read, 3000);
            cmdTweakStates[key] = t.parse ? t.parse(res) : (res || '').trim() || 'N/A';
        } catch (e) { cmdTweakStates[key] = 'ERR'; }
    }
}

function formatKbToMb(kb) {
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${kb} kB`;
}

function showPerfModal() {
    const existing = document.getElementById('perf-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'perf-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';

    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(135deg,#1a1f3a,#2d3561);border:2px solid #8b5cf6;border-radius:20px;padding:24px;width:95%;max-width:500px;max-height:90vh;overflow-y:auto;';
    box.innerHTML = `
        <h3 style="color:#8b5cf6;margin:0 0 5px;font-size:20px;text-align:center;">🛠️ Tweak Analyzer</h3>
        <p style="color:#8b92b4;font-size:12px;text-align:center;margin-bottom:20px;">VM tuning, CMD tweaks, dynamic tunables & benchmarks</p>

        <!-- VM TWEAKS -->
        <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.3);border-radius:14px;padding:16px;margin-bottom:15px;">
            <div style="color:#c4b5fd;font-size:13px;font-weight:700;margin-bottom:12px;text-align:center;">🎛️ VM Memory Tweaks</div>
            <div id="vm-tweaks-container"></div>
        </div>

        <!-- CMD TWEAKS -->
        <div style="background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.3);border-radius:14px;padding:16px;margin-bottom:15px;">
            <div style="color:#67e8f9;font-size:13px;font-weight:700;margin-bottom:8px;text-align:center;">📡 CMD System Tweaks</div>
            <div style="color:#8b92b4;font-size:10px;text-align:center;margin-bottom:10px;line-height:1.4;">
                Apply Android <code style="color:#06b6d4;">cmd</code> & <code style="color:#06b6d4;">settings</code> tweaks for performance, battery & balance.
            </div>
            <div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap;">
                <button class="cmd-preset-btn" data-preset="gaming" style="flex:1;padding:7px;background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">🎮 Gaming</button>
                <button class="cmd-preset-btn" data-preset="battery" style="flex:1;padding:7px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">🔋 Battery</button>
                <button class="cmd-preset-btn" data-preset="balanced" style="flex:1;padding:7px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">⚖️ Balanced</button>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:10px;">
                <button class="cmd-filter-btn" data-filter="all" style="flex:1;padding:5px;background:rgba(139,92,246,0.3);color:#fff;border:none;border-radius:5px;font-size:10px;cursor:pointer;">All</button>
                <button class="cmd-filter-btn" data-filter="network" style="flex:1;padding:5px;background:rgba(6,182,212,0.2);color:#67e8f9;border:none;border-radius:5px;font-size:10px;cursor:pointer;">📶 Net</button>
                <button class="cmd-filter-btn" data-filter="battery" style="flex:1;padding:5px;background:rgba(16,185,129,0.2);color:#10b981;border:none;border-radius:5px;font-size:10px;cursor:pointer;">🔋 Bat</button>
                <button class="cmd-filter-btn" data-filter="performance" style="flex:1;padding:5px;background:rgba(239,68,68,0.2);color:#ef4444;border:none;border-radius:5px;font-size:10px;cursor:pointer;">🚀 Perf</button>
                <button class="cmd-filter-btn" data-filter="balance" style="flex:1;padding:5px;background:rgba(59,130,246,0.2);color:#3b82f6;border:none;border-radius:5px;font-size:10px;cursor:pointer;">⚖️ Bal</button>
            </div>
            <button id="cmd-refresh-btn" style="width:100%;padding:6px;background:rgba(6,182,212,0.2);color:#67e8f9;border:1px solid rgba(6,182,212,0.4);border-radius:6px;font-size:10px;cursor:pointer;margin-bottom:8px;">🔄 Refresh States</button>
            <div id="cmd-tweaks-container" style="max-height:400px;overflow-y:auto;padding:2px;"></div>
        </div>

        <!-- DYNAMIC TUNABLE SCANNER -->
        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:14px;padding:16px;margin-bottom:15px;">
            <div style="color:#fca5a5;font-size:13px;font-weight:700;margin-bottom:8px;text-align:center;">🔍 Dynamic Tunable Scanner</div>
            <div style="color:#8b92b4;font-size:10px;text-align:center;margin-bottom:10px;line-height:1.4;">
                Auto-discovers tunables from <code style="color:#8b5cf6;">/sys</code>, <code style="color:#8b5cf6;">/proc</code>, <code style="color:#8b5cf6;">/dev</code> via <code style="color:#8b5cf6;">find</code>.
            </div>
            <div style="display:flex;gap:6px;margin-bottom:10px;">
                <button id="tunable-scan-btn" style="flex:1;padding:8px;background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🔍 Scan All</button>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:10px;">
                <button class="tunable-filter-btn" data-filter="all" style="flex:1;padding:5px;background:rgba(139,92,246,0.3);color:#fff;border:none;border-radius:5px;font-size:10px;cursor:pointer;">All</button>
                <button class="tunable-filter-btn" data-filter="battery" style="flex:1;padding:5px;background:rgba(16,185,129,0.2);color:#10b981;border:none;border-radius:5px;font-size:10px;cursor:pointer;">🔋 Battery</button>
                <button class="tunable-filter-btn" data-filter="performance" style="flex:1;padding:5px;background:rgba(239,68,68,0.2);color:#ef4444;border:none;border-radius:5px;font-size:10px;cursor:pointer;">🚀 Perf</button>
                <button class="tunable-filter-btn" data-filter="balance" style="flex:1;padding:5px;background:rgba(59,130,246,0.2);color:#3b82f6;border:none;border-radius:5px;font-size:10px;cursor:pointer;">⚖️ Balance</button>
            </div>
            <div id="tunable-status" style="text-align:center;font-size:11px;color:#666;margin-bottom:8px;min-height:18px;">
                <span style="color:#8b92b4;">⚙️ Click "Scan All" to discover tunables</span>
            </div>
            <div id="tunable-container" style="max-height:300px;overflow-y:auto;padding:4px;"></div>
        </div>

        <!-- Duration Slider -->
        <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:16px;margin-bottom:15px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <label style="color:#fff;font-size:13px;font-weight:600;">⏱️ Benchmark Duration</label>
                <span id="duration-display" style="color:#8b5cf6;font-size:14px;font-weight:bold;">30 sec</span>
            </div>
            <input type="range" id="duration-slider" min="10" max="300" step="10" value="30"
                   style="width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;outline:none;-webkit-appearance:none;">
            <div style="display:flex;justify-content:space-between;margin-top:6px;">
                <span style="color:#666;font-size:10px;">10s</span>
                <span style="color:#666;font-size:10px;">1 min</span>
                <span style="color:#666;font-size:10px;">3 min</span>
                <span style="color:#666;font-size:10px;">5 min</span>
            </div>
        </div>

        <div id="perf-status" style="text-align:center;font-size:12px;color:#666;margin-bottom:15px;min-height:40px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
            <span style="color:#8b5cf6;">⚙️ Ready</span>
        </div>
        <div id="perf-progress" style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;margin-bottom:15px;overflow:hidden;display:none;">
            <div id="perf-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#8b5cf6,#06b6d4);transition:width 0.3s;"></div>
        </div>
        <div id="perf-results" style="display:none;flex-direction:column;gap:10px;margin-bottom:15px;"></div>
        <button id="perf-start-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">🚀 Start Full Suite</button>
        <button id="perf-close-btn" style="width:100%;margin-top:8px;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">Close</button>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    buildVmTweakUI();
    readCurrentVmValues().then(() => refreshVmTweakUI());

    buildCmdTweakUI('all');
    readCmdTweakStates().then(() => refreshCmdTweakUI());

    document.querySelectorAll('.tunable-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tunable-filter-btn').forEach(b => {
                b.style.background = 'rgba(255,255,255,0.1)'; b.style.color = '#8b92b4';
            });
            btn.style.background = 'rgba(139,92,246,0.3)'; btn.style.color = '#fff';
            renderTunables(btn.dataset.filter);
        });
    });
    document.getElementById('tunable-scan-btn').onclick = scanTunables;

    document.querySelectorAll('.cmd-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cmd-filter-btn').forEach(b => {
                b.style.background = 'rgba(255,255,255,0.1)'; b.style.color = '#8b92b4';
            });
            btn.style.background = 'rgba(6,182,212,0.3)'; btn.style.color = '#fff';
            buildCmdTweakUI(btn.dataset.filter);
            refreshCmdTweakUI();
        });
    });

    document.querySelectorAll('.cmd-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => applyCmdPreset(btn.dataset.preset));
    });

    document.getElementById('cmd-refresh-btn').onclick = async () => {
        const btn = document.getElementById('cmd-refresh-btn');
        btn.disabled = true; btn.textContent = '⏳ Reading...';
        await readCmdTweakStates();
        refreshCmdTweakUI();
        btn.disabled = false; btn.textContent = '🔄 Refresh States';
    };

    const slider = document.getElementById('duration-slider');
    const display = document.getElementById('duration-display');
    slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        testDuration = val * 1000;
        if (val >= 60) {
            const mins = val / 60;
            display.textContent = `${mins} min${mins > 1 ? 's' : ''}`;
        } else {
            display.textContent = `${val} sec`;
        }
    });

    document.getElementById('perf-close-btn').onclick = () => { testRunning = false; modal.remove(); };
    document.getElementById('perf-start-btn').onclick = async () => {
        if (testRunning) return;
        testRunning = true;
        document.getElementById('perf-start-btn').disabled = true;
        document.getElementById('perf-start-btn').textContent = '⏳ Running...';
        await runFullSuite();
        document.getElementById('perf-start-btn').disabled = false;
        document.getElementById('perf-start-btn').textContent = '🔄 Run Again';
    };
}

function buildVmTweakUI() {
    const container = document.getElementById('vm-tweaks-container');
    if (!container) return;
    container.innerHTML = '';
    for (const key in vmTweaks) {
        const tweak = vmTweaks[key];
        const row = document.createElement('div');
        row.style.cssText = 'background:rgba(0,0,0,0.25);border-radius:10px;padding:12px;margin-bottom:10px;';
        row.id = `vm-row-${key}`;
        row.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="color:#fff;font-size:13px;font-weight:600;">${tweak.icon} ${tweak.title}</div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span style="color:#666;font-size:10px;">Current:</span>
                    <span id="vm-current-${key}" style="color:#f59e0b;font-size:12px;font-weight:bold;">...</span>
                </div>
            </div>
            <div style="color:#8b92b4;font-size:10px;line-height:1.4;margin-bottom:10px;">${tweak.info}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="color:#8b92b4;font-size:11px;">New Value:</span>
                <span id="vm-target-${key}" style="color:#8b5cf6;font-size:13px;font-weight:bold;">${tweak.default}${tweak.unit}</span>
            </div>
            <input type="range" id="vm-slider-${key}" min="${tweak.min}" max="${tweak.max}" step="${tweak.step}" value="${tweak.default}"
                   style="width:100%;height:5px;background:rgba(255,255,255,0.15);border-radius:3px;outline:none;-webkit-appearance:none;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <div style="display:flex;gap:4px;flex:1;">
                    <span style="color:#555;font-size:9px;">${tweak.min}${tweak.unit}</span>
                    <span style="flex:1;"></span>
                    <span style="color:#555;font-size:9px;">${tweak.max}${tweak.unit}</span>
                </div>
                <button class="vm-apply-btn" data-key="${key}" style="padding:6px 14px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">Apply</button>
            </div>
            <div id="vm-feedback-${key}" style="text-align:center;font-size:10px;margin-top:6px;min-height:14px;color:#666;"></div>
        `;
        container.appendChild(row);
        const sliderEl = row.querySelector(`#vm-slider-${key}`);
        const targetEl = row.querySelector(`#vm-target-${key}`);
        sliderEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (key === 'min_free_kbytes') targetEl.textContent = `${val}${tweak.unit} (${formatKbToMb(val)})`;
            else targetEl.textContent = `${val}${tweak.unit}`;
        });
        row.querySelector('.vm-apply-btn').addEventListener('click', () => applyVmTweak(key));
    }
}

function refreshVmTweakUI() {
    for (const key in vmTweaks) {
        const tweak = vmTweaks[key];
        const currentEl = document.getElementById(`vm-current-${key}`);
        if (currentEl) {
            if (key === 'min_free_kbytes') currentEl.textContent = `${tweak.currentValue}${tweak.unit} (${formatKbToMb(tweak.currentValue)})`;
            else currentEl.textContent = `${tweak.currentValue}${tweak.unit}`;
            currentEl.style.color = tweak.currentValue >= tweak.default ? '#10b981' : '#f59e0b';
        }
    }
}

async function applyVmTweak(key) {
    const tweak = vmTweaks[key];
    const sliderEl = document.getElementById(`vm-slider-${key}`);
    const feedbackEl = document.getElementById(`vm-feedback-${key}`);
    const applyBtn = document.querySelector(`.vm-apply-btn[data-key="${key}"]`);
    if (!sliderEl || !feedbackEl) return;
    const targetVal = parseInt(sliderEl.value);
    applyBtn.disabled = true; applyBtn.textContent = '...';
    feedbackEl.style.color = '#8b92b4'; feedbackEl.textContent = 'Applying...';
    try {
        const currentRaw = await execFn(`cat ${tweak.path} 2>/dev/null`, 3000);
        const currentVal = parseInt(currentRaw?.trim()) || 0;
        if (currentVal === targetVal) {
            feedbackEl.style.color = '#8b92b4'; feedbackEl.textContent = '✓ Already at target value';
        } else if (currentVal > targetVal) {
            feedbackEl.style.color = '#f59e0b'; feedbackEl.textContent = `⚠ Current (${currentVal}) > target. Skipped.`;
        } else {
            await execFn(`su -c "echo ${targetVal} > ${tweak.path}"`, 5000);
            const verify = await execFn(`cat ${tweak.path} 2>/dev/null`, 3000);
            const newVal = parseInt(verify?.trim()) || 0;
            if (newVal === targetVal) {
                feedbackEl.style.color = '#10b981'; feedbackEl.textContent = `✓ Applied: ${currentVal} → ${targetVal}${tweak.unit}`;
                tweak.currentValue = newVal; refreshVmTweakUI();
            } else {
                feedbackEl.style.color = '#ef4444'; feedbackEl.textContent = `✗ Failed to apply (got ${newVal})`;
            }
        }
    } catch (e) {
        feedbackEl.style.color = '#ef4444'; feedbackEl.textContent = `✗ Error: ${e.message || 'unknown'}`;
    } finally {
        applyBtn.disabled = false; applyBtn.textContent = 'Apply';
    }
}

// =====================================================================
// 📡 CMD TWEAK UI
// =====================================================================
function buildCmdTweakUI(filter = 'all') {
    const container = document.getElementById('cmd-tweaks-container');
    if (!container) return;
    container.innerHTML = '';

    const keys = Object.keys(cmdTweaks).filter(k => filter === 'all' || cmdTweaks[k].category === filter);
    if (keys.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#666;padding:20px;font-size:12px;">No tweaks in this category.</div>';
        return;
    }

    for (const key of keys) {
        const t = cmdTweaks[key];
        const row = document.createElement('div');
        row.style.cssText = 'background:rgba(0,0,0,0.25);border-radius:10px;padding:10px;margin-bottom:8px;border-left:3px solid #06b6d4;';
        row.id = `cmd-row-${key}`;

        let actionHtml = '';
        if (t.type === 'toggle') {
            actionHtml = `
                <div style="display:flex;gap:6px;">
                    <button class="cmd-apply-btn" data-key="${key}" data-action="apply"
                            style="flex:1;padding:6px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;">✓ Apply</button>
                    ${t.revert ? `<button class="cmd-apply-btn" data-key="${key}" data-action="revert"
                            style="flex:1;padding:6px;background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;">✗ Revert</button>` : ''}
                </div>
            `;
        } else if (t.type === 'oneshot') {
            actionHtml = `<button class="cmd-apply-btn" data-key="${key}" data-action="apply"
                    style="width:100%;padding:6px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;">⚡ Run Once</button>`;
        }

        row.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;">
                <div style="flex:1;min-width:0;">
                    <div style="color:#fff;font-size:12px;font-weight:600;">${t.icon} ${t.title}</div>
                    <div style="color:#8b92b4;font-size:9px;line-height:1.3;margin-top:2px;">${t.info}</div>
                </div>
                <span id="cmd-state-${key}" style="color:#f59e0b;font-size:10px;font-weight:bold;white-space:nowrap;padding:2px 6px;background:rgba(245,158,11,0.15);border-radius:4px;">...</span>
            </div>
            <div style="margin-top:6px;">${actionHtml}</div>
            <div id="cmd-fb-${key}" style="font-size:9px;margin-top:4px;min-height:12px;color:#666;"></div>
        `;
        container.appendChild(row);
    }

    container.querySelectorAll('.cmd-apply-btn').forEach(btn => {
        btn.addEventListener('click', () => applyCmdTweak(btn.dataset.key, btn.dataset.action));
    });
}

function refreshCmdTweakUI() {
    for (const key in cmdTweakStates) {
        const stateEl = document.getElementById(`cmd-state-${key}`);
        if (stateEl) {
            const val = cmdTweakStates[key];
            stateEl.textContent = val;
            if (val === 'ON' || val === 'ALLOWED') stateEl.style.color = '#10b981';
            else if (val === 'OFF' || val === 'RESTRICTED' || val === 'ERR') stateEl.style.color = '#ef4444';
            else stateEl.style.color = '#f59e0b';
        }
    }
}

async function applyCmdTweak(key, action) {
    const t = cmdTweaks[key];
    if (!t) return;
    const fbEl = document.getElementById(`cmd-fb-${key}`);
    const btns = document.querySelectorAll(`.cmd-apply-btn[data-key="${key}"]`);
    btns.forEach(b => b.disabled = true);
    fbEl.style.color = '#8b92b4'; fbEl.textContent = 'Applying...';

    const cmd = action === 'revert' && t.revert ? t.revert : t.apply;
    try {
        await execFn(cmd, 8000);
        fbEl.style.color = '#10b981';
        fbEl.textContent = `✓ ${action === 'revert' ? 'Reverted' : 'Applied'}: ${cmd.slice(0, 50)}${cmd.length > 50 ? '...' : ''}`;
        // Re-read state if possible
        if (t.read) {
            await new Promise(r => setTimeout(r, 500));
            const res = await execFn(t.read, 3000);
            cmdTweakStates[key] = t.parse ? t.parse(res) : (res || '').trim();
            refreshCmdTweakUI();
        }
    } catch (e) {
        fbEl.style.color = '#ef4444';
        fbEl.textContent = `✗ Error: ${e.message || 'command failed'}`;
    } finally {
        btns.forEach(b => b.disabled = false);
    }
}

async function applyCmdPreset(presetKey) {
    const preset = cmdPresets[presetKey];
    if (!preset) return;
    const btn = document.querySelector(`.cmd-preset-btn[data-preset="${presetKey}"]`);
    const origText = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Applying...';

    for (const key of preset.keys) {
        const t = cmdTweaks[key];
        const action = preset.actions?.[key] || 'apply';
        const cmd = action === 'revert' && t.revert ? t.revert : t.apply;
        const fbEl = document.getElementById(`cmd-fb-${key}`);
        if (fbEl) { fbEl.style.color = '#8b92b4'; fbEl.textContent = 'Applying preset...'; }
        try {
            await execFn(cmd, 8000);
            if (fbEl) { fbEl.style.color = '#10b981'; fbEl.textContent = `✓ Preset applied`; }
            if (t.read) {
                const res = await execFn(t.read, 3000);
                cmdTweakStates[key] = t.parse ? t.parse(res) : (res || '').trim();
            }
        } catch (e) {
            if (fbEl) { fbEl.style.color = '#ef4444'; fbEl.textContent = `✗ ${e.message || 'failed'}`; }
        }
        await new Promise(r => setTimeout(r, 200));
    }
    refreshCmdTweakUI();
    btn.disabled = false; btn.textContent = origText;
}

// =====================================================================
// 🎨 BENCHMARK UI HELPERS
// =====================================================================
function updateStatus(msg, color = '#8b92b4') {
    const el = document.getElementById('perf-status');
    if (el) el.innerHTML = `<span style="color:${color}">${msg}</span>`;
}

function updateProgress(percent) {
    const bar = document.getElementById('perf-bar');
    const prog = document.getElementById('perf-progress');
    if (bar && prog) { prog.style.display = 'block'; bar.style.width = `${percent}%`; }
}

function addResult(title, value, color = '#fff', detail = '') {
    const container = document.getElementById('perf-results');
    if (!container) return;
    container.style.display = 'flex';
    const row = document.createElement('div');
    row.style.cssText = 'background:rgba(0,0,0,0.3);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;';
    row.innerHTML = `<div style="flex:1;"><div style="color:#8b92b4;font-size:11px;">${title}</div><div style="color:${color};font-size:14px;font-weight:600;">${value}</div>${detail ? `<div style="color:#666;font-size:10px;margin-top:2px;">${detail}</div>` : ''}</div>`;
    container.appendChild(row);
}

function showAnalysis(profile, thermal, summary) {
    const container = document.getElementById('perf-results');
    if (!container) return;
    const row = document.createElement('div');
    row.style.cssText = 'background:rgba(139,92,246,0.15);border:1px solid #8b5cf6;border-radius:12px;padding:16px;margin-top:10px;text-align:center;';
    row.innerHTML = `<div style="color:#c4b5fd;font-size:12px;margin-bottom:8px;">📱 Device Profile</div><div style="font-size:18px;font-weight:bold;color:#fff;margin-bottom:4px;">${profile}</div><div style="font-size:13px;color:#8b92b4;margin-bottom:10px;">Thermal: <span style="color:${thermal.includes('Fast') ? '#ef4444' : '#10b981'}">${thermal}</span></div><div style="font-size:12px;color:#666;line-height:1.4;">${summary}</div>`;
    container.appendChild(row);
}

// =====================================================================
// 🧪 TEST FUNCTIONS
// =====================================================================
async function testStorage() {
    updateStatus('📦 Testing Storage Write Speed...');
    try {
        const ddCount = testDuration < 30000 ? 50 : 100;
        const cmd = `dd if=/dev/zero of=/data/local/tmp/_perf_test bs=1M count=${ddCount} oflag=direct 2>&1 | grep -oP '[\\d.]+\\s+[MGk]?B/s'`;
        const res = await execFn(`su -c "${cmd}"`, 15000);
        await execFn(`su -c "rm -f /data/local/tmp/_perf_test"`);
        const match = res.match(/([\d.]+)\s*([MGk]?B\/s)/);
        if (match) {
            let mbps = parseFloat(match[1]);
            if (match[2].includes('G')) mbps *= 1024;
            else if (match[2].includes('k')) mbps /= 1024;
            results.storage = mbps;
            addResult('Storage Write', `${mbps.toFixed(0)} MB/s`, mbps > 600 ? '#10b981' : '#f59e0b', mbps > 800 ? 'NVMe/UFS 3.1+' : mbps > 400 ? 'UFS 2.1/3.0' : 'eMMC/UFS 2.0');
        }
    } catch (e) { addResult('Storage Write', 'Failed', '#ef4444'); }
    updateProgress(20);
    await new Promise(r => setTimeout(r, 300));
}

async function testRAM_ZRAM() {
    updateStatus('🧠 Testing RAM & ZRAM...');
    try {
        const arrSize = 20 * 1024 * 1024;
        const start = performance.now();
        const arr = new Uint8Array(arrSize);
        for (let i = 0; i < arr.length; i++) arr[i] = i % 256;
        const duration = performance.now() - start;
        results.ramSpeed = (arrSize / 1024 / 1024) / (duration / 1000);

        const zramPath = '/sys/block/zram0';
        const zramExists = await execFn(`test -d ${zramPath} && echo "yes" || echo "no"`, 2000);
        let zramStatus = '', zramColor = '#666', zramDetail = '';
        if (zramExists.trim() === 'yes') {
            const disksize = await execFn(`cat ${zramPath}/disksize 2>/dev/null`);
            const origData = await execFn(`cat ${zramPath}/orig_data_size 2>/dev/null`);
            const comprData = await execFn(`cat ${zramPath}/compr_data_size 2>/dev/null`);
            const maxStreams = await execFn(`cat ${zramPath}/max_comp_streams 2>/dev/null`);
            const compAlgo = await execFn(`cat ${zramPath}/comp_algorithm 2>/dev/null`);
            const diskSizeVal = parseInt(disksize?.trim() || '0');
            const origVal = parseInt(origData?.trim() || '0');
            const comprVal = parseInt(comprData?.trim() || '0');
            if (diskSizeVal > 0) {
                const diskSizeMB = (diskSizeVal / 1024 / 1024).toFixed(0);
                if (origVal > 0 && comprVal > 0) {
                    results.zramRatio = origVal / comprVal;
                    zramStatus = `Active (${diskSizeMB}MB)`;
                    zramDetail = `Ratio: ${results.zramRatio.toFixed(2)}x | Algo: ${compAlgo.trim() || 'unknown'}`;
                    zramColor = results.zramRatio > 2.0 ? '#10b981' : '#f59e0b';
                } else {
                    zramStatus = `Active (${diskSizeMB}MB)`;
                    zramDetail = `Ready | Algo: ${compAlgo.trim() || 'unknown'} | Streams: ${maxStreams.trim() || 'N/A'}`;
                    zramColor = '#3b82f6';
                }
            } else {
                zramStatus = 'Module Loaded (Inactive)';
                zramDetail = 'Run "Enable ZRAM" to activate';
                zramColor = '#f59e0b';
            }
        } else {
            zramStatus = 'Not Available';
            zramDetail = 'ZRAM kernel module not found';
        }
        const ramColor = results.ramSpeed > 6000 ? '#10b981' : results.ramSpeed > 3000 ? '#f59e0b' : '#ef4444';
        addResult('RAM Speed', `${results.ramSpeed.toFixed(0)} MB/s`, ramColor, 'Memory Allocation Benchmark');
        addResult('ZRAM Status', zramStatus, zramColor, zramDetail);
    } catch (e) { addResult('RAM/ZRAM', 'Test Failed', '#ef4444', e.message); }
    updateProgress(40);
    await new Promise(r => setTimeout(r, 300));
}

async function testCPU_Thermal() {
    const durationSec = testDuration / 1000;
    updateStatus(`🔥 Testing CPU Load & Thermals (${durationSec}s)...`);
    const thermalPaths = await execFn(`ls /sys/class/thermal/thermal_zone*/temp 2>/dev/null`);
    const zones = thermalPaths.trim().split('\n').filter(p => p);
    let initialTemps = {};
    for (const z of zones) {
        const t = await execFn(`cat ${z} 2>/dev/null`);
        if (t) initialTemps[z] = parseInt(t) / 1000;
    }
    results.cpuFreq = [];
    const freqPaths = [];
    for (let i = 0; i < 8; i++) {
        const p = `/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`;
        if ((await execFn(`test -f ${p} && echo 1`)).trim() === '1') freqPaths.push(p);
    }
    const stressEnd = Date.now() + testDuration;
    while (Date.now() < stressEnd && testRunning) {
        const loopStart = performance.now();
        while (performance.now() - loopStart < 100) { Math.sqrt(Math.random()); }
        if (freqPaths.length > 0) {
            const p = freqPaths[Math.floor(Math.random() * freqPaths.length)];
            const f = await execFn(`cat ${p} 2>/dev/null`);
            if (f) results.cpuFreq.push(parseInt(f.trim()));
        }
    }
    let finalTemps = {};
    for (const z of zones) {
        const t = await execFn(`cat ${z} 2>/dev/null`);
        if (t) finalTemps[z] = parseInt(t) / 1000;
    }
    if (results.cpuFreq.length > 0) {
        const maxF = Math.max(...results.cpuFreq);
        const minF = Math.min(...results.cpuFreq);
        results.cpuStability = (minF / maxF) * 100;
        addResult('CPU Stability', `${results.cpuStability.toFixed(0)}%`, results.cpuStability > 85 ? '#10b981' : '#ef4444', `Freq range: ${(minF/1000).toFixed(0)}-${(maxF/1000).toFixed(0)} MHz`);
    }
    let maxDelta = 0;
    for (const z of zones) {
        if (initialTemps[z] && finalTemps[z]) {
            const d = finalTemps[z] - initialTemps[z];
            if (d > maxDelta) maxDelta = d;
        }
    }
    results.thermalDelta = maxDelta;
    let thermalBadge = 'Balanced';
    if (maxDelta > 12) thermalBadge = 'Heats Fast 🔥';
    else if (maxDelta < 5) thermalBadge = 'Cools Fast ❄️';
    results.thermalProfile = thermalBadge;
    addResult('Thermal ΔT', `${maxDelta.toFixed(1)}°C`, maxDelta > 10 ? '#ef4444' : '#10b981', thermalBadge);
    updateProgress(70);
    await new Promise(r => setTimeout(r, 300));
}

async function testGPU() {
    const durationSec = testDuration / 1000;
    updateStatus(`🎮 Testing GPU Draw Calls (${durationSec}s)...`);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        document.body.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        let frames = 0;
        const gpuEnd = Date.now() + testDuration;
        while (Date.now() < gpuEnd && testRunning) {
            ctx.fillStyle = `hsl(${frames % 360}, 70%, 50%)`;
            ctx.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 200; i++) {
                ctx.fillStyle = `rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255},0.8)`;
                ctx.fillRect(Math.random()*256, Math.random()*256, 20, 20);
            }
            frames++;
            await new Promise(r => setTimeout(r, 0));
        }
        canvas.remove();
        results.gpuFPS = frames / (testDuration / 1000);
        addResult('GPU Draw FPS', `${results.gpuFPS.toFixed(0)} FPS`, results.gpuFPS > 50 ? '#10b981' : '#f59e0b', 'Canvas 2D Stress');
    } catch (e) { addResult('GPU Test', 'Failed', '#ef4444'); }
    updateProgress(90);
    await new Promise(r => setTimeout(r, 300));
}

function generateAnalysis() {
    let score = 0;
    if (results.storage > 600) score += 2; else if (results.storage > 300) score += 1;
    if (results.cpuStability > 85) score += 2; else if (results.cpuStability > 60) score += 1;
    if (results.gpuFPS > 45) score += 2; else if (results.gpuFPS > 25) score += 1;
    if (results.ramSpeed > 6000) score += 1; else if (results.ramSpeed > 3000) score += 0.5;
    if (results.zramRatio > 2.0) score += 1; else if (results.zramRatio > 1.5) score += 0.5;
    if (results.thermalDelta < 6) score += 2; else if (results.thermalDelta < 10) score += 1;

    let profile = 'Power Save 🔋';
    if (score >= 7) profile = 'Gaming Beast 🚀';
    else if (score >= 4.5) profile = 'Balanced ⚖️';

    let thermalText = results.thermalProfile;
    let summary = '';
    if (profile === 'Gaming Beast 🚀') summary = 'High sustained performance with excellent cooling. Ideal for heavy gaming & multitasking.';
    else if (profile === 'Balanced ⚖️') summary = 'Good mid-range performance. May throttle under extended heavy loads.';
    else summary = 'Entry-level or aging hardware. Best suited for light tasks & battery saving.';

    addResult('Final Verdict', profile, '#8b5cf6');
    showAnalysis(profile, thermalText, summary);
    updateStatus('✅ Analysis Complete', '#10b981');
    updateProgress(100);
}

async function runFullSuite() {
    document.getElementById('perf-results').innerHTML = '';
    document.getElementById('perf-results').style.display = 'none';
    updateProgress(0);
    await testStorage();
    await testRAM_ZRAM();
    await testCPU_Thermal();
    await testGPU();
    generateAnalysis();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindClickHandler);
} else {
    bindClickHandler();
}

window.TweakAnalyzer = {
    bindClickHandler, runFullSuite, applyVmTweak,
    scanTunables, renderTunables,
    applyCmdTweak, applyCmdPreset, buildCmdTweakUI
};
})();