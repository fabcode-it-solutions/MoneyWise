import mongoose, { Connection, Model } from "mongoose";
import { compileSpaceExpenseModel, SpaceExpense } from "../models/SpaceExpense.js";

function dbNameForSpace(spaceId: string): string {
  return `space_${spaceId}`;
}

// mongoose.connection.useDb(name, { useCache: true }) returns the same Connection
// object for a given db name on repeat calls, reusing the underlying connection
// pool from the main mongoose.connect() call in db.ts — this is what makes each
// Space a genuinely separate MongoDB database without managing N connection pools.
export function getSpaceConnection(spaceId: string): Connection {
  return mongoose.connection.useDb(dbNameForSpace(spaceId), { useCache: true });
}

export function getSpaceExpenseModel(spaceId: string): Model<SpaceExpense> {
  return compileSpaceExpenseModel(getSpaceConnection(spaceId));
}
