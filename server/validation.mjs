export function media(value){
 if(!value||typeof value.src!=='string'||!(/^(https:\/\/|images\/|media\/)/.test(value.src)))throw new Error('미디어 경로가 올바르지 않습니다.');
 if(value.src.length>2048)throw new Error('경로가 너무 깁니다.');
 return {src:value.src,type:value.type==='video'?'video':'image',alt:String(value.alt||'').slice(0,500),...Object.fromEntries(['poster','thumb','medium','detail','original','srcset','width','height'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]]))};
}
export function validatePost(post){
 if(!post||!/^[a-zA-Z0-9_-]{1,120}$/.test(post.id||''))throw new Error('게시물 ID가 올바르지 않습니다.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(post.date||'')||Number.isNaN(Date.parse(post.date)))throw new Error('날짜를 확인하세요.');
 if(!Array.isArray(post.images)||!post.images.length||post.images.length>50)throw new Error('미디어는 1~50개 등록하세요.');
 if(!Array.isArray(post.colors)||post.colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Error('색상은 #RRGGBB 형식으로 입력하세요.');
 if(post.thxUrl&&!/^https:\/\//.test(post.thxUrl))throw new Error('크레딧 URL은 https://로 시작해야 합니다.');
 return {id:post.id,date:post.date,images:post.images.map(media),genre:String(post.genre||'').slice(0,100),other:(post.other||[]).map(v=>String(v).slice(0,100)).slice(0,20),colors:post.colors.slice(0,12),thxTo:String(post.thxTo||'').slice(0,100),thxUrl:String(post.thxUrl||'').slice(0,2048)};
}
export const TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm'};
