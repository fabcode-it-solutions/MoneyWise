import mongoose from "mongoose";
import { config } from "./config.js";

let dbReady: Promise<void> | null = null;
let listenerRegistered = false;

export function getDB(): Promise<void> {
  if (!dbReady) {
    dbReady = mongoose.connect(config.mongoUri).then(() => {
      console.log("MongoDB connected");
      if (!listenerRegistered) {
        listenerRegistered = true;
        mongoose.connection.on("disconnected", () => {
          console.warn("MongoDB disconnected — will reconnect on next request");
          dbReady = null;
        });
      }
    }).catch((err) => {
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}
