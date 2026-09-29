import { Router, Request } from "express";
import mongoose, { Model } from "mongoose";
import { createHash } from "node:crypto";
import { asyncHandler } from "../middleware/asyncHandler.js";

export interface ExpenseCrudOptions {
  getModel: (req: Request) => Model<any>;
  // Extra filter merged into every list/update/delete query — the personal
  // ledger scopes to { userId: req.userId }; a Space's ledger needs no extra
  // filter since the whole database is already scoped to that one Space.
  scopeFilter: (req: Request) => Record<string, unknown>;
  // Fields stamped onto every newly created document (owner identity).
  stampOwner: (req: Request) => Record<string, unknown>;
  notify: (req: Request) => void;
  // Extra optional fields (beyond type/amount/category/date/note/currency)
  // this ledger's schema supports on create/update/bulk — e.g. "familyMember"
  // for the personal ledger, none for a Space ledger.
  extraFields?: string[];
  // Runs before the ledger list is read (lazy recurring catch-up). Personal
  // route passes processRecurringForUser; a Space route passes
  // processRecurringForSpace. Must be fast: it only touches due templates.
  beforeList?: (req: Request) => Promise<void>;
}

export function createExpenseCrudRouter(options: ExpenseCrudOptions): Router {
  const { getModel, scopeFilter, stampOwner, notify, extraFields = [], beforeList } = options;
  const router = Router({ mergeParams: true });

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      if (beforeList) await beforeList(req);
      const expenses = await getModel(req).find({ ...scopeFilter(req) }).sort({ date: -1 }).lean();
      // Poll/Pusher-triggered refetches usually see no change. An ETag lets
      // the browser's own HTTP cache skip re-transferring the body when the
      // ledger is identical to what the client already has.
      const etag = `"${createHash("sha1").update(JSON.stringify(expenses)).digest("hex")}"`;
      res.set("Cache-Control", "no-cache");
      res.set("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }
      return res.json(expenses);
    })
  );

  router.get(
    "/recurring",
    asyncHandler(async (req, res) => {
      const recurring = await getModel(req)
        .find({ ...scopeFilter(req), "recurrence.isActive": true })
        .sort({ "recurrence.nextDueDate": 1 })
        .lean();
      return res.json(recurring);
    })
  );

  router.put(
    "/:id/recurring",
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const { frequency, endDate, isActive, nextDueDate } = req.body ?? {};
      const updates: Record<string, unknown> = {};

      if (frequency !== undefined) updates["recurrence.frequency"] = frequency;
      if (endDate !== undefined) updates["recurrence.endDate"] = endDate ? new Date(endDate) : null;
      if (isActive !== undefined) updates["recurrence.isActive"] = isActive;
      if (nextDueDate !== undefined) updates["recurrence.nextDueDate"] = new Date(nextDueDate);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid recurrence fields to update" });
      }

      const expense = await getModel(req).findOneAndUpdate(
        { _id: req.params.id, ...scopeFilter(req), recurrence: { $ne: null } },
        { $set: updates },
        { new: true }
      );

      if (!expense) return res.status(404).json({ error: "Recurring transaction not found" });
      notify(req);
      return res.json(expense);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { type, amount, category, date, name = "", note = "", currency = "USD", recurrence } = req.body ?? {};

      if (!type || !["income", "expense"].includes(type)) {
        return res.status(400).json({ error: "type must be 'income' or 'expense'" });
      }
      if (typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }
      if (!category || typeof category !== "string") {
        return res.status(400).json({ error: "category is required" });
      }
      if (!date) {
        return res.status(400).json({ error: "date is required" });
      }

      const doc: Record<string, any> = {
        ...stampOwner(req),
        type,
        amount,
        category,
        date,
        name,
        note,
        currency,
      };
      if (extraFields.includes("familyMember")) {
        doc.familyMember = req.body?.familyMember ?? "";
      }

      if (recurrence && recurrence.frequency) {
        doc.recurrence = {
          frequency: recurrence.frequency,
          nextDueDate: recurrence.nextDueDate || date,
          endDate: recurrence.endDate || null,
          isActive: recurrence.isActive !== false,
        };
      }

      const expense = await getModel(req).create(doc);
      notify(req);
      return res.status(201).json(expense);
    })
  );

  router.put(
    "/:id",
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const allowed = ["type", "amount", "category", "date", "name", "note", "currency", ...extraFields];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body?.[key] !== undefined) updates[key] = req.body[key];
      }

      if (req.body?.recurrence !== undefined) {
        const rec = req.body.recurrence;
        if (rec && rec.frequency) {
          updates["recurrence"] = {
            frequency: rec.frequency,
            nextDueDate: rec.nextDueDate || req.body?.date || new Date(),
            endDate: rec.endDate || null,
            isActive: rec.isActive !== false,
          };
        } else if (rec === null) {
          updates["recurrence"] = null;
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const expense = await getModel(req).findOneAndUpdate(
        { _id: req.params.id, ...scopeFilter(req) },
        { $set: updates },
        { new: true }
      );

      if (!expense) return res.status(404).json({ error: "Expense not found" });
      notify(req);
      return res.json(expense);
    })
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const expense = await getModel(req).findOneAndDelete({ _id: req.params.id, ...scopeFilter(req) });
      if (!expense) return res.status(404).json({ error: "Expense not found" });
      notify(req);
      return res.json({ message: "Deleted" });
    })
  );

  router.delete(
    "/",
    asyncHandler(async (req, res) => {
      if (req.body?.confirm !== true) {
        return res.status(400).json({ error: "Confirmation required" });
      }
      await getModel(req).deleteMany({ ...scopeFilter(req) });
      notify(req);
      return res.json({ message: "All expenses deleted" });
    })
  );

  router.post(
    "/bulk",
    asyncHandler(async (req, res) => {
      const { rows } = req.body ?? {};
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "rows must be a non-empty array" });
      }
      if (rows.length > 500) {
        return res.status(400).json({ error: "Maximum 500 rows per bulk import" });
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.type || !["income", "expense"].includes(row.type)) {
          return res.status(400).json({ error: `Row ${i + 1}: type must be 'income' or 'expense'` });
        }
        if (typeof row.amount !== "number" || row.amount <= 0) {
          return res.status(400).json({ error: `Row ${i + 1}: amount must be a positive number` });
        }
        if (!row.category || typeof row.category !== "string") {
          return res.status(400).json({ error: `Row ${i + 1}: category is required` });
        }
        if (!row.date) {
          return res.status(400).json({ error: `Row ${i + 1}: date is required` });
        }
      }

      const stamp = stampOwner(req);
      const docs = rows.map((row: any) => {
        const doc: Record<string, any> = {
          ...stamp,
          type: row.type,
          amount: row.amount,
          category: row.category,
          date: row.date,
          name: row.name ?? "",
          note: row.note ?? "",
          currency: row.currency ?? "USD",
        };
        if (extraFields.includes("familyMember")) {
          doc.familyMember = row.familyMember ?? "";
        }
        return doc;
      });

      const result = await getModel(req).insertMany(docs);
      notify(req);
      return res.status(201).json({ count: result.length });
    })
  );

  return router;
}
