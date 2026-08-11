/**
 * Bind this script to the Google Sheet, set WELCOME_CALL_SYNC_SECRET in
 * Project Settings > Script properties, and deploy it as a Web app.
 */
function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var expected = PropertiesService.getScriptProperties().getProperty("WELCOME_CALL_SYNC_SECRET") || "";
    if (!expected || payload.secret !== expected) return json_({ success: false, message: "Unauthorized" });

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(payload.sheetName || "Welcome calls");
    if (!sheet) return json_({ success: false, message: "Sheet tab not found" });
    var lastColumn = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var columns = headerMap_(headers);
    var row = findRow_(sheet, columns, payload);
    if (!row) return json_({ success: true, found: false, message: "Matching row not found" });

    set_(sheet, row, columns, ["status", "result", "outcome"], payload.status);
    set_(sheet, row, columns, ["notes", "note"], payload.notes);
    SpreadsheetApp.flush();
    return json_({ success: true, found: true, row: row });
  } catch (error) {
    return json_({ success: false, message: String(error && error.message || error) });
  }
}

function normalize_(value) {
  return String(value == null ? "" : value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
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

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
