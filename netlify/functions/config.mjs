import {env,ready,r2ready,json} from '../../server/core.mjs';
import {githubMode,githubReady,MAX_FILE_BYTES} from '../../server/github.mjs';
export default ()=>json({configured:ready(),storageConfigured:githubMode()?githubReady():!!r2ready(),storage:githubMode()?'github':'r2',maxUploadBytes:githubMode()?MAX_FILE_BYTES:200*1024*1024,url:env('SUPABASE_URL'),key:env('SUPABASE_PUBLIC_KEY')});
