// app/api/xero/callback/route.ts
// Handles the redirect back from Xero after consent, stores the token set
// and tenant ID against the logged-in user's client record in Supabase.

import { NextRequest, NextResponse } from "next/server";
import { getXeroClient } from "@/lib/xero";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const xero = getXeroClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Exchange the auth code for a token set
  await xero.apiCallback(req.url);
  const tokenSet = await xero.readTokenSet();

  // updateTenants() populates xero.tenants with the connected org(s)
  await xero.updateTenants();
  const tenant = xero.tenants[0];

  if (!tenant) {
    return NextResponse.redirect(
      new URL("/dashboard?error=no_xero_org", req.url)
    );
  }

  // Find the client record using admin client (bypasses RLS for this lookup)
  const { data: clientRecord, error: clientErr } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (clientErr || !clientRecord) {
    return NextResponse.redirect(
      new URL("/dashboard?error=client_not_found", req.url)
    );
  }

  // Use admin client for writes so RLS doesn't block token storage
  await supabaseAdmin
    .from("clients")
    .update({ xero_tenant_id: tenant.tenantId })
    .eq("id", clientRecord.id);

  await supabaseAdmin.from("xero_tokens").upsert({
    client_id: clientRecord.id,
    access_token: tokenSet.access_token,
    refresh_token: tokenSet.refresh_token,
    expires_at: tokenSet.expires_at
      ? new Date(tokenSet.expires_at * 1000).toISOString()
      : null,
  });

  return NextResponse.redirect(new URL("/dashboard?xero=connected", req.url));
}
