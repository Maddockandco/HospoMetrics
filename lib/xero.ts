// lib/xero.ts
// Xero OAuth client setup for HospoMetrics.
// Requires: npm install xero-node

import { XeroClient } from "xero-node";

if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) {
  throw new Error("Missing XERO_CLIENT_ID or XERO_CLIENT_SECRET env vars");
}

export const xero = new XeroClient({
  clientId: process.env.XERO_CLIENT_ID,
  clientSecret: process.env.XERO_CLIENT_SECRET,
  redirectUris: [process.env.XERO_REDIRECT_URI!], // e.g. https://hospometrics.maddockandco.com/api/xero/callback
  scopes: [
    "openid",
    "profile",
    "email",
    "accounting.transactions.read",
    "accounting.reports.read",
    "accounting.settings.read", // needed to read tracking categories
    "offline_access", // needed for refresh tokens
  ],
});
