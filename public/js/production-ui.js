(function(){
  'use strict';

  const NAV=[
    ['dashboard','⌂','Dashboard'],
    ['analysis','⌕','Player Scouting'],
    ['shortlist','☆','Shortlists'],
    ['squadtracker','▥','Squad Performance'],
    ['leagueanalyze','◎','League Analysis'],
    ['requests','▤','Club Requests'],
    ['admin','⚙','Admin']
  ];

  function loginFinished(){
    const overlay=document.getElementById('loginOverlay');
    return !overlay || getComputedStyle(overlay).display==='none';
  }

  function originalTab(name){
    return [...document.querySelectorAll('.main>.tabs .tab')]
      .find(t => (t.getAttribute('onclick')||'').includes("switchTab('"+name+"'"));
  }

  function syncNav(){
    const active=[...document.querySelectorAll('.main>.tabs .tab')].find(t=>t.classList.contains('active'));
    const onclick=active?(active.getAttribute('onclick')||''):'';
    document.querySelectorAll('.pm-prod-nav-btn').forEach(b=>{
      b.classList.toggle('active',onclick.includes("switchTab('"+b.dataset.tab+"'"));
    });
  }

  function buildSidebar(){
    const sb=document.getElementById('sbMain');
    if(!sb||sb.querySelector('.pm-prod-brand'))return;

    const brand=document.createElement('div');
    brand.className='pm-prod-brand';
    brand.innerHTML='<div class="pm-prod-mark">◆</div><div><div class="pm-prod-brand-title">PM SPORTS IQ</div><div class="pm-prod-brand-sub">Scouting Intelligence</div></div>';

    const nav=document.createElement('div');
    nav.className='pm-prod-nav';

    NAV.forEach(([name,ico,label])=>{
      const tab=originalTab(name);
      if(!tab)return;
      const b=document.createElement('button');
      b.className='pm-prod-nav-btn';
      b.dataset.tab=name;
      if(tab.style.display==='none') b.style.display='none';
      b.innerHTML='<span class="pm-prod-nav-ico">'+ico+'</span><span>'+label+'</span>';
      b.addEventListener('click',()=>{
        tab.click();
        syncNav();
      });
      nav.appendChild(b);
    });

    const ctx=document.createElement('button');
    ctx.className='pm-prod-context-toggle';
    ctx.innerHTML='<span>Scouting Context</span><span>⌄</span>';
    ctx.addEventListener('click',()=>{
      sb.classList.toggle('pm-context-open');
      ctx.lastElementChild.textContent=sb.classList.contains('pm-context-open')?'⌃':'⌄';
    });

    sb.prepend(ctx);
    sb.prepend(nav);
    sb.prepend(brand);

    const tabObserver=new MutationObserver(syncNav);
    document.querySelectorAll('.main>.tabs .tab').forEach(t=>tabObserver.observe(t,{attributes:true,attributeFilter:['class','style']}));
    syncNav();
  }

  function enhanceScouting(){
    const wrap=document.getElementById('anListWrap');
    if(!wrap||wrap.dataset.pmProd==='1')return;
    const card=wrap.querySelector(':scope > .card');
    if(!card)return;

    const rows=[...card.querySelectorAll(':scope > .an-filter-row')];
    const toolbar=card.querySelector(':scope > .an-list-toolbar');
    const table=card.querySelector(':scope > .an-table-wrap');
    if(!rows.length||!toolbar||!table)return;

    const grid=document.createElement('div');
    grid.className='pm-prod-scout-grid';

    const left=document.createElement('aside');
    left.className='pm-prod-filter-panel';
    left.innerHTML='<div class="pm-prod-panel-head"><div><strong>Filters</strong><br><span>Build your recruitment profile</span></div><span>⌁</span></div>';

    rows.forEach(r=>left.appendChild(r));

    const right=document.createElement('section');
    right.className='pm-prod-results-panel';
    right.innerHTML='<div class="pm-prod-panel-head"><div><strong>Player Results</strong><br><span>Rank, compare and inspect profiles</span></div></div>';
    right.appendChild(toolbar);
    right.appendChild(table);

    grid.appendChild(left);
    grid.appendChild(right);
    card.appendChild(grid);
    wrap.dataset.pmProd='1';
  }

  function mount(){
    if(document.body.classList.contains('pm-production-ui'))return;
    if(!loginFinished())return;

    document.body.classList.add('pm-production-ui');

    const topDiv=document.querySelector('.top-div');
    if(topDiv) topDiv.textContent='Club Workspace';

    buildSidebar();
    enhanceScouting();
  }

  function start(){
    if(loginFinished()){mount();return;}
    const timer=setInterval(()=>{
      if(loginFinished()){
        clearInterval(timer);
        mount();
      }
    },300);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();