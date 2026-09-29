import { Schema, Types, InferSchemaType, Connection, Model } from "mongoose";

const recurrenceSchema = new Schema(
  {
    frequency: {
      type: String,
      required: true,
      enum: ["daily", "weekly", "biweekly", "monthly", "yearly"],
    },
    nextDueDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const spaceExpenseSchema = new Schema(
  {
    authorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, enum: ["income", "expense"] },
    amount: { type: Number, required: true, min: 0, max: 1e12 },
    category: { type: String, required: true, trim: true, maxlength: 64 },
    currency: { type: String, default: "USD", trim: true, maxlength: 8 },
    name: { type: String, default: "", trim: true, maxlength: 120 },
    note: { type: String, default: "", trim: true, maxlength: 500 },
    date: { type: Date, required: true, default: () => new Date() },
    recurrence: { type: recurrenceSchema, default: null },
  },
  { timestamps: true }
);

// A Hub's expense collection lives in its own per-Hub database, so its list
// query (find({}).sort({date:-1})) has no owner filter to narrow on — index
// the sort key directly.
spaceExpenseSchema.index({ date: -1 });
// Serves both the recurring scheduler's per-Hub scan and GET /recurring
// (find({"recurrence.isActive":true,...}).sort({"recurrence.nextDueDate":1})).
spaceExpenseSchema.index({ "recurrence.isActive": 1, "recurrence.nextDueDate": 1 });

export type SpaceExpense = InferSchemaType<typeof spaceExpenseSchema> & { _id: Types.ObjectId };

export function compileSpaceExpenseModel(connection: Connection): Model<SpaceExpense> {
  return (connection.models.Expense as Model<SpaceExpense>) ?? connection.model<SpaceExpense>("Expense", spaceExpenseSchema);
}
