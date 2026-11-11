/* KESO PLAY MUSIC: official audio, Spotify-inspired controls, local-only settings. */
(function(){
  "use strict";
  var tracks=[
    {id:"mou",title:"もう一周",src:"music/assets/mou-isshu.mp3",icon:"↻"},
    {id:"rhapsody",title:"限界集落狂詩曲",src:"music/assets/genkai-rhapsody.mp3",icon:"♫"},
    {id:"kyohansha",title:"午前二時の共犯者",src:"music/assets/午前二時の共犯者 (1).mp3",icon:"✦"},
    {id:"ouenka",title:"応援歌",src:"music/assets/応援歌 (Remastered).mp3",icon:"★"},
    {id:"gosa",title:"誤差の女王",src:"music/assets/誤差の女王B.mp3",icon:"◇"},
    {id:"fullpa",title:"フルパなら",src:"music/assets/フルパならB.mp3",icon:"⚡"},
    {id:"makekowa",title:"負け怖",src:"music/assets/負け怖.mp3",icon:"🔥"},
    {id:"relic",title:"値札のない遺物",src:"music/assets/値札のない遺物B.mp3",icon:"◆"},
    {id:"masakane",title:"まさかね",src:"music/assets/まさかねC.mp3",icon:"♪"},
    {id:"yuzuan",title:"ゆず庵⁉️",src:"music/assets/ゆず庵.mp3",icon:"🍈"}
  ];
  var playable=tracks.filter(function(t){return !!t.src;});
  var lyrics=globalThis.KesoMusicLyrics||{};
  var prefix="keso.music.";
  function read(key,fallback){try{var x=localStorage.getItem(prefix+key);return x===null?fallback:x;}catch(_){return fallback;}}
  function save(key,value){try{localStorage.setItem(prefix+key,String(value));}catch(_){}}
  function clamp(n,min,max){return Math.max(min,Math.min(max,Number.isFinite(Number(n))?Number(n):min));}
  var track=read("track","mou"),volume=clamp(read("volume","5"),0,100);
  var autoplay=read("autoplay","on")!=="off",repeat=read("repeat","all"),shuffle=read("shuffle","off")==="on";
  if(!["off","all","one"].includes(repeat))repeat="all";
  if(!playable.some(function(t){return t.id===track;}))track="mou";
  var audio=null,hasPlayed=false,started=false,requestId=0,history=[],shuffleQueue=[],shuffleStarted=false,view="library",lyricPreview=null;
  function esc(text){return String(text).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function formatTime(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return "0:00";
    var n=Math.floor(seconds);
    return Math.floor(n/60)+":"+String(n%60).padStart(2,"0");
  }
  function active(){return playable.find(function(t){return t.id===track;})||playable[0];}
  var root=document.createElement("div");root.id="keso-music";
  var items=tracks.map(function(t){
    return '<button type="button" class="music-song'+(t.src?'':' music-upcoming')+'" id="music-song-'+t.id+'"'+
      ' aria-label="'+esc(t.title)+(t.src?' を再生':' の歌詞を見る（音源準備中）')+'">'+
      '<span class="music-song-cover">'+esc(t.icon)+'</span>'+
      '<span class="music-song-copy"><span class="music-song-title">'+esc(t.title)+'</span>'+
      '<small>'+ (t.src?'KESO PLAY MUSIC':'音源準備中 · 歌詞プレビュー')+'</small></span>'+
      '<span class="music-song-end">'+(t.src?'▶':'歌詞')+'</span></button>';
  }).join("");
  root.innerHTML=[
    '<button type="button" class="music-open" aria-expanded="false" aria-controls="music-panel" aria-label="音楽プレイヤーを開く">♫ <span>MUSIC</span></button>',
    '<section class="music-panel" id="music-panel" role="region" aria-label="KESO PLAY MUSIC" hidden>',
    '<div class="music-heading"><div><span class="music-eyebrow">KESO TOWN ORIGINALS</span><strong>KESO PLAY MUSIC</strong></div><button class="music-close" type="button" aria-label="閉じる">×</button></div>',
    '<div class="music-now"><div class="music-art" aria-hidden="true">♫</div><div class="music-now-text"><small>NOW PLAYING</small><strong id="music-now-title"></strong><span>Official KESO TOWN Music</span></div></div>',
    '<div class="music-timeline"><input type="range" id="music-seek" min="0" max="1000" value="0" step="1" aria-label="再生位置を移動" disabled><div class="music-times"><output id="music-current">0:00</output><output id="music-duration">0:00</output></div></div>',
    '<div class="music-transport">',
    '<button type="button" id="music-shuffle" aria-pressed="false" aria-label="シャッフル切替" title="シャッフル">⤨</button>',
    '<button type="button" id="music-prev" aria-label="前の曲" title="前の曲">⏮</button>',
    '<button type="button" id="music-play" class="music-main-play" aria-label="再生・一時停止">▶ 再生</button>',
    '<button type="button" id="music-next" aria-label="次の曲" title="次の曲">⏭</button>',
    '<button type="button" id="music-repeat" aria-label="リピート切替" title="全曲リピート">↻</button>',
    '</div>',
    '<div class="music-tabs" role="group" aria-label="表示切り替え"><button type="button" id="music-tab-library" aria-pressed="true">♪ 曲一覧</button><button type="button" id="music-tab-lyrics" aria-pressed="false">≡ 歌詞</button></div>',
    '<div id="music-library"><div class="music-section-title"><span>プレイリスト</span><small>',playable.length,'曲配信中 / ',tracks.length-playable.length,'曲準備中</small></div>',
    '<div class="music-track-select" aria-hidden="true"><label for="music-track">再生曲を選ぶ</label><select id="music-track">',
    playable.map(function(t){return '<option value="'+t.id+'">'+esc(t.title)+'</option>';}).join(""),
    '</select></div><div class="music-song-list">',items,'</div></div>',
    '<div id="music-lyrics-panel" hidden><div class="music-lyrics-heading"><strong id="music-lyrics-title"></strong><small id="music-lyrics-source"></small></div>',
    '<div id="music-lyrics-content" class="music-lyrics-content" tabindex="0" aria-label="歌詞本文"></div></div>',
    '<div class="music-bottom"><label class="music-volume-label" for="music-volume"><span>音量</span><output id="music-percent">',volume,'%','</output></label>',
    '<input type="range" id="music-volume" min="0" max="100" step="1" value="',volume,'" aria-label="BGM音量">',
    '<label class="music-auto-label"><input type="checkbox" id="music-autoplay" ',autoplay?'checked':'','> 起動時に自動再生</label></div>',
    '<p class="music-status" role="status" aria-live="polite">停止中</p>',
    '<p class="music-info">再生位置はバーをタップして移動できます。歌詞は手動スクロール表示です。音量などの設定はこの端末に保存。端末やDiscordによって自動再生・裏画面再生が制限される場合があります。</p>',
    '</section>'
  ].join("");
  // Reparent only into the authentic app header or title screen; avoid blocking gameplay.
  function mount(){
    var row=document.querySelector("#app .screen header.topbar .toprow");
    var title=document.querySelector("#app main.title-screen:has(.title-emblem)");
    var holder=row||title;
    if(holder){
      if(root.parentElement!==holder)holder.appendChild(root);
      root.hidden=false;
      if(!started){started=true;queueMicrotask(function(){if(autoplay&&root.parentElement)void play("auto");});}
    }else if(root.parentElement){root.remove();if(audio)pause();}
  }
  mount();
  var appRoot=document.getElementById("app");
  if(appRoot&&globalThis.MutationObserver)new MutationObserver(mount).observe(appRoot,{childList:true,subtree:true});
  var $=function(s){return root.querySelector(s);};
  var panel=$("#music-panel"),openBtn=$(".music-open"),playBtn=$("#music-play"),select=$("#music-track");
  select.value=track;
  function status(s){$(".music-status").textContent=s;}
  function updateTime(){
    var current=audio&&Number.isFinite(audio.currentTime)?audio.currentTime:0;
    var duration=audio&&Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:0;
    $("#music-current").textContent=formatTime(current);
    $("#music-duration").textContent=formatTime(duration);
    var slider=$("#music-seek");slider.disabled=!duration;
    if(duration)slider.value=String(Math.min(1000,Math.round(current/duration*1000)));
    else slider.value="0";
    slider.setAttribute("aria-valuetext",formatTime(current)+" / "+formatTime(duration));
  }
  function setView(next){
    view=next==="lyrics"?"lyrics":"library";
    $("#music-library").hidden=view!=="library";
    $("#music-lyrics-panel").hidden=view!=="lyrics";
    $("#music-tab-library").setAttribute("aria-pressed",String(view==="library"));
    $("#music-tab-lyrics").setAttribute("aria-pressed",String(view==="lyrics"));
    if(view==="lyrics")renderLyrics();
  }
  function renderLyrics(){
    var id=lyricPreview||track;
    var info=tracks.find(function(t){return t.id===id;})||active();
    var lyric=lyrics[id];
    $("#music-lyrics-title").textContent=info.title;
    $("#music-lyrics-source").textContent=lyric?lyric.source||"制作原稿版":"公式歌詞は未登録";
    $("#music-lyrics-content").textContent=lyric&&lyric.text?lyric.text:"この曲の歌詞は未登録です。音源と一致する歌詞を確認してから追加します。";
  }
  function render(){
    var playing=!!audio&&!audio.paused;
    playBtn.textContent=playing?"⏸ 一時停止":"▶ 再生";
    openBtn.classList.toggle("playing",playing);
    $("#music-now-title").textContent=active().title;
    $("#music-repeat").textContent=repeat==="one"?"↻₁":repeat==="all"?"↻":"↻̸";
    $("#music-repeat").setAttribute("aria-label",repeat==="one"?"1曲リピート":repeat==="all"?"全曲リピート":"リピートしない");
    $("#music-repeat").setAttribute("aria-pressed",String(repeat!=="off"));
    $("#music-repeat").classList.toggle("enabled",repeat!=="off");
    $("#music-shuffle").setAttribute("aria-pressed",String(shuffle));
    $("#music-shuffle").classList.toggle("enabled",shuffle);
    select.value=track;
    tracks.forEach(function(t){
      var el=$("#music-song-"+t.id);
      el.classList.toggle("selected",t.id===track);
      el.setAttribute("aria-current",t.id===track?"true":"false");
    });
    if(view==="lyrics")renderLyrics();
    updateTime();
  }
  function pause(){requestId++;if(audio)audio.pause();render();}
  function ensureAudio(){
    if(audio)return audio;
    audio=new Audio();audio.preload="metadata";audio.loop=false;audio.volume=volume/100;
    audio.src=new URL(active().src,document.baseURI).href;
    audio.addEventListener("play",function(){openBtn.classList.remove("needs-tap");render();});
    audio.addEventListener("pause",render);
    audio.addEventListener("timeupdate",updateTime);
    audio.addEventListener("loadedmetadata",updateTime);
    audio.addEventListener("durationchange",updateTime);
    audio.addEventListener("seeked",updateTime);
    audio.addEventListener("ended",function(){
      if(!hasPlayed)return;
      if(repeat==="one"){audio.currentTime=0;void play();return;}
      if(repeat==="off"&&!shuffle&&active().id===playable[playable.length-1].id){
        status("プレイリストが終了しました。");render();return;
      }
      void next(true);
    });
    audio.addEventListener("error",function(){
      if(audio.getAttribute("src"))status("公式音源を読み込めません。音源の配置や通信状況を確認してください。");
      render();
    });
    return audio;
  }
  function load(){
    ensureAudio();requestId++;
    audio.pause();
    audio.src=new URL(active().src,document.baseURI).href;
    audio.load();
    updateTime();render();
  }
  async function play(mode){
    var chosen=track,nonce=requestId;
    try{
      ensureAudio();
      if(!audio.getAttribute("src"))load();
      await audio.play();
      if(chosen!==track||nonce!==requestId)return;
      hasPlayed=true;status("再生中："+active().title);
    }catch(error){
      if(chosen!==track||nonce!==requestId)return;
      if(error&&error.name==="NotAllowedError")status("この端末は音声の自動再生を制限しています。▶ 再生を押してください。");
      else status("音源の再生に失敗しました。再生ボタンから再試行してください。");
      if(mode==="auto")openBtn.classList.add("needs-tap");
    }
    render();
  }
  async function choose(id,forcePlay,remember,fromShuffle){
    var found=tracks.find(function(t){return t.id===id;});
    if(!found)return;
    if(!found.src){
      lyricPreview=id;setView("lyrics");status(found.title+" は音源準備中です。歌詞を表示しています。");
      return;
    }
    var resume=!!forcePlay||(!!audio&&!audio.paused);
    if(shuffle&&!fromShuffle){shuffleQueue=[];shuffleStarted=false;}
    if(remember&&id!==track)history.push(track);
    if(history.length>30)history.shift();
    lyricPreview=null;track=id;select.value=id;save("track",id);
    load();status("選択中："+found.title);
    if(resume)await play("manual");
  }
  function next(automatic){
    if(shuffle){
      if(!shuffleQueue.length){
        if(shuffleStarted&&automatic&&repeat==="off"){
          status("プレイリストが終了しました。");render();return;
        }
        shuffleStarted=true;
        shuffleQueue=playable.filter(function(t){return t.id!==track;}).map(function(t){return t.id;});
        // Fisher-Yates: each song occurs at most once until the queue is exhausted.
        for(var k=shuffleQueue.length-1;k>0;k--){
          var j=Math.floor(Math.random()*(k+1));
          var tmp=shuffleQueue[k];shuffleQueue[k]=shuffleQueue[j];shuffleQueue[j]=tmp;
        }
      }
      if(!shuffleQueue.length){ // Only one playable song exists.
        if(automatic&&repeat==="off"){status("プレイリストが終了しました。");return;}
        return choose(track,true,true,true);
      }
      return choose(shuffleQueue.shift(),true,true,true);
    }
    var index=playable.findIndex(function(t){return t.id===track;});
    return choose(playable[(index+1)%playable.length].id,true,true);
  }
  function previous(){
    if(audio&&audio.currentTime>3){audio.currentTime=0;updateTime();return;}
    var id=history.pop(),index=playable.findIndex(function(t){return t.id===track;});
    return choose(id||playable[(index+playable.length-1)%playable.length].id,true,false);
  }
  function seekTo(value){
    if(!audio||!Number.isFinite(audio.duration)||audio.duration<=0)return;
    audio.currentTime=clamp(Number(value),0,1000)/1000*audio.duration;
    updateTime();
  }
  function setPanelOpen(open){
    panel.hidden=!open;
    root.classList.toggle("music-expanded",open);
    openBtn.setAttribute("aria-expanded",String(open));
    if(open){
      panel.scrollTop=0;
      $(".music-close").focus();
    }else openBtn.focus();
  }
  openBtn.addEventListener("click",function(){setPanelOpen(panel.hidden);});
  $(".music-close").addEventListener("click",function(){setPanelOpen(false);});
  root.addEventListener("click",function(event){
    if(event.target===root&&!panel.hidden)setPanelOpen(false); // click on dimmed backdrop
  });
  document.addEventListener("keydown",function(event){
    if(event.key==="Escape"&&!panel.hidden)setPanelOpen(false);
  });
  playBtn.addEventListener("click",function(){if(audio&&!audio.paused){pause();status("一時停止中");}else void play("manual");});
  $("#music-next").addEventListener("click",function(){void next(false);});
  $("#music-prev").addEventListener("click",function(){void previous();});
  $("#music-shuffle").addEventListener("click",function(){shuffle=!shuffle;shuffleQueue=[];shuffleStarted=false;save("shuffle",shuffle?"on":"off");render();});
  $("#music-repeat").addEventListener("click",function(){repeat=repeat==="all"?"one":repeat==="one"?"off":"all";save("repeat",repeat);render();});
  var seek=$("#music-seek");
  seek.addEventListener("input",function(e){seekTo(e.target.value);});
  seek.addEventListener("change",function(e){seekTo(e.target.value);});
  select.addEventListener("change",function(){void choose(select.value,false,true);});
  tracks.forEach(function(t){
    $("#music-song-"+t.id).addEventListener("click",function(){void choose(t.id,false,true);});
  });
  $("#music-tab-library").addEventListener("click",function(){lyricPreview=null;setView("library");});
  $("#music-tab-lyrics").addEventListener("click",function(){lyricPreview=null;setView("lyrics");});
  $("#music-volume").addEventListener("input",function(e){
    volume=clamp(e.target.value,0,100);
    if(audio)audio.volume=volume/100;
    $("#music-percent").textContent=volume+"%";save("volume",volume);
  });
  $("#music-autoplay").addEventListener("change",function(e){
    autoplay=!!e.target.checked;save("autoplay",autoplay?"on":"off");
    status(autoplay?"次の起動から自動再生を試みます。":"次の起動から自動再生しません。");
  });
  document.addEventListener("click",function(e){
    if(e.target.closest&&e.target.closest('[data-action="bgm-toggle"]')&&audio&&!audio.paused){
      pause();status("旧BGMへの切り替えに伴い停止しました。");
    }
  },true);
  globalThis.KesoMusic={
    pause:pause,
    getState:function(){return {track:track,volume:volume,playing:!!audio&&!audio.paused,repeat:repeat,shuffle:shuffle,currentTime:audio?audio.currentTime||0:0};}
  };
  setView("library");render();
})();