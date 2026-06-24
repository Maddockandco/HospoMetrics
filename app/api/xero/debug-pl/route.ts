// app/api/xero/debug-pl/route.ts
// Temporary debug route — shows the raw Xero P&L response for one week.
// Remove this once the sync is working correctly.
// Route: /api/xero/debug-pl

import { NextRequest, NextResponse } from "next/server";
import { getXeroClient } from "@/lib/xero";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: clientRecord } = await supabaseAdmin
    .from("clients")
    .select("id, xero_tenant_id")
    .eq("owner_user_id", user.id)
    .single();

  const { data: tokenRow } = await supabaseAdmin
    .from("xero_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("client_id", clientRecord!.id)
    .single();

  const xero = getXeroClient();
  await xero.setTokenSet({
    access_token: tokenRow!.access_token,
    refresh_token: tokenRow!.refresh_token,
    expires_at: tokenRow!.expires_at
      ? new Date(tokenRow!.expires_at).getTime() / 1000
      : undefined,
  });
  await xero.updateTenants();

  // Pull one week of P&L — first week of March 2026
  const response = await xero.accountingApi.getReportProfitAndLoss(
    clientRecord!.xero_tenant_id!,
    "2026-06-15",
    "2026-06-21",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    false
  );

  // Return the raw response so we can see the exact structure
  return NextResponse.json(response.body);
}
