import { AppError } from "../../../shared/utils/app-error";

export const REQUIRED_TOP_TASK_COUNT = 3;

const normalizeTask = (task: unknown) =>
  String(task ?? "")
    .trim()
    .toLocaleLowerCase();

/**
 * Every EOD (new submission, missed-day backfill or edit) must carry exactly
 * three employee-selected Top tasks. Returns the selected task texts, or
 * throws a 400 whose message tells the employee exactly what to fix.
 */
export const resolveRequiredTopTasks = (
  tasks: Array<{ text: string; isTopTask?: boolean }>,
  requestedTop3Tasks: unknown,
): string[] => {
  const selectedTopTasks = tasks
    .filter((task) => task.isTopTask && String(task.text || "").trim())
    .map((task) => String(task.text).trim());
  const requestedTopTasks = Array.isArray(requestedTop3Tasks)
    ? requestedTop3Tasks.map((task) => String(task || "").trim()).filter(Boolean)
    : [];

  if (selectedTopTasks.length !== REQUIRED_TOP_TASK_COUNT) {
    throw new AppError(
      `Select exactly ${REQUIRED_TOP_TASK_COUNT} Top tasks before submitting EOD (${selectedTopTasks.length}/${REQUIRED_TOP_TASK_COUNT} selected). Tick the "Top" box on your 3 most important tasks.`,
      400,
    );
  }

  const selectedKeys = selectedTopTasks.map(normalizeTask).sort();
  const requestedKeys = requestedTopTasks.map(normalizeTask).sort();
  const requestMatchesSelection =
    requestedKeys.length === selectedKeys.length &&
    requestedKeys.every((task, index) => task === selectedKeys[index]);
  if (!requestMatchesSelection) {
    throw new AppError(
      "Top task selection does not match the submitted EOD tasks. Please re-select your 3 Top tasks and submit again.",
      400,
    );
  }

  return selectedTopTasks;
};
