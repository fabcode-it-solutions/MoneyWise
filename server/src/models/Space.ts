import { Schema, model, Types, InferSchemaType } from "mongoose";

const spaceMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    nickname: { type: String, required: true, trim: true, maxlength: 64 },
    role: { type: String, required: true, enum: ["owner", "member"] },
    status: { type: String, required: true, enum: ["pending", "active"] },
    invitedAt: { type: Date, default: () => new Date() },
    joinedAt: { type: Date, default: null },
  },
  { _id: false }
);

const spaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 64 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    members: { type: [spaceMemberSchema], default: [] },
  },
  { timestamps: true }
);

spaceSchema.index({ "members.userId": 1 });

export type Space = InferSchemaType<typeof spaceSchema> & { _id: Types.ObjectId };
export const SpaceModel = model("Space", spaceSchema);

// Global cap on how many Hubs can exist across the whole app (confirmed with user).
export const MAX_SPACES_GLOBAL = 3;
