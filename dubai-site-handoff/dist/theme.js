/* Dubai Store day/night preference. Public storefront only. */
(function(){
  'use strict';
  const key='dubai-store-theme';
  const root=document.documentElement;
  const button=document.getElementById('theme-toggle');
  if(!button)return;
  const icon=button.querySelector('.theme-icon');
  const word=button.querySelector('.theme-word');
  function apply(mode){
    const dark=mode==='dark';
    if(dark)root.setAttribute('data-theme','dark');
    else root.removeAttribute('data-theme');
    button.setAttribute('aria-pressed',String(dark));
    button.setAttribute('aria-label',dark?'تفعيل الوضع النهاري':'تفعيل الوضع الليلي');
    button.setAttribute('title',dark?'تفعيل الوضع النهاري':'تفعيل الوضع الليلي');
    if(icon)icon.textContent=dark?'☀':'☾';
    if(word)word.textContent=dark?'نهاري':'ليلي';
  }
  apply(root.getAttribute('data-theme')==='dark'?'dark':'light');
  button.addEventListener('click',function(){
    const next=root.getAttribute('data-theme')==='dark'?'light':'dark';
    apply(next);
    try{localStorage.setItem(key,next);}catch(error){/* Private browsing: still switch for this page. */}
  });
})();
