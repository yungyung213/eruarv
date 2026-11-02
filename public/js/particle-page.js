import {mainMedia} from './content-data.js';
const target=document.querySelector('#hero-media');
let canvas=document.createElement('canvas');canvas.className='particle-canvas';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','사진 입자가 부드럽게 겹쳐 전환되는 자동 슬라이드');target.append(canvas);

const background=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#141414';
const backgroundRGB=[1,3,5].map(offset=>parseInt(background.slice(offset,offset+2),16)/255);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let count=innerWidth<701?21000:76000;
let width=innerWidth,height=innerHeight,index=0,from=[],to=[],phaseStart=performance.now(),pausedAt=0,transitioning=false,pointer=[0,0];
const hold=3000,duration=2000;
const images=[];
for(const item of mainMedia){if(item.type==='video')continue;const image=new Image();image.alt=item.alt||'';image.src=item.src;try{await image.decode();images.push(image);}catch{}}
if(!images.length){target.textContent='미리보기 이미지를 불러오지 못했습니다.';throw new Error('No preview images');}
function points(image){
 const scratch=document.createElement('canvas');scratch.width=240;scratch.height=Math.round(240*height/width);const ctx=scratch.getContext('2d',{willReadFrequently:true});
 const scale=Math.max(scratch.width/image.naturalWidth,scratch.height/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
 ctx.drawImage(image,(scratch.width-w)/2,(scratch.height-h)/2,w,h);const pixels=ctx.getImageData(0,0,scratch.width,scratch.height).data;
 const result=new Float32Array(count*4);
 for(let i=0;i<count;i++){
  let x,y,lum=0;
  for(let trial=0;trial<12;trial++){x=Math.random();y=Math.random();const offset=(Math.min(scratch.height-1,Math.floor(y*scratch.height))*scratch.width+Math.min(scratch.width-1,Math.floor(x*scratch.width)))*4;lum=(.2126*pixels[offset]+.7152*pixels[offset+1]+.0722*pixels[offset+2])/255;if(Math.random()<.02+Math.pow(lum,2))break;}
  result.set([x*2-1,1-y*2,(lum-.5)*.3,Math.pow(lum,1.1)],i*4);
 }
 return result;
}
let gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'}),ctx2d,program,fromBuffer,toBuffer;
function shader(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;}
function init(){
 if(!gl){ctx2d=canvas.getContext('2d');return;}
 try{
 program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec4 a_from;attribute vec4 a_to;uniform float u_layer;uniform float u_opacity;uniform float u_time;uniform float u_dpr;uniform vec2 u_pointer;varying float v_alpha;
 void main(){vec4 p=mix(a_from,a_to,u_layer);float seed=fract(sin(dot(p.xy,vec2(12.9898,78.233)))*43758.5453);
 p.y+=.004*sin(p.x*7.0+u_time*.3+seed*4.0);p.xy+=u_pointer*p.z*.1;
 gl_Position=vec4(p.xy/(1.0+p.z*.12),0.0,1.0);gl_PointSize=(1.1+seed*.8+p.w*.6)*u_dpr;v_alpha=(.14+p.w*.8)*.72*u_opacity;}`));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision mediump float;varying float v_alpha;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;float a=(1.0-smoothstep(.2,.5,d))*v_alpha;gl_FragColor=vec4(vec3(.66,.65,.63),a);}`));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.clearColor(...backgroundRGB,1);
 fromBuffer=gl.createBuffer();toBuffer=gl.createBuffer();
 }catch(error){console.warn('Using lighter particle renderer.');gl=null;const fallback=document.createElement('canvas');fallback.className=canvas.className;fallback.setAttribute('role','img');fallback.setAttribute('aria-label','사진 입자 미리보기');canvas.replaceWith(fallback);canvas=fallback;ctx2d=canvas.getContext('2d');}
}
init();
function upload(){if(!gl)return;for(const [buffer,name,data] of [[fromBuffer,'a_from',from],[toBuffer,'a_to',to]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);const attr=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,4,gl.FLOAT,false,0,0);}}
function resize(){if(!target.clientWidth||!target.clientHeight)return;width=target.clientWidth;height=target.clientHeight;count=width<701?21000:76000;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(gl)gl.viewport(0,0,canvas.width,canvas.height);from=points(images[index]);to=points(images[(index+1)%images.length]);upload();}
resize();phaseStart=performance.now();new ResizeObserver(resize).observe(target);
function switchTo(next){index=(next+images.length)%images.length;to=points(images[index]);transitioning=true;phaseStart=performance.now();upload();}
canvas.addEventListener('pointermove',event=>{pointer=[(event.clientX/width-.5)*2,(.5-event.clientY/height)*2];},{passive:true});canvas.addEventListener('pointerleave',()=>pointer=[0,0]);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pausedAt=performance.now();else if(pausedAt){phaseStart+=performance.now()-pausedAt;pausedAt=0;}});
let last=0;
function frame(now){requestAnimationFrame(frame);if(document.hidden||target.closest('main').hidden||!from.length||now-last<30)return;last=now;
 let progress=transitioning?Math.min(1,(now-phaseStart)/duration):0;
 if(reduced.matches)progress=transitioning?1:0;
 if(gl){
  gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(gl.getUniformLocation(program,'u_time'),reduced.matches?0:now/1000);gl.uniform1f(gl.getUniformLocation(program,'u_dpr'),Math.min(devicePixelRatio||1,2));gl.uniform2fv(gl.getUniformLocation(program,'u_pointer'),pointer);const eased=progress*progress*(3-2*progress);
  for(const [layer,opacity] of [[0,1-eased],[1,eased]]){if(opacity<=0)continue;gl.uniform1f(gl.getUniformLocation(program,'u_layer'),layer);gl.uniform1f(gl.getUniformLocation(program,'u_opacity'),opacity);gl.drawArrays(gl.POINTS,0,count);}
 }else{
  const ctx=ctx2d,dpr=canvas.width/width;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);const eased=progress*progress*(3-2*progress);
  for(const [cloud,opacity] of [[from,1-eased],[to,eased]]){if(opacity<=0)continue;for(let i=0;i<count;i+=6){const offset=i*4,x=cloud[offset],y=cloud[offset+1],lum=cloud[offset+3];ctx.fillStyle=`rgba(168,166,161,${(.06+lum*.7)*.72*opacity})`;ctx.fillRect((x+1)*.5*canvas.width,(1-y)*.5*canvas.height,dpr,dpr);}}

 }
 if(transitioning&&progress===1){from=to;to=points(images[(index+1)%images.length]);transitioning=false;phaseStart=now;upload();canvas.setAttribute('aria-label',images[index].alt||'사진 입자 미리보기');}
 if(!transitioning&&!reduced.matches&&images.length>1&&now-phaseStart>hold)switchTo(index+1);
}
requestAnimationFrame(frame);
