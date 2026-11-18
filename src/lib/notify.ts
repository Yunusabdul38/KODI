import "server-only";

/**
 * Email via Resend when RESEND_API_KEY is set; otherwise logged to the server
 * console (the app tells people to copy their private links when it can't email).
 */
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

export async function sendEmail(to: (string | null | undefined)[], subject: string, text: string) {
  const recipients = to.filter((x): x is string => Boolean(x));
  if (!recipients.length) return;
  if (!emailEnabled()) {
    console.log(`[email] to ${recipients.join(", ")}: ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Kodi <onboarding@resend.dev>", to: recipients, subject, text }),
  });
  if (!res.ok) console.error("email failed", res.status, await res.text().catch(() => ""));
}

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
