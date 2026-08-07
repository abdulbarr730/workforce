import ExcelJS from "exceljs";
import JSZip from "jszip";
import { DailyTodo } from "../../daily-flow/model/daily-todo.model";
import { EodReport } from "../../daily-flow/model/eod-report.model";
import { User } from "../../users/model/user.model";

type ArchiveRequest = {
  startDate: string;
  endDate: string;
  employeeId?: string;
};

type CsvValue = string | number | boolean | null | undefined;

const safeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const extractLegacyTaskDuration = (value: unknown) => {
  const originalText = safeString(value);
  const clockDuration = originalText.match(/\b\d{1,3}:[0-5]\d:[0-5]\d\b/)?.[0];
  const writtenDurations = Array.from(
    originalText.matchAll(
      /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/gi,
    ),
  );
  const timeTaken = clockDuration || writtenDurations.at(-1)?.[0] || "";
  const text = (timeTaken ? originalText.replace(timeTaken, "") : originalText)
    .replace(/^[\s|•⭐*\-–—]+/u, "")
    .replace(/[\s|\-–—]+(?:\([^)]*\))?\s*$/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text: text || originalText, timeTaken };
};

const protectSpreadsheetValue = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

const escapeCsvValue = (value: CsvValue) => {
  const protectedValue = protectSpreadsheetValue(String(value ?? ""));
  return `"${protectedValue.replaceAll('"', '""')}"`;
};

const toCsv = (rows: CsvValue[][]) =>
  `\uFEFF${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n")}`;

const safeFilePart = (value: string) =>
  value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "employee";

const createUniqueSheetName = (
  value: string,
  fallback: string,
  usedNames: Set<string>,
) => {
  const base =
    value
      .replace(/[\\/?*\[\]:]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || fallback;
  let candidate = base.slice(0, 31);
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    const ending = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - ending.length)}${ending}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
};

const styleHeader = (row: ExcelJS.Row) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" },
  };
  row.alignment = { vertical: "middle", wrapText: true };
};

const addSection = (worksheet: ExcelJS.Worksheet, title: string) => {
  worksheet.addRow([]);
  const row = worksheet.addRow([title]);
  worksheet.mergeCells(row.number, 1, row.number, 8);
  row.font = { bold: true, color: { argb: "FF312E81" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEF2FF" },
  };
};

export const createTodoEodArchive = async ({
  startDate,
  endDate,
  employeeId,
}: ArchiveRequest) => {
  const userFilter: Record<string, unknown> = {
    role: { $nin: ["SUPER_ADMIN", "ADMIN"] },
  };
  if (employeeId && employeeId !== "ALL") userFilter.employeeId = employeeId;

  const users = (await User.find(userFilter)
    .select("employeeId name departmentName role")
    .sort({ name: 1 })
    .lean()) as any[];
  const employeeIds = users.map((user) => user.employeeId);
  const dateFilter = { $gte: startDate, $lte: endDate };
  const [todos, eods] = await Promise.all([
    DailyTodo.find({ employeeId: { $in: employeeIds }, date: dateFilter })
      .sort({ employeeId: 1, date: 1 })
      .lean() as Promise<any[]>,
    EodReport.find({ employeeId: { $in: employeeIds }, date: dateFilter })
      .sort({ employeeId: 1, date: 1 })
      .lean() as Promise<any[]>,
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ProSync Workforce Platform";
  workbook.created = new Date();
  workbook.subject = "Todo and EOD report archive";

  const summarySheet = workbook.addWorksheet("Report Summary", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  summarySheet.columns = [
    { width: 18 },
    { width: 28 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];
  const title = summarySheet.addRow(["Todo & EOD Report"]);
  summarySheet.mergeCells("A1:F1");
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF312E81" },
  };
  summarySheet.addRow(["Date range", `${startDate} to ${endDate}`]);
  summarySheet.addRow(["Employees", users.length]);
  const summaryHeader = summarySheet.addRow([
    "Employee ID",
    "Employee",
    "Department",
    "Todo Days",
    "Todo Items",
    "EOD Tasks",
  ]);
  styleHeader(summaryHeader);

  const combinedTodoRows: CsvValue[][] = [
    [
      "Employee ID",
      "Employee",
      "Department",
      "Date",
      "Todo Item",
      "Completed",
      "Estimated Time",
      "Recorded Time",
      "Top Task",
    ],
  ];
  const combinedEodRows: CsvValue[][] = [
    [
      "Employee ID",
      "Employee",
      "Department",
      "Date",
      "Submitted At",
      "Time Slot",
      "EOD Task",
      "Time Taken",
      "Count",
      "Top Task",
      "Summary",
      "Blockers",
    ],
  ];
  const employeeCsvFiles: Array<{
    folder: string;
    todoRows: CsvValue[][];
    eodRows: CsvValue[][];
  }> = [];
  const usedSheetNames = new Set(["report summary"]);

  users.forEach((user) => {
    const employeeTodos = todos.filter(
      (todo) => todo.employeeId === user.employeeId,
    );
    const employeeEods = eods.filter(
      (eod) => eod.employeeId === user.employeeId,
    );
    const department = safeString(user.departmentName) || "Unassigned";
    const todoRows: CsvValue[][] = [combinedTodoRows[0]];
    const eodRows: CsvValue[][] = [combinedEodRows[0]];

    employeeTodos.forEach((todo) => {
      (todo.items || []).forEach((item: any) => {
        const row: CsvValue[] = [
          user.employeeId,
          user.name,
          department,
          todo.date,
          safeString(item.text),
          item.done ? "Yes" : "No",
          safeString(item.estimatedTime),
          safeString(item.timeTaken),
          item.isTopTask ? "Yes" : "No",
        ];
        combinedTodoRows.push(row);
        todoRows.push(row);
      });
    });

    employeeEods.forEach((eod) => {
      const structuredTasks = Array.isArray(eod.tasksWithTimings)
        ? eod.tasksWithTimings
        : [];
      const tasks =
        structuredTasks.length > 0
          ? structuredTasks
          : (eod.completedItems || []).map((text: string) => {
              const legacyTask = extractLegacyTaskDuration(text);
              return {
                text: legacyTask.text,
                interval: "",
                timeTaken: legacyTask.timeTaken,
                isTopTask: (eod.top3Tasks || []).includes(text),
              };
            });
      tasks.forEach((task: any) => {
        const row: CsvValue[] = [
          user.employeeId,
          user.name,
          department,
          eod.date,
          eod.submittedAt ? new Date(eod.submittedAt).toISOString() : "",
          safeString(task.interval),
          safeString(task.text),
          safeString(task.timeTaken),
          Number(task.count || task.callCount || 0) || "",
          task.isTopTask ? "Yes" : "No",
          safeString(eod.summary),
          safeString(eod.blockers),
        ];
        combinedEodRows.push(row);
        eodRows.push(row);
      });
    });

    summarySheet.addRow([
      user.employeeId,
      user.name,
      department,
      employeeTodos.length,
      todoRows.length - 1,
      eodRows.length - 1,
    ]);

    const worksheet = workbook.addWorksheet(
      createUniqueSheetName(user.name, user.employeeId, usedSheetNames),
      { views: [{ state: "frozen", ySplit: 5 }] },
    );
    worksheet.columns = [
      { width: 14 },
      { width: 24 },
      { width: 48 },
      { width: 18 },
      { width: 16 },
      { width: 18 },
      { width: 36 },
      { width: 36 },
    ];
    const employeeTitle = worksheet.addRow([
      `${user.name} (${user.employeeId}) — Todo & EOD Report`,
    ]);
    worksheet.mergeCells(employeeTitle.number, 1, employeeTitle.number, 8);
    employeeTitle.font = {
      bold: true,
      size: 15,
      color: { argb: "FFFFFFFF" },
    };
    employeeTitle.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF312E81" },
    };
    worksheet.addRow(["Date range", `${startDate} to ${endDate}`]);
    worksheet.addRow(["Department", department]);

    addSection(worksheet, "Todo Report");
    const todoHeader = worksheet.addRow([
      "Date",
      "Status",
      "Todo Item",
      "Estimated Time",
      "Recorded Time",
      "Top Task",
    ]);
    styleHeader(todoHeader);
    if (todoRows.length === 1) {
      worksheet.addRow(["No Todo items recorded"]);
    } else {
      todoRows
        .slice(1)
        .forEach((row) =>
          worksheet.addRow([row[3], row[5], row[4], row[6], row[7], row[8]]),
        );
    }

    addSection(worksheet, "EOD Report");
    const eodHeader = worksheet.addRow([
      "Date",
      "Time Slot",
      "EOD Task",
      "Time Taken",
      "Count",
      "Top Task",
      "Summary",
      "Blockers",
    ]);
    styleHeader(eodHeader);
    if (eodRows.length === 1) {
      worksheet.addRow(["No EOD tasks recorded"]);
    } else {
      eodRows
        .slice(1)
        .forEach((row) =>
          worksheet.addRow([
            row[3],
            row[5],
            row[6],
            row[7],
            row[8],
            row[9],
            row[10],
            row[11],
          ]),
        );
    }

    worksheet.eachRow((row) => {
      row.alignment = { ...row.alignment, vertical: "top", wrapText: true };
    });

    const folder = `employees/${safeFilePart(`${user.employeeId}_${user.name}`)}`;
    employeeCsvFiles.push({ folder, todoRows, eodRows });
  });

  const workbookBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const zip = new JSZip();
  zip.file(`Todo_EOD_Report_${startDate}_to_${endDate}.xlsx`, workbookBuffer);
  zip.file("combined/todo-report.csv", toCsv(combinedTodoRows));
  zip.file("combined/eod-report.csv", toCsv(combinedEodRows));
  employeeCsvFiles.forEach(({ folder, todoRows, eodRows }) => {
    zip.file(`${folder}/todo.csv`, toCsv(todoRows));
    zip.file(`${folder}/eod.csv`, toCsv(eodRows));
  });
  zip.file(
    "README.txt",
    [
      "ProSync Todo & EOD Report Archive",
      `Date range: ${startDate} to ${endDate}`,
      `Employees: ${users.length}`,
      `Todo items: ${combinedTodoRows.length - 1}`,
      `EOD tasks: ${combinedEodRows.length - 1}`,
      "",
      "The Excel workbook contains a summary plus one worksheet per employee.",
      "The combined folder contains team-wide CSV files, and employees contains separate CSV files per employee.",
    ].join("\r\n"),
  );

  return {
    buffer: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    }),
    employeeCount: users.length,
    todoItemCount: combinedTodoRows.length - 1,
    eodTaskCount: combinedEodRows.length - 1,
  };
};
