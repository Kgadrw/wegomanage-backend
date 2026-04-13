import { createHash } from "node:crypto";
import type { Repo } from "./repo.js";
import { buildAlertsEmail, buildClientPaymentEmails } from "./alerts.js";
import { sendMail } from "./mailer.js";

function sha(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export async function runEmailAutomationOnce(r: Repo, opts?: { force?: boolean }) {
  const enabled = (await r.getSetting("email_automation_enabled")) ?? (process.env.ENABLE_EMAIL_AUTOMATION || "");
  const isEnabled = String(enabled).toLowerCase() === "true";
  if (!isEnabled) return { ok: true, sent: false, reason: "disabled" as const };

  const [adminEmail, clientEmails] = await Promise.all([
    buildAlertsEmail(r),
    buildClientPaymentEmails(r),
  ]);

  const payload = JSON.stringify({
    admin: adminEmail ? { to: adminEmail.to, subject: adminEmail.subject, text: adminEmail.text } : null,
    clients: clientEmails.map((x) => ({ to: x.to, subject: x.subject, text: x.text })),
  });

  const newHash = sha(payload);
  const lastHash = (await r.getSetting("alerts_email_last_hash")) || "";

  if (!opts?.force && lastHash === newHash) {
    return { ok: true, sent: false, reason: "unchanged" as const, clientRecipients: clientEmails.length, adminRecipient: Boolean(adminEmail) };
  }

  let sentCount = 0;
  if (adminEmail) {
    await sendMail(adminEmail);
    sentCount += 1;
  }
  for (const email of clientEmails) {
    await sendMail(email);
    sentCount += 1;
  }

  if (sentCount === 0) {
    return { ok: true, sent: false, reason: "no_alerts_or_no_recipient" as const, clientRecipients: 0, adminRecipient: false };
  }

  await r.setSetting("alerts_email_last_hash", newHash);
  await r.setSetting("alerts_email_last_sent_at", new Date().toISOString());

  return { ok: true, sent: true, reason: "sent" as const, sentCount, clientRecipients: clientEmails.length, adminRecipient: Boolean(adminEmail) };
}

export function startEmailAutomation(r: Repo) {
  const minutes = Number(process.env.NOTIFY_INTERVAL_MIN || 15);
  const intervalMs = Math.max(1, minutes) * 60_000;

  const tick = async () => {
    try {
      await runEmailAutomationOnce(r);
    } catch (e) {
      // Avoid crashing the server for email issues, but do log them.
      console.error("email automation tick failed", e);
    }
  };

  void tick();
  return setInterval(() => void tick(), intervalMs);
}

