import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import { openDb, migrate } from "./db.js";
import { registerRoutes } from "./routes.js";
import { connectMongo, disconnectMongo } from "./mongo.js";
import { mongoRepo, sqliteRepo } from "./repo.js";
import { requireAuth } from "./auth.js";
import { startEmailAutomation } from "./automation.js";

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

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "wegomanage-backend" });
  });

  // Protect all API routes except login.
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    if (req.path === "/api/auth/login") return next();
    return requireAuth(req, res, next);
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

