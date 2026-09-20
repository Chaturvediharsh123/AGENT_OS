(()=>{
  const boot=()=>{
    const left=document.querySelector('.left-rail');
    const right=document.querySelector('.right-rail');
    if(left&&!left.querySelector('.station-directory')){
      left.querySelector('.rail-footer')?.insertAdjacentHTML('beforebegin',
        '<section class="station-directory"><div class="side-section-title">STATION DIRECTORY <span>4</span></div>'+
        '<div class="side-agent"><i class="live"></i><b>Scout</b><small>researcher</small><em>local</em></div>'+
        '<div class="side-agent"><i></i><b>Miller</b><small>analyst</small><em>cloud</em></div>'+
        '<div class="side-agent"><i></i><b>Juniper</b><small>writer</small><em>local</em></div>'+
        '<div class="side-agent"><i></i><b>Clover</b><small>reviewer</small><em>local</em></div></section>');
    }
    if(right&&!right.querySelector('.activity-panel')){
      right.insertAdjacentHTML('beforeend',
        '<section class="activity-panel"><div class="side-section-title">LIVE ACTIVITY <span>NOW</span></div>'+
        '<div class="activity-row"><i class="live"></i><span>Workspace ready</span><em>just now</em></div>'+
        '<div class="activity-row"><i></i><span>Waiting for a mission</span><em>—</em></div>'+
        '<div class="activity-row"><i></i><span>Search memory to inspect past work</span><em>tip</em></div></section>');
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,300));
  else setTimeout(boot,300);
})();
