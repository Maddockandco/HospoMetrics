// app/api/xero/connect/route.ts
// Redirects the user to Xero's consent screen.

import { NextResponse } from "next/server";
import { getXeroClient } from "@/lib/xero";

export async function GET() {
  const xero = getXeroClient();
  const consentUrl = await xero.buildConsentUrl();

  // TEMP DEBUG: show the URL instead of redirecting, so we can inspect it.
  // Revert this once the issue is fixed.
  return new NextResponse(consentUrl, {
    headers: { "Content-Type": "text/plain" },
  });

  // return NextResponse.redirect(consentUrl);
}
