import { Response } from "express";
import exceljs from "exceljs";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { Department } from "../model/department.model";
import { User } from "../../users/model/user.model";
import { UserRole } from "../../../_shared/constants";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  HR: "HR",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

/** "Sales", "Sales and Support", "Sales, Support and Ops". */
const joinNames = (names: string[]) =>
  names.length <= 1
    ? names[0] || ""
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const styleHeader = (sheet: exceljs.Worksheet) => {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
};

/**
 * Admin: Excel of employees by department — how many departments, how many
 * employees in each, the people in each, and who is in more than one.
 *   GET /departments/export?includeInactive=true
 */
export const exportDepartmentsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const includeInactive = req.query.includeInactive === "true";
    const [departments, users] = await Promise.all([
      Department.find().select("name code managerName").sort({ name: 1 }).lean(),
      User.find({
        role: { $ne: UserRole.SUPER_ADMIN },
        ...(includeInactive ? {} : { isActive: true }),
      })
        .select(
          "employeeId name email role isActive departmentId departmentName departmentIds departmentNames",
        )
        .sort({ name: 1 })
        .lean(),
    ]);

    const byId = new Map(departments.map((d: any) => [String(d._id), d]));
    const byName = new Map(
      departments.map((d: any) => [String(d.name).trim().toLowerCase(), d]),
    );

    // Every department a person belongs to (ids first, then stored names).
    const departmentsOf = (user: any) => {
      const found = new Map<string, string>();
      const add = (dept: any) => dept && found.set(String(dept._id), String(dept.name));
      [...(user.departmentIds || []), user.departmentId]
        .filter(Boolean)
        .forEach((id: string) => add(byId.get(String(id))));
      [...(user.departmentNames || []), user.departmentName]
        .filter(Boolean)
        .forEach((name: string) => {
          const dept = byName.get(String(name).trim().toLowerCase());
          if (dept) add(dept);
          else found.set(`name:${name}`, String(name));
        });
      return Array.from(found.entries()).map(([key, name]) => ({ key, name }));
    };

    const people = (users as any[]).map((user) => ({
      user,
      depts: departmentsOf(user),
    }));

    // Department -> members (including departments that only exist as a name).
    const members = new Map<string, { name: string; code?: string; manager?: string; people: any[] }>();
    for (const dept of departments as any[]) {
      members.set(String(dept._id), {
        name: dept.name,
        code: dept.code || "",
        manager: dept.managerName || "",
        people: [],
      });
    }
    const noDepartment: any[] = [];
    for (const person of people) {
      if (!person.depts.length) {
        noDepartment.push(person);
        continue;
      }
      for (const dept of person.depts) {
        if (!members.has(dept.key)) members.set(dept.key, { name: dept.name, people: [] });
        members.get(dept.key)!.people.push(person);
      }
    }
    const groups = Array.from(members.values()).sort((a, b) => a.name.localeCompare(b.name));

    const workbook = new exceljs.Workbook();
    workbook.created = new Date();

    // ── Summary ──
    const summary = workbook.addWorksheet("Summary");
    summary.columns = [
      { header: "Department", key: "name", width: 30 },
      { header: "Code", key: "code", width: 12 },
      { header: "Manager", key: "manager", width: 24 },
      { header: "Employees", key: "count", width: 12 },
      { header: "Also in another department", key: "shared", width: 26 },
    ];
    for (const group of groups) {
      summary.addRow({
        name: group.name,
        code: group.code || "",
        manager: group.manager || "",
        count: group.people.length,
        shared: group.people.filter((p) => p.depts.length > 1).length,
      });
    }
    if (noDepartment.length) {
      summary.addRow({ name: "No department", count: noDepartment.length, shared: 0 });
    }
    summary.addRow({});
    const totals = summary.addRow({
      name: `Total: ${groups.length} departments`,
      count: people.length,
      shared: people.filter((p) => p.depts.length > 1).length,
    });
    totals.font = { bold: true };
    summary.addRow({
      name: "Employees count once in the total; people in more than one department appear under each of them.",
    }).font = { italic: true, color: { argb: "FF64748B" } };
    styleHeader(summary);

    // ── By department ──
    const sheet = workbook.addWorksheet("By department");
    sheet.columns = [
      { header: "Department", key: "department", width: 28 },
      { header: "Employee ID", key: "employeeId", width: 16 },
      { header: "Name", key: "name", width: 26 },
      { header: "Email", key: "email", width: 30 },
      { header: "Role", key: "role", width: 12 },
      { header: "All departments", key: "all", width: 40 },
    ];
    const writeGroup = (title: string, list: any[]) => {
      const heading = sheet.addRow({ department: `${title} (${list.length})` });
      heading.font = { bold: true };
      heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
      for (const person of list) {
        const row = sheet.addRow({
          department: "",
          employeeId: person.user.employeeId,
          name: person.user.name,
          email: person.user.email,
          role: ROLE_LABEL[person.user.role] || person.user.role,
          all:
            person.depts.length > 1
              ? `In ${joinNames(person.depts.map((d: any) => d.name))}`
              : person.depts[0]?.name || "",
        });
        if (person.depts.length > 1) row.getCell("all").font = { color: { argb: "FF4F46E5" } };
      }
    };
    for (const group of groups) writeGroup(group.name, group.people);
    if (noDepartment.length) writeGroup("No department", noDepartment);
    styleHeader(sheet);

    // ── All employees ──
    const all = workbook.addWorksheet("All employees");
    all.columns = [
      { header: "Employee ID", key: "employeeId", width: 16 },
      { header: "Name", key: "name", width: 26 },
      { header: "Email", key: "email", width: 30 },
      { header: "Role", key: "role", width: 12 },
      { header: "Departments", key: "departments", width: 40 },
      { header: "Number of departments", key: "count", width: 22 },
      ...(includeInactive ? [{ header: "Active", key: "active", width: 10 }] : []),
    ];
    for (const person of people) {
      all.addRow({
        employeeId: person.user.employeeId,
        name: person.user.name,
        email: person.user.email,
        role: ROLE_LABEL[person.user.role] || person.user.role,
        departments: person.depts.length
          ? person.depts.length > 1
            ? `In ${joinNames(person.depts.map((d: any) => d.name))}`
            : person.depts[0].name
          : "No department",
        count: person.depts.length,
        active: person.user.isActive ? "Yes" : "No",
      });
    }
    styleHeader(all);

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=employees_by_department_${stamp}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  },
);
