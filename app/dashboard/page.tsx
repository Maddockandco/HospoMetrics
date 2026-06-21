import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Dashboard</h1>
      <p>Signed in as {user.email}</p>

      {searchParams.xero === "connected" && (
        <p style={{ color: "green" }}>✓ Xero connected successfully</p>
      )}
      {searchParams.error === "client_not_found" && (
        <p style={{ color: "red" }}>
          Error: no client record found for your account. Check the{" "}
          <code>client_users</code> table.
        </p>
      )}
      {searchParams.error === "no_xero_org" && (
        <p style={{ color: "red" }}>
          Error: no Xero organisation was selected during the connection.
        </p>
      )}

      <p style={{ marginTop: 20 }}>
        <a href="/api/xero/connect">Connect to Xero</a>
      </p>
    </main>
  );
}
