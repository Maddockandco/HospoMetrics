// app/api/xero/connect/route.ts
// Redirects the user to Xero's consent screen.

import { NextResponse } from "next/server";
import { getXeroClient } from "@/lib/xero";

export async function GET() {
  const xero = getXeroClient();
  const consentUrl = await xero.buildConsentUrl();
  return NextResponse.redirect(consentUrl);
}
