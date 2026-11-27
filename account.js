import { connectAuth } from './auth-client.js';

const dialog = document.querySelector('#account');
const open = document.querySelector('#account-open');
const form = document.querySelector('#auth-form');
const submit = document.querySelector('#auth-submit');
const toggle = document.querySelector('#auth-switch');
const status = document.querySelector('#auth-status');
const signedIn = document.querySelector('#signed-in');
const signOut = document.querySelector('#sign-out');
const query = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.slice(1));
const callbackError = query.has('error') || fragment.has('error');
const returningFromEmail = fragment.get('type') === 'signup' || fragment.has('access_token') || query.has('code');
let auth;
let user = null;
let ready = false;
let unavailable = false;
let signup = false;
let handleEmailReturn = callbackError || returningFromEmail;

function render() {
  document.querySelector('#account-title').textContent = user ? 'My VYBE' : signup ? '회원가입' : '로그인';
  document.querySelector('#account-email').textContent = user?.email ?? '';
  open.textContent = user ? 'My VYBE' : 'Account';
  form.hidden = !ready || Boolean(user);
  signedIn.hidden = !ready || !user;
  submit.textContent = signup ? '회원가입' : '로그인';
  toggle.textContent = signup ? '로그인' : '회원가입';
  form.elements.password.autocomplete = signup ? 'new-password' : 'current-password';
}

function message(error, fallback) {
  if (error?.code === 'invalid_credentials') return '이메일이나 비밀번호를 확인해 주세요.';
  if (error?.code === 'email_not_confirmed') return '받은 메일에서 이메일을 먼저 인증해 주세요.';
  if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) return '요청이 많아요. 잠시 후 다시 시도해 주세요.';
  if (error?.code === 'email_address_not_authorized') return '이 주소로 인증 메일을 보낼 수 없어요. 프로젝트 이메일 발송 설정을 확인해 주세요.';
  return fallback;
}

open.addEventListener('click', () => {
  if (!ready) status.textContent = unavailable ? '인증 서비스에 연결하지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.' : '인증 서비스에 연결 중이에요.';
  dialog.showModal();
});
document.querySelector('#account-close').addEventListener('click', () => dialog.close());
toggle.addEventListener('click', () => {
  signup = !signup;
  form.elements.password.value = '';
  status.textContent = '';
  render();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready || user || submit.disabled) return;
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  submit.disabled = toggle.disabled = true;
  status.textContent = '';
  try {
    const { data, error } = signup ? await auth.signUp(email, password) : await auth.signIn(email, password);
    if (error) {
      status.textContent = message(error, signup ? '회원가입 요청을 완료하지 못했어요. 이메일을 확인하거나 잠시 후 다시 시도해 주세요.' : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    form.reset();
    user = data.session?.user ?? null;
    if (user) {
      status.textContent = '로그인했어요.';
    } else if (signup) {
      signup = false;
      status.textContent = '받은편지함에서 인증 메일을 확인해 주세요.';
    }
    render();
  } catch {
    status.textContent = '연결이 끊겼어요. 잠시 후 다시 시도해 주세요.';
  } finally {
    submit.disabled = toggle.disabled = false;
  }
});

signOut.addEventListener('click', async () => {
  signOut.disabled = true;
  try {
    const { error } = await auth.signOut();
    if (error) {
      status.textContent = '로그아웃하지 못했어요. 다시 시도해 주세요.';
      return;
    }
    user = null;
    status.textContent = '로그아웃했어요.';
    render();
  } catch {
    status.textContent = '연결이 끊겼어요. 잠시 후 다시 시도해 주세요.';
  } finally {
    signOut.disabled = false;
  }
});

try {
  if (!['https:', 'http:'].includes(location.protocol)) throw new Error('HTTP host required');
  auth = await connectAuth();
  auth.subscribe((event, currentUser) => {
    ready = true;
    user = currentUser;
    if (handleEmailReturn && (callbackError || user || event === 'INITIAL_SESSION')) {
      handleEmailReturn = false;
      if (user && !callbackError) status.textContent = '이메일 인증을 마치고 로그인했어요.';
      else if (callbackError || event === 'INITIAL_SESSION') status.textContent = '인증 링크를 확인할 수 없어요. 최신 메일의 링크를 사용해 주세요.';
      if (!dialog.open) dialog.showModal();
    } else if (status.textContent === '인증 서비스에 연결 중이에요.') {
      status.textContent = '';
    }
    render();
  });
} catch {
  unavailable = true;
  status.textContent = '회원 인증은 사이트 주소로 접속하고 인터넷이 연결되어 있을 때 이용할 수 있어요.';
}
