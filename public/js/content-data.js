import {photos as fallbackPhotos} from './photos.js';
import {mainMedia as fallbackMain,mainSlideInterval} from './site-config.js';
let content;
try{const response=await fetch('content.json',{cache:'no-store'});if(response.ok){const value=await response.json();if(value.configured&&Array.isArray(value.posts))content=value;}}catch{}

if(!content)try{const response=await fetch('/.netlify/functions/public-content',{signal:AbortSignal.timeout(5000),cache:'no-store'});if(response.ok){const value=await response.json();if(value.configured&&Array.isArray(value.posts))content=value;}}catch{}
export const photos=content?content.posts:fallbackPhotos;
export const mainMedia=content?.settings?.mainMedia||fallbackMain;
export {mainSlideInterval};
