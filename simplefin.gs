const ACCOUNTS_SHEET_NAME = 'Accounts';
const TRANSACTIONS_SHEET_NAME = 'Transactions';
const BALANCES_SHEET_NAME = 'Balances';
const HOLDINGS_SHEET_NAME = 'Holdings';
const ERRORS_SHEET_NAME = 'Errors';

// SimpleFIN API request configuration.
const SIMPLEFIN_API_VERSION = 2;   // Protocol version to request; set to null to omit (server default / v1 wire format).
const INCLUDE_PENDING = true;      // When true, adds pending=1 so pending transactions are returned.
const LOOKBACK_DAYS = 0;           // 0 => all available history (start-date=0); >0 => rolling window of that many days.

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
  if (SIMPLEFIN_API_VERSION != null) {
    params.push('version=' + SIMPLEFIN_API_VERSION);
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
 * @returns {Object|null} The response data containing accounts and transactions, or null on error.
 */
function getAccountsAndTransactions(accessCodeUrl, startDate, endDate) {
  const [baseUrl, credentials] = splitUrlAndCredentials(accessCodeUrl);

  const url = buildAccountsUrl(baseUrl, { startDate: startDate, endDate: endDate });
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
      name: account.conn_name || conn.name || '',
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
 * Updates all accounts and transactions by fetching from the SimpleFin API.
 * Pulls all available history by default (LOOKBACK_DAYS = 0).
 */
function updateAccountsAndTransactions() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const accessCodeUrl = scriptProperties.getProperty('accessCodeUrl');
  Logger.log('Access Code URL from properties: ' + accessCodeUrl);

  const endDate = Math.floor(new Date().getTime() / 1000);
  // LOOKBACK_DAYS = 0 => start-date=0 (epoch) => all available history, incl. pending (posted=0).
  const startDate = LOOKBACK_DAYS > 0 ? endDate - LOOKBACK_DAYS * 86400 : 0;

  const responseData = getAccountsAndTransactions(accessCodeUrl, startDate, endDate);
  if (responseData && Array.isArray(responseData.accounts)) {
    const connMap = buildConnectionMap(responseData);
    updateAccountsSheet(responseData.accounts, connMap);
    updateTransactionsSheet(responseData.accounts);
    updateBalancesSheet(responseData.accounts);
    updateHoldingsSheet(responseData.accounts);
    surfaceApiErrors(responseData);
  } else {
    Logger.log('Error: responseData.accounts is not an array');
  }
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
 * Extends a legacy 8-column Transactions header to the current 10-column layout without
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
 * Updates the Transactions sheet with new transactions.
 * Uses Set for O(1) duplicate checking and batch operations for improved performance.
 * New columns (Transacted At, Category) are appended after the original columns so the
 * dedup read on Transaction ID (column 3) and existing rows stay aligned.
 * @param {Array} accounts - Array of account objects from the API.
 */
function updateTransactionsSheet(accounts) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRANSACTIONS_SHEET_NAME);

  const header = ['Account ID', 'Account Name', 'Transaction ID', 'Posted',
                  'Amount', 'Description', 'Pending', 'Extra', 'Transacted At', 'Category'];

  // Write the header if the sheet is empty; otherwise migrate a legacy header in place.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
  } else {
    migrateTransactionsHeaderIfNeeded(sheet, header);
  }

  // Get the range of transaction IDs in the sheet and use Set for O(1) lookups.
  const lastRow = sheet.getLastRow();
  let existingTransactionIds = new Set();
  if (lastRow > 1) {
    const transactionIdRange = sheet.getRange(2, 3, lastRow - 1, 1);
    existingTransactionIds = new Set(transactionIdRange.getValues().flat());
  }

  // Collect all new transactions in a batch array
  const newTransactions = [];

  accounts.forEach((account) => {
    (account.transactions || []).forEach((transaction) => {
      // Check if the transaction ID already exists using Set for O(1) lookup.
      if (!existingTransactionIds.has(transaction.id)) {
        const extra = transaction.extra || {};
        const category = extra.category || extra.mcc || '';
        // Posted is 0 for not-yet-posted (pending) transactions; show blank rather than 1970.
        const postedDate = transaction.posted ? new Date(transaction.posted * 1000) : '';
        newTransactions.push([
          account.id, account.name, transaction.id, postedDate,
          transaction.amount, transaction.description, transaction.pending,
          JSON.stringify(extra), toDateOrBlank(transaction.transacted_at), category
        ]);
        // Add to set to prevent duplicates within the same batch
        existingTransactionIds.add(transaction.id);
      }
    });
  });

  // Write all new transactions in a single batch operation
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

  // v2 structured errors.
  if (Array.isArray(responseData.errlist)) {
    responseData.errlist.forEach((err) => {
      rows.push([now, 'errlist', err.code || '', err.msg || '', err.conn_id || '', err.account_id || '']);
      Logger.log('SimpleFin error: ' + (err.code || '') + ' ' + (err.msg || ''));
    });
  }

  // v1 plain-string errors.
  if (Array.isArray(responseData.errors)) {
    responseData.errors.forEach((msg) => {
      rows.push([now, 'errors', '', msg, '', '']);
      Logger.log('SimpleFin error: ' + msg);
    });
  }

  // Per-account failure flags (defensive; some servers flag these on the account).
  (responseData.accounts || []).forEach((account) => {
    if (account.failed) {
      rows.push([now, 'account.failed', '', String(account.failed), account.conn_id || '', account.id || '']);
    }
    if (account.missingdata) {
      rows.push([now, 'account.missingdata', '', String(account.missingdata), account.conn_id || '', account.id || '']);
    }
  });

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  if (rows.length > 1) {
    alertUi('SimpleFin sync warnings', (rows.length - 1) + ' issue(s) reported by the API. See the "Errors" sheet.');
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
