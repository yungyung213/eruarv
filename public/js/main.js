import {imageAssets} from './image-assets.js';
import {mainMedia,mainSlideInterval} from './content-data.js';
import {createMedia,stopVideos} from './media.js';
if(document.querySelector('[data-main-effect]')?.dataset.mainEffect==='particles'&&mainMedia.length>0&&mainMedia.every(item=>item.type!=='video'&&!/\.gif(?:[?#]|$)/i.test(item.src))){
 await import('./particle-page.js');
}else{
const target=document.querySelector('#hero-media');let index=0,request=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function prepare(media){const asset=imageAssets[media.src];return asset?{...media,src:media.src.replace(/\.png$/,'-detail.jpg'),srcset:asset.srcset}:media;}
function preloadNext(){if(mainMedia.length<2)return;const media=prepare(mainMedia[(index+1)%mainMedia.length]);if(media.type==='video')return;const img=new Image();img.decoding='async';img.fetchPriority='low';if(media.srcset){img.srcset=media.srcset;img.sizes='100vw';}img.src=media.src;}
async function render(nextIndex){
 if(!mainMedia.length)return;const token=++request,media=prepare(mainMedia[nextIndex]);const el=createMedia(media);el.className='hero-asset hero-slide';
 if(el.tagName==='IMG'){
  if(media.srcset){el.srcset=media.srcset;el.sizes='100vw';}el.fetchPriority=target.children.length?'auto':'high';
  try{await el.decode();}catch{if(token===request)console.warn('Main image failed:',media.src);return;}
 }else{
  el.muted=true;el.loop=true;el.autoplay=true;
 }
 if(token!==request)return;index=nextIndex;
 const previous=[...target.children];target.append(el);
 requestAnimationFrame(()=>requestAnimationFrame(()=>{el.classList.add('is-visible');}));
 if(el.tagName==='VIDEO')el.play().catch(()=>{});
 setTimeout(()=>{previous.forEach(old=>{if(old.tagName==='VIDEO')old.pause();old.remove();});},reduced.matches?0:1400);
 preloadNext();
}
for(const [id,delta] of [['hero-previous',-1],['hero-next',1]]){
 const button=document.querySelector('#'+id);if(!button)continue;button.hidden=mainMedia.length<2;
 button.addEventListener('click',()=>render((index+delta+mainMedia.length)%mainMedia.length));
}
render(0);
setInterval(()=>{if(mainMedia.length<2||document.hidden||target.closest('main').hidden||reduced.matches)return;render((index+1)%mainMedia.length);},mainSlideInterval);

}
