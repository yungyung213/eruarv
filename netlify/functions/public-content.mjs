import {githubMode} from '../../server/github.mjs';
import {ready,db,json,handler} from '../../server/core.mjs';
export default handler(async()=>{
 if(githubMode())return json({configured:false});
 if(!ready())return json({configured:false});
 const site=await db('eru_site?id=eq.1&select=payload');if(!site[0]?.payload.initialized)return json({configured:false});
 const posts=await db('eru_posts?status=eq.published&select=payload&order=updated_at.desc');return json({configured:true,posts:posts.map(row=>row.payload),settings:site[0].payload});
});
