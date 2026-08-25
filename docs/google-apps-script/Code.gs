/**
 * Bind this script to the Google Sheet, set WELCOME_CALL_SYNC_SECRET in
 * Project Settings > Script properties, and deploy it as a Web app.
 */
function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var expected =
      PropertiesService.getScriptProperties().getProperty(
        "WELCOME_CALL_SYNC_SECRET",
      ) || "";
    if (!expected || payload.secret !== expected)
      return json_({ success: false, message: "Unauthorized" });

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var requestedSheetName = String(
      payload.weeklySheetName || "Weekly Masterclass",
    ).trim();
    var configuredSheetName = configuredWelcomeCallSheetName_();
    if (configuredSheetName && requestedSheetName !== configuredSheetName) {
      return json_({
        success: true,
        skipped: true,
        message: "Campaign is not configured for Google Sheet synchronization",
      });
    }
    var weeklySheet = getOrRotateWeeklySheet_(
      spreadsheet,
      configuredSheetName || requestedSheetName,
      payload.webinarDate,
    );
    if (!weeklySheet)
      return json_({
        success: false,
        message: "A webinar date is required for weekly sheet synchronization",
      });
    var weeklyResult = syncPayloadToSheet_(weeklySheet, payload);
    SpreadsheetApp.flush();
    return json_({
      success: true,
      found: true,
      appended: weeklyResult.appended,
      row: weeklyResult.row,
    });
  } catch (error) {
    return json_({
      success: false,
      message: String((error && error.message) || error),
    });
  }
}

function syncPayloadToSheet_(sheet, payload) {
  normalizeAutomaticSheetFormattingOnce_(sheet);
  ensureCustomColumns_(sheet, payload.customColumns || []);
  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var columns = headerMap_(headers);
  var row = findRow_(sheet, columns, payload);
  var appended = false;
  if (!row) {
    row = appendRegistration_(sheet, columns, payload);
    appended = true;
  }

  setAllotted_(sheet, row, columns, payload.allotted);
  set_(
    sheet,
    row,
    columns,
    ["assigned at", "assignedat"],
    formatDateTime_(payload.assignedAt),
  );
  set_(
    sheet,
    row,
    columns,
    ["registered on", "registered at", "registered"],
    formatDateTime_(payload.registeredAt),
  );
  set_(
    sheet,
    row,
    columns,
    ["campaign", "campaign name"],
    payload.campaignName || "",
  );
  ensureStatusValidation_(sheet, row, columns);
  (payload.customColumns || []).forEach(function (column) {
    set_(sheet, row, columns, [column.label, column.key], column.value || "");
  });
  if (payload.clearOutcome === true) {
    set_(sheet, row, columns, ["status", "result", "outcome"], "");
    set_(sheet, row, columns, ["notes", "note"], "");
  } else if (
    ["Connected", "Not Connected", "Call Again"].indexOf(payload.status) !== -1
  ) {
    set_(sheet, row, columns, ["status", "result", "outcome"], payload.status);
    set_(sheet, row, columns, ["notes", "note"], payload.notes);
  }
  applyStatusColour_(sheet, row, columns);
  return { appended: appended, row: row };
}

function getOrRotateWeeklySheet_(spreadsheet, baseName, webinarDate) {
  if (!webinarDate) return null;
  var safeBaseName =
    String(baseName || "Weekly Masterclass")
      .replace(/[\\/?*\[\]:]/g, " ")
      .trim()
      .substring(0, 80) || "Weekly Masterclass";
  var properties = PropertiesService.getScriptProperties();
  var currentKey = "WELCOME_CALL_CURRENT_WEEK_" + normalize_(safeBaseName);
  var currentDate = properties.getProperty(currentKey) || "";
  var currentSheet = spreadsheet.getSheetByName(safeBaseName);
  if (currentDate && String(webinarDate) < currentDate) return null;
  if (currentDate && currentDate !== String(webinarDate)) {
    var archiveName = ("Copy of " + safeBaseName).substring(0, 99);
    var priorArchive = spreadsheet.getSheetByName(archiveName);
    if (priorArchive) spreadsheet.deleteSheet(priorArchive);
    if (currentSheet) currentSheet.setName(archiveName);
    currentSheet = null;
  }
  if (!currentSheet)
    currentSheet = getOrCreateAutomaticSheet_(spreadsheet, safeBaseName);
  properties.setProperty(currentKey, String(webinarDate));
  properties.setProperty("WELCOME_CALL_CURRENT_WEEKLY_SHEET", safeBaseName);
  currentSheet.setTabColor("#4f46e5");
  return currentSheet;
}

/**
 * Install this function as an installable trigger:
 * Event source: From spreadsheet
 * Event type: On edit
 *
 * It synchronizes Status and Notes edits from any Workforce-managed welcome
 * call sheet back into MongoDB. The backend then refreshes the desktop agent,
 * employee dashboard and admin dashboard.
 *
 * Script properties required:
 * WORKFORCE_STATUS_WEBHOOK_URL=https://api.prosyncedu.com/api/welcome-calls/sheet-status
 * WELCOME_CALL_SYNC_SECRET=<same value used by the Workforce backend>
 */
function syncStatusToWorkforce(e) {
  if (!e || !e.range || e.range.getRow() < 2) return;

  var sheet = e.range.getSheet();
  if (!isCurrentWelcomeCallSheet_(sheet)) return;
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) return;

  var headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0];
  var columns = headerMap_(headers);
  var statusColumn = column_(columns, ["status", "result", "outcome"]);
  var notesColumn = column_(columns, ["notes", "note"]);
  var emailColumn = column_(columns, ["email"]);
  var phoneColumn = column_(columns, ["phone number", "phone", "mobile"]);
  var webinarColumn = column_(columns, ["webinar date", "webinar"]);

  // Ignore unrelated tabs and edits outside Status/Notes.
  if ((!emailColumn && !phoneColumn) || (!statusColumn && !notesColumn)) return;
  var firstEditedColumn = e.range.getColumn();
  var lastEditedColumn = e.range.getLastColumn();
  var statusWasEdited =
    statusColumn &&
    statusColumn >= firstEditedColumn &&
    statusColumn <= lastEditedColumn;
  var notesWereEdited =
    notesColumn &&
    notesColumn >= firstEditedColumn &&
    notesColumn <= lastEditedColumn;
  if (!statusWasEdited && !notesWereEdited) return;

  var properties = PropertiesService.getScriptProperties();
  var url = properties.getProperty("WORKFORCE_STATUS_WEBHOOK_URL") || "";
  var secret = properties.getProperty("WELCOME_CALL_SYNC_SECRET") || "";
  if (!url || !secret) {
    throw new Error("Workforce status webhook properties are not configured");
  }

  for (var row = e.range.getRow(); row <= e.range.getLastRow(); row++) {
    var email = emailColumn
      ? sheet.getRange(row, emailColumn).getDisplayValue()
      : "";
    var phone = phoneColumn
      ? sheet.getRange(row, phoneColumn).getDisplayValue()
      : "";
    if (!email && !phone) continue;

    var status = statusColumn
      ? String(sheet.getRange(row, statusColumn).getDisplayValue() || "").trim()
      : "";
    var normalizedStatus = normalize_(status);
    if (
      ["", "connected", "notconnected", "callagain", "callback"].indexOf(
        normalizedStatus,
      ) === -1
    ) {
      continue;
    }

    var webinarDate = "";
    if (webinarColumn) {
      var webinarCell = sheet.getRange(row, webinarColumn);
      var rawDate = webinarCell.getValue();
      if (
        Object.prototype.toString.call(rawDate) === "[object Date]" &&
        !isNaN(rawDate.getTime())
      ) {
        webinarDate = Utilities.formatDate(
          rawDate,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd",
        );
      } else {
        // The backend also understands values such as "15th August 2026".
        webinarDate = webinarCell.getDisplayValue();
      }
    }

    var notes = notesColumn
      ? String(sheet.getRange(row, notesColumn).getDisplayValue() || "").trim()
      : "";
    applyStatusColour_(sheet, row, columns);
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        secret: secret,
        email: email,
        phone: phone,
        webinarDate: webinarDate,
        status: status,
        notes: notes,
      }),
    });
    var responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
      throw new Error(
        "Workforce sheet sync failed for row " +
          row +
          " (HTTP " +
          responseCode +
          "): " +
          response.getContentText(),
      );
    }
  }
}

function normalize_(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getOrCreateAutomaticSheet_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  if (sheet.getLastColumn() > 0) {
    var currentHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0];
    var currentColumns = headerMap_(currentHeaders);
    if (
      !column_(currentColumns, ["registered on", "registered at", "registered"])
    ) {
      var assignedColumn =
        column_(currentColumns, ["assigned at", "assignedat"]) ||
        Math.min(10, sheet.getMaxColumns());
      sheet.insertColumnAfter(assignedColumn);
      currentHeaders = sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getDisplayValues()[0];
      currentColumns = headerMap_(currentHeaders);
    }
    if (!column_(currentColumns, ["campaign", "campaign name"])) {
      var registeredColumn =
        column_(currentColumns, [
          "registered on",
          "registered at",
          "registered",
        ]) || Math.min(11, sheet.getMaxColumns());
      sheet.insertColumnAfter(registeredColumn);
    }
  }
  var headers = [
    [
      "First Name",
      "Last Name",
      "Email",
      "Phone number",
      "Allotted",
      "Source",
      "Webinar Date",
      "Status",
      "Notes",
      "Assigned At",
      "Registered On",
      "Campaign",
    ],
  ];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, headers[0].length)
    .setBackground("#f3f4f6")
    .setFontWeight("bold")
    .setFontColor("#0f172a");
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, sheet.getMaxRows(), headers[0].length).createFilter();
  }
  sheet.setColumnWidths(1, 2, 140);
  sheet.setColumnWidth(3, 240);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 130);
  sheet.setColumnWidth(7, 150);
  sheet.setColumnWidth(8, 150);
  sheet.setColumnWidth(9, 260);
  sheet.setColumnWidth(10, 170);
  sheet.setColumnWidth(11, 170);
  sheet.setColumnWidth(12, 180);
  var allottedRange = sheet.getRange("E2:E");
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  var allottedProtection = null;
  for (var p = 0; p < protections.length; p++) {
    if (protections[p].getDescription() === "Workforce managed - Allotted")
      allottedProtection = protections[p];
  }
  if (!allottedProtection) {
    allottedProtection = allottedRange
      .protect()
      .setDescription("Workforce managed - Allotted");
    allottedProtection.removeEditors(allottedProtection.getEditors());
    if (allottedProtection.canDomainEdit())
      allottedProtection.setDomainEdit(false);
  }
  protectManagedColumns_(sheet);
  var statusRange = sheet.getRange("H2:H");
  statusRange
    .setBackground("#e5e7eb")
    .setFontColor("#0f172a")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
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
      .build(),
  ]);
  return sheet;
}

function normalizeAutomaticSheetFormattingOnce_(sheet) {
  var properties = PropertiesService.getScriptProperties();
  var migrationKey = "WELCOME_CALL_WHITE_ROWS_V1_" + sheet.getSheetId();
  if (properties.getProperty(migrationKey) === "done") return;

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow >= 2 && lastColumn > 0) {
    sheet
      .getRange(2, 1, lastRow - 1, lastColumn)
      .setBackground("#ffffff")
      .setFontColor("#0f172a")
      .setFontWeight("normal");

    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var columns = headerMap_(headers);
    var allottedColumn = column_(columns, [
      "allotted",
      "assigned",
      "assigned to",
      "agent",
    ]);
    if (allottedColumn) {
      var allottedValues = sheet
        .getRange(2, allottedColumn, lastRow - 1, 1)
        .getDisplayValues();
      allottedValues.forEach(function (value, index) {
        setAllotted_(sheet, index + 2, columns, value[0]);
      });
    }
  }
  properties.setProperty(migrationKey, "done");
}

function headerMap_(headers) {
  var map = {};
  headers.forEach(function (header, index) {
    map[normalize_(header)] = index + 1;
  });
  return map;
}

function ensureCustomColumns_(sheet, columns) {
  if (!columns || !columns.length) return;
  var existing = headerMap_(
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0],
  );
  var added = false;
  columns.forEach(function (column) {
    if (!column.label || existing[normalize_(column.label)]) return;
    var next = sheet.getLastColumn() + 1;
    sheet
      .getRange(1, next)
      .setValue(column.label)
      .setBackground("#f3f4f6")
      .setFontWeight("bold")
      .setFontColor("#0f172a");
    sheet.setColumnWidth(next, 160);
    existing[normalize_(column.label)] = next;
    added = true;
  });
  var palette = [
    "#dcfce7",
    "#fee2e2",
    "#fef3c7",
    "#dbeafe",
    "#ede9fe",
    "#fce7f3",
  ];
  var rules = sheet.getConditionalFormatRules();
  columns.forEach(function (column) {
    var col = existing[normalize_(column.label)];
    if (!col || !column.options || !column.options.length) return;
    var range = sheet.getRange(2, col, sheet.getMaxRows() - 1, 1);
    range.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(column.options, true)
        .setAllowInvalid(false)
        .build(),
    );
    column.options.forEach(function (option, index) {
      rules.push(
        SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo(option)
          .setBackground(
            (column.optionColors && column.optionColors[option]) ||
              palette[index % palette.length],
          )
          .setFontColor("#0f172a")
          .setRanges([range])
          .build(),
      );
    });
  });
  sheet.setConditionalFormatRules(rules);
  if (added && sheet.getFilter()) sheet.getFilter().remove();
  if (added)
    sheet
      .getRange(1, 1, sheet.getMaxRows(), sheet.getLastColumn())
      .createFilter();
}

function protectManagedColumns_(sheet) {
  var managedColumns = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  managedColumns.forEach(function (column) {
    var description = "Workforce managed column " + column;
    var exists = protections.some(function (protection) {
      return protection.getDescription() === description;
    });
    if (exists) return;
    var protection = sheet
      .getRange(2, column, sheet.getMaxRows() - 1, 1)
      .protect()
      .setDescription(description);
    protection.removeEditors(protection.getEditors());
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  });
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
    {
      aliases: ["registration id", "registrationid", "payment id"],
      value: payload.registrationId,
    },
    { aliases: ["phone number", "phone", "mobile"], value: payload.phone },
    { aliases: ["email"], value: payload.email },
  ];
  for (var t = 0; t < tests.length; t++) {
    if (!tests[t].value) continue;
    var col = column_(columns, tests[t].aliases);
    if (!col) continue;
    var values = sheet.getRange(2, col, lastRow - 1, 1).getDisplayValues();
    var isPhone = tests[t].aliases[0] === "phone number";
    var target = isPhone
      ? normalizePhone_(tests[t].value)
      : normalize_(tests[t].value);
    for (var i = 0; i < values.length; i++) {
      var candidate = isPhone
        ? normalizePhone_(values[i][0])
        : normalize_(values[i][0]);
      if (candidate === target) return i + 2;
    }
  }
  return 0;
}

function set_(sheet, row, columns, aliases, value) {
  var col = column_(columns, aliases);
  if (col && value !== undefined && value !== null)
    sheet.getRange(row, col).setValue(value);
}

function normalizePhone_(value) {
  var digits = String(value || "").replace(/\D/g, "");
  return digits.length === 12 && digits.indexOf("91") === 0
    ? digits.substring(2)
    : digits;
}

function displayPhone_(value) {
  var original = String(value || "").trim();
  var digits = original.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.indexOf("91") === 0)
    return digits.substring(2);
  return original;
}

function ordinal_(day) {
  var mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return day + "th";
  return day + ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th");
}

function formatDate_(value) {
  if (!value) return "";
  var date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return (
    ordinal_(
      Number(Utilities.formatDate(date, Session.getScriptTimeZone(), "d")),
    ) + Utilities.formatDate(date, Session.getScriptTimeZone(), " MMM yyyy")
  );
}

function formatDateTime_(value) {
  if (!value) return "";
  var date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return (
    formatDate_(date) +
    Utilities.formatDate(date, Session.getScriptTimeZone(), " 'at' HH:mm")
  );
}

function setAllotted_(sheet, row, columns, value) {
  var col = column_(columns, ["allotted", "assigned", "assigned to", "agent"]);
  if (!col || value === undefined || value === null) return;
  var palette = [
    "#fee2e2",
    "#ffedd5",
    "#fef3c7",
    "#dcfce7",
    "#ccfbf1",
    "#dbeafe",
    "#ede9fe",
    "#fce7f3",
  ];
  var text = String(value || "");
  var hash = 0;
  for (var index = 0; index < text.length; index++)
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  sheet
    .getRange(row, col)
    .setValue(text)
    .setBackground(text ? palette[hash % palette.length] : "#ffffff");
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
        false,
      );
    sheet
      .getRange(lastRow, 1, 1, sheet.getLastColumn())
      .copyTo(
        sheet.getRange(row, 1, 1, sheet.getLastColumn()),
        SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
        false,
      );
  }
  sheet
    .getRange(row, 1, 1, sheet.getLastColumn())
    .setBackground("#ffffff")
    .setFontColor("#0f172a")
    .setFontWeight("normal");
  set_(
    sheet,
    row,
    columns,
    ["first name", "firstname"],
    payload.firstName || "",
  );
  set_(sheet, row, columns, ["last name", "lastname"], payload.lastName || "");
  set_(sheet, row, columns, ["email"], payload.email || "");
  set_(
    sheet,
    row,
    columns,
    ["phone number", "phone", "mobile"],
    displayPhone_(payload.phone),
  );
  setAllotted_(sheet, row, columns, payload.allotted || "");
  set_(sheet, row, columns, ["source"], payload.source || "");
  var sourceColumn = column_(columns, ["source"]);
  if (sourceColumn)
    sheet
      .getRange(row, sourceColumn)
      .setBackground("#ffffff")
      .setFontColor("#0f172a");
  set_(
    sheet,
    row,
    columns,
    ["webinar date", "webinar"],
    formatDate_(payload.webinarDate),
  );
  set_(sheet, row, columns, ["status", "result", "outcome"], "");
  set_(sheet, row, columns, ["notes", "note"], "");
  set_(
    sheet,
    row,
    columns,
    ["registered on", "registered at", "registered"],
    formatDateTime_(payload.registeredAt),
  );
  set_(
    sheet,
    row,
    columns,
    ["assigned at", "assignedat"],
    formatDateTime_(payload.assignedAt),
  );
  set_(
    sheet,
    row,
    columns,
    ["campaign", "campaign name"],
    payload.campaignName || "",
  );
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
      .copyTo(
        target,
        SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
        false,
      );
    return;
  }
  target.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["Connected", "Not Connected", "Call Again"], true)
      .setAllowInvalid(false)
      .build(),
  );
}

function applyStatusColour_(sheet, row, columns) {
  var col = column_(columns, ["status", "result", "outcome"]);
  if (!col) return;
  var cell = sheet.getRange(row, col);
  var status = normalize_(cell.getDisplayValue());
  var background = "#e5e7eb";
  var font = "#0f172a";
  if (status === "connected") {
    background = "#0f9d58";
    font = "#ffffff";
  } else if (status === "notconnected") {
    background = "#d93025";
    font = "#ffffff";
  } else if (status === "callagain" || status === "callback") {
    background = "#f9ab00";
    font = "#ffffff";
  }
  cell
    .setBackground(background)
    .setFontColor(font)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
}

// Run once from the Apps Script editor to colour all existing status rows.
function refreshAllWelcomeCallStatusColours() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  spreadsheet.getSheets().forEach(function (sheet) {
    if (!isCurrentWelcomeCallSheet_(sheet)) return;
    if (sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return;
    var headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0];
    var columns = headerMap_(headers);
    if (!column_(columns, ["status", "result", "outcome"])) return;
    for (var row = 2; row <= sheet.getLastRow(); row++) {
      applyStatusColour_(sheet, row, columns);
    }
  });
  SpreadsheetApp.flush();
}

function currentWelcomeCallSheetName_() {
  return configuredWelcomeCallSheetName_() || String(
    PropertiesService.getScriptProperties().getProperty(
      "WELCOME_CALL_CURRENT_WEEKLY_SHEET",
    ) || "",
  ).trim();
}

function configuredWelcomeCallSheetName_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(
      "WELCOME_CALL_SYNC_SHEET_NAME",
    ) || "",
  ).trim();
}

function isCurrentWelcomeCallSheet_(sheet) {
  var managedName = currentWelcomeCallSheetName_();
  return Boolean(sheet && managedName && sheet.getName() === managedName);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
