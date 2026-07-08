const ACCOUNTS_SHEET_NAME = 'Accounts';
const TRANSACTIONS_SHEET_NAME = 'Transactions';
const BALANCES_SHEET_NAME = 'Balances';
const HOLDINGS_SHEET_NAME = 'Holdings';
const ERRORS_SHEET_NAME = 'Errors';
const DEBUG_SHEET_NAME = 'Debug';

// SimpleFIN API request configuration.
const SIMPLEFIN_API_VERSION = 2;   // Protocol version to request; set to 1 (or null) for the v1 wire format.
const INCLUDE_PENDING = true;      // When true, adds pending=1 so pending transactions are returned.
const LOOKBACK_DAYS = 0;           // 0 => page back through all available history; >0 => only the last N days.
const WINDOW_DAYS = 90;            // SimpleFIN bridge caps a single /accounts request to ~90 days; don't exceed.
const MAX_HISTORY_DAYS = 730;      // How far back to page when LOOKBACK_DAYS = 0 (safety cap; ~2 years).

/**
 * Creates a custom menu in Google Sheets when the spreadsheet is opened.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('SimpleFin')
    .addItem('Set SimpleFin Token', 'setSimplefinToken')
    .addItem('Initialize Sheets', 'initializeSheets')
    .addItem('Update Accounts and Transactions', 'updateAccountsAndTransactions')
    .addItem('Update Balances', 'updateBalances')
    .addItem('Update Holdings', 'updateHoldings')
    .addItem('Debug: Compare v1 vs v2 Accounts', 'debugCompareVersions')
    .addToUi();
}

/**
 * Prompts the user to enter their SimpleFin token and stores it securely in Script Properties.
 */
function setSimplefinToken() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Set SimpleFin Token',
    'Enter your SimpleFin token:',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() === ui.Button.OK) {
    const token = result.getResponseText().trim();
    if (!token || token === 'REPLACE_ME_WITH_A_NEW_TOKEN') {
      ui.alert('Error', 'Please enter a valid SimpleFin token.', ui.ButtonSet.OK);
      return;
    }
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('simplefinToken', token);
    ui.alert('Success', 'SimpleFin token has been stored securely.', ui.ButtonSet.OK);
  }
}

/**
 * Initializes the required sheets and stores the SimpleFin access code URL.
 * Retrieves the token from Script Properties.
 */
function initializeSheets() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const token = scriptProperties.getProperty('simplefinToken');

  if (!token || token === 'REPLACE_ME_WITH_A_NEW_TOKEN') {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'Please set your SimpleFin token first using the "Set SimpleFin Token" menu option.', ui.ButtonSet.OK);
    return;
  }

  createSheet(ACCOUNTS_SHEET_NAME);
  createSheet(TRANSACTIONS_SHEET_NAME);
  createSheet(BALANCES_SHEET_NAME);
  createSheet(HOLDINGS_SHEET_NAME);
  createSheet(ERRORS_SHEET_NAME);

  storeAccessCodeUrl(token);
}

/**
 * Creates a new sheet with the given name if it doesn't already exist.
 * @param {string} sheetName - The name of the sheet to create.
 */
function createSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(sheetName)) {
    ss.insertSheet(sheetName);
  }
}

/**
 * Shows a UI alert, swallowing errors so time-based triggers (which have no UI) don't fail.
 * @param {string} title - Alert title.
 * @param {string} message - Alert message.
 */
function alertUi(title, message) {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log(title + ': ' + message);
  }
}

/**
 * Best-effort extraction of human-readable error text from a SimpleFin error response body.
 * @param {string} body - The raw response body.
 * @returns {string} A summary string, or '' if none could be extracted.
 */
function summarizeErrorBody(body) {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed.errlist) && parsed.errlist.length) {
      return parsed.errlist.map((e) => e.msg || e.code).join('; ');
    }
    if (Array.isArray(parsed.errors) && parsed.errors.length) {
      return parsed.errors.join('; ');
    }
  } catch (e) {
    // Body was not JSON; ignore.
  }
  return '';
}

/**
 * Converts a Unix timestamp (seconds) to a Date, or returns '' when the value is absent.
 * Note: 0 is a valid timestamp (1970-01-01); only null/undefined yields ''.
 * @param {number|null|undefined} unixSeconds
 * @returns {Date|string}
 */
function toDateOrBlank(unixSeconds) {
  return unixSeconds != null ? new Date(unixSeconds * 1000) : '';
}

/**
 * Stores the SimpleFin access code URL in Script Properties.
 * @param {string} token - The SimpleFin token (base64 encoded).
 */
function storeAccessCodeUrl(token) {
  if (!token || token.trim() === '' || token === 'REPLACE_ME_WITH_A_NEW_TOKEN') {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'Invalid token provided. Please enter a valid SimpleFin token.', ui.ButtonSet.OK);
    return;
  }

  let decodedToken;
  let claimUrl;
  try {
    decodedToken = Utilities.base64Decode(token);
    claimUrl = Utilities.newBlob(decodedToken).getDataAsString();
  } catch (error) {
    Logger.log('Error decoding token: ' + error.message);
    SpreadsheetApp.getUi().alert('Error', 'Invalid token format. Please ensure you have a valid base64-encoded SimpleFin token.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  const accessCodeUrl = getAccessCodeUrl(claimUrl);

  if (accessCodeUrl) {
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('accessCodeUrl', accessCodeUrl);
  }
}

/**
 * Retrieves the access code URL from a claim URL by making a POST request.
 * @param {string} claimUrl - The claim URL to post to.
 * @returns {string|null} The access code URL, or null on error.
 */
function getAccessCodeUrl(claimUrl) {
  const options = {
    method: 'POST',
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(claimUrl, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      Logger.log('Claim URL Error: HTTP ' + responseCode + ' - ' + response.getContentText());
      SpreadsheetApp.getUi().alert('Error', 'Failed to claim access code. HTTP Status: ' + responseCode, SpreadsheetApp.getUi().ButtonSet.OK);
      return null;
    }

    const accessCodeUrl = response.getContentText();
    return accessCodeUrl;
  } catch (error) {
    Logger.log('Error getting access code URL: ' + error.message);
    SpreadsheetApp.getUi().alert('Error', 'An error occurred while claiming access code: ' + error.message, SpreadsheetApp.getUi().ButtonSet.OK);
    return null;
  }
}

/**
 * Builds the SimpleFin /accounts request URL, applying the configured API version,
 * pending flag, and optional date range. Centralizing this guarantees every code path
 * requests the same protocol version and options.
 * @param {string} baseUrl - The base URL (scheme://host/path) without credentials.
 * @param {Object} opts - { startDate, endDate } as Unix timestamps (seconds) or null.
 * @returns {string} The full /accounts URL with query string.
 */
function buildAccountsUrl(baseUrl, opts) {
  opts = opts || {};
  const params = [];
  if (opts.startDate != null) {
    params.push('start-date=' + opts.startDate);
  }
  if (opts.endDate != null) {
    params.push('end-date=' + opts.endDate);
  }
  // opts.version overrides the configured version (used by the v1-vs-v2 debug comparison).
  const version = ('version' in opts) ? opts.version : SIMPLEFIN_API_VERSION;
  if (version != null) {
    params.push('version=' + version);
  }
  if (INCLUDE_PENDING) {
    params.push('pending=1');
  }
  return `${baseUrl}/accounts` + (params.length ? '?' + params.join('&') : '');
}

/**
 * Fetches accounts and transactions from SimpleFin API within a date range.
 * @param {string} accessCodeUrl - The access code URL with credentials.
 * @param {number|null} startDate - Start date as Unix timestamp, or null to omit.
 * @param {number|null} endDate - End date as Unix timestamp, or null to omit.
 * @param {number=} version - Optional explicit API version override (else uses SIMPLEFIN_API_VERSION).
 * @returns {Object|null} The response data containing accounts and transactions, or null on error.
 */
function getAccountsAndTransactions(accessCodeUrl, startDate, endDate, version) {
  const [baseUrl, credentials] = splitUrlAndCredentials(accessCodeUrl);

  const opts = { startDate: startDate, endDate: endDate };
  if (version !== undefined) {
    opts.version = version;
  }
  const url = buildAccountsUrl(baseUrl, opts);
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Utilities.base64Encode(credentials)}`
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      const body = response.getContentText();
      Logger.log('API Error: HTTP ' + responseCode + ' - ' + body);
      const detail = summarizeErrorBody(body);
      alertUi('Error', 'Failed to fetch data from SimpleFin API. HTTP Status: ' + responseCode + (detail ? '\n' + detail : ''));
      return null;
    }

    const data = JSON.parse(response.getContentText());
    return data;
  } catch (error) {
    Logger.log('Error fetching accounts and transactions: ' + error.message);
    alertUi('Error', 'An error occurred while fetching data: ' + error.message);
    return null;
  }
}

/**
 * Fetches accounts and transactions from SimpleFin API without date filters.
 * This function can be used when you want to retrieve all available transactions.
 * @param {string} accessCodeUrl - The access code URL with credentials.
 * @returns {Object|null} The response data containing accounts and transactions, or null on error.
 */
function getAccountsAndTransactionsNoDate(accessCodeUrl) {
  const [baseUrl, credentials] = splitUrlAndCredentials(accessCodeUrl);

  const url = buildAccountsUrl(baseUrl, { startDate: null, endDate: null });
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Utilities.base64Encode(credentials)}`
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      const body = response.getContentText();
      Logger.log('API Error: HTTP ' + responseCode + ' - ' + body);
      const detail = summarizeErrorBody(body);
      alertUi('Error', 'Failed to fetch data from SimpleFin API. HTTP Status: ' + responseCode + (detail ? '\n' + detail : ''));
      return null;
    }

    const data = JSON.parse(response.getContentText());
    return data;
  } catch (error) {
    Logger.log('Error fetching accounts and transactions: ' + error.message);
    alertUi('Error', 'An error occurred while fetching data: ' + error.message);
    return null;
  }
}

/**
 * Splits an access code URL into its base URL and credentials.
 * @param {string} accessCodeUrl - The full access code URL with embedded credentials.
 * @returns {Array} An array containing [baseUrl, credentials].
 */
function splitUrlAndCredentials(accessCodeUrl) {
  const schemaRest = accessCodeUrl.split('//', 2);
  const fullRest = schemaRest[1].split('@', 2);
  const auth = fullRest[0];
  const schema = schemaRest[0];
  const rest = fullRest[1];
  const baseUrl = `${schema}//${rest}`;

  return [baseUrl, auth];
}

/**
 * Builds a lookup of SimpleFin v2 Connection objects keyed by conn_id.
 * Returns an empty object under v1 (which has no top-level connections array).
 * @param {Object} responseData - The parsed /accounts response.
 * @returns {Object} Map of conn_id -> connection object.
 */
function buildConnectionMap(responseData) {
  const map = {};
  const connections = responseData && responseData.connections;
  if (Array.isArray(connections)) {
    connections.forEach((conn) => {
      if (conn && conn.conn_id != null) {
        map[conn.conn_id] = conn;
      }
    });
  }
  return map;
}

/**
 * Normalizes organization/connection fields for an account across API versions.
 * v2: resolve account.conn_id against the connections map. v1: fall back to account.org.
 * @param {Object} account - An account object from the API.
 * @param {Object} connMap - Map from buildConnectionMap().
 * @returns {Object} { domain, name, orgId, orgUrl, sfinUrl, connId, connName }
 */
function resolveOrgFields(account, connMap) {
  const conn = (account.conn_id != null && connMap) ? connMap[account.conn_id] : null;
  if (conn) {
    // v2 wire format: org data lives on the Connection object.
    return {
      domain: '',
      name: conn.org_name || conn.name || '',
      orgId: conn.org_id || '',
      orgUrl: conn.org_url || '',
      sfinUrl: conn.sfin_url || '',
      connId: account.conn_id || '',
      connName: account.conn_name || conn.name || ''
    };
  }
  // v1 wire format fallback: org data is embedded on the account.
  const org = account.org || {};
  return {
    domain: org.domain || '',
    name: org.name || '',
    orgId: org.id || '',
    orgUrl: org.url || '',
    sfinUrl: org['sfin-url'] || '',
    connId: account.conn_id || '',
    connName: account.conn_name || ''
  };
}

/**
 * Fetches transaction history from the SimpleFin API, paging backward in <= WINDOW_DAYS
 * windows because the bridge caps a single /accounts request to ~90 days. The first window
 * uses start-date=0 so pending transactions (which may have posted=0) are included.
 * Transactions from every window are merged per account (de-duplicated by transaction id).
 * @param {string} accessCodeUrl
 * @returns {{firstResponse: Object, mergedAccounts: Array}|null}
 */
function fetchTransactionHistory(accessCodeUrl) {
  const now = Math.floor(new Date().getTime() / 1000);
  const totalDays = LOOKBACK_DAYS > 0 ? LOOKBACK_DAYS : MAX_HISTORY_DAYS;
  const stopWhenEmpty = (LOOKBACK_DAYS === 0);
  const windowSecs = WINDOW_DAYS * 86400;
  const earliest = now - totalDays * 86400;

  const accountMeta = {};
  const txByAccount = {};
  const seen = {};

  function accumulate(resp) {
    let addedAny = false;
    (resp.accounts || []).forEach((account) => {
      if (!accountMeta[account.id]) {
        accountMeta[account.id] = account;
        txByAccount[account.id] = [];
        seen[account.id] = {};
      }
      (account.transactions || []).forEach((transaction) => {
        if (!seen[account.id][transaction.id]) {
          seen[account.id][transaction.id] = true;
          txByAccount[account.id].push(transaction);
          addedAny = true;
        }
      });
    });
    return addedAny;
  }

  // Recent window: start-date=0 also returns pending transactions (posted may be 0). The
  // bridge caps this to ~90 days, which is an expected/benign message (see surfaceApiErrors).
  const firstResponse = getAccountsAndTransactions(accessCodeUrl, 0, now);
  if (!firstResponse || !Array.isArray(firstResponse.accounts)) {
    return null;
  }
  accumulate(firstResponse);

  // Page further back in <= WINDOW_DAYS windows for older history.
  let consecutiveEmpty = 0;
  let windowEnd = now - windowSecs;
  while (windowEnd > earliest) {
    const windowStart = Math.max(earliest, windowEnd - windowSecs);
    const resp = getAccountsAndTransactions(accessCodeUrl, windowStart, windowEnd);
    if (!resp || !Array.isArray(resp.accounts)) {
      break;
    }
    const addedAny = accumulate(resp);
    consecutiveEmpty = addedAny ? 0 : consecutiveEmpty + 1;
    if (windowStart <= earliest || (stopWhenEmpty && consecutiveEmpty >= 2)) {
      break;
    }
    windowEnd = windowStart;
  }

  const mergedAccounts = Object.keys(accountMeta).map((id) => {
    const merged = {};
    const source = accountMeta[id];
    for (const key in source) {
      merged[key] = source[key];
    }
    merged.transactions = txByAccount[id];
    return merged;
  });
  Logger.log('Fetched history for ' + mergedAccounts.length + ' account(s).');
  return { firstResponse: firstResponse, mergedAccounts: mergedAccounts };
}

/**
 * Updates all accounts and transactions by fetching from the SimpleFin API.
 * Pages back through all available history by default (LOOKBACK_DAYS = 0).
 */
function updateAccountsAndTransactions() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const accessCodeUrl = scriptProperties.getProperty('accessCodeUrl');

  const history = fetchTransactionHistory(accessCodeUrl);
  if (!history) {
    Logger.log('Error: no account data returned');
    return;
  }
  const connMap = buildConnectionMap(history.firstResponse);
  updateAccountsSheet(history.firstResponse.accounts, connMap); // current balances/metadata
  updateTransactionsSheet(history.mergedAccounts);              // full paged history
  updateBalancesSheet(history.firstResponse.accounts);
  updateHoldingsSheet(history.firstResponse.accounts);
  surfaceApiErrors(history.firstResponse);
}

/**
 * Menu entry point: refreshes only the Balances sheet from the latest account balances.
 */
function updateBalances() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const accessCodeUrl = scriptProperties.getProperty('accessCodeUrl');

  const responseData = getAccountsAndTransactions(accessCodeUrl, null, null);
  if (responseData && Array.isArray(responseData.accounts)) {
    updateBalancesSheet(responseData.accounts);
    surfaceApiErrors(responseData);
  } else {
    Logger.log('Error: responseData.accounts is not an array');
  }
}

/**
 * Menu entry point: refreshes only the Holdings sheet.
 */
function updateHoldings() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const accessCodeUrl = scriptProperties.getProperty('accessCodeUrl');

  const responseData = getAccountsAndTransactions(accessCodeUrl, null, null);
  if (responseData && Array.isArray(responseData.accounts)) {
    updateHoldingsSheet(responseData.accounts);
    surfaceApiErrors(responseData);
  } else {
    Logger.log('Error: responseData.accounts is not an array');
  }
}

/**
 * Updates the Accounts sheet with the latest account data.
 * The sheet is cleared and fully rewritten each run, so header changes are safe.
 * @param {Array} accounts - Array of account objects from the API.
 * @param {Object} connMap - Connection lookup from buildConnectionMap() (v2); may be empty for v1.
 */
function updateAccountsSheet(accounts, connMap) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNTS_SHEET_NAME);
  sheet.clearContents();

  const data = [
    ['Domain', 'Org Name', 'Org ID', 'Org URL', 'SFIN URL', 'Conn ID', 'Conn Name',
     'Account ID', 'Account Name', 'Currency', 'Balance', 'Available Balance',
     'Balance Date', 'Account Open Date', 'Extra (JSON)']
  ];

  accounts.forEach((account) => {
    const org = resolveOrgFields(account, connMap);
    const extra = account.extra || {};
    const openDate = extra['account-open-date'] != null ? new Date(extra['account-open-date'] * 1000) : '';
    data.push([
      org.domain, org.name, org.orgId, org.orgUrl, org.sfinUrl, org.connId, org.connName,
      account.id, account.name, account.currency,
      account.balance != null ? account.balance : '',
      account['available-balance'] != null ? account['available-balance'] : '',
      toDateOrBlank(account['balance-date']),
      openDate,
      JSON.stringify(extra)
    ]);
  });

  if (data.length > 0) {
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  }
}

/**
 * Extends a legacy Transactions header to the current column layout without
 * disturbing existing data rows (new columns are simply appended to the header row).
 * @param {Sheet} sheet - The Transactions sheet.
 * @param {Array} header - The current, full header row.
 */
function migrateTransactionsHeaderIfNeeded(sheet, header) {
  const lastCol = sheet.getLastColumn();
  if (lastCol >= header.length) {
    return;
  }
  const currentHeader = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  // Only migrate a recognized legacy header (avoids clobbering a customized sheet).
  if (currentHeader[0] === 'Account ID' && currentHeader[2] === 'Transaction ID') {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
}

/**
 * Returns true if the value is a Date object (e.g. a date cell read from a sheet).
 * @param {*} x
 * @returns {boolean}
 */
function isDateValue(x) {
  return Object.prototype.toString.call(x) === '[object Date]';
}

/**
 * Builds a Transactions sheet row for a transaction. Column order must match the header
 * in updateTransactionsSheet().
 * @param {Object} account
 * @param {Object} transaction
 * @returns {Array}
 */
function buildTransactionRow(account, transaction) {
  const extra = transaction.extra || {};
  // MCC (ISO 18245 merchant category code) is a top-level transaction field; fall back to extra.
  const mcc = transaction.mcc || extra.mcc || extra.category || '';
  // Posted is 0 for not-yet-posted (pending) transactions; show blank rather than 1970.
  const postedDate = transaction.posted ? new Date(transaction.posted * 1000) : '';
  return [
    account.id, account.name, transaction.id, postedDate,
    transaction.amount, transaction.description, transaction.pending,
    JSON.stringify(extra), toDateOrBlank(transaction.transacted_at),
    mcc, transaction.payee || '', transaction.memo || ''
  ];
}

/**
 * Composite de-duplication key for a transaction. SimpleFIN transaction IDs are unique only
 * WITHIN an account (the demo returns the same id in two accounts), so the account ID must be
 * part of the key to avoid dropping a real transaction as a false duplicate.
 * @param {string} accountId
 * @param {string} transactionId
 * @returns {string}
 */
function transactionKey(accountId, transactionId) {
  var a = String(accountId);
  return a.length + ':' + a + ':' + String(transactionId);
}

/**
 * Signature of a transaction's mutable fields (pending, posted, amount, description),
 * used to detect changes such as pending -> posted or amount adjustments. Computed
 * identically from an API transaction and from an existing sheet row so the two can be
 * compared. Deliberately excludes the supplementary columns (transacted_at, category,
 * extra) so that adding those columns does not flag every historical row as "changed".
 * @param {Object} transaction - An API transaction object.
 * @returns {string}
 */
function transactionApiSignature(transaction) {
  const pending = transaction.pending === true;
  const posted = transaction.posted ? transaction.posted : '';
  const amount = transaction.amount == null ? '' : Number(transaction.amount);
  const description = transaction.description == null ? '' : String(transaction.description);
  return JSON.stringify([pending, posted, amount, description]);
}

/**
 * Signature of an existing Transactions sheet row, comparable to transactionApiSignature().
 * @param {Array} row - A row read from the Transactions sheet.
 * @returns {string}
 */
function transactionRowSignature(row) {
  const pending = row[6] === true;
  const posted = isDateValue(row[3]) ? Math.floor(row[3].getTime() / 1000) : '';
  const amount = (row[4] === '' || row[4] == null) ? '' : Number(row[4]);
  const description = row[5] == null ? '' : String(row[5]);
  return JSON.stringify([pending, posted, amount, description]);
}

/**
 * Updates the Transactions sheet incrementally:
 *   - Appends transactions whose ID is not yet present.
 *   - Updates an existing row in place when the transaction changed (e.g. pending -> posted,
 *     amount adjustment), detected via a signature of its mutable fields.
 *   - Leaves unchanged and out-of-window rows untouched, so the full history is preserved.
 * De-duplicates by account ID + transaction ID (SimpleFIN IDs are unique only within an
 * account). New columns (Transacted At, MCC, Payee, Memo) are appended after the original
 * columns so legacy rows stay aligned.
 * @param {Array} accounts - Array of account objects from the API.
 */
function updateTransactionsSheet(accounts) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRANSACTIONS_SHEET_NAME);

  const header = ['Account ID', 'Account Name', 'Transaction ID', 'Posted',
                  'Amount', 'Description', 'Pending', 'Extra', 'Transacted At',
                  'MCC', 'Payee', 'Memo'];

  // Write the header if the sheet is empty; otherwise migrate a legacy header in place.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
  } else {
    migrateTransactionsHeaderIfNeeded(sheet, header);
  }

  const numCols = header.length;
  const lastRow = sheet.getLastRow();

  // Index existing rows by (account ID + transaction ID) -> { rowNumber, signature }.
  const existingByKey = {};
  if (lastRow > 1) {
    const existing = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    for (let i = 0; i < existing.length; i++) {
      const row = existing[i];
      const id = row[2];
      if (id !== '' && id != null) {
        existingByKey[transactionKey(row[0], id)] = { rowNumber: i + 2, sig: transactionRowSignature(row) };
      }
    }
  }

  const newTransactions = [];
  const updates = [];
  const seenNewKeys = new Set();

  accounts.forEach((account) => {
    (account.transactions || []).forEach((transaction) => {
      const key = transactionKey(account.id, transaction.id);
      const existing = existingByKey[key];
      if (!existing) {
        // Brand-new transaction: queue for append (guard against dupes within this batch).
        if (!seenNewKeys.has(key)) {
          newTransactions.push(buildTransactionRow(account, transaction));
          seenNewKeys.add(key);
        }
        return;
      }
      // Existing transaction: update the row only if its mutable fields changed.
      const newSig = transactionApiSignature(transaction);
      if (newSig !== existing.sig) {
        updates.push({ rowNumber: existing.rowNumber, values: buildTransactionRow(account, transaction) });
        existing.sig = newSig; // prevent re-updating the same row within this batch
      }
    });
  });

  // Apply in-place updates to changed rows (e.g. pending -> posted).
  updates.forEach((update) => {
    sheet.getRange(update.rowNumber, 1, 1, update.values.length).setValues([update.values]);
  });

  // Append brand-new transactions in a single batch operation.
  if (newTransactions.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newTransactions.length, newTransactions[0].length).setValues(newTransactions);
  }
}

/**
 * Updates the Holdings sheet with investment holdings for any brokerage/investment accounts.
 * Holdings are point-in-time snapshots, so the sheet is cleared and fully rewritten each run.
 * No-ops gracefully for accounts without holdings.
 * @param {Array} accounts - Array of account objects from the API.
 */
function updateHoldingsSheet(accounts) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOLDINGS_SHEET_NAME);
  if (!sheet) {
    Logger.log('Holdings sheet not found; run "Initialize Sheets" to create it.');
    return;
  }
  sheet.clearContents();

  const data = [
    ['Account ID', 'Account Name', 'Holding ID', 'Created', 'Currency', 'Symbol',
     'Description', 'Shares', 'Cost Basis', 'Market Value', 'Purchase Price', 'Extra (JSON)']
  ];

  accounts.forEach((account) => {
    (account.holdings || []).forEach((holding) => {
      data.push([
        account.id, account.name, holding.id, toDateOrBlank(holding.created),
        holding.currency || '', holding.symbol || '', holding.description || '',
        holding.shares != null ? holding.shares : '',
        holding.cost_basis != null ? holding.cost_basis : '',
        holding.market_value != null ? holding.market_value : '',
        holding.purchase_price != null ? holding.purchase_price : '',
        JSON.stringify(holding)
      ]);
    });
  });

  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
}

/**
 * True for the expected "date range exceeds 90 days and was capped" notice, which the bridge
 * returns because we intentionally request start-date=0 to capture pending transactions. It is
 * recorded as an informational message rather than counted as an error.
 * @param {string} msg
 * @returns {boolean}
 */
function isBenignCapMessage(msg) {
  return typeof msg === 'string' && /90 days|was capped/i.test(msg);
}

/**
 * Surfaces API errors into the Errors sheet so partial failures are visible instead of silent.
 * Handles v2 structured errlist, v1 plain-string errors, and per-account failure flags.
 * The sheet is cleared and fully rewritten each run.
 * @param {Object} responseData - The parsed /accounts response.
 */
function surfaceApiErrors(responseData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ERRORS_SHEET_NAME);
  if (!sheet) {
    Logger.log('Errors sheet not found; run "Initialize Sheets" to create it.');
    return;
  }
  sheet.clearContents();

  const now = new Date();
  const rows = [
    ['Timestamp', 'Type', 'Code', 'Message', 'Conn ID', 'Account ID']
  ];
  let errorCount = 0;

  // v2 structured errors.
  if (Array.isArray(responseData.errlist)) {
    responseData.errlist.forEach((err) => {
      const benign = isBenignCapMessage(err.msg);
      rows.push([now, benign ? 'message' : 'errlist', err.code || '', err.msg || '', err.conn_id || '', err.account_id || '']);
      Logger.log('SimpleFin ' + (benign ? 'message' : 'error') + ': ' + (err.code || '') + ' ' + (err.msg || ''));
      if (!benign) {
        errorCount++;
      }
    });
  }

  // v1 plain-string errors.
  if (Array.isArray(responseData.errors)) {
    responseData.errors.forEach((msg) => {
      const benign = isBenignCapMessage(msg);
      rows.push([now, benign ? 'message' : 'errors', '', msg, '', '']);
      Logger.log('SimpleFin ' + (benign ? 'message' : 'error') + ': ' + msg);
      if (!benign) {
        errorCount++;
      }
    });
  }

  // Per-account failure flags (defensive; some servers flag these on the account).
  (responseData.accounts || []).forEach((account) => {
    if (account.failed) {
      rows.push([now, 'account.failed', '', String(account.failed), account.conn_id || '', account.id || '']);
      errorCount++;
    }
    if (account.missingdata) {
      rows.push([now, 'account.missingdata', '', String(account.missingdata), account.conn_id || '', account.id || '']);
      errorCount++;
    }
  });

  // Informational messages from the API (e.g. hints about start-date); not errors.
  [].concat(responseData['x-api-message'] || []).forEach((msg) => {
    rows.push([now, 'message', '', String(msg), '', '']);
    Logger.log('SimpleFin message: ' + msg);
  });

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  if (errorCount > 0) {
    alertUi('SimpleFin sync warnings', errorCount + ' issue(s) reported by the API. See the "Errors" sheet.');
  }
}

/**
 * Updates the Balances sheet with the current account balances.
 * Creates a new row for today's date if it doesn't exist.
 * Uses batch operations for improved performance.
 * @param {Array} accountsData - Array of account objects from the API.
 */
function updateBalancesSheet(accountsData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BALANCES_SHEET_NAME);

  const today = new Date();
  const formattedToday = today.toLocaleDateString();

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // Read all existing data in one batch operation
  let existingData = [];
  let headerRow = [];
  if (lastRow > 0 && lastCol > 0) {
    existingData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    headerRow = existingData[0] || [];
  }

  // Find row with today's date in the first column
  let rowIndex = -1;
  for (let i = 0; i < existingData.length; i++) {
    const rowDate = existingData[i][0];
    if (rowDate instanceof Date && rowDate.toLocaleDateString() === formattedToday) {
      rowIndex = i + 1; // Convert to 1-based index
      break;
    }
  }

  // If today's date not found, create a new row
  if (rowIndex === -1) {
    rowIndex = lastRow + 1;
  }

  // Build header updates and balance updates
  const headerUpdates = [];
  const balanceUpdates = [];

  accountsData.forEach((account, index) => {
    const colIndex = index + 2; // Column index (1-based, starting from column 2)

    // Check if account ID header needs update
    const currentHeader = headerRow[colIndex - 1]; // 0-based array access
    if (currentHeader !== account.id) {
      headerUpdates.push({ col: colIndex, value: account.id });
    }

    balanceUpdates.push({ col: colIndex, value: account.balance });
  });

  // Write date for new row if needed
  if (rowIndex > lastRow) {
    sheet.getRange(rowIndex, 1).setValue(formattedToday);
  }

  // Batch write header updates
  headerUpdates.forEach((update) => {
    sheet.getRange(1, update.col).setValue(update.value);
  });

  // Batch write all balance values in a single row operation
  if (balanceUpdates.length > 0) {
    const balanceValues = balanceUpdates.map((u) => u.value);
    sheet.getRange(rowIndex, 2, 1, balanceValues.length).setValues([balanceValues]);
  }
}

/**
 * Appends error/message rows from a response (v1 errors, v2 errlist, x-api-message) to `lines`.
 * @param {Array} lines - The output line array to append to.
 * @param {Object|null} resp - A parsed /accounts response.
 */
function pushDebugErrors(lines, resp) {
  if (!resp) {
    lines.push(['(no response - fetch failed)']);
    return;
  }
  (resp.errlist || []).forEach((err) => {
    lines.push([err.code || '', err.msg || '', err.conn_id || '', err.account_id || '']);
  });
  (resp.errors || []).forEach((msg) => lines.push([String(msg)]));
  [].concat(resp['x-api-message'] || []).forEach((msg) => lines.push(['message', String(msg)]));
  if (!(resp.errlist && resp.errlist.length) && !(resp.errors && resp.errors.length)) {
    lines.push(['(no errors)']);
  }
}

/**
 * Diagnostic helper: fetches the account list under BOTH API v1 and v2, writes a side-by-side
 * comparison to a "Debug" sheet (with an "Only in" column flagging accounts returned by one
 * version but not the other), and logs both raw responses. Use this to check whether a missing
 * account (e.g. a mortgage) appears under one protocol version but not the other.
 */
function debugCompareVersions() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const accessCodeUrl = scriptProperties.getProperty('accessCodeUrl');
  const now = Math.floor(new Date().getTime() / 1000);

  const v1 = getAccountsAndTransactions(accessCodeUrl, 0, now, 1);
  const v2 = getAccountsAndTransactions(accessCodeUrl, 0, now, 2);
  Logger.log('Raw v1 response: ' + JSON.stringify(v1));
  Logger.log('Raw v2 response: ' + JSON.stringify(v2));

  createSheet(DEBUG_SHEET_NAME);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEBUG_SHEET_NAME);
  sheet.clearContents();

  const v1accts = (v1 && Array.isArray(v1.accounts)) ? v1.accounts : [];
  const v2accts = (v2 && Array.isArray(v2.accounts)) ? v2.accounts : [];

  // Union of accounts by id, tracking which version(s) each appeared in.
  const byId = {};
  const order = [];
  function note(list, flag) {
    list.forEach((account) => {
      if (!byId[account.id]) {
        byId[account.id] = { id: account.id, name: account.name, currency: account.currency, balance: account.balance };
        order.push(account.id);
      }
      byId[account.id][flag] = true;
    });
  }
  note(v1accts, 'inV1');
  note(v2accts, 'inV2');

  const lines = [];
  lines.push(['SimpleFIN Debug: v1 vs v2 account comparison']);
  lines.push(['v1 accounts returned', v1accts.length, 'v2 accounts returned', v2accts.length]);
  lines.push(['']);
  lines.push(['Account ID', 'Name', 'Currency', 'Balance', 'In v1', 'In v2', 'Only in']);
  order.forEach((id) => {
    const a = byId[id];
    const onlyIn = (a.inV1 && !a.inV2) ? 'v1' : ((a.inV2 && !a.inV1) ? 'v2' : '');
    lines.push([a.id, a.name, a.currency, a.balance, a.inV1 ? 'yes' : 'no', a.inV2 ? 'yes' : 'no', onlyIn]);
  });

  lines.push(['']);
  lines.push(['v1 errors / messages']);
  pushDebugErrors(lines, v1);
  lines.push(['']);
  lines.push(['v2 errors / messages']);
  pushDebugErrors(lines, v2);

  lines.forEach((line) => sheet.appendRow(line.length ? line : ['']));

  const onlyV1 = order.filter((id) => byId[id].inV1 && !byId[id].inV2).length;
  const onlyV2 = order.filter((id) => byId[id].inV2 && !byId[id].inV1).length;
  alertUi('Debug', 'v1 returned ' + v1accts.length + ' account(s), v2 returned ' + v2accts.length +
    '.\nOnly in v1: ' + onlyV1 + ' | Only in v2: ' + onlyV2 + '.\nSee the "Debug" sheet for the full comparison.');
}
