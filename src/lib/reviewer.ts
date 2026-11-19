import "server-only";
import { network } from "./lightning";

export interface ReviewerLogins {
  arbiterPassword: string | null;
  landlord: { email: string; password: string } | null;
}

/**
 * Sign-ins shown on the page for hackathon reviewers. Test network only, and
 * only with SHOW_REVIEWER_LOGINS=true: a mainnet deploy never shows them.
 */
export function reviewerLogins(): ReviewerLogins | null {
  if (network() !== "mutinynet" || process.env.SHOW_REVIEWER_LOGINS !== "true") return null;
  const email = process.env.REVIEWER_LANDLORD_EMAIL;
  const password = process.env.REVIEWER_LANDLORD_PASSWORD;
  return {
    arbiterPassword: process.env.ADMIN_PASSWORD || null,
    landlord: email && password ? { email, password } : null,
  };
}
