/* metrics.js — widget d'évaluation des performances (client-side) et tâches de blocage
   Le code de simulation de charge (blocage du thread) est déplacé au début.
   Le widget affiche FCP, LCP, CLS, TBT (~approx), #requêtes et poids total.
   N'emploie aucune dépendance externe.
*/

// --- DÉBUT DU CODE DE SIMULATION DE CHARGE ET D'ACTIVITÉ ---

(function(){
  // Tâche longue SYNCHRONE DÉLIBÉRÉE (bloque le thread principal pendant 2000 ms)
  const start = performance.now();
  while (performance.now() - start < 2000) {}

  // Tâche de calcul lourde (génération de 200 000 nombres aléatoires)
  const waste = [];
  for (let i=0;i<200000;i++) { waste.push(Math.random()*i); }
  window.__waste = waste; // Stocké pour éviter l'optimisation complète par le moteur JS

  window.addEventListener('load', function(){
    // Gestion du chargement différé des images
    const imgs = document.querySelectorAll('.card img');
    imgs.forEach(img => { 
      if (img.complete) {
        img.classList.add('loaded');
      } else {
        img.addEventListener('load', ()=> img.classList.add('loaded'));
      }
    });
    
    // Deuxième tâche longue SYNCHRONE DÉLIBÉRÉE (bloque le thread principal pendant 1000 ms) après le chargement des ressources
    const t0 = performance.now();
    while (performance.now() - t0 < 1000) {}
  });
})();

// --- FIN DU CODE DE SIMULATION DE CHARGE ET D'ACTIVITÉ ---


// --- DÉBUT DU CODE DU WIDGET D'ÉVALUATION DES PERFORMANCES ---

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

  // Helpers: formatters
  const fmtMs = v => (v == null ? '-' : v.toFixed(0) + ' ms');
  const fmtKB = v => (v == null ? '-' : (v / 1024).toFixed(1) + ' KB');

  // Observer FCP
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        if (e.name === 'first-contentful-paint' && state.fcp == null) {
          state.fcp = e.startTime;
          update();
          this.disconnect?.();
        }
      }
    }).observe({ type: 'paint', buffered: true });
  } catch {}

  // Observer LCP
  try {
    const poLcp = new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        state.lcp = e.renderTime || e.loadTime || e.startTime;
      }
      update();
    });
    poLcp.observe({ type: 'largest-contentful-paint', buffered: true });
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') poLcp.takeRecords();
    });
  } catch {}

  // Observer CLS
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {
          state.cls += e.value;
          state.clsEntries.push(e);
        }
      }
      update();
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}

  // Observer Long Tasks (TBT approx)
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        state.longTasks++;
        state.longTasksTime += e.duration;
        // TBT est la somme du temps excédant 50ms par tâche longue
        state.totalBlockingTime += Math.max(0, e.duration - 50); 
      }
      update();
    }).observe({ entryTypes: ['longtask'] });
  } catch {}

  function collectResources() {
    const entries = performance.getEntriesByType('resource');
    state.resources = entries;
    state.totalRequests = entries.length + 1; // +1 pour le document HTML

    state.totalBytes = entries.reduce((sum, r) => {
      // Utilise transferSize si disponible (taille réelle transférée), sinon encodedBodySize
      const bytes = r.transferSize > 0 ? r.transferSize : (r.encodedBodySize || 0);
      return sum + bytes;
    }, 0);
  }

  function collectNavigation() {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) state.nav = nav;
  }

  // UI Panel
  const panel = document.createElement('div');
  panel.id = 'perf-panel';
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
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(panel));

  function update() {
    collectResources();
    collectNavigation();
    const $ = id => panel.querySelector(id);

    $('#m-fcp').textContent = fmtMs(state.fcp);
    $('#m-lcp').textContent = fmtMs(state.lcp);
    $('#m-cls').textContent = state.cls ? state.cls.toFixed(3) : '-';
    // Le TBT affiché inclura le blocage délibéré simulé (2000ms au début + 1000ms au load)
    $('#m-tbt').textContent = state.totalBlockingTime ? fmtMs(state.totalBlockingTime) : '-';
    $('#m-req').textContent = String(state.totalRequests || '-');
    $('#m-bytes').textContent = state.totalBytes ? fmtKB(state.totalBytes) : '-';

    // Exportation des métriques pour un accès externe
    window.__metrics = {
      fcp: state.fcp,
      lcp: state.lcp,
      cls: state.cls,
      tbtApprox: state.totalBlockingTime,
      totalRequests: state.totalRequests,
      totalBytes: state.totalBytes,
      navigation: state.nav
    };
  }

  // Actions
  document.addEventListener('click', e => {
    if (e.target?.id === 'perf-refresh') update();
    if (e.target?.id === 'perf-close') panel.remove();
  });

  // Initial update après load
  // Le setTimeout permet au navigateur de terminer le rendu et l'exécution
  // de la tâche longue synchrone de 1000ms définie dans le premier bloc de code
  addEventListener('load', () => setTimeout(update, 0));
})();