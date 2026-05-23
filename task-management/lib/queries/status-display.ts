import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { statusSettings } from "@/db/schema";
import {
  mergeStatusDisplay,
  type StatusDisplay,
  type StatusDisplayMap,
} from "./status-display-merge";

export type { StatusDisplay, StatusDisplayMap };
export { mergeStatusDisplay };

export const getStatusDisplayMap = cache(
  async (): Promise<StatusDisplayMap> => {
    const rows = await db
      .select({
        status: statusSettings.status,
        label: statusSettings.label,
        colorToken: statusSettings.colorToken,
      })
      .from(statusSettings);
    return mergeStatusDisplay(rows);
  },
);
