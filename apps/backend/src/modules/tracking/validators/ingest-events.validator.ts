import { z } from "zod";

import {
  baseEventSchema
} from "@workforce/shared-validation";

export const ingestEventsSchema =
  z.object({
    events: z.array(
      baseEventSchema
    )
  });