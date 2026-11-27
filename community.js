import { connectAuth } from './auth-client.js';

const form = document.querySelector('#outfit-form');
const submit = form?.querySelector('button');
const posts = document.querySelector('#posts');
const feedStatus = document.querySelector('#feed-status');
const postStatus = document.querySelector('#post-status');
const myPage = document.querySelector('[data-page]').dataset.page === 'my';
const authStatus = document.querySelector('#member-status');
const accountLink = document.querySelector('[data-account]');
const profileForm = document.querySelector('#profile-form');
let profile = null;
let currentAccount = null;
let ownPostsResult;
const trends = { 'faux-fur': '페이크 퍼 아우터' };
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const bucket = 'outfit-photos';
const columns = 'id,title,caption,photo_path,created_at,trend_slug';
let user = null;
let client;

function requireSuccess(result) {
  if (result.error) throw result.error;
  return result.data;
}

async function loadFeed(owner = null) {
  feedStatus.textContent = '코디를 불러오는 중…';
  try {
    let request = client.from('outfit_posts').select(columns, { count: 'exact' })
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(24);
    if (owner) request = request.like('photo_path', owner + '/%');
    const result = await request;
    const rows = requireSuccess(result);
    const images = rows.length
      ? requireSuccess(await client.storage.from(bucket).createSignedUrls(rows.map(row => row.photo_path), 3600))
      : [];
    const urls = new Map(images.map(item => [item.path, item.signedUrl]));
    if (myPage && user?.id !== owner) return;
    if (owner) ownPostsResult = result.count;
    posts.replaceChildren(...rows.map(row => {
      const item = document.createElement('li');
      const heading = document.createElement('h3');
      heading.textContent = row.title;
      const caption = document.createElement('p');
      caption.textContent = row.caption;
      const url = urls.get(row.photo_path);
      if (url) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = row.title;
        image.loading = 'lazy';
        image.addEventListener('error', () => image.replaceWith('사진을 불러올 수 없어요.'), { once: true });
        item.append(image);
      } else item.append('사진을 불러올 수 없어요.');
      item.append(heading, caption);
      if (Object.hasOwn(trends, row.trend_slug)) {
        const trend = document.createElement('small');
        trend.textContent = trends[row.trend_slug];
        item.append(trend);
      }
      return item;
    }));
    feedStatus.textContent = rows.length ? '' : '아직 등록된 코디가 없어요.';
  } catch {
    if (myPage && user?.id !== owner) return;
    feedStatus.textContent = '피드를 불러오지 못했어요. 페이지를 새로고침해 주세요.';
  }
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!user || submit.disabled) return;
  const file = form.elements.photo.files[0];
  const title = form.elements.title.value.trim();
  const caption = form.elements.caption.value.trim();
  if (!title || !file || !Object.hasOwn(extensions, file.type) || !file.size || file.size > 5242880) {
    postStatus.textContent = '제목과 5 MB 이하의 JPG, PNG 또는 WebP 사진을 확인해 주세요.';
    return;
  }
  const owner = user.id;
  const path = owner + '/' + crypto.randomUUID() + '.' + extensions[file.type];
  const storage = client.storage.from(bucket);
  let uploaded = false;
  submit.disabled = true;
  postStatus.textContent = '코디를 올리는 중…';
  try {
    requireSuccess(await storage.upload(path, file, { contentType: file.type }));
    uploaded = true;
    requireSuccess(await client.from('outfit_posts').insert({ user_id: owner, title, caption, photo_path: path, trend_slug: form.elements.trend.value || null }));
    if (user?.id !== owner) return;
    form.reset();
    document.querySelector('#post-dialog').close();
    location.hash = 'posts-tab';
    authStatus.textContent = '코디를 공개 피드에 올렸어요.';
    await loadFeed(owner);
    renderCounts();

  } catch {
    if (uploaded) {
      // The delete policy refuses to delete any image already attached to a post.
      try { await storage.remove([path]); } catch {}
    }
    postStatus.textContent = '코디를 올리지 못했어요. 피드에서 등록 여부를 확인한 뒤 다시 시도해 주세요.';
  } finally {
    submit.disabled = false;
  }
});


let savedCount = null;

function renderCounts() {
  const counts = [];
  if (Number.isInteger(ownPostsResult)) counts.push('내 게시물 ' + ownPostsResult);
  if (Number.isInteger(savedCount)) counts.push('저장한 콘텐츠 ' + savedCount);
  document.querySelector('#counts').textContent = counts.join(' · ');
}

function renderProfile() {
  const nickname = profile?.nickname || '닉네임 미설정';
  const avatar = document.querySelector('#avatar');
  document.querySelector('#nickname').textContent = nickname;
  avatar.textContent = profile?.nickname?.slice(0, 1) || 'V';
  if (!profile?.avatar_path?.startsWith('https://')) return;
  const image = document.createElement('img');
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  image.src = profile.avatar_path;
  image.addEventListener('error', () => { avatar.textContent = nickname.slice(0, 1); }, { once: true });
  avatar.replaceChildren(image);
}

async function loadMember(owner, savedLooks) {
  await Promise.all([
    loadFeed(owner),
    (async () => {
      try {
        const ids = await savedLooks.list();
        if (user?.id !== owner) return;
        savedCount = ids.length;
        const names = { weekend: 'Weekend', office: 'Office', evening: 'Evening' };
        document.querySelector('#saved-list').replaceChildren(...ids.map(id => {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = './#looks';
          link.textContent = names[id] || id;
          item.append(link);
          return item;
        }));
        document.querySelector('#saved-status').textContent = ids.length ? '' : '저장한 코디가 없어요.';
      } catch {
        if (user?.id === owner) document.querySelector('#saved-status').textContent = '저장한 코디를 불러오지 못했어요.';
      }
    })(),
    (async () => {
      try {
        const data = requireSuccess(await client.from('profiles').select('nickname,avatar_path').eq('user_id', owner).maybeSingle());
        if (user?.id !== owner) return;
        profile = data;
        renderProfile();
      } catch {
        if (user?.id === owner) authStatus.textContent = '프로필을 불러오지 못했어요.';
      }
    })()
  ]);
  if (user?.id === owner) renderCounts();
}

if (myPage) {
  const showTab = () => {
    const saved = location.hash === '#saved';
    document.querySelector('#posts-tab').hidden = saved;
    document.querySelector('#saved').hidden = !saved;
    for (const link of document.querySelectorAll('.view-tabs a')) {
      if (link.hash === (saved ? '#saved' : '#posts-tab')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  };
  window.addEventListener('hashchange', showTab);
  showTab();
  document.querySelector('#open-post').addEventListener('click', () => document.querySelector('#post-dialog').showModal());
  for (const button of document.querySelectorAll('[data-close]')) {
    button.addEventListener('click', () => button.closest('dialog').close());
  }
  document.querySelector('#edit-profile').addEventListener('click', () => {
    profileForm.elements.nickname.value = profile?.nickname || '';
    profileForm.elements.avatar.value = profile?.avatar_path || '';
    document.querySelector('#profile-status').textContent = '';
    document.querySelector('#profile-dialog').showModal();
  });
  profileForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = profileForm.querySelector('button');
    if (!user || button.disabled) return;
    const owner = user.id;
    const nickname = profileForm.elements.nickname.value.trim();
    const avatar = profileForm.elements.avatar.value.trim();
    const status = document.querySelector('#profile-status');
    if (!nickname || (avatar && !avatar.startsWith('https://'))) {
      status.textContent = '닉네임과 https로 시작하는 이미지 주소를 확인해 주세요.';
      return;
    }
    button.disabled = true;
    try {
      const fields = { nickname, avatar_path: avatar || null };
      const query = profile
        ? client.from('profiles').update(fields).eq('user_id', owner)
        : client.from('profiles').insert({ user_id: owner, ...fields });
      requireSuccess(await query);
      if (user?.id !== owner) return;
      profile = fields;
      renderProfile();
      document.querySelector('#profile-dialog').close();
    } catch {
      status.textContent = '프로필을 저장하지 못했어요.';
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector('#logout').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      requireSuccess(await currentAccount.signOut());
      location.href = './';
    } catch {
      authStatus.textContent = '로그아웃하지 못했어요.';
    } finally {
      button.disabled = false;
    }
  });
}

try {
  currentAccount = await connectAuth();
  client = currentAccount.client;
  currentAccount.subscribe((_event, currentUser, savedLooks) => {
    const previous = user?.id;
    user = currentUser;
    accountLink.textContent = user ? 'My VYBE' : 'Account';
    accountLink.href = user ? 'my.html' : './?account=1';
    if (!myPage) return;
    document.querySelector('#member').hidden = !user;
    document.querySelector('#login-link').hidden = Boolean(user);
    if (!user || previous !== user.id) {
      authStatus.textContent = user ? '' : 'My VYBE를 보려면 로그인해 주세요.';
      profile = null;
      ownPostsResult = savedCount = null;
      renderCounts();
      renderProfile();
      posts.replaceChildren();
      document.querySelector('#saved-list').replaceChildren();
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      if (user) {
        document.querySelector('#member-email').textContent = user.email || '';
        setTimeout(() => { if (user?.id === currentUser.id) void loadMember(currentUser.id, savedLooks); }, 0);
      }
    }
  });
  if (!myPage) await loadFeed();
} catch {
  (authStatus || feedStatus).textContent = 'VYBE에 연결하지 못했어요. 새로고침해 주세요.';
}
