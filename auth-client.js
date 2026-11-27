const projectUrl = 'https://estauvmfhqtydurrpjui.supabase.co';
const publishableKey = 'sb_publishable_dBLckHS02fNHtG0LIQhUuA_tEIZiLzd';

export async function connectAuth() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const { auth } = createClient(projectUrl, publishableKey);
  const confirmationUrl = new URL(location.pathname, location.origin).href;
  return {
    subscribe(callback) {
      return auth.onAuthStateChange((event, session) => callback(event, session?.user ?? null));
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
