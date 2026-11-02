export const env=name=>process.env[name]||'';
export const ready=()=>!!(env('SUPABASE_URL')&&env('SUPABASE_PUBLIC_KEY'));
export const r2ready=()=>['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_URL'].every(name=>env(name));
export function json(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export async function db(path,{token,method='GET',body}={}){
 const response=await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`,{method,headers:{apikey:env('SUPABASE_PUBLIC_KEY'),...(token?{Authorization:`Bearer ${token}`}:{ }),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok)throw new Error('데이터베이스 요청 실패: 설정과 권한을 확인하세요.');return response.status===204?null:response.json();
}
export async function authorize(request){
 if(!ready()||!env('ADMIN_USER_ID'))throw Object.assign(new Error('연결 설정이 필요합니다.'),{status:503});
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!token)throw Object.assign(new Error('로그인하세요.'),{status:401});
 const response=await fetch(`${env('SUPABASE_URL')}/auth/v1/user`,{headers:{apikey:env('SUPABASE_PUBLIC_KEY'),Authorization:`Bearer ${token}`}});
 if(!response.ok)throw Object.assign(new Error('로그인이 만료되었습니다.'),{status:401});
 const user=await response.json();if(user.id!==env('ADMIN_USER_ID'))throw Object.assign(new Error('관리자 권한이 없습니다.'),{status:403});return token;
}
export function handler(fn){return async request=>{try{return await fn(request);}catch(error){return json({error:error.message||'요청 실패'},error.status||400);}};}
export async function body(request){if(Number(request.headers.get('content-length'))>2000000)throw new Error('요청이 너무 큽니다.');const text=await request.text();if(text.length>2000000)throw new Error('요청이 너무 큽니다.');return JSON.parse(text);}
