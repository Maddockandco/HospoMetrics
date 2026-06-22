// lib/supabase/admin.ts
// Service-role Supabase client for server-side operations that need to bypass RLS.
// NEVER import this in client components or expose it to the browser.

import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
