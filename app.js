document.documentElement.style.setProperty('--spread-photo', 'url("' + document.querySelector('.spread img').src + '")');
const panel = document.querySelector('#panel');
const body = document.querySelector('#panel-body');
const title = document.querySelector('#panel-title');
const savedNav = document.querySelector('#saved');
let saved = new Set();
try {
  const previous = JSON.parse(localStorage.getItem('vybe.winter.saved') || '[]');
  if (Array.isArray(previous)) saved = new Set(previous.filter(id => Object.hasOwn(looks, id)));
} catch {}
function updateCount() { document.querySelector('#count').textContent = saved.size; }
function showLook(id) {
  const look = looks[id];
  title.textContent = look.title;
  body.innerHTML = '<div class="look-image" data-look="' + id + '" role="img" aria-label="' + look.title + ' outfit"></div><p>' + look.items + '</p><button class="save-button" data-save="' + id + '" aria-pressed="' + saved.has(id) + '">' + (saved.has(id) ? 'Saved' : 'Save Look') + '</button>';
  if (!panel.open) panel.showModal();
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.look) showLook(button.dataset.look);
  const id = button.dataset.save;
  if (id) {
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);
    try { localStorage.setItem('vybe.winter.saved', JSON.stringify([...saved])); } catch {}
    button.textContent = saved.has(id) ? 'Saved' : 'Save Look';
    button.setAttribute('aria-pressed', String(saved.has(id)));
    updateCount();
  }
});
savedNav.addEventListener('click', () => {
  title.textContent = 'Saved Looks';
  body.innerHTML = saved.size ? '<ul class="saved-list">' + [...saved].map(id => '<li><button data-look="' + id + '">' + looks[id].title + '</button></li>').join('') + '</ul>' : '<p>No saved looks yet.</p>';
  panel.showModal();
});
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
