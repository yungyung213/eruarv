import {setTitle} from './post-title.mjs';
import {postCategories} from './post-categories.mjs';
import {palette} from './palette.js';
import {isVideo,createMedia,stopVideos} from './media.js';
import {PAGE_SIZE} from './pagination.js';
import {photos,siteSettings} from './content-data.js';
import {imageAssets} from './image-assets.js';
const optimized=(image,size)=>imageAssets[image.src]?image.src.replace(/\.png$/,`-${size}.jpg`):(image[size]||image.src);
let requestId=0;
const cache=new Map();
function loadImage(src){if(!cache.has(src)){const img=new Image();img.decoding='async';const ready=new Promise((resolve,reject)=>{img.onload=()=>img.decode().catch(()=>{}).then(()=>resolve(img));img.onerror=()=>{cache.delete(src);reject(new Error('Image load failed'));};});img.src=src;cache.set(src,ready);}return cache.get(src);}

const byPostDate=(a,b)=>b.date.localeCompare(a.date);
const posts=[...photos].sort(byPostDate);
const byUpload=[...posts].sort((a,b)=>(b.uploadedAt||b.date).localeCompare(a.uploadedAt||a.date)||byPostDate(a,b));
let sort='date';
const frames=posts.flatMap(post=>(post.images.length?post.images:[null]).map((image,imageIndex)=>({post,image,imageIndex})));
const detail=document.querySelector('#detail'),grid=document.querySelector('#photo-grid');
const previous=document.querySelector('#previous-photo'),next=document.querySelector('#next-photo');
let selectedColor='';
const moreButton=document.querySelector('#load-more');
const photoViewport=document.querySelector('.detail-photo');
const img=document.querySelector('#detail-image');
const status=document.querySelector('#image-status');
const originalLink=document.querySelector('#view-original');
const writing=detail.querySelector('.detail-writing');
const video=document.querySelector('#detail-video');
const mediaWidth=new ResizeObserver(entries=>{
 for(const {target,contentRect} of entries){
  if(!target.hidden&&contentRect.width>0){
   writing.style.setProperty('--detail-media-width',contentRect.width+'px');
  }
 }
});
mediaWidth.observe(img);
mediaWidth.observe(video);
detail.addEventListener('click',event=>{
 const link=event.target.closest('.original-link');
 if(!link||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 event.preventDefault();
 window.open(link.href,'_blank','popup,width=1050,height=800,noopener,noreferrer');
});
let renderedCount=0;

const colorLabels=Object.fromEntries(palette.map(item=>[item.color,item.name]));colorLabels['#000000']='검정';
function appendChips(target,colors){
 if(target.id==='detail-palette'||target.classList.contains('palette-chips')){
  if(!colors.length)return;const chip=document.createElement('span');chip.className='palette-gradient';chip.style.background=colors.length===1?colors[0]:`linear-gradient(90deg,${colors.join(',')})`;chip.setAttribute('role','img');chip.setAttribute('aria-label',colors.map(color=>colorLabels[color]||color).join(' / '));target.append(chip);return;
 }
 colors.forEach(color=>{const chip=document.createElement('span');chip.className='swatch';chip.style.background=color;chip.setAttribute('role','img');chip.setAttribute('aria-label',colorLabels[color]||color);target.append(chip);});
}
let current=0;
let selectedCategory='';
let selectedCharacter='';
const shortDate=date=>date.slice(2);
function filteredPosts(){return (sort==='upload'?byUpload:posts).filter(post=>(!selectedColor||post.colors.includes(selectedColor))&&(!selectedCategory||postCategories(post).includes(selectedCategory))&&(!selectedCharacter||post.other?.includes(selectedCharacter)));}
const framesByPost=new Map(posts.map(post=>[post,[]]));
for(const frame of frames)framesByPost.get(frame.post).push(frame);
function availableFrames(){return filteredPosts().flatMap(post=>framesByPost.get(post));}
function stepPost(delta){const available=filteredPosts(),post=frames[current].post;const index=available.indexOf(post);if(!available.length)return;const target=available[(index+delta+available.length)%available.length];showPhoto(frames.findIndex(frame=>frame.post===target));}

function getOriginalSource(image){
 if(!image||isVideo(image))return '';
 const original=image.original||(imageAssets[image.src]?image.src:'');
 const siteRoot=new URL('../',import.meta.url);
 if(!original||(original===image.detail&&image.thumb)||!URL.canParse(original,siteRoot))return '';
 const url=new URL(original,siteRoot);
 return ['http:','https:'].includes(url.protocol)?url.href:'';
}

function renderWriting(post){
 const title=document.querySelector('#detail-title');
 const body=document.querySelector('#detail-body');
 const text=post.body?.trim()||'';
 writing.hidden=!post.title&&!text;
 setTitle(title,post.title);
 title.hidden=!post.title;
 body.replaceChildren();
 if(!text)return;
 for(const paragraph of text.split(/\r?\n[ \t]*\r?\n+/)){
  const content=document.createElement('p');
  content.textContent=paragraph;
  body.append(content);
 }
}

async function showPhoto(index){
 if(!frames.length)return;
 const previousPost=frames[current]?.post;
 current=(index+frames.length)%frames.length;
 const {post,image,imageIndex}=frames[current];
 const token=++requestId;
 const original=getOriginalSource(image);
 originalLink.hidden=!original;
 if(original){
  const viewer=new URL('../original.html',import.meta.url);
  viewer.hash=new URLSearchParams({src:original}).toString();
  originalLink.href=viewer.href;
 }
 else originalLink.removeAttribute('href');
 img.alt='';
 previous.disabled=next.disabled=!image||post.images.length<2;document.querySelector('#previous-post').disabled=document.querySelector('#next-post').disabled=filteredPosts().length<2;
 stopVideos(detail);
 if(!detail.open||previousPost!==post)renderWriting(post);
 if(!image)writing.style.removeProperty('--detail-media-width');
 detail.querySelector('.detail-media').hidden=!image;
 photoViewport.hidden=!image||isVideo(image);
 const date=detail.querySelector('time');date.dateTime=post.date;date.textContent=shortDate(post.date);
 const palette=document.querySelector('#detail-palette');palette.replaceChildren();appendChips(palette,post.colors);
 document.querySelector('#detail-genre').textContent=postCategories(post).join(' / ')||'—';
 document.querySelector('#detail-other').textContent=(post.other||[]).join(' / ')||'—';
 const credit=document.querySelector('#detail-credit');credit.replaceChildren();if(post.thxTo&&post.thxUrl){const link=document.createElement('a');link.href=post.thxUrl;link.textContent=post.thxTo;link.target='_blank';link.rel='noopener noreferrer';credit.append(link);}else{credit.textContent=post.thxTo||'—';}
 document.querySelector('#slide-position').textContent=image?`photo ${imageIndex+1} / ${post.images.length}`:'';

 status.textContent='loading…';img.setAttribute('aria-busy','true');
 video.removeAttribute('src');video.load();
 if(!image){
  img.hidden=video.hidden=true;img.removeAttribute('src');img.setAttribute('aria-busy','false');status.textContent='';
 }else if(isVideo(image)){
  img.hidden=true;video.hidden=false;video.src=image.src;video.setAttribute('aria-label',image.alt||'동영상');
  if(image.poster)video.poster=image.poster;else video.removeAttribute('poster');
  video.onloadeddata=()=>{if(token===requestId)status.textContent='';};
  video.onerror=()=>{if(token===requestId)status.textContent='동영상을 불러오지 못했습니다. 파일 형식을 확인해 주세요.';};
  img.setAttribute('aria-busy','false');
 }else{
  video.hidden=true;img.hidden=false;
  try{let loaded;try{loaded=await loadImage(optimized(image,'detail'));}catch{loaded=await loadImage(image.src);}if(token!==requestId)return;img.src=loaded.src;img.alt=image.alt||'';img.animate([{opacity:.65},{opacity:1}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:150});status.textContent='';}
  catch{if(token===requestId){status.textContent='이미지를 불러오지 못했습니다. 다시 시도해 주세요.';img.removeAttribute('src');img.alt='';}}
  if(token!==requestId)return;img.setAttribute('aria-busy','false');
 }
 const active=availableFrames(),position=active.indexOf(frames[current]);
 for(const offset of [-1,1]){const neighbor=active[(position+offset+active.length)%active.length]?.image;if(neighbor&&neighbor!==image&&!isVideo(neighbor))loadImage(optimized(neighbor,'detail')).catch(()=>{});}

}
function open(index){if(!frames.length)return;showPhoto(index);if(!detail.open)detail.showModal();}
function step(delta){const {post,imageIndex}=frames[current];if(post.images.length<2)return;const target=(imageIndex+delta+post.images.length)%post.images.length;showPhoto(frames.findIndex(frame=>frame.post===post&&frame.imageIndex===target));}
function render(){
 grid.replaceChildren();
 renderedCount=0;
 appendPosts();
}

function appendPosts({moveFocus=false}={}){
 const shown=filteredPosts();
 const batch=shown.slice(renderedCount,renderedCount+PAGE_SIZE);
 const firstNewIndex=renderedCount;
 document.querySelector('#empty-state').hidden=shown.length>0;
 for(const post of batch){
  const button=document.createElement('button');
  button.className='photo-card';
  button.setAttribute('aria-label',post.title? `Open ${post.title}` : `Open post from ${shortDate(post.date)}`);
  const first=post.images[0];
  if(first){
   const image=createMedia({...first,alt:'',src:optimized(first,'thumb')},{thumbnail:true});
   const dimensions=imageAssets[first.src];
   if(dimensions&&!isVideo(first)){image.width=dimensions.width;image.height=dimensions.height;image.srcset=dimensions.srcset;}
   if(first.srcset&&!isVideo(first))image.srcset=first.srcset;
   image.className='thumbnail';button.append(image);
  }else{
   const excerpt=document.createElement('span');excerpt.className='text-post-excerpt';
   const title=document.createElement('strong');setTitle(title,post.title);
   excerpt.append(title);
   if(post.body){const body=document.createElement('span');body.textContent=post.body;excerpt.append(body);}
   button.append(excerpt);
  }
  const meta=document.createElement('div');meta.className='meta';
  const date=document.createElement('time');date.dateTime=post.date;date.textContent=shortDate(post.date);
  const palette=document.createElement('span');palette.className='palette-chips';appendChips(palette,post.colors);
  meta.append(date,palette);button.append(meta);
  button.addEventListener('click',()=>open(frames.findIndex(frame=>frame.post===post)));
  grid.append(button);
 }
 renderedCount+=batch.length;
 moreButton.hidden=renderedCount>=shown.length;
 updateSizes();
 if(moveFocus&&batch.length)grid.children[firstNewIndex].focus({preventScroll:true});
}

moreButton.addEventListener('click',()=>appendPosts({moveFocus:true}));

const colors=palette.map(item=>item.color);const colorOptions=document.querySelector('#color-options');
colors.forEach(color=>{const button=document.createElement('button');button.dataset.color=color;button.setAttribute('aria-label',colorLabels[color]||color);button.setAttribute('aria-pressed','false');appendChips(button,[color]);button.addEventListener('click',()=>{selectedColor=selectedColor===color?'':color;syncFilters();render();});colorOptions.append(button);});
const desktop=matchMedia('(min-width:701px)');
let view;
let clickedView=null;
const defaultView=()=>desktop.matches?'default':'one';
function updateSizes(){grid.querySelectorAll('img').forEach(img=>{img.sizes=view==='one'?'92vw':view==='default'?'auto, 46vw':'46vw';});}
function setView(value){
 const allowed=desktop.matches?['default']:['one','two'];
 view=allowed.includes(value)?value:defaultView();
 grid.dataset.view=view;
 document.querySelectorAll('.view-modes [data-view]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.view===view));button.dataset.active=String(button.dataset.view===view&&clickedView===view);});
 updateSizes();
}
function restoreView(){clickedView=null;setView(defaultView());}
document.querySelectorAll('.view-modes [data-view]').forEach(button=>button.addEventListener('click',()=>{clickedView=button.dataset.view;setView(button.dataset.view);}));
desktop.addEventListener('change',restoreView);
restoreView();
const sortButtons=document.querySelectorAll('[data-sort]');
for(const button of sortButtons)button.addEventListener('click',()=>{
 sort=button.dataset.sort;
 syncFilters();
 render();
});
render();document.querySelector('.gallery-heading sup').textContent=` (${String(posts.length).padStart(2,'0')})`;document.querySelectorAll('[data-gallery-count]').forEach(count=>{count.textContent=String(posts.length).padStart(2,'0');});
document.querySelector('#close-photo').addEventListener('click',()=>detail.close());
previous.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));
document.querySelector('#previous-post').addEventListener('click',()=>stepPost(-1));document.querySelector('#next-post').addEventListener('click',()=>stepPost(1));
detail.addEventListener('keydown',e=>{if(e.target.closest('video'))return;if(e.key==='ArrowRight'){e.preventDefault();step(1);}if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}});
detail.addEventListener('close',()=>{requestId++;stopVideos(detail);const video=document.querySelector('#detail-video');video.removeAttribute('src');video.load();document.querySelector('#detail-image').removeAttribute('src');if(location.search)history.replaceState(null,'',location.pathname);});
// Filters follow the categories and characters managed in the admin.
for(const [group,label,values] of [['genre','Category',[...(siteSettings.categories||[]),...posts.flatMap(postCategories)]],['other','Character',[...(siteSettings.characters||[]),...posts.flatMap(post=>post.other||[])]]]){
 const target=document.querySelector(`[role=group][aria-label="${label}"]`);target.querySelectorAll('button').forEach(button=>button.remove());
 for(const value of ['',...new Set(values.filter(Boolean))]){const button=document.createElement('button');button.dataset.group=group;button.dataset.value=value;button.textContent=value||'all';button.setAttribute('aria-pressed',String(!value));target.append(button);}
}
function syncFilters(){
 for(const button of document.querySelectorAll('[data-group]')){
  const {group,value}=button.dataset;
  const active=group==='genre'
   ? value===selectedCategory
   : value===selectedCharacter;
  button.setAttribute('aria-pressed',String(active));
 }
 for(const button of colorOptions.children){
  button.setAttribute('aria-pressed',String(button.dataset.color===selectedColor));
 }
 for(const button of sortButtons){
  button.setAttribute('aria-pressed',String(button.dataset.sort===sort));
 }
}

for(const button of document.querySelectorAll('[data-group]')){
 button.addEventListener('click',()=>{
  const {group,value}=button.dataset;
  if(group==='other')selectedCharacter=value;
  else selectedCategory=value;
  syncFilters();
  render();
 });
}

document.querySelector('#gallery-home').addEventListener('click',event=>{
 if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 selectedCategory='';
 selectedCharacter=selectedColor='';
 sort='date';
 setOptions(false);
 syncFilters();
 render();
});
const optionsToggle=document.querySelector('.options-toggle'),options=document.querySelector('#gallery-options');
function setOptions(expanded){
 optionsToggle.setAttribute('aria-expanded',String(expanded));
 optionsToggle.textContent=expanded?'options −':'options +';
 options.hidden=!expanded;
}
optionsToggle.addEventListener('click',()=>setOptions(options.hidden));
const selected=new URLSearchParams(location.search).get('photo'),initial=frames.findIndex(frame=>frame.post.id===selected);if(initial>=0)open(initial);

let touchStart;const media=document.querySelector('#detail-image');media.addEventListener('touchstart',event=>{touchStart={x:event.changedTouches[0].clientX,y:event.changedTouches[0].clientY};},{passive:true});media.addEventListener('touchcancel',()=>{touchStart=null;},{passive:true});media.addEventListener('touchend',event=>{if(!touchStart)return;const dx=event.changedTouches[0].clientX-touchStart.x,dy=event.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1);touchStart=null;},{passive:true});
