import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { ExpenseModel } from "../models/Expense.js";
import { notifyDataChanged } from "../lib/pusher.js";
import { createExpenseCrudRouter } from "../lib/expenseHandlers.js";
import { processRecurringForUser } from "../lib/recurringScheduler.js";

const router = Router();
router.use(authRequired);

router.use(
  createExpenseCrudRouter({
    getModel: () => ExpenseModel,
    scopeFilter: (req) => ({ userId: req.userId }),
    stampOwner: (req) => ({ userId: req.userId }),
    notify: (req) => notifyDataChanged(req.userId!),
    extraFields: ["familyMember"],
    beforeList: (req) => processRecurringForUser(req.userId!),
  })
);

export default router;
