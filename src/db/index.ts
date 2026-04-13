import { createDb } from "@convstack/service-sdk/db";
import * as schema from "./schema";

export const db = createDb();
export type Database = typeof db;
export { schema };
