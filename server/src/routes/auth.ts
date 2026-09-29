import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import passport from "../middleware/passport.js";
import { UserModel } from "../models/User.js";
import { ExpenseModel } from "../models/Expense.js";
import { SummaryModel } from "../models/Summary.js";
import { SpaceModel } from "../models/Space.js";
import { getSpaceConnection } from "../lib/spaceDb.js";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authRequired } from "../middleware/auth.js";
import { generateCsrfToken } from "../middleware/csrf.js";

const router = Router();

// H1: Minimum 12 chars, requires upper, lower, digit, and special character.
// H2: Hard cap at 72 bytes — bcrypt silently truncates beyond this boundary.
const PASSWORD_RULES =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{12,72}$/;

function validatePassword(password: string): string | null {
  if (password.length > 72) return "Password must be 72 characters or fewer";
  if (!PASSWORD_RULES.test(password))
    return "Password must be 12–72 characters and include uppercase, lowercase, a number, and a special character";
  return null;
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== "development",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: "/",
};

// C4: embed tokenVersion (tv) in the JWT so authRequired can verify it against
// the DB and immediately detect revoked sessions (e.g. after password change).
function signAndSetCookie(res: Response, userId: string, tokenVersion: number): string {
  const options: SignOptions = { expiresIn: config.jwtExpiresIn };
  const token = jwt.sign({ userId, tv: tokenVersion }, config.jwtSecret, options);
  res.cookie("sw_session", token, COOKIE_OPTS);
  return token;
}

// C1: Issue a CSRF token. The browser sends it back as x-csrf-token on every
// state-changing request; doubleCsrfProtection validates header vs. cookie.
function googleEnabled(_req: any, res: any, next: any) {
  if (!config.googleClientId || !config.googleClientSecret) {
    return res.status(503).json({ error: "Google Sign-In is not configured" });
  }
  next();
}

router.get(
  "/google",
  googleEnabled,
  passport.authenticate("google", { session: false, scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  googleEnabled,
  passport.authenticate("google", { session: false, failureRedirect: "/api/auth/google/failure" }),
  (req, res) => {
    const user = (req as any).user;
    signAndSetCookie(res, user._id.toString(), user.tokenVersion ?? 0);
    res.redirect(config.frontendUrl);
  }
);

router.get("/google/failure", (_req, res) => {
  res.redirect(`${config.frontendUrl}/?auth_error=google_failed`);
});

router.get("/csrf", (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ token });
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password required" });
    }
    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const existing = await UserModel.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await UserModel.create({ email: normalizedEmail, passwordHash });
      const token = signAndSetCookie(res, user._id.toString(), user.tokenVersion ?? 0);
      return res.status(201).json({ token, user: { id: user._id, email: user.email } });
    } catch (err: any) {
      if (err.code === 11000) return res.status(409).json({ error: "Email already registered" });
      throw err;
    }
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (!user.passwordHash) return res.status(401).json({ error: "This account uses Google Sign-In. Please sign in with Google." });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signAndSetCookie(res, user._id.toString(), user.tokenVersion ?? 0);
    return res.json({ token, user: { id: user._id, email: user.email } });
  })
);

router.post("/logout", (_req, res) => {
  res.clearCookie("sw_session", {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict",
    path: "/",
  });
  res.json({ message: "Logged out" });
});

router.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({
      id: user._id,
      email: user.email,
      createdAt: user.createdAt,
      timezone: user.timezone ?? "",
    });
  })
);

router.put(
  "/timezone",
  authRequired,
  asyncHandler(async (req, res) => {
    const { timezone } = req.body ?? {};
    if (typeof timezone !== "string" || !timezone.trim() || timezone.length > 64) {
      return res.status(400).json({ error: "timezone is required" });
    }
    try {
      // Intl throws RangeError for anything that isn't a real IANA zone name.
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      return res.status(400).json({ error: "Invalid timezone" });
    }
    await UserModel.updateOne({ _id: req.userId }, { $set: { timezone } });
    return res.json({ message: "Timezone updated" });
  })
);

router.put(
  "/password",
  authRequired,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }
    const pwErr = validatePassword(newPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const user = await UserModel.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.passwordHash) return res.status(400).json({ error: "Google Sign-In accounts do not have a password" });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

    // C4: Increment tokenVersion to invalidate all existing sessions (including
    // any stolen cookies), then re-issue a fresh cookie for the current request.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    const token = signAndSetCookie(res, user._id.toString(), user.tokenVersion);
    return res.json({ token, message: "Password updated successfully" });
  })
);

// Permanent account deletion. The authenticated user's own data is removed
// (personal expenses, AI summaries, owned Hubs with their per-Hub databases).
// For Hubs the user only belongs to, they are removed from the member list so
// the remaining members' shared ledger is preserved. The session cookie is
// cleared and all JWTs are dead because the user document no longer exists.
router.delete(
  "/account",
  authRequired,
  asyncHandler(async (req, res) => {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Confirmation required" });
    }
    const userId = req.userId;

    // Personal ledger + AI summaries.
    await ExpenseModel.deleteMany({ userId });
    await SummaryModel.deleteMany({ userId });

    // Hubs the user owns: drop the per-Hub database (shared expenses) and the
    // Hub document itself. Hubs where the user is only a member: remove the
    // membership so the other members' shared ledger survives.
    const ownedSpaces = await SpaceModel.find({ ownerId: userId }).select("_id").lean();
    for (const space of ownedSpaces) {
      await getSpaceConnection(space._id.toString()).dropDatabase();
    }
    await SpaceModel.deleteMany({ ownerId: userId });
    await SpaceModel.updateMany(
      { members: { $elemMatch: { userId } } },
      { $pull: { members: { userId } } }
    );

    await UserModel.findByIdAndDelete(userId);

    res.clearCookie("sw_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      path: "/",
    });
    return res.json({ message: "Account deleted" });
  })
);

export default router;
