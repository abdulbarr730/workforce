/**
 * Bind this script to the Google Sheet, set WELCOME_CALL_SYNC_SECRET in
 * Project Settings > Script properties, and deploy it as a Web app.
 */
function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var expected = PropertiesService.getScriptProperties().getProperty("WELCOME_CALL_SYNC_SECRET") || "";
    if (!expected || payload.secret !== expected) return json_({ success: false, message: "Unauthorized" });

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var automaticSheetName = PropertiesService.getScriptProperties().getProperty("WELCOME_CALL_AUTOMATIC_SHEET_NAME") || "Welcome call automatic";
    var sheet = getOrCreateAutomaticSheet_(spreadsheet, automaticSheetName);
    var lastColumn = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var columns = headerMap_(headers);
    var row = findRow_(sheet, columns, payload);
    var appended = false;
    if (!row) {
      row = appendRegistration_(sheet, columns, payload);
      appended = true;
    }

    set_(sheet, row, columns, ["allotted", "assigned", "assigned to", "agent"], payload.allotted);
    set_(sheet, row, columns, ["assigned at", "assignedat"], payload.assignedAt || "");
    ensureStatusValidation_(sheet, row, columns);
    if (payload.clearOutcome === true) {
      set_(sheet, row, columns, ["status", "result", "outcome"], "");
      set_(sheet, row, columns, ["notes", "note"], "");
    } else if (["Connected", "Not Connected", "Call Again"].indexOf(payload.status) !== -1) {
      set_(sheet, row, columns, ["status", "result", "outcome"], payload.status);
      set_(sheet, row, columns, ["notes", "note"], payload.notes);
    }
    SpreadsheetApp.flush();
    return json_({ success: true, found: true, appended: appended, row: row });
  } catch (error) {
    return json_({ success: false, message: String(error && error.message || error) });
  }
}

/**
 * Install this as an "On edit" trigger. It sends Status-only edits back to
 * Workforce so the employee dashboard and desktop agent stay in sync.
 * Script properties required:
 * WORKFORCE_STATUS_WEBHOOK_URL=https://api.prosyncedu.com/api/welcome-calls/sheet-status
 * WELCOME_CALL_SYNC_SECRET=<same value used by the Workforce backend>
 */
function syncStatusToWorkforce(e) {
  if (!e || !e.range || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  var sheet = e.range.getSheet();
  var configuredSheet = PropertiesService.getScriptProperties().getProperty("WELCOME_CALL_AUTOMATIC_SHEET_NAME") || "Welcome call automatic";
  if (sheet.getName() !== configuredSheet || e.range.getRow() < 2) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var columns = headerMap_(headers);
  var statusColumn = column_(columns, ["status", "result", "outcome"]);
  if (!statusColumn || e.range.getColumn() !== statusColumn) return;

  var status = String(e.range.getDisplayValue() || "").trim();
  var normalizedStatus = normalize_(status);
  if (["", "connected", "notconnected", "callagain", "callback"].indexOf(normalizedStatus) === -1) return;

  var url = PropertiesService.getScriptProperties().getProperty("WORKFORCE_STATUS_WEBHOOK_URL") || "";
  var secret = PropertiesService.getScriptProperties().getProperty("WELCOME_CALL_SYNC_SECRET") || "";
  if (!url || !secret) throw new Error("Workforce status webhook properties are not configured");

  var row = e.range.getRow();
  var emailColumn = column_(columns, ["email"]);
  var phoneColumn = column_(columns, ["phone number", "phone", "mobile"]);
  var webinarColumn = column_(columns, ["webinar date", "webinar"]);
  var webinarDate = "";
  if (webinarColumn) {
    var rawDate = sheet.getRange(row, webinarColumn).getValue();
    if (Object.prototype.toString.call(rawDate) === "[object Date]" && !isNaN(rawDate.getTime())) {
      webinarDate = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  }

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      secret: secret,
      email: emailColumn ? sheet.getRange(row, emailColumn).getDisplayValue() : "",
      phone: phoneColumn ? sheet.getRange(row, phoneColumn).getDisplayValue() : "",
      webinarDate: webinarDate,
      status: status
    })
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("Workforce status sync failed: " + response.getContentText());
  }
}

function normalize_(value) {
  return String(value == null ? "" : value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getOrCreateAutomaticSheet_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (sheet) return sheet;
  sheet = spreadsheet.insertSheet(sheetName);
  var headers = [[
    "First Name",
    "Last Name",
    "Email",
    "Phone number",
    "Allotted",
    "Source",
    "Webinar Date",
    "Status",
    "Notes",
    "Assigned At"
  ]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers[0].length)
    .setBackground("#dbeafe")
    .setFontWeight("bold")
    .setFontColor("#0f172a");
  sheet
    .getRange(1, 1, sheet.getMaxRows(), headers[0].length)
    .createFilter();
  sheet.setColumnWidths(1, 2, 140);
  sheet.setColumnWidth(3, 240);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 130);
  sheet.setColumnWidth(7, 150);
  sheet.setColumnWidth(8, 150);
  sheet.setColumnWidth(9, 260);
  sheet.setColumnWidth(10, 170);
  var statusRange = sheet.getRange("H2:H");
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Connected")
      .setBackground("#0f9d58")
      .setFontColor("#ffffff")
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Not Connected")
      .setBackground("#d93025")
      .setFontColor("#ffffff")
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Call Again")
      .setBackground("#f9ab00")
      .setFontColor("#ffffff")
      .setRanges([statusRange])
      .build()
  ]);
  return sheet;
}

function headerMap_(headers) {
  var map = {};
  headers.forEach(function (header, index) { map[normalize_(header)] = index + 1; });
  return map;
}

function column_(columns, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var found = columns[normalize_(aliases[i])];
    if (found) return found;
  }
  return 0;
}

function findRow_(sheet, columns, payload) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var tests = [
    { aliases: ["registration id", "registrationid", "payment id"], value: payload.registrationId },
    { aliases: ["phone number", "phone", "mobile"], value: payload.phone },
    { aliases: ["email"], value: payload.email }
  ];
  for (var t = 0; t < tests.length; t++) {
    if (!tests[t].value) continue;
    var col = column_(columns, tests[t].aliases);
    if (!col) continue;
    var values = sheet.getRange(2, col, lastRow - 1, 1).getDisplayValues();
    var target = normalize_(tests[t].value);
    for (var i = 0; i < values.length; i++) if (normalize_(values[i][0]) === target) return i + 2;
  }
  return 0;
}

function set_(sheet, row, columns, aliases, value) {
  var col = column_(columns, aliases);
  if (col && value !== undefined && value !== null) sheet.getRange(row, col).setValue(value);
}

function appendRegistration_(sheet, columns, payload) {
  var lastRow = Math.max(1, sheet.getLastRow());
  var row = lastRow + 1;
  sheet.insertRowAfter(lastRow);
  if (lastRow >= 2) {
    sheet
      .getRange(lastRow, 1, 1, sheet.getLastColumn())
      .copyTo(
        sheet.getRange(row, 1, 1, sheet.getLastColumn()),
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false
      );
    sheet
      .getRange(lastRow, 1, 1, sheet.getLastColumn())
      .copyTo(
        sheet.getRange(row, 1, 1, sheet.getLastColumn()),
        SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
        false
      );
  }
  set_(sheet, row, columns, ["first name", "firstname"], payload.firstName || "");
  set_(sheet, row, columns, ["last name", "lastname"], payload.lastName || "");
  set_(sheet, row, columns, ["email"], payload.email || "");
  set_(sheet, row, columns, ["phone number", "phone", "mobile"], payload.phone || "");
  set_(sheet, row, columns, ["allotted", "assigned", "assigned to", "agent"], payload.allotted || "");
  set_(sheet, row, columns, ["source"], payload.source || "");
  set_(sheet, row, columns, ["webinar date", "webinar"], payload.webinarDate || "");
  set_(sheet, row, columns, ["status", "result", "outcome"], "");
  set_(sheet, row, columns, ["notes", "note"], "");
  set_(sheet, row, columns, ["assigned at", "assignedat"], payload.assignedAt || "");
  return row;
}

function ensureStatusValidation_(sheet, row, columns) {
  var col = column_(columns, ["status", "result", "outcome"]);
  if (!col) return;
  var target = sheet.getRange(row, col);
  if (target.getDataValidation()) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var validations = sheet.getRange(2, col, lastRow - 1, 1).getDataValidations();
  for (var index = 0; index < validations.length; index++) {
    if (!validations[index][0]) continue;
    sheet
      .getRange(index + 2, col)
      .copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    return;
  }
  target.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["Connected", "Not Connected", "Call Again"], true)
      .setAllowInvalid(false)
      .build()
  );
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
