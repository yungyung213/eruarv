export const PAGE_SIZE=12;
export function paginate(items,page=1){
 const totalPages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
 const currentPage=Math.max(1,Math.min(totalPages,page));
 return {items:items.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE),currentPage,totalPages};
}
