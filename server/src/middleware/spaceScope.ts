import { Request, Response, NextFunction } from "express";
import { Model } from "mongoose";
import { SpaceModel } from "../models/Space.js";
import { getSpaceExpenseModel } from "../lib/spaceDb.js";
import { SpaceExpense } from "../models/SpaceExpense.js";

declare global {
  namespace Express {
    interface Request {
      spaceExpenseModel?: Model<SpaceExpense>;
      space?: {
        id: string;
        role: "owner" | "member";
        nickname: string;
      };
    }
  }
}

export async function spaceScope(req: Request, res: Response, next: NextFunction): Promise<void> {
  const spaceId = req.params.spaceId;
  try {
    const space = await SpaceModel.findById(spaceId).lean();
    if (!space) {
      res.status(404).json({ error: "Hub not found" });
      return;
    }
    const membership = space.members.find(
      (m) => String(m.userId) === req.userId && m.status === "active"
    );
    if (!membership) {
      res.status(403).json({ error: "Not a member of this Hub" });
      return;
    }
    req.space = { id: spaceId, role: membership.role as "owner" | "member", nickname: membership.nickname };
    req.spaceExpenseModel = getSpaceExpenseModel(spaceId);
    next();
  } catch (err) {
    next(err);
  }
}
