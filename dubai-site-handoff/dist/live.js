(async function(){
try{let r=await fetch('/api/data?action=store',{cache:'no-store'});if(!r.ok)throw Error('No live data');window.CATALOG=await r.json();}
catch(e){try{let r=await fetch('/catalog.json',{cache:'no-store'});window.CATALOG=await r.json();console.warn('Showing cached catalog',e)}catch(err){document.body.insertAdjacentHTML('beforeend','<p style="padding:20px">تعذر تحميل المنتجات، يرجى تحديث الصفحة.</p>');return}}
try{
const script=document.createElement('script');script.src='/shop.js';script.onload=()=>{
const cats=window.CATALOG.categories||[];
const bar=document.querySelector('.category-bar');const tiles=document.querySelector('.category-tiles');
function pic(n){return String(n).startsWith('uploads/')?'/api/data?action=image&file='+encodeURIComponent(n):'/assets/'+n}
function safe(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
cats.forEach(c=>{
if(bar&&!bar.querySelector('a[href="/'+c.id+'/"]'))bar.insertAdjacentHTML('beforeend','<a href="/'+encodeURIComponent(c.id)+'/">'+safe(c.short||c.title)+' <span>+</span></a>');
if(tiles&&!tiles.querySelector('a[href="/'+c.id+'/"]'))tiles.insertAdjacentHTML('beforeend','<a href="/'+encodeURIComponent(c.id)+'/"><img src="'+safe(pic(c.image))+'" alt=""><b>'+safe(c.title)+'</b><span>اكتشف القسم ↖</span></a>')
});
let settings=window.CATALOG.site||{};if(settings.whatsapp){document.querySelectorAll('a[href^="https://wa.me/"]').forEach(a=>{a.href=a.href.replace(/wa\.me\/\d+/, 'wa.me/'+settings.whatsapp)})}
if(settings.name)document.querySelectorAll('.brand b').forEach(e=>e.textContent=settings.name);
if(settings.heroTitle&&document.querySelector('.hero h1'))document.querySelector('.hero h1').textContent=settings.heroTitle;
if(settings.heroDescription&&document.querySelector('.hero-copy p'))document.querySelector('.hero-copy p').textContent=settings.heroDescription;
};
document.body.appendChild(script)
}catch(e){console.error(e)}
})();