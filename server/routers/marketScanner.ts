import { z } from "zod";
import { ownerProcedure, router } from "../_core/trpc.js";
import { scanMarket } from "../marketScanner.js";

export const marketScannerRouter = router({
  scan: ownerProcedure
    .input(z.object({
      market: z.enum(["stocks", "crypto"]),
      mode: z.enum(["consolidation", "bottom"]).default("consolidation"),
      daysToLookback: z.number().int().min(5).max(250).default(22),
      consolidationPercentage: z.number().min(0.1).max(50).default(10),
      minPrice: z.number().min(0),
      maxPrice: z.number().positive(),
      minVolume: z.number().min(0).default(0),
    }))
    .query(({ input }) => scanMarket(input)),
});
