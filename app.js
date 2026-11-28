const panel = document.querySelector('#panel');
const body = document.querySelector('#panel-body');
const title = document.querySelector('#panel-title');
const savedNav = document.querySelector('#saved');
const guestSaved = new Set();
try {
  const previous = JSON.parse(localStorage.getItem('vybe.winter.saved') || '[]');
  if (Array.isArray(previous)) {
    for (const id of previous) if (Object.hasOwn(looks, id)) guestSaved.add(id);
  }
} catch {}

let account = null;
let visibleLook = null;
const activeSaved = () => account?.saved ?? guestSaved;

function updateCount() {
  document.querySelector('#count').textContent = account && !account.loaded ? '…' : activeSaved().size;
}

function updateLookControls() {
  const button = body.querySelector('[data-save]');
  if (!button || button.dataset.save !== visibleLook) return;
  const selected = activeSaved().has(visibleLook);
  button.disabled = Boolean(account && (!account.loaded || account.pending.has(visibleLook)));
  button.textContent = selected ? 'Saved' : 'Save Look';
  button.setAttribute('aria-pressed', String(selected));
  body.querySelector('[role="status"]').textContent = account?.error ?? '';
  body.querySelector('[data-retry-saved]').hidden = !account?.error || account.loaded;
}

function showLook(id) {
  const look = looks[id];
  if (!look) return;
  visibleLook = id;
  title.textContent = look.title;
  body.innerHTML = '<div class="look-image" data-look="' + id + '" role="img" aria-label="' + look.title + ' outfit"></div><p>' + look.items + '</p><button class="save-button" data-save="' + id + '"></button><p role="status"></p><button class="save-button" data-retry-saved hidden>Try again</button>';
  updateLookControls();
  if (!panel.open) panel.showModal();
}

function renderSavedList() {
  const list = [...activeSaved()];
  if (account && !account.loaded) {
    body.innerHTML = account.error
      ? '<p role="status">Could not load saved looks.</p><button class="save-button" data-retry-saved>Try again</button>'
      : '<p role="status">Loading saved looks…</p>';
    return;
  }
  body.innerHTML = list.length
    ? '<ul class="saved-list">' + list.map(id => '<li><button data-look="' + id + '">' + looks[id].title + '</button></li>').join('') + '</ul>'
    : '<p>No saved looks yet.</p>';
}

function refreshSavedUI() {
  updateCount();
  document.dispatchEvent(new CustomEvent('vybe:editorial-saves',{detail:{userId:account?.id??null,ids:[...activeSaved()]}}));
  if (!panel.open) return;
  if (visibleLook) updateLookControls();
  else renderSavedList();
}

async function loadAccountSaves(state) {
  if (state.loading) return;
  state.loading = true;
  state.error = '';
  refreshSavedUI();
  try {
    state.saved = new Set((await state.api.list()).filter(id => Object.hasOwn(looks, id)));
    state.loaded = true;
  } catch {
    state.error = 'Could not load saved looks.';
  } finally {
    state.loading = false;
    if (account === state) refreshSavedUI();
  }
}

document.addEventListener('vybe:account', ({ detail }) => {
  if (account && detail.userId === account.id) {
    account.api = detail.savedLooks;
    return;
  }
  account = detail.userId
    ? { id: detail.userId, api: detail.savedLooks, saved: new Set(), pending: new Set(), loaded: false }
    : null;
  if (account) void loadAccountSaves(account);
  else refreshSavedUI();
});

async function toggleSave(id) {
  const state = account;
  if (state && (!state.loaded || state.pending.has(id))) return;
  const list = activeSaved();
  const selected = !list.has(id);
  if (state) {
    state.pending.add(id);
    state.error = '';
    refreshSavedUI();
  }
  try {
    if (state) await state.api.set(id, selected);
    if (selected) list.add(id);
    else list.delete(id);
    if (!state) {
      try { localStorage.setItem('vybe.winter.saved', JSON.stringify([...list])); } catch {}
    }
  } catch {
    state.error = 'Could not update saved looks. Please try again.';
  } finally {
    state?.pending.delete(id);
    if (account === state) refreshSavedUI();
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.look) showLook(button.dataset.look);
  if (button.dataset.save && Object.hasOwn(looks, button.dataset.save)) void toggleSave(button.dataset.save);
  if (button.hasAttribute('data-retry-saved') && account) void loadAccountSaves(account);
});
savedNav.addEventListener('click', () => {
  if (location.protocol === 'file:') {
    visibleLook = null;
    title.textContent = 'Saved Looks';
    renderSavedList();
    panel.showModal();
    return;
  }
  location.href = 'saved.html';
});
const requestedLook = new URLSearchParams(location.search).get('look');
if (requestedLook && Object.hasOwn(looks, requestedLook)) showLook(requestedLook);
panel.querySelector('.close').addEventListener('click', () => panel.close());
document.querySelector('#pause').addEventListener('click', event => {
  const button = event.currentTarget;
  const paused = button.getAttribute('aria-pressed') !== 'true';
  document.querySelector('.hero').dataset.paused = String(paused);
  button.setAttribute('aria-pressed', String(paused));
  button.textContent = paused ? 'Play' : 'Pause';
});
updateCount();

if (location.protocol === 'file:') {
  document.querySelector('#account-open').addEventListener('click', () => {
    const account = document.querySelector('#account');
    document.querySelector('#auth-status').textContent = '회원 인증은 웹사이트 주소에서 이용할 수 있어요.';
    account.showModal();
  });
  document.querySelector('#account-close').addEventListener('click', () => document.querySelector('#account').close());
}

