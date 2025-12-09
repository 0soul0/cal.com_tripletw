import { z } from "zod";

import { timeZoneSchema } from "@calcom/lib/dayjs/timeZone.schema";

export const ZUpdateInputSchema = z.object({
  scheduleId: z.number(),
  timeZone: timeZoneSchema.optional(),
  name: z.string().optional(),
  isDefault: z.boolean().optional(),
  schedule: z
    .array(
      z.array(
        z.object({
          start: z.date(),
          end: z.date(),
          bookings: z.coerce.number().min(0).nullable().optional(),
        })
      )
    )
    .optional(),
  dateOverrides: z
    .array(
      z.object({
        start: z.date(),
        end: z.date(),
        bookings: z.coerce.number().min(0).nullable().optional(),
      })
    )
    .optional(),
});

export type TUpdateInputSchema = z.infer<typeof ZUpdateInputSchema>;
