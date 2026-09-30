(function(){
  function el(tag,cls,html){
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(html!==undefined)n.innerHTML=html;
    return n;
  }

  function buildShell(){
    document.body.classList.add('pm-v3');

    const app=document.querySelector('.app');
    const sb=document.getElementById('sbMain');
    const tabs=document.querySelector('.tabs');
    const top=document.querySelector('.top');
    if(!app||!sb||!tabs)return;

    // Brand lives in the navigation rail, like a modern SaaS product.
    if(!sb.querySelector('.pm-nav-brand')){
      const brand=el('div','pm-nav-brand',
        '<div class="pm-nav-brand-mark">◆</div>'+
        '<div><div class="pm-nav-brand-name">PM SPORTS IQ</div>'+
        '<div class="pm-nav-brand-sub">Scouting Intelligence</div></div>'
      );
      sb.prepend(brand);
    }

    // Move working tab controls into the left navigation. We keep the original
    // nodes and onclick handlers, so all current navigation logic remains intact.
    if(!tabs.classList.contains('pm-side-nav')){
      tabs.classList.add('pm-side-nav');
      const firstSec=sb.querySelector('.sb-sec');
      if(firstSec) sb.insertBefore(tabs,firstSec);
      else sb.appendChild(tabs);

      [...tabs.children].forEach((node)=>{
        if(!node.classList.contains('tab')) node.classList.add('pm-nav-separator');
      });
    }

    // Context label before the original operational sidebar controls.
    if(!sb.querySelector('.pm-context-label')){
      const firstSec=sb.querySelector('.sb-sec');
      if(firstSec){
        const lbl=el('div','pm-context-label','SCOUTING CONTEXT');
        sb.insertBefore(lbl,firstSec);
      }
    }

    // Clean topbar identity after moving primary branding to the side.
    if(top){
      top.classList.add('pm-topbar-v3');
      const logo=top.querySelector('.logo');
      if(logo) logo.style.display='none';
      const div=top.querySelector('.top-div');
      if(div) div.textContent='Professional Scouting Workspace';
    }
  }

  function buildScoutingLayout(){
    const wrap=document.getElementById('anListWrap');
    if(!wrap||wrap.dataset.pmV3==='1')return;
    const card=wrap.querySelector(':scope > .card');
    if(!card)return;

    const filterRows=[...card.querySelectorAll(':scope > .an-filter-row')];
    const toolbar=card.querySelector(':scope > .an-list-toolbar');
    const table=card.querySelector(':scope > .an-table-wrap');
    if(!filterRows.length||!toolbar||!table)return;

    const layout=el('div','pm-scout-layout');
    const filters=el('aside','pm-scout-filters');
    const results=el('section','pm-scout-results');

    const fh=el('div','pm-scout-panel-head',
      '<div><div class="pm-scout-panel-title">Filters</div>'+
      '<div class="pm-scout-panel-sub">Build your recruitment profile</div></div>'+
      '<div class="pm-filter-icon">⌁</div>'
    );
    filters.appendChild(fh);
    filterRows.forEach(r=>filters.appendChild(r));

    const rh=el('div','pm-scout-results-head',
      '<div><div class="pm-scout-panel-title">Player Results</div>'+
      '<div class="pm-scout-panel-sub">Rank, compare and inspect matching profiles</div></div></div>'
    );
    results.appendChild(rh);
    results.appendChild(toolbar);
    results.appendChild(table);

    layout.appendChild(filters);
    layout.appendChild(results);
    card.appendChild(layout);
    wrap.dataset.pmV3='1';
  }

  function polishDetail(){
    const detail=document.getElementById('anDetailWrap');
    if(!detail||detail.dataset.pmV3==='1')return;
    detail.dataset.pmV3='1';
    const actions=detail.querySelector('.print-btn-row');
    if(actions){
      const title=el('div','pm-detail-toolbar-title',
        '<strong>Player Profile</strong><span>Scouting intelligence & comparison</span>'
      );
      actions.prepend(title);
    }
  }

  function init(){
    buildShell();
    buildScoutingLayout();
    polishDetail();

    // Some panels are rendered dynamically after navigation.
    const obs=new MutationObserver(()=>{
      buildScoutingLayout();
      polishDetail();
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();