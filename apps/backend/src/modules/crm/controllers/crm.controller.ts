import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { User } from "../../users/model/user.model";
import { Department } from "../../departments/model/department.model";

export const getCrmEmployeesController = asyncHandler(
  async (req: Request, res: Response) => {
    const { departmentId, role, search } = req.query;

    const query: any = {};
    if (departmentId) query.departmentId = departmentId;
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search as string, $options: "i" } },
        { email: { $regex: search as string, $options: "i" } },
        { employeeId: { $regex: search as string, $options: "i" } },
      ];
    }

    const [users, departments] = await Promise.all([
      User.find(query).select("-password").sort({ name: 1 }).lean(),
      Department.find({ isActive: true }).lean(),
    ]);

    const deptMap = new Map<string, any>();
    departments.forEach((d) => {
      deptMap.set(d._id.toString(), d);
    });

    const enrichedEmployees = users.map((u: any) => {
      const dept = u.departmentId ? deptMap.get(u.departmentId.toString()) : null;
      return {
        id: u._id,
        employeeId: u.employeeId,
        name: u.name,
        email: u.email,
        role: u.role,
        department: dept
          ? {
              id: dept._id,
              name: dept.name,
              code: dept.code || null,
              description: dept.description || "",
              managerId: dept.managerId || null,
              managerName: dept.managerName || null,
            }
          : u.departmentName
            ? {
                id: u.departmentId || null,
                name: u.departmentName,
                code: null,
                description: "",
                managerId: null,
                managerName: null,
              }
            : null,
        assignedShiftPolicyId: u.assignedShiftPolicyId || null,
        schedule: {
          enforceTrackingSchedule: Boolean(u.enforceTrackingSchedule),
          trackingDays: u.trackingDays || [],
          trackingStartTime: u.trackingStartTime || "09:00",
          trackingEndTime: u.trackingEndTime || "17:00",
          trackingDaySchedules: u.trackingDaySchedules || [],
          idleExemptionDays: u.idleExemptionDays || [],
          idleExemptionStartTime: u.idleExemptionStartTime || "17:00",
          idleExemptionEndTime: u.idleExemptionEndTime || "21:00",
          idleExemptionDaySchedules: u.idleExemptionDaySchedules || [],
        },
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      };
    });

    res.status(200).json(
      successResponse(
        {
          total: enrichedEmployees.length,
          employees: enrichedEmployees,
        },
        "CRM employees fetched successfully",
      ),
    );
  },
);

export const getCrmEmployeeByIdController = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id || "");

    // Search by Mongo ID or employeeId
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
    const user: any = await User.findOne({
      $or: [{ _id: isMongoId ? id : null }, { employeeId: id }],
    })
      .select("-password")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: `Employee not found with identifier '${id}'`,
      });
    }

    let dept = null;
    if (user.departmentId) {
      dept = await Department.findById(user.departmentId).lean();
    }

    const enrichedEmployee = {
      id: user._id,
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      role: user.role,
      department: dept
        ? {
            id: dept._id,
            name: dept.name,
            code: (dept as any).code || null,
            description: dept.description || "",
            managerId: (dept as any).managerId || null,
            managerName: (dept as any).managerName || null,
          }
        : user.departmentName
          ? {
              id: user.departmentId || null,
              name: user.departmentName,
              code: null,
              description: "",
              managerId: null,
              managerName: null,
            }
          : null,
      assignedShiftPolicyId: user.assignedShiftPolicyId || null,
      schedule: {
        enforceTrackingSchedule: Boolean(user.enforceTrackingSchedule),
        trackingDays: user.trackingDays || [],
        trackingStartTime: user.trackingStartTime || "09:00",
        trackingEndTime: user.trackingEndTime || "17:00",
        trackingDaySchedules: user.trackingDaySchedules || [],
        idleExemptionDays: user.idleExemptionDays || [],
        idleExemptionStartTime: user.idleExemptionStartTime || "17:00",
        idleExemptionEndTime: user.idleExemptionEndTime || "21:00",
        idleExemptionDaySchedules: user.idleExemptionDaySchedules || [],
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json(
      successResponse(enrichedEmployee, "Employee details fetched successfully"),
    );
  },
);

export const getCrmDepartmentsController = asyncHandler(
  async (_req: Request, res: Response) => {
    const [departments, users] = await Promise.all([
      Department.find({ isActive: true }).sort({ name: 1 }).lean(),
      User.find().select("_id employeeId name email role departmentId").lean(),
    ]);

    const usersByDept = new Map<string, any[]>();
    users.forEach((u: any) => {
      const dId = u.departmentId?.toString();
      if (dId) {
        if (!usersByDept.has(dId)) usersByDept.set(dId, []);
        usersByDept.get(dId)!.push({
          id: u._id,
          employeeId: u.employeeId,
          name: u.name,
          email: u.email,
          role: u.role,
        });
      }
    });

    const enrichedDepartments = departments.map((d: any) => {
      const members = usersByDept.get(d._id.toString()) || [];
      return {
        id: d._id,
        name: d.name,
        code: d.code || null,
        description: d.description || "",
        managerId: d.managerId || null,
        managerName: d.managerName || null,
        employeeCount: members.length,
        employees: members,
        isActive: d.isActive,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });

    res.status(200).json(
      successResponse(
        {
          total: enrichedDepartments.length,
          departments: enrichedDepartments,
        },
        "CRM departments fetched successfully",
      ),
    );
  },
);

import { randomUUID } from "node:crypto";
import { AppError } from "../../../shared/utils/app-error";
import { notificationService } from "../../../shared/services/notification.service";
import { AssignedTask } from "../../assigned-tasks/model/assigned-task.model";
import { DailyTodo } from "../../daily-flow/model/daily-todo.model";
import { dispatchCrmWebhook } from "../services/crm-webhook.service";

export const transferCrmQueryController = asyncHandler(
  async (req: Request, res: Response) => {
    const body = req.body || {};
    const queryId = String(body.queryId || body.id || "").trim();
    const title = String(
      body.title ||
        (body.clientName ? `CRM Query: ${body.clientName}` : "") ||
        (queryId ? `CRM Query ${queryId}` : "") ||
        "Transferred CRM Query",
    ).trim();

    const targetEmployeeId = String(
      body.assignedToEmployeeId || body.employeeId || body.assignedTo || "",
    ).trim();
    const targetEmail = String(body.email || body.assignedToEmail || "").trim();

    if (!targetEmployeeId && !targetEmail) {
      throw new AppError(
        "assignedToEmployeeId or employeeId or email is required",
        400,
      );
    }

    const queryCond: any = { isActive: true };
    if (targetEmployeeId && targetEmail) {
      queryCond.$or = [
        { employeeId: targetEmployeeId },
        { email: targetEmail.toLowerCase() },
      ];
    } else if (targetEmployeeId) {
      queryCond.employeeId = targetEmployeeId;
    } else {
      queryCond.email = targetEmail.toLowerCase();
    }

    const employee = await User.findOne(queryCond).lean();
    if (!employee) {
      throw new AppError("Assigned employee not found or inactive", 404);
    }

    const todayStr = new Date().toLocaleDateString("en-CA");
    const scheduledFor = body.scheduledFor ? String(body.scheduledFor) : todayStr;
    const priority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(
      String(body.priority || "").toUpperCase(),
    )
      ? (String(body.priority).toUpperCase() as any)
      : "HIGH";

    const assignedByName = String(
      body.assignedByName || body.assignedBy || "CRM System",
    ).trim();
    const assignedByEmployeeId = String(
      body.assignedByEmployeeId || "CRM",
    ).trim();

    const task = await AssignedTask.create({
      title,
      description: String(
        body.description || body.notes || body.queryDetails || "",
      ).trim(),
      priority,
      status: "REQUESTED",
      source: "CRM",
      assignedByEmployeeId,
      assignedByName,
      assignedToEmployeeId: employee.employeeId,
      assignedToName: employee.name,
      assignedToDepartmentName: employee.departmentName || "",
      scheduledFor,
      deadlineAt: body.deadlineAt ? new Date(body.deadlineAt) : null,
      estimatedTime: String(body.estimatedTime || "30m").trim(),
      addToTodo: true,
      autoAddToEodOnComplete: true,
      crmQueryId: queryId,
      crmClientName: String(body.clientName || body.customerName || "").trim(),
      crmClientPhone: String(body.clientPhone || body.phone || "").trim(),
      crmClientEmail: String(body.clientEmail || body.customerEmail || "").trim(),
      crmUrl: String(body.crmUrl || body.link || "").trim(),
    });

    // Auto-add to employee's daily todo list
    const todo =
      (await DailyTodo.findOne({
        employeeId: employee.employeeId,
        date: scheduledFor,
      })) ||
      new DailyTodo({
        employeeId: employee.employeeId,
        date: scheduledFor,
        items: [],
      });

    const itemTaskId = randomUUID();
    (todo.items as any[]).push({
      taskId: itemTaskId,
      text: `[CRM Query] ${title}`,
      timeTaken: task.estimatedTime || "30m",
      estimatedTime: task.estimatedTime || "30m",
      scheduledFor,
      deadlineAt: task.deadlineAt || null,
    });
    await todo.save();

    task.todoDate = scheduledFor;
    task.todoItemTaskId = itemTaskId;
    await task.save();

    const serialized =
      typeof (task as any).toObject === "function"
        ? (task as any).toObject()
        : task;
    const responseTask = { ...serialized, id: String(serialized._id) };

    // SSE Notifications
    notificationService.broadcastToUser(
      employee.employeeId,
      "crm_query_transferred",
      {
        title: "🔔 CRM Query Transferred",
        message: `Query '${title}' transferred to you by ${assignedByName}`,
        task: responseTask,
        queryId,
        clientName: task.crmClientName,
        clientPhone: task.crmClientPhone,
        clientEmail: task.crmClientEmail,
        crmUrl: task.crmUrl,
      },
    );

    notificationService.broadcastToUser(
      employee.employeeId,
      "assigned_task_created",
      {
        title: "🔔 New Assigned Task (CRM Query)",
        message: `Query '${title}' transferred to you from CRM`,
        task: responseTask,
      },
    );

    notificationService.broadcastToRoles(
      ["SUPER_ADMIN", "ADMIN", "HR", "MANAGER"],
      "crm_query_transferred",
      {
        title: "🔔 CRM Query Transferred",
        message: `Query '${title}' transferred to ${employee.name} (${employee.employeeId})`,
        task: responseTask,
      },
    );

    dispatchCrmWebhook("crm_query.transferred", {
      queryId,
      assignedToEmployeeId: employee.employeeId,
      assignedToName: employee.name,
      taskId: responseTask.id,
      transferredAt: new Date().toISOString(),
    });

    res
      .status(201)
      .json(
        successResponse(
          responseTask,
          "CRM Query transferred and assigned successfully",
        ),
      );
  },
);
