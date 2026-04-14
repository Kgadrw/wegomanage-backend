import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import { openDb, migrate } from "./db.js";
import { registerRoutes } from "./routes.js";
import { connectMongo, disconnectMongo } from "./mongo.js";
import { mongoRepo, sqliteRepo } from "./repo.js";
import { hashPassword, requireAuth } from "./auth.js";
import { startEmailAutomation } from "./automation.js";
import { randomUUID } from "node:crypto";

dotenv.config();

async function start() {
  const app = express();

  const port = Number(process.env.PORT || 8080);
  const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  const extraOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Sensible defaults so production works on Render without extra configuration.
  // Override/extend anytime with FRONTEND_ORIGIN + CORS_ORIGINS.
  const defaultOrigins = [
    "http://localhost:5173",
    "https://managment.wegoconnect.net",
  ];

  const allowedOrigins = Array.from(new Set([...defaultOrigins, frontendOrigin, ...extraOrigins]));

  app.use(cors({
    origin: (origin, cb) => {
      // Allow same-origin / server-to-server calls (no Origin header).
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // eslint-disable-next-line no-console
      console.warn(`CORS blocked origin: ${origin}`);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));
  app.use(express.json());
  app.use(morgan("dev"));

  const storage = (process.env.STORAGE || "").toLowerCase();
  const preferMongo = storage ? storage === "mongo" : Boolean(process.env.MONGODB_URI);
  let repo = sqliteRepo(openDb());

  try {
    const mongoClient = await connectMongo();
    if (mongoClient) {
      // eslint-disable-next-line no-console
      console.log("MongoDB connected");
      if (preferMongo) {
        repo = mongoRepo(mongoClient);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("MongoDB skipped (MONGODB_URI not set)");
      if (preferMongo) {
        // eslint-disable-next-line no-console
        console.log("STORAGE=mongo requested but MongoDB is not configured");
      }
    }
  } catch {
    // eslint-disable-next-line no-console
    console.log("MongoDB connection failed");
    if (preferMongo) {
      // eslint-disable-next-line no-console
      console.log("STORAGE=mongo requested but MongoDB connection failed");
    }
  }

  // Only migrate SQLite if we're actually using it.
  if (!preferMongo || !process.env.MONGODB_URI) {
    const db = openDb();
    migrate(db);
    repo = sqliteRepo(db);
  }

  // Optional: reset/create a default user from env on startup.
  if (String(process.env.ADMIN_RESET_DEFAULT || "").toLowerCase() === "true") {
    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = (process.env.ADMIN_PASSWORD || "").trim();
    if (!email || !password) {
      // eslint-disable-next-line no-console
      console.warn("ADMIN_RESET_DEFAULT=true but ADMIN_EMAIL/ADMIN_PASSWORD are not set");
    } else {
      const existing = await repo.getUserByEmail(email);
      const salt = randomUUID();
      const hash = hashPassword(password, salt);
      if (!existing) {
        await repo.createUser({ email, passwordSalt: salt, passwordHash: hash });
      } else {
        await repo.updateUserCredentials(existing.id, { passwordSalt: salt, passwordHash: hash, email });
      }
      // eslint-disable-next-line no-console
      console.log("Default user credentials reset from env");
    }
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "wegomanage-backend" });
  });

  // Protect all API routes except login.
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    if (
      req.path === "/api/auth/login" ||
      req.path === "/api/auth/register" ||
      req.path === "/api/auth/refresh" ||
      req.path === "/api/auth/forgot-password" ||
      req.path === "/api/auth/reset-password"
    ) return next();
    return requireAuth(repo, req, res, next);
  });

  registerRoutes(app, repo);

  if (String(process.env.ENABLE_EMAIL_AUTOMATION || "").toLowerCase() === "true") {
    startEmailAutomation(repo);
    // eslint-disable-next-line no-console
    console.log("Email automation enabled");
  }

  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${port}`);
    console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
  });

  const shutdown = async () => {
    server.close();
    await disconnectMongo();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start();

