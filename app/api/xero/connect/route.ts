// app/api/xero/connect/route.ts
// Redirects the user to Xero's consent screen.

import { NextResponse } from "next/server";
import { xero } from "@/lib/xero";

export async function GET() {
  const consentUrl = await xero.buildConsentUrl();
  return NextResponse.redirect(consentUrl);
}
