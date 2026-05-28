#!/system/bin/sh
# MTK AI Engine - Background Update Checker (Exact SHA256 Validation)
# Replicates original JS logic: checks existence + SHA256 for text files
# POSIX-compliant, uses temp files to avoid shell variable hashing errors

MODDIR="/data/adb/modules/MTK_AI"
BUSYBOX="${MODDIR}/busybox"
STATUS_FILE="/sdcard/MTK_AI/.update_status"
REQUIRED_LIST="${MODDIR}/.required_files"
MODULE_PROP="${MODDIR}/module.prop"
ONLINE_PROP_URL="https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/MTK_AI/module.prop"
MANIFEST_URL="https://raw.githubusercontent.com/Jestoni888/MTK-AI-Engine/refs/heads/main/manifest.txt"
TMP_DIR="/dev/shm"
[ -d "$TMP_DIR" ] || TMP_DIR="/sdcard/MTK_AI/.tmp"
mkdir -p "$TMP_DIR" 2>/dev/null

# ===== HELPERS =====
get_prop() {
    grep "^$1=" "$2" 2>/dev/null | cut -d'=' -f2- | tr -d '\r'
}

write_status() {
    _ua="$1" _cv="$2" _ov="$3" _fc="$4" _cf="$5"
    _ts=$(date +%s 2>/dev/null || echo 0)
    cat > "$STATUS_FILE" << EOF
{"update_available":$_ua,"current_version":"$_cv","online_version":"$_ov","files_changed":$_fc,"changed_files":$_cf,"last_check":$_ts}
EOF
}

compare_ver() {
    _v1="${1:-0.0.0}" _v2="${2:-0.0.0}"
    _a1=$(echo "$_v1" | cut -d. -f1); _a2=$(echo "$_v1" | cut -d. -f2); _a3=$(echo "$_v1" | cut -d. -f3)
    _b1=$(echo "$_v2" | cut -d. -f1); _b2=$(echo "$_v2" | cut -d. -f2); _b3=$(echo "$_v2" | cut -d. -f3)
    : ${_a1:=0} ${_a2:=0} ${_a3:=0} ${_b1:=0} ${_b2:=0} ${_b3:=0}
    [ "$_a1" -gt "$_b1" ] 2>/dev/null && echo 2 && return
    [ "$_a1" -lt "$_b1" ] 2>/dev/null && echo 0 && return
    [ "$_a2" -gt "$_b2" ] 2>/dev/null && echo 2 && return
    [ "$_a2" -lt "$_b2" ] 2>/dev/null && echo 0 && return
    [ "$_a3" -gt "$_b3" ] 2>/dev/null && echo 2 && return
    [ "$_a3" -lt "$_b3" ] 2>/dev/null && echo 0 && return
    echo 1
}

is_text_file() {
    case "$1" in
        *.sh|*.js|*.html|*.prop|*.txt|*.cfg|*.conf|*.xml|*.json|*.css|*.md) return 0 ;;
    esac
    _sh=$($BUSYBOX head -c 2 "${MODDIR}/$1" 2>/dev/null)
    [ "$_sh" = "#!" ] && return 0
    return +1
    }

get_sha256() {
    # Works for both files and returns clean lowercase hex
    $BUSYBOX sha256sum "$1" 2>/dev/null | $BUSYBOX cut -d' ' -f1 | tr -d '[:space:]' | tr 'A-F' 'a-f'
}

# ===== MAIN CHECK =====
check_update() {
    _debug="${1:-}"
    
    # 1. Version Check
    _cv=$(get_prop "version" "$MODULE_PROP")
    [ -z "$_cv" ] && _cv=$(get_prop "versionCode" "$MODULE_PROP")
    [ -z "$_cv" ] && _cv="0.0.0"
    
    _op=$($BUSYBOX wget -q -O - "$ONLINE_PROP_URL" 2>/dev/null)
    _ov=$(echo "$_op" | grep "^version=" | cut -d= -f2 | tr -d '\r')
    [ -z "$_ov" ] && _ov=$(echo "$_op" | grep "^versionCode=" | cut -d= -f2 | tr -d '\r')
    [ -z "$_ov" ] && _ov="0.0.0"
    
    _vn=0
    [ "$(compare_ver "$_cv" "$_ov")" = "0" ] && _vn=1
    
    # 2. Fetch Manifest
    _manifest=$($BUSYBOX wget -q -O - "$MANIFEST_URL" 2>/dev/null)
    [ -z "$_manifest" ] && _manifest=$(curl -sL "$MANIFEST_URL" 2>/dev/null)
    
    _fc=0
    _cj="[]"
    _ca=""
    
    # 3. File Integrity Check
    if [ -f "$REQUIRED_LIST" ] && [ -n "$_manifest" ]; then
        while IFS= read -r _rp; do
            case "$_rp" in ""|\#*) continue ;; esac
            _lp="${MODDIR}/${_rp}"
            
            # Existence check
            if [ ! -f "$_lp" ]; then
                _ca="${_ca}{\"path\":\"${_rp}\",\"reason\":\"Missing\"},"
                _fc=1
                continue
            fi
            
            # Text files: SHA256 comparison
            if is_text_file "$_rp"; then
                _lh=$(get_sha256 "$_lp")
                # Find online URL in manifest
                _ou=$(echo "$_manifest" | grep "^${_rp} " | head -n1 | cut -d' ' -f2-)                
                if [ -n "$_ou" ]; then
                    _tmpf="${TMP_DIR}/.mtk_online_hash"
                    # Download to temp file (avoids shell variable newline/encoding traps)
                    if $BUSYBOX wget -q -O "$_tmpf" "$_ou" 2>/dev/null || curl -sL -o "$_tmpf" "$_ou" 2>/dev/null; then
                        _oh=$(get_sha256 "$_tmpf")
                        
                        [ "$_debug" = "--debug" ] && echo "  [DEBUG] $_rp | Local: $_lh | Online: $_oh | Match: $([ "$_lh" = "$_oh" ] && echo YES || echo NO)" >&2
                        
                        if [ -n "$_lh" ] && [ -n "$_oh" ] && [ "$_lh" != "$_oh" ]; then
                            _ca="${_ca}{\"path\":\"${_rp}\",\"reason\":\"Modified\"},"
                            _fc=1
                        fi
                    fi
                    rm -f "$_tmpf" 2>/dev/null
                fi
            fi
            # Binary files: existence only (skip SHA256 to prevent false positives)
        done < "$REQUIRED_LIST"
    fi
    
    _ca="${_ca%,}"
    [ -n "$_ca" ] && _cj="[${_ca}]"
    
    _sn=0
    [ "$_vn" = "1" ] || [ "$_fc" = "1" ] && _sn=1
    
    write_status "$_sn" "$_cv" "$_ov" "$_fc" "$_cj"
    echo "Check done: update=$_sn cv=$_cv ov=$_ov fc=$_fc" >&2
}

# ===== ENTRY POINT =====
case "$1" in
    --check) check_update ;;
    --full)  check_update ;;  # Full now includes SHA256 by default
    --debug) check_update "--debug" ;;
    --status) cat "$STATUS_FILE" 2>/dev/null || echo '{"error":"No status"}' ;;
    --clear)  rm -f "$STATUS_FILE" && echo "Cleared" ;;
    *)        check_update ;;
esac