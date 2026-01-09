import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Maak Supabase "safe": als env vars ontbreken, crasht de app niet.
export const supabase =
  url && anon ? createClient(url, anon) : null;

export const supabaseConfigOk = Boolean(url && anon);
