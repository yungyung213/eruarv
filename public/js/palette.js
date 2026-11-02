export const palette=[
 {name:'빨강',color:'#e63838'},{name:'주황',color:'#f28c28'},{name:'노랑',color:'#f5ce45'},
 {name:'초록',color:'#3b9b59'},{name:'파랑',color:'#3379d5'},{name:'남색',color:'#303f8f'},
 {name:'보라',color:'#8656b8'},{name:'흰색',color:'#ffffff'},{name:'회색',color:'#808080'},{name:'검정',color:'#000000'}
];
export const paletteLabel=color=>palette.find(item=>item.color===color)?.name||`${color} (기존 값)`;
