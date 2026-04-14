import type { User } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      user?: Pick<User, "id" | "email">;
    }
  }
}

export {};

