(function(){

  /* ❌ L’ANCIEN CODE BLOQUAIT 3 SECONDES + GROS TABLEAU :
        while(...) {}
        for(){ waste.push(...) }
     → Remplacé par un "simulateur léger non-bloquant"
  */

  // Simule une tâche longue *sans bloquer*
  function simulateHeavyTask(duration=2000){
    const start = performance.now();
    function step(){
      if(performance.now() - start < duration){
        // On traite un petit morceau (5ms max)
        const t0 = performance.now();
        while(performance.now() - t0 < 5){}
        requestIdleCallback(step);
      }
    }
    requestIdleCallback(step);
  }

  simulateHeavyTask(800); // avant : 2000ms bloquants

  window.addEventListener('load', ()=>{
    const imgs = document.querySelectorAll('.card img');
    imgs.forEach(img =>{
      if(img.complete) img.classList.add('loaded');
      else img.addEventListener('load', ()=> img.classList.add('loaded'));
    });
  });

})();