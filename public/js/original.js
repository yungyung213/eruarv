const image = document.querySelector('#original-image');
const error = document.querySelector('#original-error');
const source = new URLSearchParams(location.hash.slice(1)).get('src');

function showError() {
  image.hidden = true;
  error.hidden = false;
}

if (source && URL.canParse(source) && ['https:', 'http:'].includes(new URL(source).protocol)) {
  image.addEventListener('load', () => { image.hidden = false; }, {once: true});
  image.addEventListener('error', showError, {once: true});
  image.src = source;
} else {
  showError();
}
