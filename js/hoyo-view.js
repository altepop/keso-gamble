const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const games=[['genshin','🌌 原神'],['starrail','🚂 崩壊：スターレイル'],['zzz','⚡ ゼンレスゾーンゼロ']];
const day=value=>new Date(value).toLocaleString('ja-JP');
export function hoyoPanel(view){
 if(!view)return '<section class="panel"><div class="card-body"><h2 class="panel-title">HoYoverse プロフィール連携</h2><p class="helper">原神・スターレイル・ゼンゼロの公開キャラと育成状況を表示。Steamとは別枠で、現在はKP支給なし。</p><button class="action-btn" data-action="hoyo-status">連携を開く</button></div></section>';
 const profiles=view.profiles??[];
 const cards=games.map(([game,label])=>{
  const p=profiles.find(item=>item.game===game),s=p?.snapshot;
  const next=p&&p.nextAt>Date.now()?' · 次の取得 '+day(p.nextAt):'';
  const chars=(s?.characters??[]).slice(0,12);
  return '<article class="history-entry"><h3>'+label+'</h3>'+
   (p?'<p><strong>'+escape(s.nickname)+'</strong> · UID '+escape(p.uid)+'</p><p class="helper">レベル '+(s.accountLevel??'未取得')+(s.achievements===null?'':' · 実績 '+s.achievements)+' · 公開キャラ '+s.characters.length+'人</p><p class="helper">最終取得 '+day(p.updatedAt)+next+'</p>'+
    (chars.length?'<div class="hoyo-char-list" style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0">'+chars.map(c=>'<span class="badge">ID '+escape(c.id)+' Lv.'+c.level+(c.copies?' · '+c.copies+'凸':'')+'</span>').join('')+'</div>':'<p class="helper">キャラクター展示が非公開か、展示キャラがありません。</p>')+
    (p.changes.length?'<div class="market-disclaimer"><strong>前回からの変化（公開展示の変化）</strong><br>'+p.changes.map(escape).join('<br>')+'</div>':'<p class="helper">前回からの変化はまだありません。</p>')+
    '<div class="action-row"><button class="action-btn" data-action="hoyo-refresh" data-game="'+game+'"'+(p.nextAt>Date.now()?' disabled':'')+'>公開情報を更新</button><button class="action-btn" data-action="hoyo-unlink" data-game="'+game+'">登録を解除</button></div>'
    :'<p class="helper">未登録。ゲーム内の公開プロフィールに表示されるUIDを入力。</p>')+
   '<div class="field"><label for="hoyo-uid-'+game+'">'+(p?'登録UIDを変更':'UIDを登録')+'</label><input class="input" inputmode="numeric" pattern="[0-9]*" maxlength="12" id="hoyo-uid-'+game+'" placeholder="8〜12桁の数字" value=""></div>'+
   '<button class="action-btn" data-action="hoyo-link" data-game="'+game+'">'+(p?'別のUIDを照会・登録':'公開プロフィールを照会・登録')+'</button></article>';
 }).join('');
 return '<section class="panel"><div class="card-body"><h2 class="panel-title">HoYoverse プロフィール連携</h2>'+
 '<p class="helper">3作品の公開プロフィールをEnka.Network経由で取得。ゲームのパスワード、Cookie、HoYoLABログイン情報は不要。データの更新には取得元のキャッシュ時間を守ります。</p>'+
 '<p class="market-disclaimer">⚠️ UIDの登録だけでは本人確認になりません。新規獲得・実際のプレイを証明する機能ではなく、現在は<strong>KP支給・自動巡回・外部公開ランキングなし</strong>です。自分のUIDのみ入力してください。</p>'+
 (view.error?'<p role="alert">'+escape(view.error)+'</p>':'')+(view.notice?'<p role="status">'+escape(view.notice)+'</p>':'')+
 cards+'<div class="action-row"><button class="action-btn" data-action="hoyo-status"'+(view.loading?' disabled':'')+'>'+(view.loading?'確認中…':'登録状況を確認')+'</button></div></div></section>';
}
