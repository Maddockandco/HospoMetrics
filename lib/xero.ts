// lib/xero.ts
// Xero OAuth client setup for HospoMetrics.
// Requires: npm install xero-node

import { XeroClient } from "xero-node";

let cachedClient: XeroClient | null = null;

export function getXeroClient(): XeroClient {
  if (cachedClient) return cachedClient;

  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) {
    throw new Error("Missing XERO_CLIENT_ID or XERO_CLIENT_SECRET env vars");
  }

  cachedClient = new XeroClient({
    clientId: process.env.XERO_CLIENT_ID,
    clientSecret: process.env.XERO_CLIENT_SECRET,
    redirectUris: [process.env.XERO_REDIRECT_URI!],
    scopes: [
      "openid",
      "profile",
      "email",
      "accounting.transactions.read",
      "accounting.reports.read",
      "accounting.settings.read",
      "offline_access",
    ],
  });

  return cachedClient;
}
