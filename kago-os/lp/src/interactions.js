"use strict";
const menuButton = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('#mobile-menu');
function closeMenu(){menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','メニューを開く');mobileMenu.hidden=true;}
menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');mobileMenu.hidden=!open;});
mobileMenu.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
let scheduled=false;
window.addEventListener('scroll',()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{const max=document.documentElement.scrollHeight-innerHeight;document.querySelector('.reading-progress').style.width=(max>0?scrollY/max*100:0)+'%';scheduled=false;});},{passive:true});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  document.documentElement.classList.add('motion-ready');
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target);}});
  }, {threshold:.06, rootMargin:'0px 0px -25px 0px'});
  document.querySelectorAll('.reveal').forEach(element=>revealObserver.observe(element));
}

const comparison = document.querySelector('.comparison');
const connectToggle = document.querySelector('.connect-toggle');
connectToggle.addEventListener('click',()=>{
  const connected=connectToggle.getAttribute('aria-checked')!=='true';
  connectToggle.setAttribute('aria-checked',String(connected));
  comparison.dataset.connected=String(connected);
  document.querySelector('#comparison-label').textContent=connected?'表示から購入までが、ひと続きになる':'再生回数と売上の、あいだにある空白';
  document.querySelector('#comparison-description').textContent=connected?'スキャンとかごの記録で、表示の後に起きた選択を確かめられる。':'表示と購入は分かる。でも、どの表示が選択を動かしたかは見えない。';
  document.querySelector('#comparison-status').textContent=connected?'✓ 表示→スキャン 6.9%、スキャン→購入 38%。表示後の選択を比較する手がかりに。':'? 再生回数も売上もあるのに、効いたかどうかが分からない。';
  comparison.querySelectorAll('[data-off][data-on]').forEach(el=>{el.textContent=connected?el.dataset.on:el.dataset.off;});
});

// Keep native anchor navigation; open the selected service's explanation before scrolling.
document.querySelectorAll('.platform-service, .hero-service').forEach(link=>{
  link.addEventListener('click',()=>{
    const target=document.getElementById(link.hash.slice(1));
    const details=target?.querySelector('details');
    if(details)details.open=true;
  });
});

// ===== WHY KAGO/OS story: click / tap / swipe / arrow keys; P = presentation mode (6 scenes) =====
(function(){
  const intro=document.querySelector('.intro');
  if(!intro)return;
  const all=[...intro.querySelectorAll('.intro-slide')];
  const progress=intro.querySelector('.intro-progress');
  const countNum=intro.querySelector('.intro-count b');
  const countTotal=intro.querySelector('.intro-count span');
  const live=intro.querySelector('.intro-live');
  const prevBtn=intro.querySelector('.intro-prev');
  const nextBtn=intro.querySelector('.intro-next');
  const modeBtn=intro.querySelector('.intro-mode');
  const hero=document.getElementById('hero');
  const closeBtn=intro.querySelector('.intro-skip');
  const storyLaunchers=[...document.querySelectorAll('.story-launch')];
  const root=document.documentElement;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const pad=n=>String(n).padStart(2,'0');

  let present=new URLSearchParams(location.search).has('present');
  let list=[], cur=0, timers=[], rafs=[];

  if(present)intro.hidden=false;
  intro.classList.add('is-ready');

  // scene 1: "デジタルサイネージ" term popover
  const termBtn=intro.querySelector('.intro-term-btn'), termPop=intro.querySelector('.intro-term-pop');
  function termOpen(){return !!termBtn&&termBtn.getAttribute('aria-expanded')==='true';}
  function setTerm(open){if(!termBtn)return;termBtn.setAttribute('aria-expanded',String(open));termPop.hidden=!open;}
  if(termBtn){
    termBtn.addEventListener('click',()=>setTerm(!termOpen()));
    intro.querySelector('.intro-term-close').addEventListener('click',()=>{setTerm(false);termBtn.focus();});
  }

  function buildList(keepScene){
    list=present?all:all.filter(s=>s.hasAttribute('data-short'));
    let idx=list.indexOf(keepScene);
    if(idx<0){idx=list.findIndex(s=>+s.dataset.scene>=+(keepScene?.dataset.scene||1));if(idx<0)idx=list.length-1;}
    progress.innerHTML=list.map(()=>'<i></i>').join('');
    list.forEach((s,k)=>{s.querySelector('.intro-num').textContent=pad(k+1);s.querySelector('.intro-bignum').textContent=pad(k+1);});
    countTotal.textContent='/ '+pad(list.length);
    root.classList.toggle('intro-present',present);
    modeBtn.setAttribute('aria-pressed',String(present));
    modeBtn.textContent=present?'発表モードを終了':'発表モード';
    show(idx,false);
  }

  function countUp(el,delay){
    const target=Number(el.dataset.count), t0=performance.now()+delay, dur=1800;
    if(reduce.matches){el.textContent=target.toLocaleString('ja-JP');return;}
    el.textContent='0';
    const step=now=>{const t=Math.min(1,Math.max(0,(now-t0)/dur));el.textContent=Math.round(target*(1-Math.pow(1-t,3))).toLocaleString('ja-JP');if(t<1)rafs.push(requestAnimationFrame(step));};
    rafs.push(requestAnimationFrame(step));
  }

  function show(idx,animate){
    setTerm(false);
    const next=list[idx];
    all.forEach(s=>{const on=s===next;s.classList.toggle('is-active',on);s.inert=!on;if(on)s.removeAttribute('aria-hidden');else s.setAttribute('aria-hidden','true');});
    // restart scene animations
    next.classList.remove('is-active');void next.offsetWidth;next.classList.add('is-active');
    rafs.forEach(cancelAnimationFrame);rafs=[];
    next.querySelectorAll('[data-count]').forEach(el=>countUp(el,600));
    cur=idx;
    [...progress.children].forEach((b,k)=>{b.classList.toggle('is-done',k<cur);b.classList.toggle('is-current',k===cur);});
    countNum.textContent=pad(cur+1);
    prevBtn.disabled=cur===0;
    nextBtn.setAttribute('aria-label',cur===list.length-1?'KAGO/OSの紹介へ進む':'次の場面へ');
    if(animate)live.textContent=`${cur+1} / ${list.length}　${[...next.querySelectorAll('.intro-line')].map(l=>l.textContent).join('')}`;
  }

  function go(n,back){
    if(n<0)return;
    if(n>=list.length){
      if(present){present=false;buildList(list[list.length-1]);}
      intro.hidden=true;
      hero.scrollIntoView({behavior:reduce.matches?'auto':'smooth'});return;
    }
    timers.forEach(clearTimeout);timers=[];
    if(reduce.matches){show(n,true);return;}
    intro.classList.remove('is-wiping','is-back');void intro.offsetWidth;
    intro.classList.add('is-wiping');intro.classList.toggle('is-back',!!back);
    timers.push(setTimeout(()=>show(n,true),360));
    timers.push(setTimeout(()=>intro.classList.remove('is-wiping','is-back'),980));
  }
  const nextScene=()=>go(cur+1,false), prevScene=()=>go(cur-1,true);

  function ripple(x,y){
    if(reduce.matches)return;
    const r=document.createElement('span');r.className='intro-ripple';r.style.left=x+'px';r.style.top=y+'px';
    r.addEventListener('animationend',()=>r.remove());intro.appendChild(r);
  }

  let downX=0,downY=0,swiped=false;
  intro.addEventListener('pointerdown',e=>{downX=e.clientX;downY=e.clientY;swiped=false;});
  intro.addEventListener('pointerup',e=>{
    const dx=e.clientX-downX,dy=e.clientY-downY;
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.3){swiped=true;if(dx<0)nextScene();else prevScene();}
  });
  intro.addEventListener('click',e=>{
    if(swiped||e.target.closest('a,button,.intro-term-pop'))return;
    if(termOpen()){setTerm(false);return;}
    const r=intro.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    ripple(x,y);
    if(x<r.width*.2&&cur>0)prevScene();else nextScene();
  });
  prevBtn.addEventListener('click',prevScene);
  nextBtn.addEventListener('click',nextScene);
  modeBtn.addEventListener('click',()=>{present=!present;buildList(list[cur]);if(present)intro.focus({preventScroll:true});});
  function openStory(){
    intro.hidden=false;
    show(0,false);
    intro.scrollIntoView({behavior:reduce.matches?'auto':'smooth',block:'start'});
    window.setTimeout(()=>intro.focus({preventScroll:true}),reduce.matches?0:450);
  }
  function closeStory(){
    present=false;
    root.classList.remove('intro-present');
    intro.hidden=true;
    storyLaunchers[0]?.focus({preventScroll:true});
    hero.scrollIntoView({behavior:reduce.matches?'auto':'smooth',block:'start'});
  }
  storyLaunchers.forEach(button=>button.addEventListener('click',openStory));
  closeBtn.addEventListener('click',closeStory);
  intro.querySelector('.intro-cta')?.addEventListener('click',()=>{intro.hidden=true;root.classList.remove('intro-present');});

  let inView=true;
  document.addEventListener('keydown',e=>{
    if(intro.hidden)return;
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.key==='Escape'&&termOpen()){e.preventDefault();setTerm(false);termBtn.focus();return;}
    const tag=(document.activeElement&&document.activeElement.tagName)||'';
    if(/INPUT|TEXTAREA|SELECT/.test(tag))return;
    const focusedIntro=document.activeElement===intro;
    const free=present||focusedIntro||document.activeElement===document.body||intro.contains(document.activeElement);
    if(!(present||inView)||!free)return;
    if(e.key==='ArrowRight'||e.key==='PageDown'||(e.key===' '&&(present||focusedIntro)&&!/^(BUTTON|A)$/.test(tag))){e.preventDefault();nextScene();}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();prevScene();}
    else if(e.key==='p'||e.key==='P'){present=!present;buildList(list[cur]);}
    else if(e.key==='Escape'){closeStory();}
    else if((e.key==='f'||e.key==='F')&&present&&document.documentElement.requestFullscreen){
      if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});
    }
  });
  if('IntersectionObserver' in window){
    new IntersectionObserver(([en])=>{inView=en.intersectionRatio>.45;intro.classList.toggle('in-view',en.isIntersecting);},{threshold:[0,.45,.6]}).observe(intro);
  }else intro.classList.add('in-view');

  buildList(all[0]);
})();

// Reveal the explanation inside its quadrant; preserve the overview geometry.
const positionChoices=[...document.querySelectorAll('[data-position]')];
function closePosition(button,restoreFocus=false){
  const cell=button.closest('.position-cell');
  cell.classList.remove('is-open');
  cell.querySelector('.quadrant-reveal').hidden=true;
  button.inert=false;
  button.setAttribute('aria-expanded','false');
  if(restoreFocus)button.focus({preventScroll:true});
}
positionChoices.forEach(button=>{
  const cell=button.closest('.position-cell');
  const panel=cell.querySelector('.quadrant-reveal');
  const close=panel.querySelector('.quadrant-close');
  button.addEventListener('click',()=>{
    positionChoices.forEach(other=>closePosition(other));
    button.setAttribute('aria-expanded','true');
    button.inert=true;
    panel.hidden=false;
    cell.classList.add('is-open');
    close.focus({preventScroll:true});
  });
  close.addEventListener('click',()=>closePosition(button,true));
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();closePosition(button,true);}});
});
