import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {authorize,body,env,r2ready,json,handler} from '../../server/core.mjs';
import {TYPES} from '../../server/validation.mjs';
import {randomUUID} from 'node:crypto';
export default handler(async request=>{
 await authorize(request);if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!r2ready())return json({error:'R2 저장소 연결이 필요합니다.'},503);
 const input=await body(request);const ext=TYPES[input.type];if(!ext||!Number.isFinite(input.size)||input.size<=0||input.size>200*1024*1024)throw new Error('지원 형식과 200MB 제한을 확인하세요.');
 const key=`uploads/${new Date().toISOString().slice(0,10)}/${randomUUID()}.${ext}`;
 const client=new S3Client({region:'auto',endpoint:`https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('R2_ACCESS_KEY_ID'),secretAccessKey:env('R2_SECRET_ACCESS_KEY')},requestChecksumCalculation:'WHEN_REQUIRED'});
 const url=await getSignedUrl(client,new PutObjectCommand({Bucket:env('R2_BUCKET'),Key:key,ContentType:input.type}),{expiresIn:300});
 return json({url,src:`${env('R2_PUBLIC_URL').replace(/\/$/,'')}/${key}`});
});
