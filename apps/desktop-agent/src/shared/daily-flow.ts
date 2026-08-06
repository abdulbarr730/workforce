export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/**
 * `/me/eod/today` also returns check-ins and the daily plan when no EOD exists.
 * Only a payload with a real submission timestamp is a submitted EOD.
 */
export function hasSubmittedEod(payload: unknown): boolean {
  if (!isRecord(payload)) return false;

  const nested = payload.eod ?? payload.report ?? payload.eodReport;
  const candidate = isRecord(nested) ? nested : payload;

  return (
    typeof candidate.submittedAt === "string" ||
    candidate.submittedAt instanceof Date
  );
}
