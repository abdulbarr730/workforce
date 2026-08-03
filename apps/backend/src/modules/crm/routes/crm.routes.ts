import { Router } from "express";
import { authenticateCrm } from "../middlewares/crm-auth.middleware";
import {
  getCrmEmployeesController,
  getCrmEmployeeByIdController,
  getCrmDepartmentsController,
} from "../controllers/crm.controller";

const router = Router();

// All CRM routes are protected by authenticateCrm (Supports X-API-KEY, Bearer CRM_API_KEY, or JWT)
router.use(authenticateCrm);

/**
 * @route   GET /api/crm/employees
 * @desc    Get all employees enriched with full department metadata
 * @query   departmentId, role, search
 */
router.get("/employees", getCrmEmployeesController);

/**
 * @route   GET /api/crm/employees/:id
 * @desc    Get a single employee by ID or employeeId with department details
 */
router.get("/employees/:id", getCrmEmployeeByIdController);

/**
 * @route   GET /api/crm/departments
 * @desc    Get all departments with employee counts and roster
 */
router.get("/departments", getCrmDepartmentsController);

export default router;
