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
      // Identity
      "openid",
      "profile",
      "email",
      "offline_access",
      // Contacts (suppliers, customers)
      "accounting.contacts.read",
      // Chart of accounts, tracking categories
      "accounting.settings.read",
      // Transactions
      "accounting.invoices.read",
      "accounting.banktransactions.read",
      "accounting.manualjournals.read",
      "accounting.payments.read",
      // Reports - exactly what we need for HospoMetrics
      "accounting.reports.profitandloss.read",
      "accounting.reports.balancesheet.read",
      "accounting.reports.trialbalance.read",
    ],
  });

  return cachedClient;
}
