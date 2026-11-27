import { connectAuth } from './auth-client.js';

const form = document.querySelector('#outfit-form');
const submit = form?.querySelector('button');
const posts = document.querySelector('#posts');
const feedStatus = document.querySelector('#feed-status');
const postStatus = document.querySelector('#post-status');
const page = document.querySelector('[data-page]').dataset.page;
const myPage = page === 'my';
const profileId = new URLSearchParams(location.search).get('id');
const validProfile = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(profileId || '');
const sort = document.querySelector('#feed-sort');
const statusForActions = document.querySelector('#feed-status');
const signedActions = { likes: new Set(), saves: new Set() };
let feedRequest = 0;
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
  const requestId = ++feedRequest;
  feedStatus.textContent = '코디를 불러오는 중…';
  try {
    let request = client.from('outfit_posts').select(columns, { count: 'exact' })
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(24);
    if (owner) request = request.like('photo_path', owner + '/%');
    if (page === 'saved') {
      const ids = [...signedActions.saves];
      request = ids.length ? request.in('id', ids) : null;
    }
    if (sort?.value === 'popular') request = client.rpc('vybe_ranked_outfits');
    const result = request ? await request : { data: [], count: 0 };
    const rows = requireSuccess(result);
    const likes = rows.length
      ? requireSuccess(await client.rpc('vybe_feed_counts', { post_ids: rows.map(row => row.id) }))
      : [];
    const totals = new Map(likes.map(row => [row.post_id, Number(row.likes)]));
    const images = rows.length
      ? requireSuccess(await client.storage.from(bucket).createSignedUrls(rows.map(row => row.photo_path), 3600))
      : [];
    const urls = new Map(images.map(item => [item.path, item.signedUrl]));
    if (requestId !== feedRequest || (myPage && user?.id !== owner)) return;
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
      const profile = document.createElement('a');
      profile.href = 'profile.html?id=' + encodeURIComponent(row.photo_path.split('/')[0]);
      profile.textContent = '작성자 프로필';
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      actions.append(makeAction('상세 보기', () => showPost(row, url)), profile);
      const like = makeAction('좋아요 ' + (totals.get(row.id) || 0), event =>
        changeReaction(event.currentTarget, 'outfit_likes', signedActions.likes, row.id));
      const save = makeAction(signedActions.saves.has(row.id) ? '저장 해제' : '저장', event =>
        changeReaction(event.currentTarget, 'saved_outfits', signedActions.saves, row.id));
      like.setAttribute('aria-pressed', String(signedActions.likes.has(row.id)));
      save.setAttribute('aria-pressed', String(signedActions.saves.has(row.id)));
      actions.append(like, save);
      if (myPage) actions.append(makeAction('수정', () => editPost(row)), makeAction('삭제', () => deletePost(row)));
      item.append(actions);
      if (Object.hasOwn(trends, row.trend_slug)) {
        const trend = document.createElement('small');
        trend.textContent = trends[row.trend_slug];
        item.append(trend);
      }
      return item;
    }));
    feedStatus.textContent = rows.length ? '' : '아직 등록된 코디가 없어요.';
  } catch {
    if (requestId !== feedRequest || (myPage && user?.id !== owner)) return;
    feedStatus.textContent = '피드를 불러오지 못했어요. 페이지를 새로고침해 주세요.';
  }
}

function makeAction(title, callback) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = title;
  button.addEventListener('click', callback);
  return button;
}

let detail;
function openDetail(title) {
  if (!detail) {
    detail = document.createElement('dialog');
    detail.setAttribute('aria-labelledby', 'outfit-detail-title');
    document.querySelector('main').append(detail);
  }
  const heading = document.createElement('h2');
  heading.id = 'outfit-detail-title';
  heading.textContent = title;
  detail.replaceChildren(heading, makeAction('닫기', () => detail.close()));
  if (!detail.open) detail.showModal();
  return detail;
}

function showPost(row, url) {
  const dialog = openDetail(row.title);
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = row.title;
    image.className = 'detail-photo';
    dialog.append(image);
  }
  const caption = document.createElement('p');
  caption.textContent = row.caption;
  dialog.append(caption);
}

async function reloadPosts() {
  await loadFeed(myPage ? user?.id : page === 'profile' ? profileId : null);
  if (myPage && user) renderCounts();
}

async function changeReaction(button, table, selected, postId) {
  if (!user) { location.href = './?account=1'; return; }
  const owner = user.id;
  button.disabled = true;
  try {
    const result = selected.has(postId)
      ? await client.from(table).delete().eq('post_id', postId).eq('user_id', owner)
      : await client.from(table).insert({ post_id: postId, user_id: owner });
    if (result.error?.code !== '23505') requireSuccess(result);
    if (user?.id !== owner) return;
    if (selected.has(postId)) selected.delete(postId);
    else selected.add(postId);
    await reloadPosts();
  } catch {
    statusForActions.textContent = '변경하지 못했어요. 다시 시도해 주세요.';
  } finally {
    button.disabled = false;
  }
}

function editPost(row) {
  const dialog = openDetail('코디 수정');
  const form = document.createElement('form');
  const title = document.createElement('input');
  title.setAttribute('aria-label', '제목');
  title.required = true;
  title.maxLength = 80;
  title.value = row.title;
  const caption = document.createElement('textarea');
  caption.setAttribute('aria-label', '코디 설명');
  caption.maxLength = 500;
  caption.value = row.caption;
  const trend = document.querySelector('#outfit-trend').cloneNode(true);
  trend.removeAttribute('id');
  trend.setAttribute('aria-label', '관련 트렌드');
  trend.value = row.trend_slug || '';
  const submit = document.createElement('button');
  submit.textContent = '저장';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  form.append(title, caption, trend, submit, status);
  dialog.append(form);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!title.value.trim() || submit.disabled) return;
    submit.disabled = true;
    try {
      const changed = requireSuccess(await client.from('outfit_posts').update({
        title: title.value.trim(), caption: caption.value.trim(), trend_slug: trend.value || null
      }).eq('id', row.id).select('id'));
      if (changed.length !== 1) throw new Error('Post was not updated');
      dialog.close();
      await reloadPosts();
    } catch {
      status.textContent = '게시물을 수정하지 못했어요.';
    } finally {
      submit.disabled = false;
    }
  });
}

function deletePost(row) {
  const dialog = openDetail('코디를 삭제할까요?');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = '삭제한 코디는 피드와 내 게시물에서 사라져요.';
  const confirm = makeAction('삭제하기', async () => {
    confirm.disabled = true;
    try {
      const removed = requireSuccess(await client.from('outfit_posts').delete().eq('id', row.id).select('id'));
      if (removed.length !== 1) throw new Error('Post was not deleted');
      try { await client.storage.from(bucket).remove([row.photo_path]); } catch {}
      dialog.close();
      await reloadPosts();
    } catch {
      status.textContent = '게시물을 삭제하지 못했어요.';
    } finally {
      confirm.disabled = false;
    }
  });
  dialog.append(status, confirm);
}

async function loadReactions(owner) {
  const results = owner ? await Promise.all([
    client.from('outfit_likes').select('post_id'),
    client.from('saved_outfits').select('post_id')
  ]) : [];
  if ((user?.id || null) !== owner) return;
  const next = results.map(requireSuccess);
  signedActions.likes = new Set(next[0]?.map(row => row.post_id));
  signedActions.saves = new Set(next[1]?.map(row => row.post_id));
}

async function loadSavedPage(adapter) {
  let ids;
  if (adapter) ids = await adapter.list();
  else {
    try { ids = JSON.parse(localStorage.getItem('vybe.winter.saved') || '[]'); }
    catch { ids = []; }
  }
  const names = { weekend: 'Weekend', office: 'Office', evening: 'Evening' };
  const list = document.querySelector('#editorial-saved');
  list.replaceChildren(...(Array.isArray(ids) ? ids : []).filter(id => Object.hasOwn(names,id)).map(id => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = './?look=' + encodeURIComponent(id) + '#looks';
    link.textContent = names[id];
    item.append(link);
    return item;
  }));
  if (!list.children.length) list.textContent = '저장한 추천 코디가 없어요.';
}

sort?.addEventListener('change', () => void reloadPosts());

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
    reloadPosts(),
    (async () => {
      try {
        const ids = await savedLooks.list();
        if (user?.id !== owner) return;
        savedCount = ids.length;
      } catch {
        if (user?.id === owner) savedCount = null;
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
  if (location.hash === '#saved') location.replace('saved.html');
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
    if (previous !== user?.id || _event === 'INITIAL_SESSION') {
      setTimeout(async () => {
        const owner = currentUser?.id ?? null;
        if ((user?.id ?? null) !== owner) return;
        try {
          await loadReactions(owner);
          if ((user?.id ?? null) !== owner) return;
          if (page === 'saved') await loadSavedPage(savedLooks);
          if (!myPage && page !== 'trends' && (page !== 'profile' || validProfile)) await reloadPosts();
          if (myPage && user) await loadMember(owner, savedLooks);
        } catch {
          (authStatus || feedStatus).textContent = '정보를 불러오지 못했어요. 새로고침해 주세요.';
        }
      }, 0);
    }
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
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      if (user) {
        document.querySelector('#member-email').textContent = user.email || '';

      }
    }
  });
  if (page === 'profile') {
    if (!validProfile) feedStatus.textContent = '프로필 주소를 확인해 주세요.';
    else {
      const data = requireSuccess(await client.from('profiles').select('nickname,bio').eq('user_id', profileId).maybeSingle());
      document.querySelector('#public-name').textContent = data?.nickname || 'VYBE 회원';
      document.querySelector('#public-bio').textContent = data?.bio || '';
    }
  }
} catch {
  if (authStatus || feedStatus) (authStatus || feedStatus).textContent = 'VYBE에 연결하지 못했어요. 새로고침해 주세요.';
}
