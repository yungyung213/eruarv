export function setTitle(element,value=''){
 element.replaceChildren();
 element.classList.add('gallery-post-title');
 for(const segment of String(value??'').split(/([\p{Script=Hangul}]+)/u).filter(Boolean)){
  if(!/\p{Script=Hangul}/u.test(segment)){
   element.append(segment);
   continue;
  }
  const korean=document.createElement('span');
  korean.lang='ko';
  korean.textContent=segment;
  element.append(korean);
 }
}

