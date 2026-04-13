import type { Express } from "express";
import { z } from "zod";
import type { Repo } from "./repo.js";
import { hashPassword, issueToken, revokeAllTokens, revokeToken, verifyPassword } from "./auth.js";
import { randomUUID } from "node:crypto";
import { sendMail } from "./mailer.js";
import { runEmailAutomationOnce } from "./automation.js";
import {
  productCreateSchema,
  productUpdateSchema,
  subscriptionCreateSchema,
  subscriptionUpdateSchema,
  rentRecordCreateSchema,
  rentRecordUpdateSchema,
  reminderCreateSchema,
  reminderUpdateSchema,
} from "./validate.js";
import { isBeforeToday, isWithinNextDays } from "./lib/time.js";

export function registerRoutes(app: Express, r: Repo) {

  app.post("/api/auth/login", async (req, res) => {
    const parsed = z.object({
      email: z.string().trim().email(),
      password: z.string().min(1),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid credentials" });

    const storedEmail = (await r.getSetting("admin_email"))?.trim().toLowerCase() || "";
    const storedSalt = (await r.getSetting("admin_password_salt")) || "";
    const storedHash = (await r.getSetting("admin_password_hash")) || "";

    const envEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const envPassword = process.env.ADMIN_PASSWORD || "";

    const inputEmail = parsed.data.email.trim().toLowerCase();
    const inputPassword = parsed.data.password;

    // Primary: DB-stored credentials (if present).
    const dbOk = Boolean(
      storedEmail &&
      storedSalt &&
      storedHash &&
      inputEmail === storedEmail &&
      verifyPassword(inputPassword, storedSalt, storedHash),
    );

    // Also allow env credentials (same behavior as local dev when ADMIN_* is set).
    const envOk = Boolean(envEmail && envPassword && inputEmail === envEmail && inputPassword === envPassword);

    const ok = dbOk || envOk;

    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = issueToken();
    res.json({ token });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid token" });
    revokeToken(parsed.data.token);
    res.json({ ok: true });
  });

  app.put("/api/admin/credentials", async (req, res) => {
    const parsed = z.object({
      currentPassword: z.string().min(1),
      newEmail: z.string().trim().email(),
      newPassword: z.string().min(6),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const storedSalt = (await r.getSetting("admin_password_salt")) || "";
    const storedHash = (await r.getSetting("admin_password_hash")) || "";
    const envPassword = process.env.ADMIN_PASSWORD || "";

    const hasDbCreds = Boolean(storedSalt && storedHash);
    const currentOk = hasDbCreds
      ? verifyPassword(parsed.data.currentPassword, storedSalt, storedHash)
      : Boolean(envPassword && parsed.data.currentPassword === envPassword);

    if (!currentOk) return res.status(401).json({ error: "Invalid current password" });

    const salt = randomUUID();
    const hash = hashPassword(parsed.data.newPassword, salt);
    await Promise.all([
      r.setSetting("admin_email", parsed.data.newEmail.trim().toLowerCase()),
      r.setSetting("admin_password_salt", salt),
      r.setSetting("admin_password_hash", hash),
    ]);

    // Force re-login everywhere (simple global revoke).
    revokeAllTokens();
    res.json({ ok: true });
  });

  // Admin login email (do not expose password/hash).
  app.get("/api/admin/credentials", async (_req, res) => {
    const storedEmail = (await r.getSetting("admin_email")) || "";
    const envEmail = process.env.ADMIN_EMAIL || "";
    const email = (storedEmail || envEmail).trim().toLowerCase();
    res.json({ email });
  });

  app.post("/api/email/test", async (req, res) => {
    const parsed = z.object({
      to: z.string().trim().email(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid email" });

    await sendMail({
      to: parsed.data.to,
      subject: "wegomanage SMTP test",
      text: "SMTP is configured correctly.",
      html: "<p><strong>SMTP is configured correctly.</strong></p>",
    });
    res.json({ ok: true });
  });

  app.post("/api/automation/email/run", async (_req, res) => {
    const force = String((_req.query as any)?.force ?? "").toLowerCase() === "true";
    const result = await runEmailAutomationOnce(r, { force });
    res.json(result);
  });

  // Settings / config
  app.get("/api/config", async (_req, res) => {
    const usdToFrwRate = Number((await r.getSetting("usd_to_frw_rate")) ?? "1300");
    res.json({ usdToFrwRate });
  });

  app.get("/api/profile", async (_req, res) => {
    const [name, role, email, company, avatarUrl] = await Promise.all([
      r.getSetting("profile_name"),
      r.getSetting("profile_role"),
      r.getSetting("profile_email"),
      r.getSetting("profile_company"),
      r.getSetting("profile_avatar_url"),
    ]);
    res.json({
      name: name ?? "",
      role: role ?? "",
      email: email ?? "",
      company: company ?? "",
      avatarUrl: avatarUrl ?? "",
    });
  });

  app.put("/api/profile", async (req, res) => {
    const parsed = z.object({
      name: z.string().trim().min(1).max(80),
      role: z.string().trim().max(80).optional().default(""),
      email: z.string().trim().email().max(120),
      company: z.string().trim().min(1).max(120),
      avatarUrl: z.string().trim().url().optional().or(z.literal("")).default(""),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid profile" });

    const p = parsed.data;
    await Promise.all([
      r.setSetting("profile_name", p.name),
      r.setSetting("profile_role", p.role ?? ""),
      r.setSetting("profile_email", p.email),
      r.setSetting("profile_company", p.company),
      r.setSetting("profile_avatar_url", p.avatarUrl ?? ""),
    ]);
    res.json({ ok: true });
  });

  app.put("/api/settings/usd-to-frw-rate", async (req, res) => {
    const body = z.object({ rate: z.number().positive() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid rate" });
    await r.setSetting("usd_to_frw_rate", String(body.data.rate));
    res.json({ ok: true });
  });

  // Products
  app.get("/api/products", async (_req, res) => res.json(await r.listProducts()));
  app.get("/api/products/:id", async (req, res) => {
    const item = await r.getProduct(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });
  app.post("/api/products", async (req, res) => {
    const parsed = productCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const created = await r.createProduct(parsed.data);
    await r.addActivity({ action: "created", recordType: "product", recordName: created.name });
    res.status(201).json(created);
  });
  app.put("/api/products/:id", async (req, res) => {
    const parsed = productUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const updated = await r.updateProduct(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await r.addActivity({ action: "updated", recordType: "product", recordName: updated.name });
    res.json(updated);
  });
  app.delete("/api/products/:id", async (req, res) => {
    const cur = await r.getProduct(req.params.id);
    const ok = await r.deleteProduct(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    if (cur) await r.addActivity({ action: "deleted", recordType: "product", recordName: cur.name });
    res.json({ ok: true });
  });

  // Subscriptions
  app.get("/api/subscriptions", async (_req, res) => res.json(await r.listSubscriptions()));
  app.get("/api/subscriptions/:id", async (req, res) => {
    const item = await r.getSubscription(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });
  app.post("/api/subscriptions", async (req, res) => {
    const parsed = subscriptionCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const created = await r.createSubscription(parsed.data);
    await r.addActivity({ action: "created", recordType: "subscription", recordName: created.name });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after create subscription", e));
    res.status(201).json(created);
  });
  app.put("/api/subscriptions/:id", async (req, res) => {
    const parsed = subscriptionUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const updated = await r.updateSubscription(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await r.addActivity({ action: "updated", recordType: "subscription", recordName: updated.name });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after update subscription", e));
    res.json(updated);
  });
  app.delete("/api/subscriptions/:id", async (req, res) => {
    const cur = await r.getSubscription(req.params.id);
    const ok = await r.deleteSubscription(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    if (cur) await r.addActivity({ action: "deleted", recordType: "subscription", recordName: cur.name });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after delete subscription", e));
    res.json({ ok: true });
  });

  // Rent records
  app.get("/api/rent-records", async (_req, res) => res.json(await r.listRentRecords()));
  app.get("/api/rent-records/:id", async (req, res) => {
    const item = await r.getRentRecord(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });
  app.post("/api/rent-records", async (req, res) => {
    const parsed = rentRecordCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const created = await r.createRentRecord(parsed.data);
    await r.addActivity({ action: "created", recordType: "rent", recordName: created.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after create rent record", e));
    res.status(201).json(created);
  });
  app.put("/api/rent-records/:id", async (req, res) => {
    const parsed = rentRecordUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const updated = await r.updateRentRecord(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await r.addActivity({ action: "updated", recordType: "rent", recordName: updated.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after update rent record", e));
    res.json(updated);
  });
  app.delete("/api/rent-records/:id", async (req, res) => {
    const cur = await r.getRentRecord(req.params.id);
    const ok = await r.deleteRentRecord(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    if (cur) await r.addActivity({ action: "deleted", recordType: "rent", recordName: cur.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after delete rent record", e));
    res.json({ ok: true });
  });

  // Reminders
  app.get("/api/reminders", async (_req, res) => res.json(await r.listReminders()));
  app.get("/api/reminders/:id", async (req, res) => {
    const item = await r.getReminder(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });
  app.post("/api/reminders", async (req, res) => {
    const parsed = reminderCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const created = await r.createReminder(parsed.data);
    await r.addActivity({ action: "created", recordType: "reminder", recordName: created.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after create reminder", e));
    res.status(201).json(created);
  });
  app.put("/api/reminders/:id", async (req, res) => {
    const parsed = reminderUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const updated = await r.updateReminder(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await r.addActivity({ action: "updated", recordType: "reminder", recordName: updated.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after update reminder", e));
    res.json(updated);
  });
  app.delete("/api/reminders/:id", async (req, res) => {
    const cur = await r.getReminder(req.params.id);
    const ok = await r.deleteReminder(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    if (cur) await r.addActivity({ action: "deleted", recordType: "reminder", recordName: cur.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after delete reminder", e));
    res.json({ ok: true });
  });

  // Activity log
  app.get("/api/activity", async (_req, res) => res.json(await r.listActivity()));

  // Notifications aggregate (same idea as frontend NotificationCenter)
  app.get("/api/notifications", async (_req, res) => {
    const reminders = await r.listReminders();
    const subscriptions = await r.listSubscriptions();
    const rent = await r.listRentRecords();

    const upcomingReminders = reminders.filter((x) => x.status === "pending" && isWithinNextDays(x.reminderDate, 7));
    const overdueReminders = reminders.filter((x) => x.status === "overdue" || (x.status === "pending" && isBeforeToday(x.reminderDate)));
    const expiringSubs = subscriptions.filter((s) => s.status === "active" && isWithinNextDays(s.renewalDate, 30));
    const overdueRent = rent.filter((rr) => isBeforeToday(rr.dueDate) && rr.status !== "completed");

    // Trigger email automation right after notifications are computed.
    // Fire-and-forget so the UI isn't slowed down.
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after notifications", e));

    res.json({ overdueReminders, overdueRent, expiringSubs, upcomingReminders });
  });
}

