import {music} from './music-config.js';
const bar=document.createElement('section');bar.className='music-bar';bar.setAttribute('aria-label','배경 음악');
const play=document.createElement('button');play.type='button';play.textContent='▶';play.setAttribute('aria-label','음악 재생');
const stop=document.createElement('button');stop.type='button';stop.textContent='■';stop.setAttribute('aria-label','음악 정지');
const status=document.createElement('span');status.className='music-status';status.setAttribute('role','status');
bar.append(play,stop,status);document.querySelector('footer').prepend(bar);
function message(text){status.textContent=text;play.title=text;stop.title=text;}
function state(playing){play.setAttribute('aria-pressed',String(playing));}
if(music.audioSrc){
 const audio=document.createElement('audio');audio.src=music.audioSrc;audio.loop=true;audio.preload='metadata';bar.append(audio);
 play.addEventListener('click',()=>audio.play().catch(()=>message('재생 버튼을 다시 눌러 주세요.')));
 stop.addEventListener('click',()=>{audio.pause();audio.currentTime=0;state(false);message('정지');});
 audio.addEventListener('play',()=>{state(true);message('재생 중');});audio.addEventListener('pause',()=>state(false));audio.addEventListener('error',()=>message('음원 파일을 불러오지 못했습니다.'));
 audio.play().catch(()=>message('소리 자동재생이 제한되었습니다. 재생 버튼을 눌러 주세요.'));
}else{
 let player,ready=false,wantsPlay=true;
 const host=document.createElement('div');host.className='music-engine';host.setAttribute('aria-hidden','true');const target=document.createElement('div');target.id='music-youtube';host.append(target);bar.append(host);
 function connect(){player=new YT.Player('music-youtube',{height:200,width:300,videoId:music.youtubeId,playerVars:{playsinline:1,loop:1,playlist:music.youtubeId},events:{
 onReady:event=>{ready=true;if(wantsPlay)event.target.playVideo();},
 onError:()=>{state(false);message('이 YouTube 곡은 재생할 수 없습니다. 사용 가능한 음원이 필요합니다.');},
 onAutoplayBlocked:()=>{state(false);message('자동재생이 제한되었습니다. 재생 버튼을 눌러 주세요.');},
 onStateChange:event=>{state(event.data===1);if(event.data===1)message('재생 중');}
 }});}
 play.addEventListener('click',()=>{wantsPlay=true;if(ready)player.playVideo();else message('플레이어를 불러오는 중입니다.');});
 stop.addEventListener('click',()=>{wantsPlay=false;if(ready)player.stopVideo();state(false);message('정지');});
 if(window.YT?.Player)connect();else{window.onYouTubeIframeAPIReady=connect;const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;script.onerror=()=>message('음악 플레이어를 불러오지 못했습니다.');document.head.append(script);}
}
