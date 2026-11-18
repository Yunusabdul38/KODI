import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Daily jobs: pay vaults that are due, pay out refunds whose 48-hour window
  // has passed, and take a proof-of-reserves snapshot. Vercel sends
  // `Authorization: Bearer $CRON_SECRET`. An external scheduler can call the
  // same route more often (see README).
  crons: [{ path: "/api/cron/daily", schedule: "0 6 * * *" }],
};
