import { Schema, model, Types, InferSchemaType } from "mongoose";

const categoryBreakdownSchema = new Schema(
  {
    category: { type: String, required: true },
    amount: { type: Number, required: true },
    count: { type: Number, required: true },
  },
  { _id: false }
);

const summarySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Monday of the summarized week, YYYY-MM-DD, in the user's timezone at generation time.
    weekStartDate: { type: String, required: true },
    weekEndDate: { type: String, required: true },
    timezone: { type: String, required: true },
    narrative: { type: String, required: true },
    stats: {
      totalIncome: { type: Number, required: true },
      totalExpense: { type: Number, required: true },
      net: { type: Number, required: true },
      transactionCount: { type: Number, required: true },
      byCategory: { type: [categoryBreakdownSchema], default: [] },
      previousWeekExpense: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

summarySchema.index({ userId: 1, weekStartDate: 1 }, { unique: true });

export type Summary = InferSchemaType<typeof summarySchema> & { _id: Types.ObjectId };
export const SummaryModel = model("Summary", summarySchema);
