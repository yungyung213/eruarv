export function isVideo(media){return media.type==='video'||/\.(mp4|webm|mov)(?:[?#]|$)/i.test(media.src);}
export function createMedia(media,{thumbnail=false}={}){
 const el=document.createElement(isVideo(media)?'video':'img');
 if(isVideo(media)){
  el.preload='metadata';el.playsInline=true;
  if(media.poster)el.poster=media.poster;
  if(thumbnail){el.muted=true;el.tabIndex=-1;el.setAttribute('aria-hidden','true');}
  else{el.controls=true;el.setAttribute('aria-label',media.alt||'동영상');}
 }else{el.alt=media.alt||'';el.decoding='async';if(thumbnail)el.loading='lazy';}
 el.src=thumbnail&&media.poster?media.poster:media.src;
 // A video poster belongs on <video>; its source must remain the video URL.
 if(isVideo(media))el.src=media.src;
 return el;
}
export function stopVideos(target){target.querySelectorAll('video').forEach(video=>video.pause());}
