import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Db = Database.Database;

function ensureDirForFile(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function openDb(): Db {
  const dbPath = process.env.DB_PATH || "./data/db.sqlite";
  ensureDirForFile(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function migrate(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      vendor TEXT NOT NULL,
      purchaseDate TEXT NOT NULL,
      purchaseCost REAL NOT NULL,
      warrantyExpiry TEXT NOT NULL,
      serialNumber TEXT NOT NULL,
      assignedTo TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      planType TEXT NOT NULL,
      amount REAL NOT NULL,
      billingCycle TEXT NOT NULL,
      startDate TEXT NOT NULL,
      renewalDate TEXT NOT NULL,
      paymentMethod TEXT NOT NULL,
      status TEXT NOT NULL,
      reminderDaysBefore INTEGER NOT NULL,
      payerName TEXT NOT NULL DEFAULT '',
      payerEmail TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rent_records (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      propertyType TEXT NOT NULL,
      contactName TEXT NOT NULL,
      payerName TEXT NOT NULL DEFAULT '',
      payerEmail TEXT NOT NULL DEFAULT '',
      rentAmount REAL NOT NULL,
      paymentFrequency TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      contractStartDate TEXT NOT NULL,
      contractEndDate TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      relatedType TEXT NOT NULL,
      relatedId TEXT,
      reminderDate TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      recordType TEXT NOT NULL,
      recordName TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Add columns for existing DBs (safe to run multiple times)
  const addColumnIfMissing = (table: string, column: string, defSql: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table});`).all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${defSql};`);
  };

  addColumnIfMissing("subscriptions", "payerEmail", "payerEmail TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("subscriptions", "payerName", "payerName TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("rent_records", "payerEmail", "payerEmail TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("rent_records", "payerName", "payerName TEXT NOT NULL DEFAULT ''");
}

