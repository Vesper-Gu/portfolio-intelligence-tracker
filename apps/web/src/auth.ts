import type { Session, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const authEnabled = Boolean(supabaseUrl && supabaseAnonKey);
let client: SupabaseClient | undefined;

async function getClient() {
  if (!authEnabled) return undefined;
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(supabaseUrl as string, supabaseAnonKey as string);
  }
  return client;
}

export function isExternalAuthEnabled() {
  return authEnabled;
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = await getClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email: string, password: string) {
  const supabase = await getClient();
  if (!supabase) throw new Error("External authentication is not configured");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const supabase = await getClient();
  if (supabase) await supabase.auth.signOut();
}

export async function subscribeToSession(listener: (session: Session | null) => void) {
  const supabase = await getClient();
  if (!supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(session));
  return () => data.subscription.unsubscribe();
}
