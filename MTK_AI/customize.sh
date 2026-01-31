#!/system/bin/sh
SKIPUNZIP=0

ui_print "- Capturing original system files..."

# 1. Create the dummy system structure so the Meta Overlay has 'slots'
mkdir -p "$MODPATH/system/etc"
mkdir -p "$MODPATH/vendor/etc"
su -c 'mkdir -p /sdcard/MTK_AI_Engine && :> /sdcard/MTK_AI_Engine/enable_notifications'
# 2. Back up Stock files from the phone
[ -f "/system/etc/gameprops.json" ] && cp "/system/etc/gameprops.json" "$MODPATH/Extras/gameprops_stock.json"
[ -f "/vendor/etc/gbe.cfg" ] && cp "/vendor/etc/gbe.cfg" "$MODPATH/Extras/gbe_stock.cfg"
[ -f "/vendor/etc/qt.cfg" ] && cp "/vendor/etc/qt.cfg" "$MODPATH/Extras/qt_stock.cfg"
[ -f "/vendor/etc/xgf.cfg" ] && cp "/vendor/etc/xgf.cfg" "$MODPATH/Extras/xgf_stock.cfg"
[ -f "/vendor/etc/fstb.cfg" ] && cp "/vendor/etc/fstb.cfg" "$MODPATH/Extras/fstb_stock.cfg"
[ -f "/vendor/etc/power_app_cfg.xml" ] && cp "/vendor/etc/power_app_cfg.xml" "$MODPATH/Extras/power_app_cfg_stock.xml"
[ -f "/vendor/etc/powercontable.xml" ] && cp "/vendor/etc/powercontable.xml" "$MODPATH/Extras/powercontable_stock.xml"
[ -f "/vendor/etc/powerscntbl.xml" ] && cp "/vendor/etc/powerscntbl.xml" "$MODPATH/Extras/powerscntbl_stock.xml"

# 3. Create the initial 'dummy' files in the system path.
# We use the custom versions as the starting dummy so the phone boots normally.
cp "$MODPATH/Extras/gameprops_custom.json" "$MODPATH/system/etc/gameprops.json"
cp "$MODPATH/Extras/gbe_custom.cfg" "$MODPATH/vendor/etc/gbe.cfg"
cp "$MODPATH/Extras/qt_custom.cfg" "$MODPATH/vendor/etc/qt.cfg"
cp "$MODPATH/Extras/fstb_custom.cfg" "$MODPATH/vendor/etc/fstb.cfg"
cp "$MODPATH/Extras/xgf_custom.cfg" "$MODPATH/vendor/etc/xgf.cfg"
cp "$MODPATH/Extras/powerscntbl_custom.xml" "$MODPATH/vendor/etc/powerscntbl.xml"
cp "$MODPATH/Extras/powercontable_custom.xml" "$MODPATH/vendor/etc/powercontable.xml"
cp "$MODPATH/Extras/power_app_cfg_custom.xml" "$MODPATH/vendor/etc/power_app_cfg.xml"

# 4. Set Permissions
set_perm_recursive "$MODPATH" 0 0 0755 0644

ui_print "- Custom gameprops & Gamebooster Engine installed on default"

ui_print "=================================="
ui_print "     MTK AI Engine "
ui_print "  Universal Root Manager Support"
ui_print "=================================="

# Detect root environment
if [ -d /data/adb/magisk ]; then
    ROOT_ENV="Magisk"
elif [ -d /data/adb/ksu ]; then
    ROOT_ENV="KernelSU"
elif [ -d /data/adb/apatch ]; then
    ROOT_ENV="APatch"
elif [ -d /data/adb/sukisu ]; then
    ROOT_ENV="SUKISU"
else
    ROOT_ENV="Unknown"
fi

ui_print "Detected root manager: $ROOT_ENV"

# 1. Header
ui_print "****************************************"
ui_print "* ANDROID SYSTEM INFORMATION        *"
ui_print "****************************************"

# 2. Advanced Device Properties (Pro User Edition)
ui_print "- DEVICE INFO:"
ui_print "  Model         : $(getprop ro.product.model)"
ui_print "  Manufacturer  : $(getprop ro.product.manufacturer)"
ui_print "  Android Ver   : $(getprop ro.build.version.release) (API $(getprop ro.build.version.sdk))"
ui_print "  Arch          : $(getprop ro.product.cpu.abi)"
ui_print "  Kernel        : $(uname -r)"
ui_print "  SoC (Platform): $(getprop ro.board.platform)"

# Hardware Specifics for Pro Users
ui_print "- HARDWARE SPECS:"
ui_print "  Display Rate  : $(dumpsys display | grep -m1 mPhys | grep -oE '[0-9.]+ fps' | head -n1)"
ui_print "  Panel Type    : $(getprop ro.vendor.display.paneltype || echo 'Standard')"
ui_print "  Thermal Zone  : $(ls /sys/class/thermal/ | grep -c "thermal_zone") zones detected"
ui_print "  Dynamic Part. : $(getprop ro.boot.dynamic_partitions)"
ui_print "  A/B Slot      : $(getprop ro.boot.slot_suffix || echo 'Legacy')"
ui_print "  SELinux       : $(getenforce)"

# MediaTek / ColorOS Specifics
if [ "$(getprop ro.hardware)" = "mtk" ] || [ "$(getprop ro.board.platform)" = "mt*" ]; then
  ui_print "  MTK Engine    : FPSGO & PowerHAL Detected"
fi

# 3. CPU & Governor Details
ui_print "- CPU CONFIGURATION:"
for policy in /sys/devices/system/cpu/cpufreq/policy*; do
    P_ID=$(basename "$policy")
    GOV=$(cat "$policy/scaling_governor" 2>/dev/null)
    MAX=$(cat "$policy/cpuinfo_max_freq" 2>/dev/null)
    # Convert kHz to MHz for easier reading
    MAX_MHZ=$((MAX / 1000))
    ui_print "  $P_ID: Gov: [$GOV] | Max: ${MAX_MHZ}MHz"
done

# 4. GPU Specifications
ui_print "- GPU INFO:"
if [ -d /sys/class/kgsl/kgsl-3d0 ]; then
    GPU_MAX=$(cat /sys/class/kgsl/kgsl-3d0/max_gpuclk 2>/dev/null)
    ui_print "  Type: Qualcomm Adreno"
    ui_print "  Max Clock: $((GPU_MAX / 1000000))MHz"
elif ls /sys/class/devfreq/*mali* >/dev/null 2>&1; then
    MALI_PATH=$(ls -d /sys/class/devfreq/*mali* | head -n 1)
    ui_print "  Type: ARM Mali"
    ui_print "  Governor: $(cat "$MALI_PATH/governor")"
fi

# 5. Memory & Storage Status
ui_print "- MEMORY STATUS:"
MEM_TOTAL=$(grep MemTotal /proc/meminfo | awk '{print $2}')
MEM_FREE=$(grep MemFree /proc/meminfo | awk '{print $2}')
ui_print "  RAM: $((MEM_TOTAL / 1024))MB Total / $((MEM_FREE / 1024))MB Free"

# 6. Thermal Status (Real-time)
ui_print "- THERMAL ZONES (Top 3):"
count=0
for zone in /sys/class/thermal/thermal_zone*; do
    [ $count -eq 3 ] && break
    TYPE=$(cat "$zone/type")
    TEMP=$(cat "$zone/temp")
    # Convert millidegrees to degrees
    ui_print "  $TYPE: $((TEMP / 1000))°C"
    count=$((count + 1))
done

# 7. MediaTek Specifics (From your service.sh logic)
if [ -d /proc/eem ]; then
    ui_print "- MEDIATEK EEM OFFSETS:"
    [ -f /proc/eem/EEM_DET_B/eem_offset ] && ui_print "  Big Cluster: $(cat /proc/eem/EEM_DET_B/eem_offset)"
    [ -f /proc/eem/EEM_DET_L/eem_offset ] && ui_print "  Little Cluster: $(cat /proc/eem/EEM_DET_L/eem_offset)"
fi

ui_print "****************************************"
ui_print "* INFORMATION GATHERED          *"
ui_print "****************************************"

ui_print ""
ui_print ""
ui_print ""
ui_print " MTK AI Engine"
ui_print " - is a LOGCAT/TOUCH based module that uses only a detection method with a near zero usage of CPU because it has no loop/sleep detection command"
ui_print ""
ui_print ""
ui_print "-   𝘾𝙡𝙞𝙘𝙠 𝘼𝙘𝙩𝙞𝙤𝙣 𝙗𝙪𝙩𝙩𝙤𝙣 ▶️ 𝙞𝙣 𝙈𝙏𝙆 𝘼𝙄 𝙢𝙤𝙙𝙪𝙡𝙚 𝙨𝙚𝙘𝙩𝙞𝙤𝙣 𝙞𝙣 𝙮𝙤𝙪𝙧 𝙧𝙤𝙤𝙩 𝙢𝙖𝙣𝙖𝙜𝙚𝙧 𝙩𝙤 𝙖𝙥𝙥𝙡𝙮 𝙩𝙬𝙚𝙖𝙠𝙨"
ui_print ""
ui_print ""

# Set permissions for the module files
set_perm_recursive $MODPATH 0 0 0755 0644

ui_print "  💡see logs in sdcard/MTK_AI_Engine/MTK_AI_Engine.log for more details & info"

GAME_LIST_FILE="/sdcard/MTK_AI_Engine/game_list.txt"
#EXCLUDE_FILE="/sdcard/MTK_AI_Engine/exclude_apps.txt"
LOG_FILE="/sdcard/MTK_AI_Engine/MTK_AI_Engine.log"

# Create game list
if [ ! -f "$GAME_LIST_FILE" ]; then
  cat > "$GAME_LIST_FILE" <<'EOF'
Nekootan.kfkj
adventure.rpg.anime.game.vng.ys6
age.of.civilizations2.jakowski.lukasz
air.com.ubisoft.brawl.halla.platform.fighting.action.pvp
brownmonster.app.game.rushrally3
com.AlfaBravo.Combat
com.CarXTech.highWay
com.CarXTech.street
com.ChillyRoom.DungeonShooter
com.EndlessClouds.Treeverse
com.EtherGaming.PocketRogues
com.Flanne.MinutesTillDawn.roguelike.shooting.gp
com.FosFenes.Sonolus
com.GameCoaster.ProtectDungeon
com.HoYoverse.Nap
com.HoYoverse.hkrpgoversea
com.LanPiaoPiao.PlantsVsZombiesRH
com.MOBGames.PoppyMobileChap1
com.OxGames.Pluvia
com.PigeonGames.Phigros
com.ProjectMoon.LimbusCompany
com.Psyonix.RL2D
com.RickyG.DONTFORGET
com.RoamingStar.BlueArchive
com.ShinyShoe.MonsterTrain.mtap
com.Shooter.ModernWarfront
com.Shooter.ModernWarship
com.Shooter.ModernWarships
com.Sunborn.SnqxExilium
com.Sunborn.SnqxExilium.Glo
com.TeamCherry.HollowKnight
com.TechTreeGames.TheTower
com.Vince.AlamobileFormula
com.WandaSoftware.TruckersofEurope3
com.Wispwood.ArrowQuest
com.YoStarEN.Arknights
com.YoStarEN.HBR
com.YoStarEN.MahjongSoul
com.YoStarJP.MajSoul
com.YoStar.AetherGazer
com.YostarJP.BlueArchive
com.ZeroCastleGameStudioINTL.StrikeBusterPrototype
com.ZeroCastleGameStudio.StrikeBusterPrototype
com.actgames.bbee
com.activision.callofduty.shooter
com.activision.callofduty.warzone
com.albiononline
com.aligames.kuang.kybc
com.aligames.kuang.kybc.huawei
com.alightcreative.motion
com.android.test.uibench
com.andromeda.androbench2
com.and.games505.Terraria
com.archosaur.sea.dr.gp
com.asobimo.toramonline
com.autumn.skullgirls
com.axlebolt.standoff2
com.bairimeng.dmmdzz
com.bandainamcoent.opbrww
com.bandainamcoent.sao
com.bandainamcoent.shinycolorsprism
com.bandainamcoent.tensuramrkww
com.bandainamcoent.ultimateninjastorm
com.bandainamcogames.dbzdokkanww
com.bf.sgs.hdexp.bd
com.bhvr.deadbydaylight
com.bilibiligame.heglgp
com.bilibili.azurlane
com.bilibili.deadcells.mobile
com.bilibili.fatego
com.bilibili.heaven
com.bilibili.priconne
com.bilibili.star.bili
com.bilibili.warmsnow
com.biligamekr.aggp
com.bingkolo.kleins.cn
com.blizzard.diablo.immortal
com.blizzard.wtcg.hearthstone
com.bluepoch.m.en.reverse1999
com.bscotch.crashlands2
com.bushiroad.d4dj
com.bushiroad.en.bangdreamgbp
com.bushiroad.lovelive.schoolidolfestival2
com.carxtech.sr
com.chillyroom.soulknightprequel
com.chucklefish.stardewvalley
com.citra.emu
com.cnvcs.xiangqi
com.com2us.starseedgl.android.google.global.normal
com.companyname.AM2RWrapper
com.criticalforceentertainment.criticalops
com.crunchyroll.princessconnectredive
com.denachina.g13002010
com.dena.a12026801
com.denchi.vtubestudio
com.devsisters.ck
com.dfjz.moba
com.dgames.g15002002
com.dishii.mm
com.dishii.soh
com.dois.greedgame
com.dolphinemu.dolphinemu
com.dragonli.projectsnow.lhm
com.drivezone.car.race.game
com.dts.freefireadv
com.dts.freefiremax
com.dts.freefireth
com.dts.freefireth.huawei
com.dxx.firenow
com.ea.gp.apexlegendsmobilefps
com.ea.gp.fifamobile
com.ea.gp.nfsm
com.emulator.fpse64
com.epicgames.fortnite
com.epicgames.portal
com.epsxe.ePSXe
com.eyougame.msen
com.fantablade.icey
com.farlightgames.igame.gp
com.feralinteractive.gridas
com.firewick.p42.bilibili
com.firsttouchgames.dls7
com.fizzd.connectedworlds
com.futuremark.dmandroid.application
com.gabama.monopostolite
com.gaijingames.wtm
com.gakpopuler.gamekecil
com.gameark.ggplay.lonsea
com.gamedevltd.wwh
com.gameloft.android.ANMP.GloftA9HM
com.gameloft.android.ANMP.GloftMVHM
com.gameloft.android.SAMS.GloftA9SS
com.garena.game.codm
com.garena.game.df
com.garena.game.kgid
com.garena.game.kgtw
com.garena.game.kgvn
com.garena.game.lmjx
com.garena.game.nfsm
com.gbits.funnyfighter.android.overseas
com.gravity.romg
com.gravity.roo.sea
com.gryphline.exastris.gp
com.guigugame.guigubahuang
com.guyou.deadstrike
com.h73.jhqyna
com.halo.windf.hero
com.heavenburnsred
com.hermes.j1game
com.hermes.mk
com.herogame.gplay.magicminecraft.mmorpg
com.hg.cosmicshake
com.hg.lbw
com.hottapkgs.hotta
com.humo.yqqsqz.yw
com.hypergryph.arknights
com.hypergryph.exastris
com.idreamsky.klbqm
com.idreamsky.strinova
com.igg.android.doomsdaylastsurvivors
com.ignm.raspberrymash.jp
com.ilongyuan.implosion
com.infoldgames.infinitynikkien
com.jacksparrow.jpmajiang
com.japan.datealive.gp
com.je.supersus
com.jumpw.mobile300
com.kakaogames.eversoul
com.kakaogames.gdts
com.kakaogames.wdfp
com.kiloo.subwaysurf
com.kog.grandchaseglobal
com.komoe.kmumamusumegp
com.kurogame.aki
com.kurogame.gplay.punishing.grayraven.en
com.kurogame.haru
com.kurogame.haru.bilibili
com.kurogame.haru.hero
com.kurogame.mingchao
com.kurogame.wutheringwaves.global
com.leiting.wf
com.lemcnsun.soultide.android
com.levelinfinite.hotta.gp
com.levelinfinite.sgameGlobal
com.levelinfinite.sgameGlobal.midaspay
com.lilithgames.hgame.cn
com.lilithgame.hgame.gp
com.lilithgame.roc.gp
com.linecorp.LGGRTHN
com.linegames.sl
com.longe.allstarhmt
com.lrgame.dldl.sea
com.madfingergames.legends
com.maleo.bussimulatorid
com.miHoYo.GI.samsung
com.miHoYo.GenshinImpact
com.miHoYo.HSoDv2JPOriginalEx
com.miHoYo.Nap
com.miHoYo.Yuanshen
com.miHoYo.bh3
com.miHoYo.bh3global
com.miHoYo.bh3oversea
com.miHoYo.bh3rdJP
com.miHoYo.bh3.bilibili
com.miHoYo.bh3.mi
com.miHoYo.bh3.uc
com.miHoYo.enterprise.NGHSoD
com.miHoYo.hkrpg
com.miHoYo.ys
com.miHoYo.zenless
com.minidragon.idlefantasy
com.miniworldgame.creata.vn
com.miraclegames.farlight84
com.mobiin.gp
com.mobilechess.gp
com.mobilelegends.hwag
com.mobilelegends.mi
com.mobilelegends.taptest
com.mobile.legends
com.modx.daluandou
com.mojang.hostilegg
com.mojang.minecraftpe
com.mojang.minecraftpe.patch
com.morizero.milthm
com.nanostudios.games.twenty.minutes
com.ncsoft.lineagen
com.nebulajoy.act.dmcpoc.asia
com.nekki.shadowfight
com.nekki.shadowfight3
com.neowizgames.game.browndust2
com.neowiz.game.idolypride.en
com.netease.AVALON
com.netease.EVE
com.netease.aceracer
com.netease.allstar
com.netease.dfjs
com.netease.dunkcd
com.netease.dwrg
com.netease.eve.en
com.netease.frxyna
com.netease.g78na.gb
com.netease.g93na
com.netease.h73hmt
com.netease.h75na
com.netease.hyxd
com.netease.idv
com.netease.jddsaef
com.netease.ko
com.netease.l22
com.netease.lagrange
com.netease.lglr
com.netease.lztgglobal
com.netease.ma84
com.netease.ma100asia
com.netease.moba
com.netease.mrzh
com.netease.newspike
com.netease.nshm
com.netease.nshmhmt
com.netease.onmyoji
com.netease.party
com.netease.partyglobal
com.netease.pes
com.netease.qrsj
com.netease.race
com.netease.racerna
com.netease.sky
com.netease.soulofhunter
com.netease.tj
com.netease.tom
com.netease.wotb
com.netease.wyclx
com.netease.x19
com.netease.yhtj
com.netease.yysls
com.netease.yyslscn
com.netflix.NGP.GTAIIIDefinitiveEdition
com.netflix.NGP.GTASanAndreasDefinitiveEdition
com.netflix.NGP.GTAViceCityDefinitiveEdition
com.netmarble.skiagb
com.netmarble.sololv
com.netmarble.tog
com.nexon.bluearchive
com.nexon.kartdrift
com.nexon.konosuba
com.nexon.mdnf
com.nexon.mod
com.ngame.allstar.eu
com.nianticlabs.monsterhunter
com.nianticproject.ingress
com.noctuagames.android.ashechoes
com.noctua.android.crazyones
com.npixel.GranSagaGB
com.olzhass.carparking.multyplayer
com.oninou.FAPI
com.papegames.infinitynikki
com.papegames.nn4.en
com.pearlabyss.blackdesertm
com.pearlabyss.blackdesertm.gl
com.pinkcore.tkfm
com.plarium.raidlegends
com.playdigious.deadcells.mobile
com.playmini.miniworld
com.play.rosea
com.popcap.pvz
com.primatelabs.geekbench6
com.proximabeta.dn2.global
com.proximabeta.mf.aceforce2
com.proximabeta.mf.liteuamo
com.proximabeta.mf.uamo
com.proximabeta.nikke
com.proxima.dfm
com.prpr.musedash
com.pubg
com.pubg.imobile
com.pubg.krmobile
com.pubg.newstate
com.pwrd.hotta.laohu
com.pwrd.huanta
com.pwrd.opmwsea
com.pwrd.p5x
com.pwrd.persona5x.laohu
com.r2games.myhero.bilibili
com.rayark.cytus2
com.rayark.deemo2
com.rayark.deemoreborn
com.rayark.implosion
com.rayark.sdorica
com.rekoo.pubgm
com.retroarch
com.rinzz.projectmuse
com.riotgames.league.teamfighttactics
com.riotgames.league.teamfighttacticstw
com.riotgames.league.teamfighttacticsvn
com.riotgames.league.wildrift
com.roblox.client
com.roblox.client.vnggames
com.robtopx.geometryjump
com.rockstargames.gta3
com.rockstargames.gta3.de
com.rockstargames.gtasa
com.rockstargames.gtasa.de
com.rockstargames.gtavc
com.rockstargames.gtavc.de
com.rsg.myheroesen
com.sandboxinteractive.albiononline
com.sandboxol.blockymods
com.seasun.jx3
com.seasun.snowbreak.google
com.sega.ColorfulStage.en
com.sega.pjsekai
com.sega.soniccd.classic
com.sgra.dragon
com.shangyoo.neon
com.shatteredpixel.shatteredpixeldungeon
com.shenlan.m.reverse1999
com.silverstarstudio.angellegion
com.smokoko.race
com.sofunny.Sausage
com.soulgamechst.majsoul
com.spaceapegames.beatstar
com.sprduck.garena.vn
com.squareenix.lis
com.starform.metalstorm
com.stove.epic7.google
com.studiobside.CounterSide
com.studiowildcard.wardrumstudios.ark
com.studiowildcard.wardrumstudios.ark.ncr
com.sugarfun.gp.sea.lzgwy
com.sunborn.girlsfrontline.en
com.sunborn.neuralcloud
com.sunborn.neuralcloud.en
com.superb.rhv
com.supercell.boombeach
com.supercell.brawlstars
com.supercell.clashofclans
com.supercell.clashroyale
com.supercell.hayday
com.supercell.squad
com.sybogames.subway.surfers.game
com.sy.dldlhsdj
com.t2ksports.nba2k20and
com.tencent.KiHan
com.tencent.af
com.tencent.baiyeint
com.tencent.hhw
com.tencent.ig
com.tencent.iglite
com.tencent.jkchess
com.tencent.letsgo
com.tencent.lolm
com.tencent.mf.uam
com.tencent.msgame
com.tencent.nba2kx
com.tencent.nfsonline
com.tencent.tmgp.WePop
com.tencent.tmgp.bh3
com.tencent.tmgp.cf
com.tencent.tmgp.cod
com.tencent.tmgp.dfjs
com.tencent.tmgp.dfm
com.tencent.tmgp.dnf
com.tencent.tmgp.dwrg
com.tencent.tmgp.ffom
com.tencent.tmgp.gnyx
com.tencent.tmgp.kr.codm
com.tencent.tmgp.pubgmhd
com.tencent.tmgp.sgame
com.tencent.tmgp.sgamece
com.tencent.tmgp.speedmobile
com.tencent.tmgp.sskeus
com.tencent.tmgp.supercell.boombeach
com.tencent.tmgp.wuxia
com.tencent.tmgp.yys.zqb
com.tencent.toaa
com.tgc.sky.android
com.the10tons.dysmantle
com.tinybuildgames.helloneighbor
com.tipsworks.android.pascalswager
com.tipsworks.pascalswager
com.trampolinetales.lbal
com.tumuyan.ncnn.realsr
com.tungsten.fcl
com.cygames.umamusume
com.ubisoft.rainbowsixmobile.r6.fps.pvp.shooter
com.unity.mmd
com.valvesoftware.cswgsm
com.valvesoftware.source
com.vng.mlbbvn
com.vng.pubgmobile
com.vng.speedvn
com.wb.goog.scribblenauts3
com.winlator
com.wondergames.warpath.gp
com.xd.TLglobal
com.xd.dxlzz.taptap
com.xd.muffin.gp.global
com.xd.rotaeno.googleplay
com.xd.rotaeno.tapcn
com.xd.ssrpgen
com.xd.terraria
com.xd.xdt
com.xindong.torchlight
com.yinhan.hunter
com.yongshi.tenojo
com.yoozoo.jgame.global
com.yoozoo.jgame.us
com.zlongame.mhmnz
com.ztgame.bob
com.ztgame.yyzy
com.zy.wqmt.cn
com.bandainamcoent.dblegends_ww
com.bandainamcoent.idolmaster_gakuen
com.bandainamcoent.imas_millionlive_theaterdays
com.ea.games.r3_row
com.ea.game.pvz2_rfl
com.ea.game.pvz2_row
com.ea.game.pvzfree_row
com.feralinteractive.gridautosport_edition_android
com.miHoYo.bh3oversea_vn
cyou.joiplay.joiplay
hg.toriteling.neetchan
game.qualiarts.idolypride
gplay.punishing.grayraven
id.rj01117883.liomeko
jp.co.bandainamcoent.BNEI0242
jp.co.craftegg.band
jp.co.cygames.princessconnectredive
jp.co.cygames.umamusume
jp.co.koeitecmo.ReslerianaGL
jp.garud.ssimulator
jp.konami.duellinks
jp.konami.masterduel
jp.konami.pesam
jp.pokemon.pokemonunite
jp.goodsmile.touhoulostwordglobal_android
lega.feisl.hhera
me.magnum.melonds.nightly
me.mugzone.emiria
me.pou.app
me.tigerhix.cytoid
minitech.miniworld
moe.low.arc
net.kdt.pojavlaunch
net.kdt.pojavlaunch.debug
net.kdt.pojavlaunch.firefly
net.wargaming.wot.blitz
nlch.imouto.apk
org.citra.emu
org.dolphinemu.dolphinemu
org.flos.phira
org.godotengine.godot4
org.maxbytes.lfs
org.mm.jr
org.mupen64plusae.v3.alpha
org.mupen64plusae.v3.fzurita.pro
org.openttd.sdl
org.ppsspp.ppsspp
org.ppsspp.ppssppgold
org.vita3k.emulator
org.citron.citron_emu
org.sudachi.sudachi_emu.ea
org.uzuy.uzuy_emu.ea
org.yuzu.yuzu_emu
pro.archiemeng.waifu2x
ro.alyn_sampmobile.game
ru.nsu.ccfit.zuev.osuplus
ru.unisamp_mobile.game
sh.ppy.osulazer
skyline.emu
skyline.purple
tw.sonet.allbw
tw.sonet.princessconnect
uk.co.powdertoy.tpt
vng.games.revelation.mobile
www.townofmagic.com
xd.sce.promotion
xyz.aethersx2.android
ccc71.at.free
com.antutu.ABenchMark
com.antutu.benchmark.full.lite
EOF
  chmod 0666 "$GAME_LIST_FILE"
  ui_print "✅ Created $GAME_LIST_FILE"
else
  ui_print "⚠️ $GAME_LIST_FILE already exists"
fi

# Create log file
if [ ! -f "$LOG_FILE" ]; then
  touch "$LOG_FILE"
  chmod 0666 "$LOG_FILE"
fi

# Set permissions for COOLER
set_perm_recursive $MODPATH/system/etc/cooler 0 0 0755 0644
ui_print ""

##########################################################################################
# Permissions
##########################################################################################
##########################################################################################
# Custom Functions
##########################################################################################

# Android 12.0 or newer
