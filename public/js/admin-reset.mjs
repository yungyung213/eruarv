import {supabaseUrl, publishableKey} from './admin-reset-config.mjs';

const requestForm = document.querySelector('#request-reset');
const passwordForm = document.querySelector('#set-password');
const status = document.querySelector('#reset-status');
const fragment = new URLSearchParams(location.hash.slice(1));
let recoveryToken = fragment.get('type') === 'recovery' ? fragment.get('access_token') : null;

if (location.hash) history.replaceState(null, '', location.pathname);
passwordForm.hidden = !recoveryToken;
requestForm.hidden = !!recoveryToken;
if (fragment.has('error')) status.textContent = '재설정 링크가 만료되었거나 이미 사용되었습니다. 새 링크를 요청하세요.';

async function authRequest(path, method, body, token) {
  const response = await fetch(supabaseUrl + '/auth/v1/' + path, {
    method,
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
      ...(token ? {Authorization: 'Bearer ' + token} : {})
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  });
  return response;
}

function onSubmit(form, run) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    status.textContent = '';
    try { await run(new FormData(form)); }
    catch { status.textContent = '연결에 실패했습니다. 잠시 후 다시 시도하세요.'; }
    finally { button.disabled = false; }
  });
}

onSubmit(requestForm, async fields => {
  const redirect = new URL(location.pathname, location.origin);
  const response = await authRequest(
    'recover?redirect_to=' + encodeURIComponent(redirect.href),
    'POST',
    {email: fields.get('email').trim()}
  );
  status.textContent = response.ok
    ? '메일함에서 비밀번호 재설정 링크를 확인하세요.'
    : '메일을 보내지 못했습니다. 잠시 후 다시 시도하세요.';
});

onSubmit(passwordForm, async fields => {
  const password = fields.get('password');
  if (password !== fields.get('confirmation')) {
    status.textContent = '두 비밀번호를 똑같이 입력하세요.';
    return;
  }
  const response = await authRequest('user', 'PUT', {password}, recoveryToken);
  if (!response.ok) {
    if ([401, 403].includes(response.status)) {
      recoveryToken = null;
      passwordForm.reset();
      passwordForm.hidden = true;
      requestForm.hidden = false;
      status.textContent = '재설정 링크가 만료되었습니다. 새 링크를 요청하세요.';
    } else {
      status.textContent = '새 비밀번호를 저장하지 못했습니다. 다른 비밀번호로 다시 시도하세요.';
    }
    return;
  }
  recoveryToken = null;
  passwordForm.reset();
  passwordForm.hidden = true;
  status.textContent = '비밀번호를 바꿨어요. 어드민으로 돌아가 yung213과 새 비밀번호로 로그인하세요.';
});
