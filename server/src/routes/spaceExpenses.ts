import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { spaceScope } from "../middleware/spaceScope.js";
import { notifySpaceDataChanged } from "../lib/pusher.js";
import { createExpenseCrudRouter } from "../lib/expenseHandlers.js";
import { processRecurringForSpace } from "../lib/recurringScheduler.js";

const router = Router({ mergeParams: true });
router.use(authRequired);
router.use(spaceScope);

router.use(
  createExpenseCrudRouter({
    getModel: (req) => req.spaceExpenseModel!,
    // No extra filter: the whole database is already scoped to this one Hub,
    // and any active member may edit/delete any entry in it (shared ledger).
    scopeFilter: () => ({}),
    stampOwner: (req) => ({ authorUserId: req.userId }),
    notify: (req) => notifySpaceDataChanged(req.params.spaceId),
    beforeList: (req) => processRecurringForSpace(req.params.spaceId),
  })
);

export default router;
