import {photos} from './photos.js';
import {imageAssets} from './image-assets.js';
import {mainMedia} from './site-config.js';
import {createMedia,stopVideos} from './media.js';
const target=document.querySelector('#hero-media');let index=0;
function render(){stopVideos(target);target.replaceChildren();if(!mainMedia.length)return;
 const media=mainMedia[index],asset=imageAssets[media.src];const display=asset?{...media,src:media.src.replace(/\.png$/,'-detail.jpg')}:media;const el=createMedia(display);el.className='hero-asset';if(asset&&el.tagName==='IMG'){el.srcset=asset.srcset;el.sizes='100vw';}
 if(el.tagName==='VIDEO'){el.muted=true;el.loop=true;el.autoplay=true;}
 el.addEventListener('error',()=>{const message=document.createElement('p');message.textContent='미디어를 불러오지 못했습니다.';target.replaceChildren(message);});
 target.append(el);
}
for(const [id,delta] of [['hero-previous',-1],['hero-next',1]]){const button=document.querySelector('#'+id);button.hidden=mainMedia.length<2;button.addEventListener('click',()=>{index=(index+delta+mainMedia.length)%mainMedia.length;render();});}
render();

// Image-only gallery preview: native touch scrolling and quiet auto-advance.
const preview=document.querySelector('#home-preview-track');
const previewPosts=[...photos].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12);
for(const post of previewPosts){
 const original=post.images[0];if(!original)continue;
 const asset=imageAssets[original.src];
 const media=asset?{...original,src:original.src.replace(/\.png$/,'-medium.jpg')}:original;
 const item=createMedia(media,{thumbnail:true});item.className='preview-image';
 if(asset){item.srcset=asset.srcset;item.sizes='(max-width:700px) 66vw, 28vw';}
 preview.append(item);
}
let previewVisible=false,pausedUntil=0;
const observer=new IntersectionObserver(entries=>{previewVisible=entries[0].isIntersecting;},{threshold:.15});observer.observe(preview);
function pausePreview(){pausedUntil=Date.now()+16000;}
preview.addEventListener('pointerdown',pausePreview,{passive:true});preview.addEventListener('wheel',pausePreview,{passive:true});
preview.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();pausePreview();preview.scrollBy({left:(event.key==='ArrowRight'?1:-1)*(preview.firstElementChild?.getBoundingClientRect().width||200),behavior:'smooth'});});
setInterval(()=>{
 if(!previewVisible||document.hidden||preview.closest('main').hidden||Date.now()<pausedUntil||preview.matches(':hover,:focus-within')||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const children=[...preview.children];if(children.length<2)return;
 const left=preview.getBoundingClientRect().left;
 const next=children.find(item=>item.getBoundingClientRect().left>left+10);
 const atEnd=preview.scrollLeft+preview.clientWidth>=preview.scrollWidth-2;
 preview.scrollTo({left:atEnd||!next?0:preview.scrollLeft+next.getBoundingClientRect().left-left,behavior:'smooth'});
},4000);
