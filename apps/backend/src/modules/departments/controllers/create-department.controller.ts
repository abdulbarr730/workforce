import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { createDepartmentSchema } from "../validators/create-department.validator";
import { createDepartment } from "../services/create-department.service";
import { dispatchCrmWebhook } from "../../crm/services/crm-webhook.service";

export const createDepartmentController = asyncHandler(
  async (
    req: Request,
    res: Response,
  ) => {
    const validatedData = createDepartmentSchema.parse(req.body);

    const result = await createDepartment(validatedData);

    // Trigger CRM Webhook asynchronously
    dispatchCrmWebhook("department.created", result);

    return res.status(201).json(
      successResponse(
        result,
        "Department created successfully",
      ),
    );
  },
);
