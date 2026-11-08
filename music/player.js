/* KESO PLAY music player. Local-only settings: no API requests or D1. */
(function(){
  "use strict";
  var tracks=[
    {id:"mou",title:"もう一周",src:"music/assets/mou-isshu.mp3"},
    {id:"rhapsody",title:"限界集落狂詩曲",src:"music/assets/genkai-rhapsody.mp3"}
  ];
  var prefix="keso.music.", audio=null;
  var read=function(key,fallback){try{return localStorage.getItem(prefix+key)||fallback;}catch(_){return fallback;}};
  var save=function(key,value){try{localStorage.setItem(prefix+key,String(value));}catch(_){}};
  var track=read("track","mou"),volume=Math.max(0,Math.min(100,Number(read("volume","5"))||0));
  var autoplay=read("autoplay","on")!=="off",started=false;
  if(!tracks.some(function(t){return t.id===track;}))track="mou";
  // Startup playback is requested by the user; browsers may deny autoplay with sound.
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
    '<label class="music-auto-label"><input type="checkbox" id="music-autoplay" ',autoplay?'checked':'','> 起動時に自動再生</label>',
    '<p class="music-info">起動時に再生を試みます（初期5%）。iPhone・Discordの制限で自動再生できない場合は▶再生を押してください。別タブ・裏画面でも再生を続けます（端末によっては中断される場合があります）。設定は端末保存で、D1は利用しません。</p>',
    '<p class="music-status" role="status" aria-live="polite">停止中</p>',
    '</section>'
  ].join("");
  // Keep the player detached until the app has rendered a usable header.
  // Place the button *inside* the real header, never on top of game controls.
  function mount(){
    var row=document.querySelector("#app .screen header.topbar .toprow");
    // Unlike the emergency error/retry screen, the real title has the K emblem.
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
  var requestId=0,hasPlayed=false;
  function status(s){$(".music-status").textContent=s;}
  function render(){var playing=!!audio&&!audio.paused;playBtn.textContent=playing?"⏸ 一時停止":"▶ 再生";openBtn.classList.toggle("playing",playing);}
  function pause(){requestId++;if(audio)audio.pause();render();}
  function active(){return tracks.find(function(t){return t.id===track;})||tracks[0];}
  function ensureAudio(){
    if(audio)return audio;
    audio=new Audio();audio.preload="none";audio.loop=false;audio.volume=volume/100;
    audio.src=new URL(active().src,document.baseURI).href;
    audio.addEventListener("play",function(){openBtn.classList.remove("needs-tap");render();});
    audio.addEventListener("pause",render);
    audio.addEventListener("ended",function(){if(hasPlayed)void next();});
    audio.addEventListener("error",function(){if(audio.getAttribute("src"))status("公式音源の読み込みに失敗しました。再度開き直してください。");render();});
    return audio;
  }

  function load(){
    ensureAudio();requestId++;
    audio.pause();
    audio.src=new URL(active().src,document.baseURI).href;
    audio.load();render();
  }
  async function play(mode="manual"){
    var chosen=track;
    try{
      ensureAudio();
      if(!audio.getAttribute("src"))load();
      if(chosen!==track)return;
      await audio.play();hasPlayed=true;status("再生中："+active().title);
    }catch(error){
      if(error?.name==="NotAllowedError")status("この端末は音声の自動再生を制限しています。▶ 再生を押してください。");
      else status("公式音源を再生できませんでした。接続状況を確認し、開き直してください。");
      if(mode==="auto")openBtn.classList.add("needs-tap");
    }
    render();
  }
  async function choose(id,forcePlay){
    if(!tracks.some(function(t){return t.id===id;}))return;
    var resume=forcePlay||(!!audio&&!audio.paused);
    track=id;select.value=id;save("track",id);
    load();status("選択中："+active().title);
    if(resume)await play();
  }
  function next(){var i=tracks.findIndex(function(t){return t.id===track;});return choose(tracks[(i+1)%tracks.length].id,true);}
  openBtn.addEventListener("click",function(){panel.hidden=!panel.hidden;openBtn.setAttribute("aria-expanded",String(!panel.hidden));});
  $(".music-close").addEventListener("click",function(){panel.hidden=true;openBtn.setAttribute("aria-expanded","false");openBtn.focus();});
  playBtn.addEventListener("click",function(){if(audio&&!audio.paused){pause();status("一時停止中");}else void play();});
  $("#music-next").addEventListener("click",function(){void next();});
  select.addEventListener("change",function(){void choose(select.value,false);});
  $("#music-volume").addEventListener("input",function(e){volume=Math.max(0,Math.min(100,Number(e.target.value)||0));if(audio)audio.volume=volume/100;$("#music-percent").textContent=volume+"%";save("volume",volume);});
  $("#music-autoplay").addEventListener("change",function(e){autoplay=!!e.target.checked;save("autoplay",autoplay?"on":"off");status(autoplay?"次回の起動時から自動再生を試みます。":"次回から自動再生しません。");});
  document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest('[data-action="bgm-toggle"]')&&audio&&!audio.paused){pause();status("旧BGMへの切り替えに伴い停止しました。");}},true);
  globalThis.KesoMusic={pause:pause,getState:function(){return {track:track,volume:volume,playing:!!audio&&!audio.paused};}};
})();