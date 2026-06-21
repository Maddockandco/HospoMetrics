// app/api/xero/callback/route.ts
// Handles the redirect back from Xero after consent, stores the token set
// and tenant ID against the logged-in user's client record in Supabase.

import { NextRequest, NextResponse } from "next/server";
import { xero } from "@/lib/xero";
import { createClient } from "@/lib/supabase/server"; // your existing Supabase server client helper

export async function GET(req: NextRequest) {
  const supabase = createClient();

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
  const tenant = xero.tenants[0]; // assume single org for now - Tangerine Trees

  if (!tenant) {
    return NextResponse.redirect(
      new URL("/dashboard?error=no_xero_org", req.url)
    );
  }

  // Find the client record for this logged-in user.
  // Adjust this query to however you link auth.users -> clients in your schema
  // (e.g. a user_id column on clients, or a join table for multi-user firms).
  const { data: clientRecord, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (clientErr || !clientRecord) {
    return NextResponse.redirect(
      new URL("/dashboard?error=client_not_found", req.url)
    );
  }

  // Store the tenant ID on the client record, and the token set separately
  // (token sets should live in their own table, not on `clients`, since they
  // expire/refresh independently and you don't want to bloat that row).
  await supabase
    .from("clients")
    .update({ xero_tenant_id: tenant.tenantId })
    .eq("id", clientRecord.id);

  await supabase.from("xero_tokens").upsert({
    client_id: clientRecord.id,
    access_token: tokenSet.access_token,
    refresh_token: tokenSet.refresh_token,
    expires_at: tokenSet.expires_at
      ? new Date(tokenSet.expires_at * 1000).toISOString()
      : null,
  });

  return NextResponse.redirect(new URL("/dashboard?xero=connected", req.url));
}
