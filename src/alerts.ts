import type { Repo } from "./repo.js";
import { isBeforeToday, isWithinNextDays } from "./lib/time.js";
import { renderEmailTemplate } from "./emailTemplate.js";

type AlertEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function formatUsd(amount: number) {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function tableHtml(headers: string[], rows: string[][]) {
  if (rows.length === 0) return "";
  return `
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead>
        <tr>
          ${headers.map((h) => `<th style="text-align:left; padding:10px 8px; border-bottom:1px solid #e5e7eb; color:#374151;">${escapeHtml(h)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
              ${r.map((c) => `<td style="padding:10px 8px; border-bottom:1px solid #f3f4f6; vertical-align:top;">${escapeHtml(c)}</td>`).join("")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `.trim();
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function ul(items: string[]) {
  if (items.length === 0) return "<p>None.</p>";
  return `<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}

export async function buildAlertsEmail(r: Repo): Promise<AlertEmail | null> {
  const [profileEmail, profileName, reminders, subs, rent] = await Promise.all([
    r.getSetting("profile_email"),
    r.getSetting("profile_name"),
    r.listReminders(),
    r.listSubscriptions(),
    r.listRentRecords(),
  ]);

  const to = (profileEmail || "").trim();
  if (!to) return null;
  const name = (profileName || "").trim();

  const upcomingReminders = reminders.filter((x) => x.status === "pending" && isWithinNextDays(x.reminderDate, 7));
  const overdueReminders = reminders.filter((x) => x.status === "overdue" || (x.status === "pending" && isBeforeToday(x.reminderDate)));

  const expiringSubs = subs.filter((s) => s.status === "active" && isWithinNextDays(s.renewalDate, 30));
  const overdueRent = rent.filter((rr) => isBeforeToday(rr.dueDate) && rr.status !== "completed");

  if (
    upcomingReminders.length === 0 &&
    overdueReminders.length === 0 &&
    expiringSubs.length === 0 &&
    overdueRent.length === 0
  ) {
    return null;
  }

  const subject = "WegoConnect alerts — action needed";

  const textLines: string[] = [
    "WegoConnect alerts",
    "",
    `Overdue reminders: ${overdueReminders.length}`,
    ...overdueReminders.slice(0, 20).map((x) => `- ${x.title} (${x.reminderDate})`),
    "",
    `Upcoming reminders (next 7 days): ${upcomingReminders.length}`,
    ...upcomingReminders.slice(0, 20).map((x) => `- ${x.title} (${x.reminderDate})`),
    "",
    `Subscriptions renewing soon (next 30 days): ${expiringSubs.length}`,
    ...expiringSubs.slice(0, 20).map((s) => `- ${s.name} (${s.renewalDate})`),
    "",
    `Overdue rent: ${overdueRent.length}`,
    ...overdueRent.slice(0, 20).map((rr) => `- ${rr.title} (${rr.dueDate})`),
    "",
    "Open WegoConnect to review and clear these alerts.",
  ];

  const bodyHtml = `
    <div style="margin:0 0 10px;">
      Here’s what needs your attention in WegoConnect.
    </div>

    <h3 style="margin:16px 0 8px;">Overdue reminders (${overdueReminders.length})</h3>
    ${ul(overdueReminders.slice(0, 20).map((x) => `${x.title} (${x.reminderDate})`))}

    <h3 style="margin:16px 0 8px;">Upcoming reminders (7d) (${upcomingReminders.length})</h3>
    ${ul(upcomingReminders.slice(0, 20).map((x) => `${x.title} (${x.reminderDate})`))}

    <h3 style="margin:16px 0 8px;">Expiring subscriptions (30d) (${expiringSubs.length})</h3>
    ${ul(expiringSubs.slice(0, 20).map((s) => `${s.name} (${s.renewalDate})`))}

    <h3 style="margin:16px 0 8px;">Overdue rent (${overdueRent.length})</h3>
    ${ul(overdueRent.slice(0, 20).map((rr) => `${rr.title} (${rr.dueDate})`))}

    <p style="margin:16px 0 0; color:#6b7280; font-size:12px;">
      If you already handled an item, you can ignore it.
    </p>
  `.trim();

  const html = renderEmailTemplate({
    title: "Alerts — action needed",
    bannerText: "Action needed: you have new alerts in WegoConnect.",
    greeting: name ? `Hi ${name},` : "Hi,",
    bodyHtml,
    ctaText: "",
    footerText: "WegoConnect • If you didn’t expect this email, you can ignore it.",
  });

  return { to, subject, text: textLines.join("\n"), html };
}

function groupByEmail<T extends { payerEmail: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const email = (item.payerEmail || "").trim().toLowerCase();
    if (!email) continue;
    const arr = map.get(email) || [];
    arr.push(item);
    map.set(email, arr);
  }
  return map;
}

export async function buildClientPaymentEmails(r: Repo): Promise<AlertEmail[]> {
  const [subs, rent] = await Promise.all([
    r.listSubscriptions(),
    r.listRentRecords(),
  ]);

  const expiringSubs = subs.filter((s) => s.status === "active" && isWithinNextDays(s.renewalDate, 7));
  const dueRent = rent.filter((rr) => isWithinNextDays(rr.dueDate, 7) && rr.status !== "completed");
  const overdueRent = rent.filter((rr) => isBeforeToday(rr.dueDate) && rr.status !== "completed");

  const subsByEmail = groupByEmail(expiringSubs);
  const rentByEmail = groupByEmail([...dueRent, ...overdueRent]);

  const recipients = new Set<string>([...subsByEmail.keys(), ...rentByEmail.keys()]);
  const emails: AlertEmail[] = [];

  for (const to of recipients) {
    const subItems = subsByEmail.get(to) || [];
    const rentItems = rentByEmail.get(to) || [];

    const soonSub = subItems.some((s) => isWithinNextDays(s.renewalDate, 3));
    const anyOverdueRent = rentItems.some((rr) => isBeforeToday(rr.dueDate));
    const subject = anyOverdueRent
      ? "WegoConnect payment reminder — overdue"
      : soonSub
        ? "WegoConnect payment reminder — due soon"
        : "WegoConnect payment reminder";

    const recipientName =
      (subItems.find((x) => (x as any).payerName && String((x as any).payerName).trim()) as any)?.payerName?.trim() ||
      (rentItems.find((x) => (x as any).payerName && String((x as any).payerName).trim()) as any)?.payerName?.trim() ||
      "";

    const subRows = subItems.map((s) => [s.name, s.provider, formatUsd(s.amount), s.renewalDate]);
    const rentRows = rentItems.map((rr) => [rr.title, rr.propertyType || "-", formatUsd(rr.rentAmount), rr.dueDate]);

    const textLines: string[] = [
      `Hello${recipientName ? ` ${recipientName}` : ""},`,
      "",
      "This is a payment reminder from WegoConnect.",
      "You are receiving this email because your email address is listed as the payer for the items below.",
      "",
      ...(subItems.length
        ? ["Subscription(s):", ...subItems.map((s) => `- ${s.name} (${s.provider}) — ${formatUsd(s.amount)} — renewal date ${s.renewalDate}`), ""]
        : []),
      ...(rentItems.length
        ? ["Rent:", ...rentItems.map((rr) => `- ${rr.title} — ${formatUsd(rr.rentAmount)} — due date ${rr.dueDate}`), ""]
        : []),
      "Please make payment on time to avoid interruption or penalties.",
      "If you already paid, you can ignore this email.",
    ].filter(Boolean);

    const bodyHtml = `
      <div style="margin:0 0 10px;">
        This is a payment reminder from <strong>WegoConnect</strong>.
        You are receiving this email because your email address is listed as the payer for the items below.
      </div>

      ${subRows.length ? `
        <h3 style="margin:16px 0 8px;">Subscription(s) (${subRows.length})</h3>
        ${tableHtml(["Subscription", "Provider", "Amount", "Renewal date"], subRows)}
      ` : ``}

      ${rentRows.length ? `
        <h3 style="margin:16px 0 8px;">Rent (${rentRows.length})</h3>
        ${tableHtml(["Rent", "Type", "Amount", "Due date"], rentRows)}
      ` : ``}

      <p style="margin:16px 0 0; color:#6b7280; font-size:12px;">
        If you already paid, you can ignore this email.
      </p>
    `.trim();

    const html = renderEmailTemplate({
      title: "Payment reminder",
      bannerText: "Payment due soon — please review.",
      greeting: `Hello${recipientName ? ` ${recipientName}` : ""},`,
      bodyHtml,
      ctaText: "",
      footerText: "WegoConnect • Automated payment reminder",
    });

    emails.push({ to, subject, text: textLines.join("\n"), html });
  }

  return emails;
}

