import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { isoDateOnly } from "./lib/time.js";
import type { ActivityLog, Product, Reminder, RentRecord, Subscription } from "./types.js";
import type { MongoClient, Collection } from "mongodb";

function row<T>(x: unknown): T {
  return x as T;
}

export type Repo = {
  // Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  // Products
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  createProduct(input: Omit<Product, "id" | "createdAt">): Promise<Product>;
  updateProduct(id: string, patch: Partial<Omit<Product, "id" | "createdAt">>): Promise<Product | null>;
  deleteProduct(id: string): Promise<boolean>;

  // Subscriptions
  listSubscriptions(): Promise<Subscription[]>;
  getSubscription(id: string): Promise<Subscription | null>;
  createSubscription(input: Omit<Subscription, "id" | "createdAt">): Promise<Subscription>;
  updateSubscription(id: string, patch: Partial<Omit<Subscription, "id" | "createdAt">>): Promise<Subscription | null>;
  deleteSubscription(id: string): Promise<boolean>;

  // Rent
  listRentRecords(): Promise<RentRecord[]>;
  getRentRecord(id: string): Promise<RentRecord | null>;
  createRentRecord(input: Omit<RentRecord, "id" | "createdAt">): Promise<RentRecord>;
  updateRentRecord(id: string, patch: Partial<Omit<RentRecord, "id" | "createdAt">>): Promise<RentRecord | null>;
  deleteRentRecord(id: string): Promise<boolean>;

  // Reminders
  listReminders(): Promise<Reminder[]>;
  getReminder(id: string): Promise<Reminder | null>;
  createReminder(input: Omit<Reminder, "id" | "createdAt">): Promise<Reminder>;
  updateReminder(id: string, patch: Partial<Omit<Reminder, "id" | "createdAt">>): Promise<Reminder | null>;
  deleteReminder(id: string): Promise<boolean>;

  // Activity
  listActivity(): Promise<ActivityLog[]>;
  addActivity(input: Omit<ActivityLog, "id" | "timestamp"> & { timestamp?: string }): Promise<ActivityLog>;
};

export function sqliteRepo(db: Db): Repo {
  return {
    // Settings
    async getSetting(key: string) {
      const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return r?.value ?? null;
    },
    async setSetting(key: string, value: string) {
      db.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .run(key, value);
    },

    // Products
    async listProducts(): Promise<Product[]> {
      return db.prepare("SELECT * FROM products ORDER BY createdAt DESC").all().map(row<Product>);
    },
    async getProduct(id: string): Promise<Product | null> {
      return (db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined) ?? null;
    },
    async createProduct(input: Omit<Product, "id" | "createdAt">): Promise<Product> {
      const p: Product = { ...input, id: randomUUID(), createdAt: isoDateOnly() };
      db.prepare(
        `INSERT INTO products(id,name,category,vendor,purchaseDate,purchaseCost,warrantyExpiry,serialNumber,assignedTo,status,notes,createdAt)
         VALUES(@id,@name,@category,@vendor,@purchaseDate,@purchaseCost,@warrantyExpiry,@serialNumber,@assignedTo,@status,@notes,@createdAt)`,
      ).run(p);
      return p;
    },
    async updateProduct(id: string, patch: Partial<Omit<Product, "id" | "createdAt">>): Promise<Product | null> {
      const cur = await this.getProduct(id);
      if (!cur) return null;
      const next: Product = { ...cur, ...patch };
      db.prepare(
        `UPDATE products SET
          name=@name, category=@category, vendor=@vendor, purchaseDate=@purchaseDate, purchaseCost=@purchaseCost,
          warrantyExpiry=@warrantyExpiry, serialNumber=@serialNumber, assignedTo=@assignedTo, status=@status, notes=@notes
         WHERE id=@id`,
      ).run({ ...next, id });
      return next;
    },
    async deleteProduct(id: string): Promise<boolean> {
      const info = db.prepare("DELETE FROM products WHERE id = ?").run(id);
      return info.changes > 0;
    },

    // Subscriptions
    async listSubscriptions(): Promise<Subscription[]> {
      return db.prepare("SELECT * FROM subscriptions ORDER BY createdAt DESC").all().map(row<Subscription>);
    },
    async getSubscription(id: string): Promise<Subscription | null> {
      return (db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id) as Subscription | undefined) ?? null;
    },
    async createSubscription(input: Omit<Subscription, "id" | "createdAt">): Promise<Subscription> {
      const s: Subscription = { ...input, id: randomUUID(), createdAt: isoDateOnly() };
      db.prepare(
        `INSERT INTO subscriptions(id,name,provider,planType,amount,billingCycle,startDate,renewalDate,paymentMethod,payerName,payerEmail,status,reminderDaysBefore,notes,createdAt)
         VALUES(@id,@name,@provider,@planType,@amount,@billingCycle,@startDate,@renewalDate,@paymentMethod,@payerName,@payerEmail,@status,@reminderDaysBefore,@notes,@createdAt)`,
      ).run(s);
      return s;
    },
    async updateSubscription(id: string, patch: Partial<Omit<Subscription, "id" | "createdAt">>): Promise<Subscription | null> {
      const cur = await this.getSubscription(id);
      if (!cur) return null;
      const next: Subscription = { ...cur, ...patch };
      db.prepare(
        `UPDATE subscriptions SET
          name=@name, provider=@provider, planType=@planType, amount=@amount, billingCycle=@billingCycle,
          startDate=@startDate, renewalDate=@renewalDate, paymentMethod=@paymentMethod, payerName=@payerName, payerEmail=@payerEmail, status=@status,
          reminderDaysBefore=@reminderDaysBefore, notes=@notes
         WHERE id=@id`,
      ).run({ ...next, id });
      return next;
    },
    async deleteSubscription(id: string): Promise<boolean> {
      const info = db.prepare("DELETE FROM subscriptions WHERE id = ?").run(id);
      return info.changes > 0;
    },

    // Rent
    async listRentRecords(): Promise<RentRecord[]> {
      return db.prepare("SELECT * FROM rent_records ORDER BY createdAt DESC").all().map(row<RentRecord>);
    },
    async getRentRecord(id: string): Promise<RentRecord | null> {
      return (db.prepare("SELECT * FROM rent_records WHERE id = ?").get(id) as RentRecord | undefined) ?? null;
    },
    async createRentRecord(input: Omit<RentRecord, "id" | "createdAt">): Promise<RentRecord> {
      const r: RentRecord = { ...input, id: randomUUID(), createdAt: isoDateOnly() };
      db.prepare(
        `INSERT INTO rent_records(id,title,propertyType,contactName,payerName,payerEmail,rentAmount,paymentFrequency,dueDate,contractStartDate,contractEndDate,status,notes,createdAt)
         VALUES(@id,@title,@propertyType,@contactName,@payerName,@payerEmail,@rentAmount,@paymentFrequency,@dueDate,@contractStartDate,@contractEndDate,@status,@notes,@createdAt)`,
      ).run(r);
      return r;
    },
    async updateRentRecord(id: string, patch: Partial<Omit<RentRecord, "id" | "createdAt">>): Promise<RentRecord | null> {
      const cur = await this.getRentRecord(id);
      if (!cur) return null;
      const next: RentRecord = { ...cur, ...patch };
      db.prepare(
        `UPDATE rent_records SET
          title=@title, propertyType=@propertyType, contactName=@contactName, payerName=@payerName, payerEmail=@payerEmail, rentAmount=@rentAmount, paymentFrequency=@paymentFrequency,
          dueDate=@dueDate, contractStartDate=@contractStartDate, contractEndDate=@contractEndDate, status=@status, notes=@notes
         WHERE id=@id`,
      ).run({ ...next, id });
      return next;
    },
    async deleteRentRecord(id: string): Promise<boolean> {
      const info = db.prepare("DELETE FROM rent_records WHERE id = ?").run(id);
      return info.changes > 0;
    },

    // Reminders
    async listReminders(): Promise<Reminder[]> {
      return db.prepare("SELECT * FROM reminders ORDER BY createdAt DESC").all().map(row<Reminder>);
    },
    async getReminder(id: string): Promise<Reminder | null> {
      return (db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as Reminder | undefined) ?? null;
    },
    async createReminder(input: Omit<Reminder, "id" | "createdAt">): Promise<Reminder> {
      const r: Reminder = { ...input, id: randomUUID(), createdAt: isoDateOnly() };
      db.prepare(
        `INSERT INTO reminders(id,title,relatedType,relatedId,reminderDate,priority,status,message,createdAt)
         VALUES(@id,@title,@relatedType,@relatedId,@reminderDate,@priority,@status,@message,@createdAt)`,
      ).run(r);
      return r;
    },
    async updateReminder(id: string, patch: Partial<Omit<Reminder, "id" | "createdAt">>): Promise<Reminder | null> {
      const cur = await this.getReminder(id);
      if (!cur) return null;
      const next: Reminder = { ...cur, ...patch };
      db.prepare(
        `UPDATE reminders SET
          title=@title, relatedType=@relatedType, relatedId=@relatedId, reminderDate=@reminderDate,
          priority=@priority, status=@status, message=@message
         WHERE id=@id`,
      ).run({ ...next, id });
      return next;
    },
    async deleteReminder(id: string): Promise<boolean> {
      const info = db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
      return info.changes > 0;
    },

    // Activity
    async listActivity(): Promise<ActivityLog[]> {
      return db.prepare("SELECT * FROM activity_log ORDER BY timestamp DESC").all().map(row<ActivityLog>);
    },
    async addActivity(input: Omit<ActivityLog, "id" | "timestamp"> & { timestamp?: string }): Promise<ActivityLog> {
      const a: ActivityLog = {
        id: randomUUID(),
        timestamp: input.timestamp ?? new Date().toISOString(),
        action: input.action,
        recordType: input.recordType,
        recordName: input.recordName,
      };
      db.prepare(
        `INSERT INTO activity_log(id,action,recordType,recordName,timestamp)
         VALUES(@id,@action,@recordType,@recordName,@timestamp)`,
      ).run(a);
      return a;
    },
  };
}

function coll<T extends { id: string }>(client: MongoClient, name: string): Collection<T> {
  const dbName = process.env.MONGODB_DB || "wegomanage";
  return client.db(dbName).collection<T>(name);
}

export function mongoRepo(client: MongoClient): Repo {
  const settings = client.db(process.env.MONGODB_DB || "wegomanage").collection<{ key: string; value: string }>("settings");
  const products = coll<Product>(client, "products");
  const subscriptions = coll<Subscription>(client, "subscriptions");
  const rentRecords = coll<RentRecord>(client, "rent_records");
  const reminders = coll<Reminder>(client, "reminders");
  const activity = coll<ActivityLog>(client, "activity_log");

  return {
    async getSetting(key: string) {
      const doc = await settings.findOne({ key });
      return doc?.value ?? null;
    },
    async setSetting(key: string, value: string) {
      await settings.updateOne({ key }, { $set: { key, value } }, { upsert: true });
    },

    async listProducts() {
      return await products.find({}).sort({ createdAt: -1 }).toArray();
    },
    async getProduct(id: string) {
      return await products.findOne({ id });
    },
    async createProduct(input) {
      const p: Product = { ...input, id: randomUUID(), createdAt: isoDateOnly() };
      await products.insertOne(p);
      return p;
    },
    async updateProduct(id, patch) {
      const cur = await products.findOne({ id });
      if (!cur) return null;
      const next: Product = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt };
      await products.updateOne({ id }, { $set: next });
      return next;
    },
    async deleteProduct(id) {
      const res = await products.deleteOne({ id });
      return res.deletedCount > 0;
    },

    async listSubscriptions() {
      return await subscriptions.find({}).sort({ createdAt: -1 }).toArray();
    },
    async getSubscription(id: string) {
      return await subscriptions.findOne({ id });
    },
    async createSubscription(input) {
      const s: Subscription = { ...input, id: randomUUID(), createdAt: isoDateOnly() };
      await subscriptions.insertOne(s);
      return s;
    },
    async updateSubscription(id, patch) {
      const cur = await subscriptions.findOne({ id });
      if (!cur) return null;
      const next: Subscription = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt };
      await subscriptions.updateOne({ id }, { $set: next });
      return next;
    },
    async deleteSubscription(id) {
      const res = await subscriptions.deleteOne({ id });
      return res.deletedCount > 0;
    },

    async listRentRecords() {
      return await rentRecords.find({}).sort({ createdAt: -1 }).toArray();
    },
    async getRentRecord(id: string) {
      return await rentRecords.findOne({ id });
    },
    async createRentRecord(input) {
      const r: RentRecord = { ...input, id: randomUUID(), createdAt: isoDateOnly() };
      await rentRecords.insertOne(r);
      return r;
    },
    async updateRentRecord(id, patch) {
      const cur = await rentRecords.findOne({ id });
      if (!cur) return null;
      const next: RentRecord = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt };
      await rentRecords.updateOne({ id }, { $set: next });
      return next;
    },
    async deleteRentRecord(id) {
      const res = await rentRecords.deleteOne({ id });
      return res.deletedCount > 0;
    },

    async listReminders() {
      return await reminders.find({}).sort({ createdAt: -1 }).toArray();
    },
    async getReminder(id: string) {
      return await reminders.findOne({ id });
    },
    async createReminder(input) {
      const r: Reminder = { ...input, id: randomUUID(), createdAt: isoDateOnly() };
      await reminders.insertOne(r);
      return r;
    },
    async updateReminder(id, patch) {
      const cur = await reminders.findOne({ id });
      if (!cur) return null;
      const next: Reminder = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt };
      await reminders.updateOne({ id }, { $set: next });
      return next;
    },
    async deleteReminder(id) {
      const res = await reminders.deleteOne({ id });
      return res.deletedCount > 0;
    },

    async listActivity() {
      return await activity.find({}).sort({ timestamp: -1 }).toArray();
    },
    async addActivity(input) {
      const a: ActivityLog = {
        id: randomUUID(),
        timestamp: input.timestamp ?? new Date().toISOString(),
        action: input.action,
        recordType: input.recordType,
        recordName: input.recordName,
      };
      await activity.insertOne(a);
      return a;
    },
  };
}


