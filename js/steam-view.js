const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const errors={free_game:'無料・基本無料ゲームは対象外です。',temporarily_free:'無料配布中のゲームは対象外です。',not_paid_game:'体験版・DLCなどは対象外です。有料ゲーム本体を選んでください。',store_unavailable:'Steamストアで有料販売を確認できず、支給を保留しています。',playtime_required:'Steamで累計120分以上を確認できるまで保留します。プレイ時間の公開設定も確認してください。',playtime_unavailable:'Steamの累計プレイ時間を確認できないため、支給を保留しています。',game_not_owned:'Steamでこのゲームの所持を確認できないため、支給を保留しています。',private_or_unavailable:'Steamのゲーム詳細・実績を取得できません。公開設定を確認してください。',rate_limited:'Steamの取得制限で待機中です。',network:'Steamへの接続を再試行します。',missing_or_pending:'一部の実績は確認・支給待ちです。',missing_rarity:'解除率を取得できず、支給を保留しています。',retry_pending:'入金を確認できず、再試行待ちです。',disconnected:'接続が解除されています。'};
const number=n=>esc(Number(n).toLocaleString('ja-JP'));
const normalize=s=>String(s??'').normalize('NFKC').toLowerCase();
export function steamConnectionMessage(status,pending,link){
 if(status?.account?.active)return 'Steamとの接続は完了しています。「所持ゲームから選ぶ」へ進んでください。';
 if(pending?.verified&&!pending.confirmed)return 'Steamでの本人確認が届きました。表示されたアカウントを確認し、「このSteamアカウントを接続」を押してください。';
 if(link)return 'Steamでの本人確認はまだ届いていません。先ほどのログインが失敗した場合は、「Steamで接続する」から新しいリンクでやり直してください。';
 return 'Steamは未接続です。「Steamで接続する」から始めてください。';
}
export function steamPanel(view){
 if(!view)return `<div class="panel"><div class="card-body"><h2 class="panel-title">Steam実績で稼ぐ</h2><p>新しく解除した実績がKPに。Steam公式ログインで接続できます。</p><button class="action-btn" data-action="steam-status">Steam連携を開く</button></div></div>`;
 const v=view.status,link=view.link,p=view.pending;
 const amounts=(v?.tiers??[{amount:5000},{amount:1000},{amount:300},{amount:100}]).map(t=>number(t.amount));
 const rewards=`解除率0.1%以下 ${amounts[0]} KP／1%以下 ${amounts[1]} KP／10%以下 ${amounts[2]} KP／10%超 ${amounts[3]} KP。`;
 const minimum=Number(v?.minPlaytimeMinutes??120),eligible=g=>Number.isSafeInteger(g.playtimeMinutes)&&g.playtimeMinutes>=minimum;
 const active=(v?.games??[]).filter(g=>g.active),activeIds=new Set(active.map(g=>g.app));
 const found=(view.library??[]).filter(g=>!activeIds.has(g.id)&&normalize(g.title).includes(normalize(view.search))),shown=found.slice(0,40);
 const library=view.library?`<label for="steam-game-search">所持ゲームを検索</label><input class="input" id="steam-game-search" value="${esc(view.search??'')}" placeholder="ゲーム名で検索"><p class="helper">${found.length}本。40本まで表示します。実績のないゲームは監視できません。無料・基本無料・無料配布中のゲームは対象外です。有料販売の確認は選択時に行います。</p>${shown.map(g=>`<article class="history-entry"><h3>${esc(g.title)}</h3><p class="helper">${Number.isSafeInteger(g.playtimeMinutes)&&g.playtimeMinutes>=0?'Steamの記録：累計'+number(g.playtimeMinutes)+'分'+(eligible(g)?'':' · あと'+number(minimum-g.playtimeMinutes)+'分'):'プレイ時間を確認できません。Steamの公開設定を確認してください。'}</p><button class="action-btn" data-action="steam-game" data-app="${esc(g.id)}" data-active="true" ${active.length>=5||!eligible(g)?'disabled':''}>${active.length>=5?'5本監視中':eligible(g)?'このゲームを監視':'累計2時間以上で対象'}</button></article>`).join('')}`:'';
 const paused=(v?.games??[]).filter(g=>!g.active&&['free_game','temporarily_free','not_paid_game'].includes(g.error)).map(g=>`<article class="history-entry"><h3>${esc(v.apps.find(a=>a.id===g.app)?.title??'Steam App '+g.app)}</h3><p>監視停止：${esc(errors[g.error])}</p><p class="helper">有料販売に戻った場合は、所持ゲーム一覧から選び直してください。再開前の解除済み実績は支給しません。</p></article>`).join('');
 const games=active.map(g=>`<article class="history-entry"><h3>${esc(v.apps.find(a=>a.id===g.app)?.title??'Steam App '+g.app)}</h3><p>監視中${g.lastChecked?' · 最終確認 '+esc(new Date(g.lastChecked).toLocaleString('ja-JP')):''}</p>${g.error?`<p class="helper">${esc(errors[g.error]??'確認待ちです。')}</p>`:''}<button class="action-btn" data-action="steam-game" data-app="${esc(g.app)}" data-active="false">監視を止める</button></article>`).join('');
 return `<div class="panel"><div class="card-body"><h2 class="panel-title">Steam実績で稼ぐ</h2>${v?`
 <p>${v.enabled?'自動支給が有効です。':'自動支給は準備中です。現在は入金されません。'}</p>
 <p>今日のSteam報酬 ${number(v.earnedToday??0)} / ${number(v.dailyCap??5000)} KP · 残り ${number(v.remainingToday??5000)} KP</p>
 <p class="helper">毎朝9時更新。全ゲーム合計で1日5,000 KPまで。上限を超える分は支給せず、翌日へ繰り越しません。</p>
 <p class="helper">${rewards}ゲーム選択前の解除済み実績は対象外です。同時監視は5本まで。管理者によるタイトル指定はありません。Steamストアで有料販売中と確認でき、累計2時間（120分）以上のゲームだけが対象です。毎回2時間遊ぶ必要はありません。</p>
 ${v.account?.active?`<p>接続先：Steam ${esc(v.account.steamId)}</p><button class="action-btn" data-action="steam-disconnect">Steam接続を解除</button>`:''}
 ${v.available?`${!v.account?.active?'<button class="action-btn primary" data-action="steam-link">Steamで接続する</button>':''}
 ${link?'<p>外部ブラウザーでSteam公式ログインを済ませ、この画面に戻ってください。</p><button class="action-btn primary" data-action="steam-open">Steam公式ログインを開く</button>':''}
 ${p?.verified&&!p.confirmed?`<p>接続先：Steam ${esc(p.steamId)}。自分のアカウントか確認してください。</p><a href="https://steamcommunity.com/profiles/${esc(p.steamId)}" target="_blank" rel="noopener noreferrer">Steamプロフィールを確認</a><button class="action-btn primary" data-action="steam-confirm">このSteamアカウントを接続</button>`:''}
 ${v.account?.active?`<p class="helper">Steamのプロフィール・ゲーム詳細を公開してください。非公開・通信失敗中は支給を保留します。解除率はBotが確認した時点の値です。</p><button class="action-btn" data-action="steam-library">所持ゲームから選ぶ</button>${games}${paused}${library}`:''}`:'<p class="helper">Steamの接続設定を準備しています。</p>'}`:`<p class="helper">${view.loading?'接続状況を確認中です。':'接続状況を確認できません。'}</p>`}
 ${view.error||view.notice?`<p role="status" aria-live="polite">${esc(view.error||view.notice)}</p>`:''}<div class="action-row"><button class="action-btn" data-action="steam-status" ${view.loading?'disabled aria-busy="true"':''}>${view.loading?'確認中…':'接続を確認'}</button></div></div></div>`;
}
