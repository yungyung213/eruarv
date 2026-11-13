import './password-visibility.mjs';
import {supabaseUrl, publishableKey} from './admin-reset-config.mjs';

const requestForm = document.querySelector('#request-reset');
const passwordForm = document.querySelector('#set-password');
const status = document.querySelector('#reset-status');
const fragment = new URLSearchParams(location.hash.slice(1));
let recoveryToken = fragment.get('type') === 'recovery' ? fragment.get('access_token') : null;

if (location.hash) history.replaceState(null, '', location.pathname);
passwordForm.hidden = !recoveryToken;
requestForm.hidden = !!recoveryToken;
function showStatus(message = '', isError = false) {
  status.textContent = message;
  status.toggleAttribute('data-error', isError);
}

if (fragment.has('error')) showStatus('This link expired or has already been used. Request a new link.', true);

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
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    showStatus();
    try { await run(new FormData(form)); }
    catch { showStatus('Could not connect. Try again in a moment.', true); }
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
  if (response.ok) {
    showStatus('If the email matches an account, a reset link will arrive shortly.');
  } else if (response.status === 429) {
    showStatus('Please wait a moment before requesting another link.', true);
  } else {
    showStatus('Could not send a reset link. Try again in a moment.', true);
  }
});

onSubmit(passwordForm, async fields => {
  const password = fields.get('password');
  if (password !== fields.get('confirmation')) {
    showStatus('The passwords do not match.', true);
    return;
  }
  const response = await authRequest('user', 'PUT', {password}, recoveryToken);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const code = error.error_code ?? error.code;
    if (['session_expired', 'session_not_found', 'bad_jwt', 'otp_expired'].includes(code) ||
        (!code && response.status === 401)) {
      recoveryToken = null;
      passwordForm.reset();
      passwordForm.hidden = true;
      requestForm.hidden = false;
      showStatus('This reset link expired. Request a new link.', true);
    } else if (code === 'same_password') {
      showStatus('Choose a password different from your current one.', true);
    } else if (code === 'weak_password') {
      showStatus('Choose a stronger password. Try a longer, unique password.', true);
    } else if (code === 'reauthentication_needed') {
      showStatus('Request a fresh reset link and open it before saving.', true);
    } else {
      showStatus('Could not save the password. Try again in a moment.', true);
    }
    return;
  }
  recoveryToken = null;
  passwordForm.reset();
  passwordForm.hidden = true;
  showStatus('Password updated. Return to sign in with your new password.');
});
