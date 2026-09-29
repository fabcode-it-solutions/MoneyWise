import { Schema, model, Types, InferSchemaType } from "mongoose";

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

const expenseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true, enum: ["income", "expense"] },
    amount: { type: Number, required: true, min: 0, max: 1e12 },
    category: { type: String, required: true, trim: true, maxlength: 64 },
    currency: { type: String, default: "USD", trim: true, maxlength: 8 },
    familyMember: { type: String, default: "", trim: true, maxlength: 64 },
    name: { type: String, default: "", trim: true, maxlength: 120 },
    note: { type: String, default: "", trim: true, maxlength: 500 },
    date: { type: Date, required: true, default: () => new Date() },
    recurrence: { type: recurrenceSchema, default: null },
  },
  { timestamps: true }
);

// Serves the main per-user list query (find({userId}).sort({date:-1})) and,
// via the userId prefix, the plain-equality deleteMany({userId}) used by
// "delete all". Replaces the old single-field userId index.
expenseSchema.index({ userId: 1, date: -1 });
// Serves the recurring scheduler's cross-user scan
// (find({"recurrence.isActive":true,"recurrence.nextDueDate":{$lte:now}})),
// which has no userId to filter by.
expenseSchema.index({ "recurrence.isActive": 1, "recurrence.nextDueDate": 1 });
// Serves the per-user lazy catch-up on ledger reads
// (find({userId, "recurrence.isActive":true, "recurrence.nextDueDate":{$lte:now}})).
expenseSchema.index({ userId: 1, "recurrence.isActive": 1, "recurrence.nextDueDate": 1 });

export type Expense = InferSchemaType<typeof expenseSchema> & { _id: Types.ObjectId };
export const ExpenseModel = model("Expense", expenseSchema);
