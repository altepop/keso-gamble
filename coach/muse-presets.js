/* Verified study presets for the Muse full UI (2026-11-22).
   Content source: ~/workspace/valorant/zagaku-presets.md, where every source
   URL was checked to exist before registration. Only sources marked
   verified:true here may be displayed; KesoCoachMuseTop.validatePreset
   re-checks the flag and the URL shape before anything is shown.
   Warmups are the maps' custom-game confirmation drills from the same
   inventory. No tactic is invented in this file. */
(function(root){
'use strict';
const CROSSHAIR={title:'Digital Racer クロスヘア配置ガイド',url:'https://www.digitalracer.store/blog/valorant-crosshair-placement-corner-drills/',verified:true};
const PRESETS=Object.freeze({
 Summit:Object.freeze({
  warmup:{title:'カスタムゲームで歩いて確認します',durationMinutes:null,steps:[
   'A Mainから入り、Garden・Art・Caveの横の角度と、奥のHall・Linkを分けてクリアする順番を確認します',
   'サイト奥のカバー裏とLink側に立ち、2人の視線が交差してトレードできる形になっているかを確認します',
   '同じルートを逆向き（サイト側から）にも歩き、攻めとリテイクで見える角度の違いを比べます']},
  study:{theme:'Aサイトのクロス位置',points:[
   '進入：A Mainではヘッドラインを安定させ、Garden・Art・Caveの横の角度と、奥のHall・Linkを分けてクリアします',
   '設置前：Gardenを先に潰します。残されると設置後の死角になります',
   '設置後：サイト奥のカバー裏とLink側で視線を交差させ、トレードできる形にします',
   '壁の状態：A Wall（落とせる壁）が落ちているかでリテイク経路が変わるので、毎ラウンド確認します',
   '確認方法：カスタムで同じルートを逆向き（サイト側から）にも歩き、攻めとリテイクで見える角度の違いを比べます'],
   sources:[
    {title:'SpikeAtlas サミット3Dマップ',url:'https://www.spikeatlas.com/en-gb/maps/summit/',verified:true},
    {title:'KeenGamer サミットガイド',url:'https://www.keengamer.com/articles/guides/valorant-summit-map-guide-best-agents-callouts-and-strategies/',verified:true},
    {title:'GamGem サミットガイド',url:'https://gamgem.com/valorant/maps/summit',verified:true},
    CROSSHAIR]}}),
 Bind:Object.freeze({
  warmup:{title:'カスタムゲームで歩いて確認します',durationMinutes:5,steps:[
   'A LobbyとB Longから入り、各サイトで植えられるカバーを2つずつ確認します',
   'A単独で回転時間を測ります',
   'Linkからリテイクします',
   '両テレポーターを1回ずつ通り、出口ドアの挙動（内側からしか開かない、外から撃ち抜ける）を確認します',
   'コール練習として「TP鳴った、A Bath側」と声に出します']},
  study:{theme:'テレポーターとスプリット',points:[
   'テレポーターの音は全員に聞こえます。使うたびにマップ全体に音が鳴り、ローテートの合図になります。入る前にユーティリティを先に通し、出口を出たらすぐ部屋を離れます。出口は待ち構えられやすい場所です',
   'Split Aの形：ShortとBath（Showers）に同時に圧力をかけ、Truck/Lampsをスモークで切ります。Cubbyは事前に潰します。設置は箱裏で、リテイク経路をBathかShortの一方に絞ります',
   'Split Bの形：LongとHookahを同時に押します。Windowは設置前に必ず潰します。設置後はLongとWindowで持ち、リテイクはHallとElbowから来ます',
   'TPフェイクとラーク：5人で片サイトを見せ、音を合図に反対サイトへ移ります。ラークはTPの音をチームにコールし、味方の誤射を防ぎます',
   '守りは出口を見ます。2-1-2で各TP出口を誰か1人が持ちます。TPの音が1回なら全員回転ではなく「出口に1人」として扱います'],
   sources:[
    {title:'SpikeAtlas バインド3Dマップ',url:'https://www.spikeatlas.com/en-gb/maps/bind/',verified:true},
    {title:'GamGem バインドガイド',url:'https://gamgem.com/valorant/maps/bind',verified:true},
    {title:'Juked バインドガイド',url:'https://juked.gg/valorant/game-guide/valorant-bind-map-breakdown-best-plays-and-agent-synergies/',verified:true},
    {title:'valorantmaps.gg バインドガイド',url:'https://valorantmaps.gg/bind',verified:true},
    CROSSHAIR]}}),
 Abyss:Object.freeze({
  warmup:{title:'カスタムゲームで歩いて確認します',durationMinutes:5,steps:[
   'A MainとB Mainから入り、各サイトで植えられるカバーを2つずつ確認します',
   'A単独でローテート時間を測ります',
   'Linkからリテイクします']},
  study:{theme:'ミッドと縁の立ち位置',points:[
   '縁から離れて撃ちます。壁がなく、落下は即死です。ノックバック系にも注意し、縁際での撃ち合いは避けます',
   'ミッドを先に取ります。Mid Top・Catwalkを押さえると、両サイトへのスプリットとローテートの起点になります',
   'A Ventは音を出して使います。壊す音が大きいので、フェイクか、タイミングを合わせたスプリットに使います',
   '設置は縁から離れたカバー裏にします。ノックバックで落とされない植え方を選びます',
   'Sovaの索敵は最小限にします。ドローン操作中の無防備とエイム低下に注意し、索敵のタイミングを先に決めておきます'],
   sources:[
    {title:'SpikeAtlas アビス3Dマップ',url:'https://www.spikeatlas.com/en-gb/maps/abyss/',verified:true},
    {title:'Juked アビスガイド',url:'https://juked.gg/valorant/game-guide/valorant-abyss-map-guide-layout-callouts-tactics/',verified:true},
    {title:'GamGem アビスガイド',url:'https://gamgem.com/valorant/maps/abyss',verified:true},
    CROSSHAIR]}}),
 Corrode:Object.freeze({
  warmup:{title:'カスタムゲームで歩いて確認します',durationMinutes:5,steps:[
   'A MainとB Mainから入り、各サイトで植えられるカバーを2つずつ確認します',
   'A単独でローテート時間を測ります',
   'Linkからリテイクします',
   'Mid BottomからStairs、Window、Topを歩き、各層でのヘッドラインの高さを確認します',
   '水たまりを一度踏んで、音の出方を確かめます']},
  study:{theme:'ミッド制圧と壁の状態を読む',points:[
   'ミッドを先に取ります。Mid BottomからStairs、Window、Topは高さの違う層です。ミッドを押さえると両サイトを脅かせ、守りに先に決断を迫れます',
   '壁の状態を先に読みます。壁の材質で通れるルートが変わり、覚えた定石がそのまま通用しない場面があります。コールは壁の状態を確認してから出します',
   'A攻め：PocketとElbowを先に潰してから設置します。A Linkや奥の視線はスモークで切ります。設置後はTop側の視線を失わないことが大切です',
   'B攻め：TowerとArchの圧を先に潰します。Bは距離の長い撃ち合いになるので、ヘッドラインを安定させて入ります。設置はカバー裏で、サイトの奥まで入ってから植えます',
   '音を読みます。水たまりの通路は足音が出ます。ローテートやラークで水を踏むと位置が知られます。逆に、相手の水の音は情報になります'],
   sources:[
    {title:'SpikeAtlas コロード3Dマップ',url:'https://spikeatlas.com/en-gb/maps/corrode/',verified:true},
    {title:'GamGem コロードガイド',url:'https://gamgem.com/valorant/maps/corrode',verified:true},
    {title:'1v9 コロードガイド',url:'https://1v9.gg/blog/valorant-corrode-map-guide',verified:true},
    {title:'expcarry コロードガイド',url:'https://expcarry.com/valorant-corrode-map-guide',verified:true},
    CROSSHAIR]}}),
 Haven:Object.freeze({
  warmup:{title:'カスタムゲームで歩いて確認します',durationMinutes:5,steps:[
   'A Long、B Back、C Longから入り、各サイトで植えられるカバーを2つずつ確認します',
   'A単独でローテート時間を測ります',
   'Linkからリテイクします',
   'GarageからWindowへの高さの段差で、クロスヘアの高さを確認します',
   'B BackからC Linkへの短い回転も歩きます']},
  study:{theme:'3サイトとミッドの支配',points:[
   'ミッドを先に取ります。Mid Courtyard・Mid Windowを押さえると、B・Garage・A Sewerへ同時に脅かせます。ミッドを渡すと3サイト全部を同時に守らされます',
   '攻めは「見せるサイト」と「決めるサイト」を分けます。片サイトでユーティリティと音を見せ、ローテートを引いてから薄いサイトを叩きます。守りは1回目のコールで全員回転せず、2回目の情報で回転します',
   'GarageとSewer（A Short）は第2の入口です。CはGarage経由、AはSewer経由でスプリットします。破壊可能パネルの状態を確認してから動きます',
   '設置はカバー裏で、リテイク経路を絞ってから植えます。Bはリテイク経路が多いので、どこを切るか決めてから植えます。AはTower（Heaven）の高さを先に潰します',
   '守りは「出口に1人」と回転の順番を決めておきます。4人で3サイトを守るので、どこかを薄くする前提で組みます'],
   sources:[
    {title:'SpikeAtlas ヘイヴン3Dマップ',url:'https://www.spikeatlas.com/en-gb/maps/haven/',verified:true},
    {title:'GamGem ヘイヴンガイド',url:'https://gamgem.com/valorant/maps/haven',verified:true},
    {title:'Juked ヘイヴンガイド',url:'https://juked.gg/valorant/game-guide/valorant-haven-guide-expert-tips-for-attack-and-defense/',verified:true},
    CROSSHAIR]}}),
 Lotus:Object.freeze({
  warmup:{title:'カスタムゲームで歩いて確認します',durationMinutes:5,steps:[
   'A Main、B Main、C Mainから入り、各サイトで植えられるカバーを2つずつ確認します',
   'A単独でローテート時間を測ります',
   'A LinkとC Linkからリテイクします',
   'A TopからA Dropへの静音ドロップを試します',
   '回転ドアを1回回して、音と回転時間を確認します']},
  study:{theme:'回転ドアと3サイトの読み',points:[
   'A Mainを先に取ります。A Mainを制圧すると、A Top・A Drop・A Stairsを隔離してドアからA Treeへ進めます。設置後はA TreeとA Dropのクロスで守ります',
   'ドアはフェイクに使います。回転ドアは音がします。守りはドアを早めに閉めて、マップを2サイトに分けます。ドアの回転範囲内のユーティリティは壊れるので、配置に注意します',
   '攻めデフォルトは4C + 1Aです。Cに4人、Aに1人で読み、反応でCヒット、B転換、Aヒットを切り替えます。A Linkの管理が設置後の鍵になります',
   'Cは滝とドアの読みです。C WaterfallとC Hallをスモークで隔離し、入る前に索敵を通します。C Moundドアからの裏取りは音で知られるので、タイミングを合わせます',
   '守りは「ドアに1人」と回転の順番を決めておきます。3サイトを薄く守る前提で、ドアが開いた音は回転の合図ですが、1回で全員回転はしません'],
   sources:[
    {title:'SpikeAtlas ロータス3Dマップ',url:'https://www.spikeatlas.com/en-gb/maps/lotus/',verified:true},
    {title:'GamGem ロータスガイド',url:'https://gamgem.com/valorant/maps/lotus',verified:true},
    {title:'Road2Radiant ロータスガイド',url:'https://road2radiant.pro/en/guides/maps/lotus',verified:true},
    CROSSHAIR]}}),
 Sunset:Object.freeze({
  warmup:{title:'カスタムゲームで歩いて確認します',durationMinutes:5,steps:[
   'A MainとB Mainから入り、各サイトで植えられるカバーを2つずつ確認します',
   'A単独でローテート時間を測ります',
   'A Linkからリテイクします',
   'Mid BottomからCourtyard、Topを歩き、A Link・Market・Bobaへの視線を確認します']},
  study:{theme:'長い視線とミッドのスプリット',points:[
   '長い視線はユーティリティで切ってから渡ります。A MainもB Mainも長い通路です。誰もクリアしていない視線を、そのまま渡ることはしません',
   'Aは3人以上で数で入ります。A Main奥をスモークとフラッシュで切り、デフォルト（奥壁際）への設置が最も守りやすい形です。Aサイト入口の角での早期デュエルがファーストブラッドの主源なので、先に潰すかスモークで切ります',
   'Bは速さが武器です。Bはタイトでスポーンに近く、速い実行ができます。2人目の守備が寄る前に数的有利を作ることが、Bの強みです',
   'ミッドはスプリットの起点です。Midを取ると、A LinkスプリットとBへの裏取りが生まれます。B Marketの破壊可能ドアは、ローテ否定とリテイクの起点になります',
   '守りは情報から読みます。A Mainの早期の足音はA寄せ、Midの動きはLinkスプリットの警戒、B Mainの早期の動きはBラッシュの警戒につなげます'],
   sources:[
    {title:'SpikeAtlas サンセット3Dマップ',url:'https://www.spikeatlas.com/en-gb/maps/sunset/',verified:true},
    {title:'GamGem サンセットガイド',url:'https://gamgem.com/valorant/maps/sunset',verified:true},
    {title:'UpForge サンセットガイド',url:'https://upforge.gg/blog/sunset-map-guide-valorant-strategy',verified:true},
    CROSSHAIR]}})
});
root.KesoCoachMusePresets=Object.freeze({PRESETS});
})(typeof globalThis==='object'?globalThis:this);
