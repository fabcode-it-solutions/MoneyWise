import { Router } from "express";
import mongoose from "mongoose";
import { authRequired } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { SpaceModel, MAX_SPACES_GLOBAL } from "../models/Space.js";
import { UserModel } from "../models/User.js";
import { getSpaceConnection } from "../lib/spaceDb.js";
import { notifyDataChanged } from "../lib/pusher.js";

const router = Router();
router.use(authRequired);

function normalizeNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > 64) return null;
  return name;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const spaces = await SpaceModel.find({
      members: { $elemMatch: { userId: req.userId, status: "active" } },
    }).lean();
    return res.json(spaces);
  })
);

router.get(
  "/invites",
  asyncHandler(async (req, res) => {
    const spaces = await SpaceModel.find({
      members: { $elemMatch: { userId: req.userId, status: "pending" } },
    }).lean();
    return res.json(spaces);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = normalizeNickname(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: "name is required and must be 64 characters or fewer" });
    }

    const totalSpaces = await SpaceModel.countDocuments();
    if (totalSpaces >= MAX_SPACES_GLOBAL) {
      return res.status(400).json({ error: `Maximum of ${MAX_SPACES_GLOBAL} Hubs allowed across the app` });
    }

    const requester = (req as any).user;
    const defaultNickname = requester?.email ? String(requester.email).split("@")[0] : "Owner";

    const space = await SpaceModel.create({
      name,
      ownerId: req.userId,
      members: [
        {
          userId: req.userId,
          nickname: normalizeNickname(req.body?.nickname) || defaultNickname,
          role: "owner",
          status: "active",
          invitedAt: new Date(),
          joinedAt: new Date(),
        },
      ],
    });

    return res.status(201).json(space);
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    const name = normalizeNickname(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: "name is required and must be 64 characters or fewer" });
    }

    const space = await SpaceModel.findById(req.params.id);
    if (!space) return res.status(404).json({ error: "Hub not found" });

    const requesterMembership = space.members.find(
      (m) => String(m.userId) === req.userId && m.status === "active"
    );
    if (!requesterMembership || requesterMembership.role !== "owner") {
      return res.status(403).json({ error: "Only the Hub owner can rename this Hub" });
    }

    space.name = name;
    await space.save();

    return res.json(space);
  })
);

router.post(
  "/:id/members",
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    const space = await SpaceModel.findById(req.params.id);
    if (!space) return res.status(404).json({ error: "Hub not found" });

    const requesterMembership = space.members.find(
      (m) => String(m.userId) === req.userId && m.status === "active"
    );
    if (!requesterMembership || requesterMembership.role !== "owner") {
      return res.status(403).json({ error: "Only the Hub owner can invite members" });
    }

    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email) return res.status(400).json({ error: "email is required" });
    const nickname = normalizeNickname(req.body?.nickname);
    if (!nickname) {
      return res.status(400).json({ error: "nickname is required and must be 64 characters or fewer" });
    }

    const invitee = await UserModel.findOne({ email }).select("_id");
    if (!invitee) {
      return res.status(404).json({ error: "No account found with that email" });
    }

    const alreadyMember = space.members.some((m) => String(m.userId) === String(invitee._id));
    if (alreadyMember) {
      return res.status(409).json({ error: "That person is already invited or a member of this Hub" });
    }

    space.members.push({
      userId: invitee._id,
      nickname,
      role: "member",
      status: "pending",
      invitedAt: new Date(),
      joinedAt: null,
    } as any);
    await space.save();
    await notifyDataChanged(String(invitee._id));

    return res.status(201).json(space);
  })
);

router.post(
  "/:id/invites/respond",
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    if (typeof req.body?.accept !== "boolean") {
      return res.status(400).json({ error: "accept must be a boolean" });
    }

    const space = await SpaceModel.findById(req.params.id);
    if (!space) return res.status(404).json({ error: "Hub not found" });

    const memberIndex = space.members.findIndex(
      (m) => String(m.userId) === req.userId && m.status === "pending"
    );
    if (memberIndex === -1) {
      return res.status(404).json({ error: "No pending invite for this Hub" });
    }

    if (req.body.accept) {
      space.members[memberIndex].status = "active";
      space.members[memberIndex].joinedAt = new Date();
    } else {
      space.members.splice(memberIndex, 1);
    }
    await space.save();
    await notifyDataChanged(String(space.ownerId));

    return res.json(space);
  })
);

router.patch(
  "/:id/members/:userId",
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    const nickname = normalizeNickname(req.body?.nickname);
    if (!nickname) {
      return res.status(400).json({ error: "nickname is required and must be 64 characters or fewer" });
    }

    const space = await SpaceModel.findById(req.params.id);
    if (!space) return res.status(404).json({ error: "Hub not found" });

    const requesterMembership = space.members.find((m) => String(m.userId) === req.userId);
    const isSelf = req.params.userId === req.userId;
    const isOwner = requesterMembership?.status === "active" && requesterMembership.role === "owner";
    if (!isSelf && !isOwner) {
      return res.status(403).json({ error: "Not allowed to rename this member" });
    }

    const target = space.members.find((m) => String(m.userId) === req.params.userId);
    if (!target) return res.status(404).json({ error: "Member not found" });

    target.nickname = nickname;
    await space.save();

    return res.json(space);
  })
);

router.delete(
  "/:id/members/:userId",
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const space = await SpaceModel.findById(req.params.id);
    if (!space) return res.status(404).json({ error: "Hub not found" });

    const requesterMembership = space.members.find((m) => String(m.userId) === req.userId);
    const isSelf = req.params.userId === req.userId;
    const isOwner = requesterMembership?.status === "active" && requesterMembership.role === "owner";
    if (!isSelf && !isOwner) {
      return res.status(403).json({ error: "Not allowed to remove this member" });
    }

    const targetIndex = space.members.findIndex((m) => String(m.userId) === req.params.userId);
    if (targetIndex === -1) return res.status(404).json({ error: "Member not found" });

    if (space.members[targetIndex].role === "owner") {
      return res.status(400).json({ error: "The owner cannot leave — delete the Hub instead" });
    }

    space.members.splice(targetIndex, 1);
    await space.save();

    return res.json(space);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Confirmation required" });
    }

    const space = await SpaceModel.findById(req.params.id);
    if (!space) return res.status(404).json({ error: "Hub not found" });

    const requesterMembership = space.members.find(
      (m) => String(m.userId) === req.userId && m.status === "active"
    );
    if (!requesterMembership || requesterMembership.role !== "owner") {
      return res.status(403).json({ error: "Only the Hub owner can delete this Hub" });
    }

    await getSpaceConnection(req.params.id).dropDatabase();
    await SpaceModel.findByIdAndDelete(req.params.id);

    return res.json({ message: "Hub deleted" });
  })
);

export default router;
