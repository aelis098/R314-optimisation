/* metrics.js — widget d'évaluation des performances (client-side)
   Affiche FCP, LCP, CLS, TBT (~approx), #requêtes et poids total.
   N'emploie aucune dépendance externe. */
(function(){
  const state = {
    fcp: null,
    lcp: null,
    cls: 0,
    clsEntries: [],
    longTasks: 0,
    longTasksTime: 0,
    totalBlockingTime: 0, // approx: somme (longTask - 50ms)
    resources: [],
    totalRequests: 0,
    totalBytes: 0,
    nav: null
  };

  // Helper: formatters
  const fmtMs = v => (v==null?'-':v.toFixed(0)+' ms');
  const fmtKB = v => (v==null?'-':(v/1024).toFixed(1)+' KB');

  // Observe FCP (first-contentful-paint)
  try{
    const poPaint = new PerformanceObserver((list)=>{
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

  // Observe LCP (largest-contentful-paint)
  try{
    const poLcp = new PerformanceObserver((list)=>{
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

  // Observe CLS (cumulative layout shift)
  try{
    const poCls = new PerformanceObserver((list)=>{
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

  // Observe Long Tasks => approx TBT = somme(max(0, duration-50ms))
  try{
    const poLT = new PerformanceObserver((list)=>{
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
    state.totalRequests = entries.length + 1; // +1 pour le document HTML

    // Try transferSize/encodedBodySize; fallback à encoded if transfer is 0; sinon unknown
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

  // UI panel
  const panel = document.createElement('div');
  panel.setAttribute('id', 'perf-panel');
  Object.assign(panel.style, {
    position:'fixed', right:'16px', bottom:'16px', zIndex:9999,
    width:'320px', maxWidth:'90vw', fontFamily:'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
    background:'rgba(10,12,28,.9)', color:'#E8ECF1', border:'1px solid rgba(255,255,255,.12)',
    borderRadius:'12px', boxShadow:'0 10px 40px rgba(0,0,0,.5)',
    backdropFilter:'blur(6px) saturate(120%)', padding:'12px 14px'
  });
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
      <strong style="letter-spacing:.2px">Évaluation perfs</strong>
      <div>
        <button id="perf-refresh" style="background:#7C5CFF;color:white;border:0;border-radius:8px;padding:6px 10px;cursor:pointer">Mesurer</button>
        <button id="perf-close" style="background:transparent;color:#c9d1d9;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:6px 8px;margin-left:6px;cursor:pointer">×</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
      <div><div style="opacity:.8">FCP</div><div id="m-fcp" style="font-weight:600">-</div></div>
      <div><div style="opacity:.8">LCP</div><div id="m-lcp" style="font-weight:600">-</div></div>
      <div><div style="opacity:.8">CLS</div><div id="m-cls" style="font-weight:600">-</div></div>
      <div><div style="opacity:.8">TBT (≈)</div><div id="m-tbt" style="font-weight:600">-</div></div>
      <div><div style="opacity:.8">Requêtes</div><div id="m-req" style="font-weight:600">-</div></div>
      <div><div style="opacity:.8">Poids total</div><div id="m-bytes" style="font-weight:600">-</div></div>
    </div>
    <div style="margin-top:8px;font-size:12px;opacity:.8">
      <div id="m-note">Cliquez sur <em>Mesurer</em> après vos modifications.</div>
    </div>
  `;
  document.addEventListener('DOMContentLoaded', ()=>{ document.body.appendChild(panel); });

  function update(){
    collectResources();
    collectNavigation();

    const $ = id => panel.querySelector(id);
    $('#m-fcp').textContent = fmtMs(state.fcp);
    $('#m-lcp').textContent = fmtMs(state.lcp);
    $('#m-cls').textContent = state.cls ? state.cls.toFixed(3) : '-';
    $('#m-tbt').textContent = state.totalBlockingTime ? fmtMs(state.totalBlockingTime) : '-';
    $('#m-req').textContent = String(state.totalRequests||'-');
    $('#m-bytes').textContent = state.totalBytes ? fmtKB(state.totalBytes) : '-';

    // Expose pour comparaison avant/après
    window.__metrics = {
      fcp: state.fcp, lcp: state.lcp, cls: state.cls,
      tbtApprox: state.totalBlockingTime,
      totalRequests: state.totalRequests,
      totalBytes: state.totalBytes,
      navigation: state.nav
    };
  }

  // Actions
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='perf-refresh'){
      // Forcer une collecte complète (post-load)
      update();
    }
    if(e.target && e.target.id==='perf-close'){
      panel.remove();
    }
  });

  // Mise à jour initiale après load pour disposer des ressources
  addEventListener('load', ()=>{
    setTimeout(update, 0);
  });
})();
