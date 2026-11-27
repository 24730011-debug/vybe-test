const projectUrl = 'https://estauvmfhqtydurrpjui.supabase.co';
const publishableKey = 'sb_publishable_dBLckHS02fNHtG0LIQhUuA_tEIZiLzd';

export async function connectAuth() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const { auth } = createClient(projectUrl, publishableKey);
  const confirmationUrl = new URL(location.pathname, location.origin).href;
  return {
    subscribe(callback) {
      return auth.onAuthStateChange((event, session) => callback(event, session?.user ?? null, session ? accountSavedLooks(session) : null));
    },
    signUp(email, password) {
      return auth.signUp({ email, password, options: { emailRedirectTo: confirmationUrl } });
    },
    signIn(email, password) {
      return auth.signInWithPassword({ email, password });
    },
    signOut() {
      return auth.signOut({ scope: 'local' });
    }
  };
}

function accountSavedLooks(session) {
  const endpoint = new URL('/rest/v1/saved_looks', projectUrl);
  const headers = { apikey: publishableKey, Authorization: 'Bearer ' + session.access_token };
  return {
    async list() {
      const url = new URL(endpoint);
      url.searchParams.set('select', 'look_id');
      url.searchParams.set('order', 'created_at.asc');
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error('Could not load account saves');
      return (await response.json()).map(row => row.look_id);
    },
    async set(lookId, selected) {
      if (selected) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ look_id: lookId })
        });
        if (!response.ok && (response.status !== 409 || (await response.json()).code !== '23505')) {
          throw new Error('Could not save look');
        }
      } else {
        const url = new URL(endpoint);
        url.searchParams.set('look_id', 'eq.' + lookId);
        const response = await fetch(url, { method: 'DELETE', headers });
        if (!response.ok) throw new Error('Could not remove look');
      }
    }
  };
}
