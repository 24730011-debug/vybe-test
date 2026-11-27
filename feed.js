import { connectAuth } from './auth-client.js';

const form = document.querySelector('#outfit-form');
const submit = form.querySelector('button');
const posts = document.querySelector('#posts');
const feedStatus = document.querySelector('#feed-status');
const postStatus = document.querySelector('#post-status');
const authStatus = document.querySelector('#feed-auth');
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const bucket = 'outfit-photos';
const columns = 'id,title,caption,photo_path,created_at';
let user = null;
let client;

function requireSuccess(result) {
  if (result.error) throw result.error;
  return result.data;
}

async function loadFeed() {
  feedStatus.textContent = '코디를 불러오는 중…';
  try {
    const rows = requireSuccess(await client.from('outfit_posts').select(columns)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(24));
    const images = rows.length
      ? requireSuccess(await client.storage.from(bucket).createSignedUrls(rows.map(row => row.photo_path), 3600))
      : [];
    const urls = new Map(images.map(item => [item.path, item.signedUrl]));
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
      return item;
    }));
    feedStatus.textContent = rows.length ? '' : '아직 등록된 코디가 없어요.';
  } catch {
    feedStatus.textContent = '피드를 불러오지 못했어요. 페이지를 새로고침해 주세요.';
  }
}

form.addEventListener('submit', async event => {
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
    requireSuccess(await client.from('outfit_posts').insert({ user_id: owner, title, caption, photo_path: path }));
    form.reset();
    postStatus.textContent = '피드에 코디를 올렸어요.';
    await loadFeed();
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

try {
  const connection = await connectAuth();
  client = connection.client;
  connection.subscribe((_event, currentUser) => {
    user = currentUser;
    form.hidden = !user;
    authStatus.textContent = user ? '' : '코디를 올리려면 Home의 Account에서 로그인해 주세요.';
  });
  await loadFeed();
} catch {
  authStatus.textContent = 'VYBE에 연결하지 못했어요. 새로고침해 주세요.';
}
