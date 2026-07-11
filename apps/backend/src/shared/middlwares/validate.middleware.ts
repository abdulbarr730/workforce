import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { AppError } from "../utils/app-error";

export const validate =
  (schema: ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        require("fs").writeFileSync("validation-error.txt", messages);
        return next(new AppError(`Validation failed: ${messages}`, 400));
      }
      return next(error);
    }
  };
