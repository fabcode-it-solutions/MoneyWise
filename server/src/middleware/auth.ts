import { Request, Response, NextFunction } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config.js";
import { UserModel } from "../models/User.js";

interface JwtPayload {
  userId: string;
  tv: number; // C4: token version for server-side revocation
  exp?: number;
}

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // slide if < 1 day left

function maybeRefreshSession(res: Response, payload: JwtPayload): void {
  const exp = (payload.exp ?? 0) * 1000;
  if (Date.now() < exp - REFRESH_THRESHOLD_MS) return;
  const token = jwt.sign(
    { userId: payload.userId, tv: payload.tv },
    config.jwtSecret,
    { expiresIn: "7d" } as SignOptions
  );
  res.cookie("sw_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict" as const,
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

export async function authRequired(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Cookie (web) or Bearer token (mobile)
  let token = req.cookies?.sw_session;
  if (!token) {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) token = auth.slice(7);
  }
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Step 1: verify JWT signature and expiry (pure crypto, no DB)
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as JwtPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  // C4: Step 2: check tokenVersion against DB so password changes / explicit
  // revocation take effect immediately rather than waiting for JWT expiry.
  // Fetch full user (minus password) so downstream route handlers like /me
  // avoid a redundant DB query.
  try {
    const user = await UserModel.findById(payload.userId).select("-passwordHash").lean();
    if (!user || (user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
      res.status(401).json({ error: "Session invalidated — please log in again" });
      return;
    }
    (req as any).user = user;
  } catch (err) {
    next(err);
    return;
  }

  maybeRefreshSession(res, payload);
  req.userId = payload.userId;
  next();
}
