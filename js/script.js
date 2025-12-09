(function(){
  const start = performance.now();
  while (performance.now() - start < 2000) {}
  const waste = [];
  for (let i=0;i<200000;i++) { waste.push(Math.random()*i); }
  window.__waste = waste;
  window.addEventListener('load', function(){
    const imgs = document.querySelectorAll('.card img');
    imgs.forEach(img => { if (img.complete) img.classList.add('loaded'); else img.addEventListener('load', ()=> img.classList.add('loaded')); });
    const t0 = performance.now();
    while (performance.now() - t0 < 1000) {}
  });
})();
