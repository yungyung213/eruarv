export function appearance(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('화면 설정을 확인하세요.');
 const theme=value.theme??'dark',particles=value.particles??true;
 if(!['dark','light'].includes(theme)||typeof particles!=='boolean')throw new Error('화면 설정을 확인하세요.');
 return {theme,particles};
}
