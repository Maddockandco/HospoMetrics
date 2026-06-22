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
      // Granular accounting scopes (required for apps created after March 2, 2026)
      "accounting.journals.read",      // GL journal entries
      "accounting.reports.read",       // P&L, Balance Sheet reports
      "accounting.settings.read",      // Chart of accounts, tracking categories
      "accounting.transactions.read",  // Invoices, bills, bank transactions
      "accounting.contacts.read",      // Suppliers, customers
    ],
  });

  return cachedClient;
}
