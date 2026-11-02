import {authorize,json,handler} from '../../server/core.mjs';
import {githubMode,stageUpload,MAX_FILE_BYTES} from '../../server/github.mjs';
export default handler(async request=>{
 await authorize(request);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!githubMode())return json({error:'GitHub 저장 방식이 아닙니다.'},400);
 const limit=Math.ceil(MAX_FILE_BYTES/3)*4+1024;
 if(Number(request.headers.get('content-length'))>limit)return json({error:'파일당 4MB까지 업로드할 수 있습니다.'},413);
 const text=await request.text();if(text.length>limit)return json({error:'파일당 4MB까지 업로드할 수 있습니다.'},413);
 return json(await stageUpload(JSON.parse(text)));
});
