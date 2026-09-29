import jwt from "jsonwebtoken";
import { UserModel } from "../../src/models/User.js";

export interface TestUser {
  _id: import("mongoose").Types.ObjectId;
  token: string;
  email: string;
}

/**
 * Create a user directly in the test DB and return a valid session JWT that
 * authRequired will accept (same secret as config.jwtSecret).
 */
export async function createUser(overrides: { email?: string; tokenVersion?: number } = {}): Promise<TestUser> {
  const email = overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const user = await UserModel.create({
    email,
    passwordHash: "$2b$12$C6UzMDM.H6dfI/f/IKcEeO3bDqW9S7F3yYxYxYxYxYxYxYxYxYxY",
    tokenVersion: overrides.tokenVersion ?? 0,
  });
  const token = jwt.sign(
    { userId: user._id.toString(), tv: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
  return { _id: user._id, token, email };
}

/** A fresh, deterministic email for register tests (unique per call). */
export function uniqueEmail(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
}
