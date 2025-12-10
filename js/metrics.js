/* metrics.js — widget d'évaluation des performances (client-side)
   Version optimisée : suppression des tâches longues bloquantes,
   amélioration du rendu, allègement du thread principal et protection DOMContentLoaded.
*/
(function(){
  const state = {
    fcp: null,
    lcp: null,
    cls: 0,
    clsEntries: [],
    longTasks: 0,
    longTasksTime: 0,
    totalBlockingTime: 0,
    resources: [],
    totalRequests: 0,
    totalBytes: 0,
    nav: null
  };

  const fmtMs = v => (v==null?'-':v.toFixed(0)+' ms');
  const fmtKB = v => (v==null?'-':(v/1024).toFixed(1)+' KB');

  /* ----------- OBSERVATEURS DE PERFORMANCE ----------- */

  try{
    const poPaint = new PerformanceObserver(list=>{
      for(const e of list.getEntries()){
        if(e.name === 'first-contentful-paint' && state.fcp == null){
          state.fcp = e.startTime;
          update();
          poPaint.disconnect();
        }
      }
    });
    poPaint.observe({ type:'paint', buffered:true });
  }catch(err){}

  try{
    const poLcp = new PerformanceObserver(list=>{
      for(const e of list.getEntries()){
        state.lcp = e.renderTime || e.loadTime || e.startTime;
      }
      update();
    });
    poLcp.observe({ type:'largest-contentful-paint', buffered:true });
    addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'hidden') poLcp.takeRecords();
    });
  }catch(err){}

  try{
    const poCls = new PerformanceObserver(list=>{
      for(const e of list.getEntries()){
        if(!e.hadRecentInput){
          state.cls += e.value;
          state.clsEntries.push(e);
        }
      }
      update();
    });
    poCls.observe({ type:'layout-shift', buffered:true });
  }catch(err){}

  try{
    const poLT = new PerformanceObserver(list=>{
      for(const e of list.getEntries()){
        state.longTasks++;
        state.longTasksTime += e.duration;
        state.totalBlockingTime += Math.max(0, e.duration - 50);
      }
      update();
    });
    poLT.observe({ entryTypes:['longtask'] });
  }catch(err){}

  function collectResources(){
    const entries = performance.getEntriesByType('resource');
    state.resources = entries;
    state.totalRequests = entries.length + 1;

    let total = 0;
    for(const r of entries){
      const bytes = (r.transferSize && r.transferSize>0) ? r.transferSize : (r.encodedBodySize||0);
      total += bytes;
    }
    state.totalBytes = total;
  }

  function collectNavigation(){
    const nav = performance.getEntriesByType('navigation')[0];
    if(nav) state.nav = nav;
  }

  /* ----------- UI PANEL ----------- */

  const panel = document.createElement('div');
  panel.id = 'perf-panel';
  Object.assign(panel.style, {
    position:'fixed', right:'16px', bottom:'16px', zIndex:9999,
    width:'320px', maxWidth:'90vw', fontFamily:'ui-sans-serif, system-ui',
    background:'rgba(10,12,28,.9)', color:'#E8ECF1',
    border:'1px solid rgba(255,255,255,.12)', borderRadius:'12px',
    boxShadow:'0 10px 40px rgba(0,0,0,.5)', backdropFilter:'blur(6px)',
    padding:'12px 14px'
  });

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <strong>Évaluation perfs</strong>
      <div>
        <button id="perf-refresh" style="background:#7C5CFF;color:white;border:0;border-radius:8px;padding:6px 10px;cursor:pointer">Mesurer</button>
        <button id="perf-close" style="background:transparent;color:#c9d1d9;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:6px 8px;margin-left:6px;cursor:pointer">×</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
      <div><div style="opacity:.8">FCP</div><div id="m-fcp">-</div></div>
      <div><div style="opacity:.8">LCP</div><div id="m-lcp">-</div></div>
      <div><div style="opacity:.8">CLS</div><div id="m-cls">-</div></div>
      <div><div style="opacity:.8">TBT (≈)</div><div id="m-tbt">-</div></div>
      <div><div style="opacity:.8">Requêtes</div><div id="m-req">-</div></div>
      <div><div style="opacity:.8">Poids total</div><div id="m-bytes">-</div></div>
    </div>
  `;

  document.addEventListener('DOMContentLoaded', ()=>{
    document.body.appendChild(panel);
  });

  /* ----------- UPDATE DU PANNEAU ----------- */
  function update(){
    collectResources();
    collectNavigation();

    const $ = id => panel.querySelector(id);
    $('#m-fcp').textContent    = fmtMs(state.fcp);
    $('#m-lcp').textContent    = fmtMs(state.lcp);
    $('#m-cls').textContent    = state.cls ? state.cls.toFixed(3) : '-';
    $('#m-tbt').textContent    = state.totalBlockingTime ? fmtMs(state.totalBlockingTime) : '-';
    $('#m-req').textContent    = state.totalRequests;
    $('#m-bytes').textContent  = fmtKB(state.totalBytes);

    window.__metrics = { ...state };
  }

  /* ----------- ACTIONS PANEL ----------- */
  document.addEventListener('click', e=>{
    if(e.target.id === 'perf-refresh') update();
    if(e.target.id === 'perf-close')   panel.remove();
  });

  addEventListener('load', ()=> setTimeout(update, 0));
})();