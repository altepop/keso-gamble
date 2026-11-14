/* Keep the host Activity and its music player alive while the isolated CPU demo runs. */
(function(){
  'use strict';
  const app=document.getElementById('app');
  if(!app)return;
  let overlay=null,practiceFrame=null,launchButton=null,previousOverflow='',previousInert=false;
  const RETURN_MESSAGE='keso:close-cpu-practice';

  function closePractice(){
    if(!overlay)return;
    overlay.remove();
    overlay=null;
    practiceFrame=null;
    app.inert=previousInert;
    document.body.style.overflow=previousOverflow;
    const focus=launchButton;
    launchButton=null;
    if(focus?.isConnected)focus.focus({preventScroll:true});
  }

  function openPractice(trigger){
    if(overlay)return;
    launchButton=trigger;
    previousOverflow=document.body.style.overflow;
    previousInert=app.inert;

    const shell=document.createElement('section');
    shell.id='keso-cpu-practice-overlay';
    shell.setAttribute('role','dialog');
    shell.setAttribute('aria-modal','true');
    shell.setAttribute('aria-label','CPU練習');

    const header=document.createElement('header');
    header.className='keso-cpu-practice-header';
    const close=document.createElement('button');
    close.type='button';
    close.className='keso-cpu-practice-close';
    close.textContent='← 決闘に戻る';
    close.addEventListener('click',closePractice);
    const heading=document.createElement('strong');
    heading.textContent='CPU練習';
    header.append(close,heading);

    const frame=document.createElement('iframe');
    frame.className='keso-cpu-practice-frame';
    frame.title='CPUとの練習';
    frame.setAttribute('allow','autoplay');
    frame.src=new URL('./duel-demo.html?cpu=1&v=cpu-20261114-v1',document.baseURI).href;
    shell.append(header,frame);

    overlay=shell;
    practiceFrame=frame;
    document.body.appendChild(shell);
    // Inert the game controls, NOT the document/audio: KESO PLAY MUSIC keeps its Audio element.
    app.inert=true;
    document.body.style.overflow='hidden';
    close.focus({preventScroll:true});
  }

  document.addEventListener('click',function(event){
    const anchor=event.target.closest?.('a[href]');
    if(!anchor||!app.contains(anchor))return;
    let url;
    try{url=new URL(anchor.href,document.baseURI);}catch{return;}
    if(url.origin!==location.origin||!url.pathname.endsWith('/duel-demo.html')||url.searchParams.get('cpu')!=='1')return;
    event.preventDefault();
    openPractice(anchor);
  });

  window.addEventListener('message',function(event){
    if(!overlay||!practiceFrame||event.origin!==location.origin||event.source!==practiceFrame.contentWindow)return;
    if(event.data?.type===RETURN_MESSAGE)closePractice();
  });
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&overlay){
      event.preventDefault();
      closePractice();
    }
  });
})();
