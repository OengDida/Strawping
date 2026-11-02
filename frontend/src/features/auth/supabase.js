import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// The anon/publishable key is designed for browser use. Never put a service-role key here.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function requireSupabase() {
  if (!supabase) {
    throw new Error('Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the frontend environment.');
  }
  return supabase;
}

export async function signInWithPassword(email, password) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, displayName = '') {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
      data: displayName.trim() ? { full_name: displayName.trim() } : {},
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await requireSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}

export async function getCurrentSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export function subscribeToAuthChanges(onSessionChange) {
  const client = requireSupabase();
  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    onSessionChange(session);
  });
  return () => subscription.unsubscribe();
}

export async function logout() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}
