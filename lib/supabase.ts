import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(value: string | undefined) {
  if (!value) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  }

  return value.replace(/\/rest\/v1\/?$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
