import {
  Request,
  Response
} from "express";

import { ZodError } from "zod";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { ingestEventsSchema } from "../validators/ingest-events.validator";

import { ingestEvents } from "../services/ingest-events.service";

export const ingestEventsController =
  asyncHandler(
    async (
      req: Request,

      res: Response
    ) => {
      try {
        /*
          Full payload logging
        */

        console.log(
          "Incoming tracking payload:"
        );

        console.log(
          JSON.stringify(
            req.body,
            null,
            2
          )
        );

        /*
          Validate payload
        */

        const validatedData = ingestEventsSchema.parse({
          body: req.body
        });

        console.log(
          `Received ${validatedData.body.events.length} tracking events`
        );

        /*
          Process ingestion
        */

        const result =
          await ingestEvents(
            validatedData.body
          );

        return res.status(201).json(
          successResponse(
            result,

            "Events ingested successfully"
          )
        );
      } catch (error) {
        /*
          Zod validation debugging
        */

        if (
          error instanceof
          ZodError
        ) {
          console.error(
            "Tracking validation failed:"
          );

          console.error(
            JSON.stringify(
              error.issues,
              null,
              2
            )
          );

          return res.status(400).json({
            success: false,

            message:
              "Tracking validation failed",

            errors:
              error.issues
          });
        }

        /*
          Unknown errors
        */

        console.error(
          "Tracking ingestion failed:"
        );

        console.error(error);

        return res.status(500).json({
          success: false,

          message:
            "Tracking ingestion failed",

          error:
            error instanceof Error
              ? error.message
              : "Unknown error"
        });
      }
    }
  );