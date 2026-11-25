import {stockDiscount} from './stock-market.ts';
import {kpTargetAllowed,kpTargetMembers} from './kp-target-members.ts';
import {raceCatchphrase,raceAside} from './racing-voice.ts';
// Luxury items bought with KP. The purchase row (and the crown race, for crown items) is written by a
// trigger on the same wallet operation insert as the KP debit, so either everything applies or nothing.
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { BILLBOARD_MS, LUXURY, TITLES, endOfJstDay, validCrownName } from '../../../js/luxury.js';
import configuredPlayers from '../players.json' with { type: 'json' };
import { kpRandom } from './kp.ts';
import type { KpEnv, KpMapping } from './kp.ts';
import { ensureCrowns, nextCrownSlot } from './racing-crowns.ts';
import type { RoastLevel } from './racing-crowns.ts';
import { enqueue, ensurePosts, roastLevelsOf } from './racing-posts.ts';
interface Item { id:string; label:string; price:number; needs:string }
// Each deck is disjoint; sequence allocation below persists across Worker restarts and concurrent purchases.
const FULL_ROAST_DECKS=[
 {
  "title": "緊急記者会見",
  "lines": [
   "勝利条件の確認からやり直せや",
   "作戦会議の議事録が全部言い訳やん",
   "反省会だけ皆勤賞で草",
   "勝ち筋をわざわざ閉鎖するな",
   "謝罪会見の段取りだけプロ級や",
   "記者の質問が全部「なんで？」や",
   "改善計画が来世まで延期されとる",
   "予算の全額を敗北に突っ込むな",
   "目標達成率が行方不明や",
   "責任者がリプレイを見て絶句したわ",
   "再発防止策が前回と一字一句同じや",
   "勝利を発表する予定が消滅したぞ",
   "会見の尺だけ世界大会クラスや",
   "検討しますで何試合落とすねん",
   "結論が出る頃には次の試合も終わるわ",
   "次回会見の予約だけ先に取っとけ"
  ]
 },
 {
  "title": "競馬実況",
  "lines": [
   "お前の本命がゲート開く前から不安や",
   "対抗馬が祝勝会の予約しとるぞ",
   "馬券の印が全部逆方向やんけ",
   "直線で急に観光始めるな",
   "ゴール板が遠いんやなくて予想が遠いねん",
   "パドックで買った理由が迷子や",
   "予想紙の余白に謝罪文書いとけ",
   "人気薄より人気のない買い目や",
   "逆張りして順張りして結局外すな",
   "本命発表が対抗馬の応援歌になっとる",
   "馬より先に資金が走り去ったわ",
   "着順を下から読む才能は一級品や",
   "馬券の払い戻し機に顔覚えられてへんぞ",
   "単勝を複雑な芸術にすな",
   "実況席が何を実況すべきか困っとる",
   "次のレースはまず出馬表から読もか"
  ]
 },
 {
  "title": "株式市場",
  "lines": [
   "買い注文が天井の目印になっとる",
   "売り注文が底値の鐘になっとる",
   "チャートが逆さまでも成績一緒ちゃうか",
   "含み益は伝説上の生物か",
   "損切りのタイミングだけ永久に審議中や",
   "投資戦略がジェットコースターの設計図や",
   "上昇トレンドに逆走してどうすんねん",
   "市場分析より市場の分析対象になっとる",
   "買った銘柄の応援席が急に静かや",
   "ポートフォリオが全部オチ担当や",
   "決算説明会のスライドが全部赤いぞ",
   "リスク管理のリスクが一番でかいわ",
   "利益確定という機能をご存じですか",
   "市場の反応が見事な逆指標や",
   "暴落の理由を買い注文に求めるな",
   "次回はグラフの上下を確認しよか"
  ]
 },
 {
  "title": "行政監査",
  "lines": [
   "勝利事業の執行率が審議入りや",
   "敗北予算だけ満額執行してどうすんねん",
   "目標指標が全項目で赤信号や",
   "改善報告書が前年度の焼き直しや",
   "決裁前に作戦が崩壊しとる",
   "庁内調整してる間に試合終わったぞ",
   "費用対効果の効果が見つからへん",
   "敗北の標準化だけ異常に進んどる",
   "勝利施策が実証実験で止まっとる",
   "監査資料がリプレイ一枚で足りるやん",
   "見直し方針の見直し会議やめろ",
   "失敗事例集のページ数を増やすな",
   "勝ち筋の所管がどこにもないぞ",
   "進捗管理表が謝罪文になっとる",
   "次年度予算に勝利条件の研修費を計上や",
   "検討委員会よりまず一勝せえ"
  ]
 },
 {
  "title": "宇宙開発",
  "lines": [
   "打ち上げ前に勝ち筋が大気圏外や",
   "軌道計算が全力で敵陣向いとる",
   "燃料満タンで敗北へ直行すな",
   "司令室が無言でモニター消したわ",
   "着陸地点がなぜか出発地点や",
   "宇宙望遠鏡でも勝利が見えへん",
   "重力より強い力で負けに引かれとる",
   "通信途絶して言い訳だけ届くな",
   "月面基地より遠い勝利条件や",
   "逆噴射の使い方だけ一流や",
   "軌道修正が全部遠回りやん",
   "ミッション名を失敗例収集に変えろ",
   "管制塔がカウントダウンを諦めたぞ",
   "ロケットの先端に白旗付けるな",
   "衛星から見ても作戦が迷子や",
   "帰還後はチュートリアルに再突入や"
  ]
 },
 {
  "title": "料理番組",
  "lines": [
   "勝ち筋を強火で炭にすな",
   "レシピ読んで完成品を爆発させるな",
   "下ごしらえで全部の材料失うな",
   "隠し味が敗北になっとる",
   "調味料の順番より作戦の順番や",
   "オーブン開けたら言い訳が焼けとった",
   "盛り付けだけ豪華な失敗作や",
   "試食担当が攻略本を出してきたぞ",
   "味見する前に試合が焦げたわ",
   "包丁研いで戦術切り刻むな",
   "火加減が毎回クライマックスや",
   "勝利のレシピを逆から読むな",
   "食材全部敵チームに提供しとる",
   "料理時間より反省会の方が長いわ",
   "三つ星評価の星が全部消えたぞ",
   "次回はまずコンロの電源確認や"
  ]
 },
 {
  "title": "ゲーム攻略本",
  "lines": [
   "攻略本のやってはいけない欄を完全再現や",
   "チュートリアルにラスボス並みの苦戦すな",
   "セーブ地点からわざわざ負けに走るな",
   "イージーモードに接待されとる",
   "最強装備で最弱のルート選ぶな",
   "ボスより説明文を攻略せえ",
   "クエストの目的地だけ毎回逆や",
   "隠し実績の全敗条件を狙うな",
   "コンティニューの演出だけ見飽きたわ",
   "攻略動画の悪い例に採用や",
   "オート戦闘の方が判断速そうやな",
   "スキルポイントを反省会に全振りすな",
   "勝利画面が未解放コンテンツやん",
   "パッチノートで勝ち筋が修正されるの待つな",
   "リトライ回数で殿堂入りすな",
   "次は開始ボタンの横の説明読もか"
  ]
 },
 {
  "title": "学校の成績表",
  "lines": [
   "勝ち方のテストで裏面まで間違うな",
   "反省文の提出だけ満点や",
   "敗北の自由研究が全国大会級や",
   "作戦の予習を全部忘れてきたんか",
   "先生が解答用紙ひっくり返してもうた",
   "通知表の努力欄にしか丸がないぞ",
   "答え合わせのたびに新しい謎が生まれるわ",
   "補習の補習を予約しとけ",
   "実技試験で見本の逆をやるな",
   "教科書より言い訳ノートが分厚いぞ",
   "勝利の単元だけ欠席しとる",
   "黒板に負け筋を全部書くな",
   "グループ課題で敵側に貢献するな",
   "宿題の勝ち筋どこ置いてきたんや",
   "再試験の予定表が満員や",
   "卒業条件はまず一勝です"
  ]
 },
 {
  "title": "鉄道運行情報",
  "lines": [
   "勝利行きの電車に乗って敗北駅で降りるな",
   "終点まで逆方向に爆走や",
   "乗換案内が匙投げたぞ",
   "特急料金払って各駅敗北すな",
   "作戦変更で永久に折り返し運転や",
   "勝ち筋方面のホームが閉鎖されたわ",
   "遅延証明書がリプレイ全編や",
   "線路の分岐で毎回負け側選ぶな",
   "運転再開見込みは未定です",
   "快速言い訳号だけ定刻発車や",
   "駅員が勝利への道案内を諦めたぞ",
   "始発から終電まで反省会や",
   "乗車券を買って観戦席に戻るな",
   "勝利駅を通過する仕様なんか",
   "終着駅でまた乗り間違えるな",
   "次回は行き先表示を読んでから出発や"
  ]
 },
 {
  "title": "天気予報",
  "lines": [
   "勝利確率に濃霧注意報や",
   "予想が外れすぎて気象衛星が困っとる",
   "判断に局地的な逆風が発生中",
   "作戦の上空に巨大な負け雲や",
   "晴れ予報で毎回どしゃ降りすな",
   "勝ち筋の観測所が閉鎖されたぞ",
   "言い訳前線が全国に拡大中や",
   "反省会だけ年間降水量更新や",
   "勝利の気圧配置が教科書と逆や",
   "予報円が敵チームを囲んどる",
   "敗北警報が解除されへん",
   "勝ちの兆しが地平線の向こうや",
   "傘持って砂漠に出かける作戦すな",
   "天気図に白旗のマーク増やすな",
   "予報士が次戦をノーコメントにしたわ",
   "まずは足元の天気を確認せえ"
  ]
 },
 {
  "title": "工事現場",
  "lines": [
   "勝ち筋の建設予定地が更地や",
   "作戦の基礎工事で全部傾いとる",
   "設計図の完成形が敗北やんけ",
   "工期延長で次の試合まで掘り続けるな",
   "監督がヘルメット抱えて頭抱えとる",
   "足場より先に勝利が崩れたぞ",
   "品質検査で逆方向の施工が発覚や",
   "安全第一の看板だけ立派やな",
   "完成式典の予約を取り消すな",
   "材料全部敵陣に搬入しとる",
   "手直し工事が本工事より大規模や",
   "重機で自分の勝ち筋掘り返すな",
   "進捗率の数字がマイナスになっとる",
   "建築確認の段階で攻略本渡されたわ",
   "敗北の記念碑だけ完成度高いぞ",
   "次は水平器から使おか"
  ]
 },
 {
  "title": "法廷劇",
  "lines": [
   "勝ち筋の存在が証拠不十分や",
   "弁護側がリプレイ見て沈黙したぞ",
   "検察の証拠が試合の全ラウンドや",
   "異議ありのタイミングだけ遅いねん",
   "反論するたびに新しい負け筋が出るわ",
   "判決を先送りしてもスコアは変わらんぞ",
   "証人が攻略画面を提出しとる",
   "作戦の合理性について審理長期化や",
   "敗北の再現実験で全員納得したわ",
   "陪審員がチュートリアルを推奨しとる",
   "勝利条件を知らなかったとの供述や",
   "証拠映像の編集点が全部ハイライトや",
   "勝てるという主張が立証できへん",
   "控訴審でも同じ作戦やめろ",
   "法廷の時計だけ進んで試合内容止まっとる",
   "次回は証拠より勝ちを持ってこい"
  ]
 },
 {
  "title": "通販番組",
  "lines": [
   "勝ち筋を返品するなや",
   "敗北セットの定期購入は解約せえ",
   "今なら反省会がもう一個付いてくるぞ",
   "成功例の写真が一枚もない商品や",
   "商品の使用方法を逆に試すな",
   "勝利保証の対象外になっとる",
   "購入者レビューが全部攻略アドバイスや",
   "送料だけで勝利まで届きそうやな",
   "効果実感ゼロでリピートすな",
   "お試しセットから本契約で負けるな",
   "比較動画が敵チームの宣伝になっとる",
   "説明書を読まずに組み立てるな",
   "セール価格でも高すぎる作戦や",
   "お客様相談室に勝ち筋が迷い込んだぞ",
   "在庫切れなのは勝ちだけや",
   "次は取扱説明書付きの作戦を選べ"
  ]
 },
 {
  "title": "音楽祭",
  "lines": [
   "勝ち筋のテンポが毎回裏拍や",
   "ソロパートで全員のリズム崩すな",
   "イントロだけ名曲でサビが敗北や",
   "指揮者がタクト置いて帰ったぞ",
   "譜面の上下を逆に読むな",
   "勝利のファンファーレが未収録や",
   "反省会のアンコールだけ長すぎるわ",
   "転調するたびに敵が有利になるぞ",
   "演奏終了より先に拍手が止まったわ",
   "全員合奏で一人だけ別の曲やるな",
   "メトロノームにまで置いてかれるな",
   "楽譜に言い訳を書き足すな",
   "ライブ盤の全曲が負け試合や",
   "リハーサルで勝って本番で崩れるな",
   "オーケストラがチューニングからやり直しや",
   "次回はせめて同じ曲を演奏せえ"
  ]
 },
 {
  "title": "航空管制",
  "lines": [
   "勝利滑走路への着陸許可を自分で取り消すな",
   "離陸直後に逆方向へ旋回や",
   "目的地を敗北に設定するな",
   "管制官が航路図を二度見したわ",
   "機内アナウンスだけ自信満々やんけ",
   "燃料切れより先に勝ち筋切れとる",
   "乗客全員が攻略動画見始めたぞ",
   "着陸態勢からなぜか再離陸や",
   "航路変更のたびに遠ざかるな",
   "計器飛行でスコアを見失うな",
   "勝利便が毎回欠航しとる",
   "反省会行きの便だけ増便や",
   "緊急着陸先が敵の祝勝会場やん",
   "操縦マニュアルを逆に実行すな",
   "空港職員がリプレイで研修しとる",
   "次は目的地入力から確認や"
  ]
 },
 {
  "title": "探偵事務所",
  "lines": [
   "勝利失踪事件の犯行現場が毎回同じや",
   "手掛かり全部捨てて推理始めるな",
   "探偵がリプレイ見て即解決したぞ",
   "アリバイより作戦の辻褄合わせろ",
   "犯人は負け筋を選んだその判断や",
   "謎解きの答えがスコアボードに出とる",
   "虫眼鏡でも見つからん勝ち筋や",
   "推理の結論が毎回次こそ勝つやん",
   "捜査員がチュートリアルを証拠品にしたぞ",
   "現場検証で全員が同じとこ指差すな",
   "密室から敵だけ逃がすな",
   "伏線回収が全部敗北につながっとる",
   "推理小説の最終章だけ毎回同じや",
   "迷宮入りしたのは勝利条件や",
   "名探偵も言い訳の長さに驚いとる",
   "次は事件を起こさず勝ってこい"
  ]
 },
 {
  "title": "ロボット工場",
  "lines": [
   "勝利判定のセンサーが未接続や",
   "敗北製造ラインだけフル稼働すな",
   "品質検査で作戦が全数不合格や",
   "制御プログラムに逆走を実装するな",
   "ロボットがリプレイ見て工場出荷時に戻ったぞ",
   "試作品より反省会の量産が速いわ",
   "エラーコードが毎回同じやんけ",
   "修理担当が原因を説明する前に次も壊れたぞ",
   "アップデートで勝率がデグレすな",
   "勝利ユニットが部品不足や",
   "自動運転の方が勝ち筋探しそうや",
   "テスト環境だけ絶好調やな",
   "障害報告書が日刊誌になっとる",
   "設計レビューで全員首傾げとる",
   "不具合の再現率だけ100パーセントや",
   "次回は電源入れる前に仕様書読め"
  ]
 },
 {
  "title": "スポーツ実況",
  "lines": [
   "開始の笛より早く作戦が崩れたぞ",
   "逆転劇の主役が毎回相手側や",
   "監督がホワイトボード消し始めたわ",
   "勝利へのパスを敵に通すな",
   "ハイライトが全部相手の名場面や",
   "解説席が無言の時間長すぎるわ",
   "練習の成果が反省会に集中しとる",
   "守備固めのつもりで穴広げるな",
   "試合終了の笛だけ待ち遠しいな",
   "ベンチの作戦表が迷路になっとる",
   "逆転のチャンスを自分で片付けるな",
   "実況がまたこの展開ですと言うたぞ",
   "タイムアウト取って同じことすな",
   "記録係が失点欄を追加したわ",
   "勝利インタビューのマイクが新品のままや",
   "次はルールブックからアップしとけ"
  ]
 },
 {
  "title": "テーマパーク",
  "lines": [
   "勝利アトラクションが運休中や",
   "敗北コースターだけ待ち時間ゼロや",
   "地図見て出口に向かうな",
   "入場券で退場ゲート直行すな",
   "作戦のパレードが逆走しとる",
   "記念写真が全部反省会やん",
   "勝利のショーが悪天候で中止や",
   "案内スタッフが道順を描き直したぞ",
   "お土産が負け試合のリプレイや",
   "ファストパスで敗北を早めるな",
   "観覧車より作戦がぐるぐる回っとる",
   "迷子センターに勝ち筋届いとるぞ",
   "絶叫ポイントが試合の全場面や",
   "閉園時間まで同じ場所おるな",
   "チケット代より言い訳の情報量多いわ",
   "次回は入口の地図から見よか"
  ]
 },
 {
  "title": "研究発表",
  "lines": [
   "仮説を立てて全部反証するな",
   "勝利の実験が毎回対照群以下や",
   "論文の結論が要再試験で草",
   "再現性だけ異常に高い敗北や",
   "査読者が攻略サイトのURL返してきたぞ",
   "実験条件を変えて同じミスすな",
   "データのグラフが下向きに芸術的や",
   "サンプル数を増やして勝率下げるな",
   "研究費が全部反省会に消えたわ",
   "観測結果が作戦と完全に逆や",
   "実験ノートが失敗事例の百科事典や",
   "新規性はあるけど勝利がないぞ",
   "学会発表で会場が一斉に首傾げとる",
   "検証結果を無視して仮説を守るな",
   "次の研究テーマは勝利条件の理解や",
   "まずは実験の目的を書き直せ"
  ]
 }
] as const;
const NORMAL_ROAST_DECKS=[
 [
  "緊急記者会見モードで、今回は作戦を再点検や。",
  "次の挑戦では勝利条件から見直そか。",
  "次こそ会見を祝勝会に変えていこや。"
 ],
 [
  "競馬実況モードで、今回は作戦を再点検や。",
  "次の挑戦では本命選びから見直そか。",
  "次こそ予想を的中に変えていこや。"
 ],
 [
  "株式市場モードで、今回は作戦を再点検や。",
  "次の挑戦では買い時から見直そか。",
  "次こそ収支をプラスに変えていこや。"
 ],
 [
  "行政監査モードで、今回は作戦を再点検や。",
  "次の挑戦では目標設定から見直そか。",
  "次こそ成果を報告に変えていこや。"
 ],
 [
  "宇宙開発モードで、今回は作戦を再点検や。",
  "次の挑戦では進行方向から見直そか。",
  "次こそ着陸を成功に変えていこや。"
 ],
 [
  "料理番組モードで、今回は作戦を再点検や。",
  "次の挑戦では準備手順から見直そか。",
  "次こそ完成品を食卓に変えていこや。"
 ],
 [
  "ゲーム攻略本モードで、今回は作戦を再点検や。",
  "次の挑戦では攻略ルートから見直そか。",
  "次こそクリア画面を記念に変えていこや。"
 ],
 [
  "学校の成績表モードで、今回は作戦を再点検や。",
  "次の挑戦では基本問題から見直そか。",
  "次こそ答案を満点に変えていこや。"
 ],
 [
  "鉄道運行情報モードで、今回は作戦を再点検や。",
  "次の挑戦では乗換順序から見直そか。",
  "次こそ終点を勝利駅に変えていこや。"
 ],
 [
  "天気予報モードで、今回は作戦を再点検や。",
  "次の挑戦では状況判断から見直そか。",
  "次こそ予報を快晴に変えていこや。"
 ],
 [
  "工事現場モードで、今回は作戦を再点検や。",
  "次の挑戦では土台作りから見直そか。",
  "次こそ完成式を予定どおりに変えていこや。"
 ],
 [
  "法廷劇モードで、今回は作戦を再点検や。",
  "次の挑戦では根拠整理から見直そか。",
  "次こそ証拠を勝利に変えていこや。"
 ],
 [
  "通販番組モードで、今回は作戦を再点検や。",
  "次の挑戦では説明確認から見直そか。",
  "次こそレビューを星五つに変えていこや。"
 ],
 [
  "音楽祭モードで、今回は作戦を再点検や。",
  "次の挑戦ではタイミングから見直そか。",
  "次こそ演奏を大成功に変えていこや。"
 ],
 [
  "航空管制モードで、今回は作戦を再点検や。",
  "次の挑戦では進路選択から見直そか。",
  "次こそ目的地を勝利に変えていこや。"
 ],
 [
  "探偵事務所モードで、今回は作戦を再点検や。",
  "次の挑戦では手掛かりから見直そか。",
  "次こそ謎を解決に変えていこや。"
 ],
 [
  "ロボット工場モードで、今回は作戦を再点検や。",
  "次の挑戦では動作確認から見直そか。",
  "次こそ製品を合格に変えていこや。"
 ],
 [
  "スポーツ実況モードで、今回は作戦を再点検や。",
  "次の挑戦では連携から見直そか。",
  "次こそ試合を名勝負に変えていこや。"
 ],
 [
  "テーマパークモードで、今回は作戦を再点検や。",
  "次の挑戦では案内図から見直そか。",
  "次こそ記念写真を笑顔に変えていこや。"
 ],
 [
  "研究発表モードで、今回は作戦を再点検や。",
  "次の挑戦では仮説検証から見直そか。",
  "次こそ実験を成功に変えていこや。"
 ]
] as const;
const ROAST_OPENINGS=[
 "ぎゃああああああああwwwwww",
 "どひゃーーーー！！競馬場がざわついとるぞww",
 "大変です！！架空の取引所から緊急放送です！",
 "緊急招集！！勝利事業の監査を開始します！",
 "管制室より緊急通信！！",
 "お待たせしました！！本日の爆速料理特番です！",
 "攻略班が緊急集合！！",
 "臨時の成績発表を始めます！！",
 "運行情報です！！",
 "気象特番に切り替えます！！",
 "現場から緊急中継です！！",
 "ただいまより特別法廷を開廷します！！",
 "お茶の間の皆様、緊急通販です！！",
 "臨時公演、開幕や！！",
 "管制塔より特別アナウンス！！",
 "探偵事務所から速報です！！",
 "緊急の品質検査を実施します！！",
 "実況席から特別中継です！！",
 "緊急の園内放送です！！",
 "臨時学会を開催します！！"
] as const;
const ROAST_FINALES=[
 [
  "本投稿には30,000KPが費やされております。",
  "なお、対象者の勝率改善に使われた予算は0KPです。",
  "ほな、また負けたときにお会いしましょうwwwwww"
 ],
 [
  "今回の特番に30,000KPを投じました。",
  "的中のための研究費ではなく、外れ馬券を実況する費用です。",
  "次の本命発表も対抗馬一同、心よりお待ちしております。"
 ],
 [
  "広告宣伝費として30,000KPを計上しました。",
  "なお、利益確定の記録は今回の架空決算に存在しません。",
  "次回の決算もチャートより言い訳の伸び率に注目やww"
 ],
 [
  "本事業には30,000KPを投入しました。",
  "勝利事業の成果物は未納、反省会の議事録だけ納品済みです。",
  "来年度も同じ反省会を開催する場合は予算査定からやり直しや。"
 ],
 [
  "今回の宇宙ミッションの放送費は30,000KPです。",
  "勝利の観測には失敗しましたが、負け筋の全容は高画質で撮影できました。",
  "次の打ち上げも、まず地球から出発してくれやww"
 ],
 [
  "制作費30,000KPで、豪華な料理番組をお送りしました。",
  "完成した料理は勝利ではなく、焦げた作戦の盛り合わせです。",
  "次回は食材を敵チームに配る前に試食してなww"
 ],
 [
  "攻略特番の制作費は30,000KPです。",
  "今回解放された実績は、攻略本の注意書き完全再現です。",
  "次回の放送はチュートリアルクリア後にお願いしますww"
 ],
 [
  "特別補習の教材制作費に30,000KPを使いました。",
  "成績表には反省文の提出欄だけ花丸を付けておきます。",
  "次は答案用紙に勝ち筋を書いてから提出してなww"
 ],
 [
  "鉄道特番に30,000KPを投入しました。",
  "勝利行きは運休、快速反省会号は増発しております。",
  "次は終点の表示くらい読んでから乗車してくれやww"
 ],
 [
  "本日の特別予報は30,000KPの提供でお届けしました。",
  "勝利の観測は困難ですが、言い訳前線の接近は確認済みです。",
  "敗北注意報、解除予定は次の勝利まで未定やww"
 ],
 [
  "現場中継に30,000KPを投入しました。",
  "完成予定の勝利は更地、反省会場だけ竣工しております。",
  "次回は基礎工事を飛ばして祝勝会を建てるなよww"
 ],
 [
  "本法廷の特別中継費は30,000KPです。",
  "判決は勝ち筋の立証不足、追加証拠は次の試合で提出願います。",
  "言い訳の異議申し立ては閉廷後にどうぞww"
 ],
 [
  "番組制作費として30,000KPをいただきました。",
  "今回の商品は敗北の定期便。反省会は追加料金なしで付属します。",
  "お得やないから次は契約する前に説明書読んでなww"
 ],
 [
  "特別公演の協賛金は30,000KPです。",
  "勝利のファンファーレは未演奏、敗北のアンコールだけ開催されました。",
  "次回は反省会をメイン曲にするんやないでww"
 ],
 [
  "航空特番の制作には30,000KPを使用しました。",
  "勝利便は欠航、反省会便は満席で出発いたしました。",
  "次は目的地を確認してから離陸しろやww"
 ],
 [
  "特別捜査の経費として30,000KPを受領しました。",
  "勝ち筋失踪事件は映像資料だけで解決、反省会の謎は継続調査です。",
  "次の依頼は勝利してから持ってきてなww"
 ],
 [
  "工場見学特番の制作費は30,000KPです。",
  "敗北ラインは量産体制、勝利ラインは試運転で停止中です。",
  "次回は不具合の再現率ではなく勝率を上げるんやでww"
 ],
 [
  "特別実況は30,000KPのスポンサー提供です。",
  "勝利インタビュー用マイクは今回も新品のまま保管されます。",
  "次の放送ではせめて開封させてくれやww"
 ],
 [
  "今回のパーク特番は30,000KPで開催しました。",
  "勝利アトラクションは運休、敗北コースターは乗り放題です。",
  "次は出口じゃなく目的のアトラクションに向かってなww"
 ],
 [
  "特別研究発表に30,000KPの助成金を投入しました。",
  "敗北の再現性については十分な証拠が集まり、勝利は追加研究が必要です。",
  "次回の論文は反省会の議事録で代用せんといてなww"
 ]
] as const;
export function luxuryRoastText(level:Exclude<RoastLevel,'mild'>,sequence:number,target:string,user:string){
 const index=sequence%FULL_ROAST_DECKS.length;
 const deck=FULL_ROAST_DECKS[index]!;
 const lines=level==='full'?deck.lines:NORMAL_ROAST_DECKS[index]!;
 return [`📢 <@${target}>`,`🚨 **特製煽り投稿｜${deck.title} 編** 🚨`,'-# KESO PLAY 架空のゲーム内特番', '',...(level==='full'?[ROAST_OPENINGS[index]!,'']:[]),...lines.map(line=>'・'+line),'',...(level==='full'?['**【等しいbotからのお知らせ】**','',...ROAST_FINALES[index]!,'']:[]),level==='full'?`提供：<@${user}>`:`🎙️ 30,000 KP提供：<@${user}>`].join('\n');
}
// Atomic allocation, unique for each guild and tone until the finite deck wraps.
// Repeated delivery attempts reuse the same sequence rather than consuming another deck.
async function roastSequence(env:KpEnv,guild:string,id:string,level:Exclude<RoastLevel,'mild'>){
 const row=await env.DB.prepare(`INSERT INTO kp_luxury_roast_order(id,guild,level,seq)
 VALUES(?,?,?,COALESCE((SELECT MAX(seq) FROM kp_luxury_roast_order WHERE guild=? AND level=?),-1)+1)
 ON CONFLICT(id) DO UPDATE SET id=excluded.id RETURNING seq,level`).bind(id,guild,level,guild,level).first<{seq:number;level:Exclude<RoastLevel,'mild'>}>();
 if(!row)throw Error('煽り投稿の順番を確保できませんでした。');
 return row;
}
const memberName=(mapping:KpMapping,user:string)=>{const a=mapping.accounts.find(a=>a.discordUserId===user);return a?(configuredPlayers.find(p=>p.riotId.toLowerCase()===a.riotId.toLowerCase())?.name??a.riotId.split('#')[0]):'メンバー';};
const clean=(text:string)=>text.replace(/[@`*_~<>|]/g,'');
const initialized=new WeakSet<object>();
export async function ensureLuxury(env:KpEnv){
 if(initialized.has(env.DB))return;
 await ensureCrowns(env);
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_luxury_roast_order(id TEXT PRIMARY KEY,guild TEXT NOT NULL,level TEXT NOT NULL,seq INTEGER NOT NULL,UNIQUE(guild,level,seq))'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_luxury(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,item TEXT NOT NULL,target TEXT,payload TEXT,until INTEGER,created_at INTEGER NOT NULL)'),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_luxury_apply AFTER INSERT ON kp_operations WHEN json_extract(NEW.response,'$.result.luxury.id') IS NOT NULL BEGIN
   INSERT INTO kp_luxury(id,guild,user,item,target,payload,until,created_at) VALUES(json_extract(NEW.response,'$.result.luxury.id'),NEW.guild,NEW.user,json_extract(NEW.response,'$.result.luxury.item'),json_extract(NEW.response,'$.result.luxury.target'),json_extract(NEW.response,'$.result.luxury.payload'),json_extract(NEW.response,'$.result.luxury.until'),NEW.at);
   INSERT INTO kp_crowns(guild,race,name,user,kind,source,created_at) SELECT NEW.guild,json_extract(NEW.response,'$.result.luxury.crown.race'),json_extract(NEW.response,'$.result.luxury.crown.name'),json_extract(NEW.response,'$.result.luxury.crown.user'),'bought','luxury:'||json_extract(NEW.response,'$.result.luxury.id'),NEW.at WHERE json_extract(NEW.response,'$.result.luxury.crown.race') IS NOT NULL;
  END`),
 ]);
 initialized.add(env.DB);
}
/** Validates a purchase and returns the result the trigger applies. Debits `state.cash`. */
export async function buyLuxury(env:KpEnv&{KP_EARNINGS_WEBHOOK_URL?:string},mapping:KpMapping,user:string,state:{cash:number},args:Record<string,unknown>,now=Date.now(),discountPercent=0){
 await ensureLuxury(env);
 const item=(LUXURY as Item[]).find(i=>i.id===args.item);if(!item)throw Error('品目を選んでください。');
 const discount=stockDiscount(item.price,discountPercent);
 if(state.cash<discount.paid)throw Error('KPが足りません。');
 const luxury:{id:string;item:string;target:string|null;payload:string|null;until:number|null;crown?:{race:number;name:string;user:string}}={id:'lux-'+kpRandom(),item:item.id,target:null,payload:null,until:null};
 if(item.needs==='target'){
  const target=String(args.target??'');
  if(target===user||!await kpTargetAllowed(env,mapping,target))throw Error('KP口座のある相手を選んでください。');
  if((await roastLevelsOf(env,mapping))(target)==='mild')throw Error('相手の煽りレベルが「控えめ」なので使えません。');
  if(item.id==='roast-post'&&!env.KP_EARNINGS_WEBHOOK_URL)throw Error('稼ぎchの投稿先がまだ設定されていません。');
  luxury.target=target;
  if(item.id==='convict')luxury.until=endOfJstDay(now);
 }
 if(item.id==='title'){if(!TITLES.includes(args.title))throw Error('称号を選んでください。');luxury.payload=String(args.title);}
 if(item.id==='crown-name'||item.id==='crown-target'){
  const race=await nextCrownSlot(env,mapping.guildId,now);if(race===null)throw Error('空いている枠がありません。');
  const targetName=luxury.target?(await kpTargetMembers(env,mapping)).find(m=>m.id===luxury.target)?.name:null;
  const name=item.id==='crown-name'?validCrownName(args.text):`${targetName??memberName(mapping,luxury.target!)}を笑う会`;
  luxury.crown={race,name,user:item.id==='crown-name'?user:luxury.target!};luxury.payload=name;
 }
 if(item.needs==='horse'||item.needs==='retired'){
  const horse=await env.DB.prepare('SELECT id,retired_at FROM kp_horses WHERE guild=? AND owner=? AND id=? AND sold_at IS NULL').bind(mapping.guildId,user,String(args.horseId??'')).first<{id:string;retired_at:number|null}>();
  if(!horse||(item.needs==='retired'&&!horse.retired_at))throw Error(item.needs==='retired'?'引退した自分の馬を選んでください。':'自分の馬を選んでください。');
  if(item.id==='statue'&&await env.DB.prepare("SELECT 1 FROM kp_luxury WHERE item='statue' AND payload=?").bind(horse.id).first())throw Error('この馬にはもう銅像があります。');
  luxury.payload=horse.id;
  if(item.id==='billboard')luxury.until=now+BILLBOARD_MS;
 }
 state.cash-=discount.paid;
 return {luxury,discount};
}
/** Posts for a completed purchase (after its insert succeeded). Missing webhook means no post. */
export async function luxuryPosts(env:KpEnv&{KP_EARNINGS_WEBHOOK_URL?:string},mapping:KpMapping,user:string,luxury:{id:string;item:string;target:string|null;payload:string|null;crown?:{race:number;name:string}},now=Date.now()){
 if(!env.KP_EARNINGS_WEBHOOK_URL)return;
 await ensurePosts(env);
 const when=(t:number)=>new Date(t).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 let text='';
 if(luxury.item==='roast-post'){
  const level=(await roastLevelsOf(env,mapping))(luxury.target!);
  if(level==='mild')return;
  await ensureLuxury(env);
  const allocation=await roastSequence(env,mapping.guildId,luxury.id,level);
  // Never escalate a retried purchase if the recipient has since reduced their setting.
  if(allocation.level==='full'&&level!=='full')return;
  text=luxuryRoastText(allocation.level,allocation.seq,luxury.target!,user);
 }
 if(luxury.item==='convict')text=`🚨 本日の戦犯は <@${luxury.target}> に決定（<@${user}> が認定）`;
 if(luxury.crown)text=`🏇 『${clean(luxury.crown.name)}』開催決定！ ${when(luxury.crown.race)}発走（<@${user}> の冠レース）\n💬 ${raceCatchphrase('crown',String(luxury.crown.race))}\n${raceAside('crown',String(luxury.crown.race))}`;
 if(luxury.item==='billboard')text=`🏆 <@${user}> の馬が今週の看板馬に！`;
 if(luxury.item==='statue')text=`🗿 <@${user}> が愛馬の銅像を殿堂に建てました。`;
 if(text)await enqueue(env,'luxury:'+luxury.id,text,now);
}
/** What everyone sees: today's convicts, the current billboard horse; and the viewer's own title. */
export async function luxuryView(env:KpEnv,mapping:KpMapping,user:string,now=Date.now(),displayNames:ReadonlyMap<string,string>=new Map()){
 await ensureLuxury(env);
 const rows=(await env.DB.prepare("SELECT user,item,target,payload,until FROM kp_luxury WHERE guild=? AND (item IN ('title','statue') OR until>?) ORDER BY created_at DESC LIMIT 200").bind(mapping.guildId,now).all<{user:string;item:string;target:string|null;payload:string|null;until:number|null}>()).results;
 const convicts=[...new Set(rows.filter(r=>r.item==='convict').map(r=>r.target!))].map(u=>({user:u,name:displayNames.get(u)??memberName(mapping,u)}));
 const board=rows.find(r=>r.item==='billboard');
 const horse=board?await env.DB.prepare('SELECT name FROM kp_horses WHERE id=?').bind(board.payload).first<{name:string}>():null;
 return {
  title:rows.find(r=>r.item==='title'&&r.user===user)?.payload??null,
  convicts,
  billboard:board&&horse?{horseName:horse.name,ownerName:displayNames.get(board.user)??memberName(mapping,board.user),until:board.until}:null,
  statues:rows.filter(r=>r.item==='statue'&&r.user===user).map(r=>r.payload),
 };
}
export async function titlesOf(env:KpEnv,guild:string){
 await ensureLuxury(env);
 const rows=(await env.DB.prepare("SELECT user,payload FROM kp_luxury WHERE guild=? AND item='title' ORDER BY created_at").bind(guild).all<{user:string;payload:string}>()).results;
 return new Map(rows.map(r=>[r.user,r.payload]));
}
