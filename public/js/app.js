import {stopVideos} from './media.js';
const footer=document.querySelector('footer');const shell=document.createElement('div');shell.className='footer-shell';footer.before(shell);shell.append(footer);
// Both routes share the same document, footer and audio engine for this visit.
const initialGallery=location.pathname.endsWith('/gallery.html');
const initialMain=document.querySelector('main');initialMain.dataset.page=initialGallery?'gallery':'main';
await import('./music.js');
try{
 const response=await fetch(initialGallery?'index.html':'gallery.html');if(!response.ok)throw new Error('Page load failed');
 const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
 const other=parsed.querySelector('main');other.dataset.page=initialGallery?'main':'gallery';other.hidden=true;shell.before(other);
 const dialog=parsed.querySelector('#detail');if(dialog)shell.before(dialog);
 await import('./main.js');await import('./gallery.js');
 const pages=[...document.querySelectorAll('main[data-page]')];
 function route(){
  const gallery=location.pathname.endsWith('/gallery.html');
  const detail=document.querySelector('#detail');if(!gallery&&detail.open)detail.close();
  pages.forEach(page=>{page.hidden=page.dataset.page!==(gallery?'gallery':'main');if(page.hidden)stopVideos(page);else page.querySelectorAll('video[autoplay]').forEach(video=>video.play().catch(()=>{}));});
  document.body.classList.toggle('home-page',!gallery);
  document.querySelectorAll('header nav a').forEach(link=>{if(link.getAttribute('href')===(gallery?'gallery.html':'index.html'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 }
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.target||link.hasAttribute('download'))return;
  const url=new URL(link.href,location.href);if(url.origin!==location.origin||!['index.html','gallery.html'].includes(url.pathname.split('/').pop()))return;
  event.preventDefault();if(location.pathname!==url.pathname||location.search!==url.search)history.pushState(null,'',url.pathname+url.search+url.hash);route();window.scrollTo({top:0,behavior:'instant'});
 });
 window.addEventListener('popstate',route);route();
}catch(error){
 // Ordinary document links remain available if the companion page cannot load.
 const script=document.createElement('script');script.type='module';script.src=initialGallery?'js/gallery.js':'js/main.js';document.body.append(script);
 console.error('Shared page navigation unavailable:',error);
}
