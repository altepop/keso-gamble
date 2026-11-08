/* KESO PLAY music player. Local-only settings: no API requests or D1. */
(function(){
  "use strict";
  var tracks=[
    {id:"mou",title:"もう一周",src:"music/assets/mou-isshu.mp3"},
    {id:"rhapsody",title:"限界集落狂詩曲",src:"music/assets/genkai-rhapsody.mp3"}
  ];
  var prefix="keso.music.", audio=new Audio();
  var read=function(key,fallback){try{return localStorage.getItem(prefix+key)||fallback;}catch(_){return fallback;}};
  var save=function(key,value){try{localStorage.setItem(prefix+key,String(value));}catch(_){}};
  var track=read("track","mou"),volume=Math.max(0,Math.min(100,Number(read("volume","15"))||0));
  if(!tracks.some(function(t){return t.id===track;}))track="mou";
  audio.preload="none";audio.loop=false;audio.volume=volume/100;
  // Setting src with preload=none does not start playback; the first tap can call play() without an await.
  audio.src=new URL(tracks.find(function(t){return t.id===track;}).src,document.baseURI).href;
  var root=document.createElement("div");root.id="keso-music";
  root.innerHTML=[
    '<button type="button" class="music-open" aria-expanded="false" aria-controls="music-panel" aria-label="音楽プレイヤーを開く">♫ <span>BGM</span></button>',
    '<section class="music-panel" id="music-panel" aria-label="BGM設定" hidden>',
    '<div class="music-heading"><strong>♫ KESO PLAY MUSIC</strong><button class="music-close" type="button" aria-label="閉じる">×</button></div>',
    '<label for="music-track">曲を選ぶ</label>',
    '<select id="music-track"><option value="mou">もう一周</option><option value="rhapsody">限界集落狂詩曲</option></select>',
    '<div class="music-buttons"><button type="button" id="music-play">▶ 再生</button><button type="button" id="music-next">次の曲 ⏭</button></div>',
    '<label class="music-volume-label" for="music-volume"><span>BGM音量</span><output id="music-percent">',volume,'%','</output></label>',
    '<input type="range" id="music-volume" min="0" max="100" step="1" value="',volume,'" aria-label="BGM音量">',
    '<label for="music-file">音源が未配信なら、端末からMP3を追加</label>',
    '<input type="file" id="music-file" accept="audio/*">',
    '<p class="music-info">初期停止・小音量。Discord通話中は必要に応じて音量を下げてください。音量と曲の設定は端末に保存し、D1は利用しません。</p>',
    '<p class="music-status" role="status" aria-live="polite">停止中</p>',
    '</section>'
  ].join("");
  document.body.appendChild(root);
  var $=function(s){return root.querySelector(s);};
  var panel=$("#music-panel"),openBtn=$(".music-open"),playBtn=$("#music-play"),select=$("#music-track");
  select.value=track;
  var memory=new Map(),objectUrl=null,requestId=0,hasPlayed=false;
  function status(s){$(".music-status").textContent=s;}
  function render(){var playing=!audio.paused;playBtn.textContent=playing?"⏸ 一時停止":"▶ 再生";openBtn.classList.toggle("playing",playing);}
  function pause(){requestId++;audio.pause();render();}
  function release(){if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}}
  function database(){
    return new Promise(function(resolve,reject){
      if(!globalThis.indexedDB){reject(Error("storage unavailable"));return;}
      var req=indexedDB.open("keso-music-v1",1);
      req.onupgradeneeded=function(){if(!req.result.objectStoreNames.contains("tracks"))req.result.createObjectStore("tracks");};
      req.onsuccess=function(){resolve(req.result);};
      req.onerror=function(){reject(req.error);};
    });
  }
  async function stored(id){
    if(memory.has(id))return memory.get(id);
    try{
      var db=await database();
      return await new Promise(function(resolve){
        var req=db.transaction("tracks","readonly").objectStore("tracks").get(id);
        req.onsuccess=function(){resolve(req.result||null);db.close();};
        req.onerror=function(){resolve(null);db.close();};
      });
    }catch(_){return null;}
  }
  async function persist(id,file){
    memory.set(id,file);
    try{
      var db=await database();
      await new Promise(function(resolve,reject){
        var tx=db.transaction("tracks","readwrite");tx.objectStore("tracks").put(file,id);
        tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error);};
      });
      db.close();return true;
    }catch(_){return false;}
  }
  function active(){return tracks.find(function(t){return t.id===track;})||tracks[0];}
  // Restore user-imported music before the first play when possible, without starting audio.
  void stored(track).then(function(file){
    if(!file||!audio.paused||objectUrl)return;
    objectUrl=URL.createObjectURL(file);audio.src=objectUrl;
  });

  async function load(){
    var turn=++requestId;
    audio.pause();audio.removeAttribute("src");audio.load();release();render();
    var local=await stored(track);
    if(turn!==requestId)return false;
    if(local){objectUrl=URL.createObjectURL(local);audio.src=objectUrl;}
    else audio.src=new URL(active().src,document.baseURI).href;
    return true;
  }
  async function play(){
    var chosen=track;
    try{
      if(!audio.getAttribute("src"))await load();
      if(chosen!==track)return;
      await audio.play();hasPlayed=true;status("再生中："+active().title);
    }catch(_){status("再生できません。音源が未配信の場合は下のファイル選択からMP3を登録してください。");}
    render();
  }
  async function choose(id,forcePlay){
    if(!tracks.some(function(t){return t.id===id;}))return;
    var resume=forcePlay||!audio.paused;
    track=id;select.value=id;save("track",id);
    await load();status("選択中："+active().title);
    if(resume)await play();
  }
  function next(){var i=tracks.findIndex(function(t){return t.id===track;});return choose(tracks[(i+1)%tracks.length].id,true);}
  openBtn.addEventListener("click",function(){panel.hidden=!panel.hidden;openBtn.setAttribute("aria-expanded",String(!panel.hidden));});
  $(".music-close").addEventListener("click",function(){panel.hidden=true;openBtn.setAttribute("aria-expanded","false");openBtn.focus();});
  playBtn.addEventListener("click",function(){if(!audio.paused){pause();status("一時停止中");}else void play();});
  $("#music-next").addEventListener("click",function(){void next();});
  select.addEventListener("change",function(){void choose(select.value,false);});
  $("#music-volume").addEventListener("input",function(e){volume=Math.max(0,Math.min(100,Number(e.target.value)||0));audio.volume=volume/100;$("#music-percent").textContent=volume+"%";save("volume",volume);});
  $("#music-file").addEventListener("change",async function(e){
    var file=e.target.files&&e.target.files[0];if(!file)return;
    if(!file.type.startsWith("audio/")&&!/\.(mp3|ogg|wav|m4a)$/i.test(file.name)){status("音声ファイルを選択してください。");return;}
    if(file.size>40*1024*1024){status("40MB以下の音源を指定してください。");return;}
    var ok=await persist(track,file);await load();
    status(ok?"端末に保存しました。▶ 再生を押してください。":"今回の画面では読み込めました。次回は再選択が必要です。");
  });
  audio.addEventListener("play",render);audio.addEventListener("pause",render);
  audio.addEventListener("ended",function(){if(hasPlayed&&!document.hidden)void next();});
  audio.addEventListener("error",function(){if(audio.getAttribute("src"))status("音源の読み込みに失敗しました。端末からMP3を追加してください。");render();});
  document.addEventListener("visibilitychange",function(){if(document.hidden){pause();status("画面が非表示のため停止しました。");}});
  window.addEventListener("pagehide",pause);
  document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest('[data-action="bgm-toggle"]')&&!audio.paused){pause();status("旧BGMへの切り替えに伴い停止しました。");}},true);
  globalThis.KesoMusic={pause:pause,getState:function(){return {track:track,volume:volume,playing:!audio.paused};}};
})();