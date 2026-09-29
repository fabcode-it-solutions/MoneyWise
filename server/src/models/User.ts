import { Schema, model, InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    googleId: { type: String, sparse: true, unique: true },
    passwordHash: { type: String },
    // C4: Incrementing this field invalidates all existing JWTs for this user.
    // Bump on password change so stolen tokens cannot be reused after a reset.
    tokenVersion: { type: Number, default: 0, required: true },
    // IANA timezone (e.g. "Asia/Kolkata"), detected client-side. Used to figure
    // out when "Sunday 11:59pm" actually is for this specific user.
    timezone: { type: String, default: "" },
    aiUsage: {
      type: {
        count: { type: Number, default: 0 },
        weeklyCount: { type: Number, default: 0 },
        // C7: date key (YYYY-MM-DD) of the Monday that starts the current
        // usage week — the week rolls over once "now" lands on a later Monday.
        weekStartDate: { type: String, default: "" },
      },
      default: { count: 0, weeklyCount: 0, weekStartDate: "" },
    },
  },
  { timestamps: true }
);

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
