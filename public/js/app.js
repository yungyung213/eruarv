import {stopVideos} from './media.js';
import {photos,siteSettings} from './content-data.js';
const appearance=siteSettings.appearance||{};
document.documentElement.dataset.theme=appearance.theme==='dark'?'dark':'light';
document.body.dataset.mainEffect=appearance.particles===false?'media':'particles';
const siteRoot = new URL('../', import.meta.url);
function pageForPath(path){
 if(!path.startsWith(siteRoot.pathname))return null;
 path='/'+path.slice(siteRoot.pathname.length);
 if(/^\/gallery(?:\.html)?\/?$/.test(path))return 'gallery';
 if(/^\/(?:index\.html)?$/.test(path))return 'main';
 return null;
}
const footer=document.querySelector('footer');const shell=document.createElement('div');shell.className='footer-shell';footer.before(shell);shell.append(footer);
const initialMain=document.querySelector('main');
const initialPage=initialMain.classList.contains('gallery-main')?'gallery':'main';
initialMain.dataset.page=initialPage;
await import('./music.js');
try{
 const response=await fetch(new URL(initialPage==='gallery'?'index.html':'gallery.html',siteRoot));if(!response.ok)throw new Error('Page load failed');
 const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
 const other=parsed.querySelector('main');if(!other)throw new Error('Companion page missing');
 other.dataset.page=initialPage==='gallery'?'main':'gallery';other.hidden=true;shell.before(other);
 const dialog=parsed.querySelector('#detail');if(dialog&&!document.querySelector('#detail'))shell.before(dialog);

 const pages=[...document.querySelectorAll('main[data-page]')];
 const pageModules={
  main:()=>import('./main.js?v=38'),
  gallery:()=>import('./gallery.js?v=38')
 };
 const initialized=new Set();
 document.querySelectorAll('[data-gallery-count]').forEach(count=>{count.textContent=String(photos.length).padStart(2,'0');});
 function route(){
  const page=pageForPath(location.pathname)||initialPage,gallery=page==='gallery';
  const detail=document.querySelector('#detail');if(!gallery&&detail?.open)detail.close();
  pages.forEach(section=>{section.hidden=section.dataset.page!==page;if(section.hidden)stopVideos(section);else section.querySelectorAll('video[autoplay]').forEach(video=>video.play().catch(()=>{}));});
  document.body.classList.toggle('home-page',!gallery);
  if(!initialized.has(page)){
   initialized.add(page);
   pageModules[page]().catch(error=>{
    initialized.delete(page);
    console.error('Page initialization failed:',error);
   });
  }
  document.querySelectorAll('header nav a').forEach(link=>{if(pageForPath(new URL(link.href,location.href).pathname)===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 }
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.target||link.hasAttribute('download'))return;
  const url=new URL(link.href,location.href);if(url.origin!==location.origin||!pageForPath(url.pathname))return;
  event.preventDefault();if(location.pathname!==url.pathname||location.search!==url.search)history.pushState(null,'',url.pathname+url.search+url.hash);route();window.scrollTo({top:0,behavior:'instant'});
 });
 window.addEventListener('popstate',route);route();

}catch(error){
 const script=document.createElement('script');script.type='module';script.src=new URL(initialPage==='gallery'?'./gallery.js?v=38':'./main.js?v=38',import.meta.url);document.body.append(script);
 console.error('Shared page navigation unavailable:',error);
}
