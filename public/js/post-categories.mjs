export function postCategories(post) {
 const values=Array.isArray(post.categories)?post.categories:[post.genre];
 return [...new Set(values.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))];
}
