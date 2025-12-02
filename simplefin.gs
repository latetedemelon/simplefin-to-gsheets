const ACCOUNTS_SHEET_NAME = 'Accounts';
const TRANSACTIONS_SHEET_NAME = 'Transactions';
const BALANCES_SHEET_NAME = 'Balances';
const LOOKBACK_DAYS = 14;

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
    .addItem('Compare','compareAndRecordTransactions')
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
 * Fetches accounts and transactions from SimpleFin API within a date range.
 * @param {string} accessCodeUrl - The access code URL with credentials.
 * @param {number} startDate - Start date as Unix timestamp.
 * @param {number} endDate - End date as Unix timestamp.
 * @returns {Object|null} The response data containing accounts and transactions, or null on error.
 */
function getAccountsAndTransactions(accessCodeUrl, startDate, endDate) {
  const [baseUrl, credentials] = splitUrlAndCredentials(accessCodeUrl);
  
  const url = `${baseUrl}/accounts?start-date=${startDate}&end-date=${endDate}`;
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
      Logger.log('API Error: HTTP ' + responseCode + ' - ' + response.getContentText());
      SpreadsheetApp.getUi().alert('Error', 'Failed to fetch data from SimpleFin API. HTTP Status: ' + responseCode, SpreadsheetApp.getUi().ButtonSet.OK);
      return null;
    }
    
    const data = JSON.parse(response.getContentText());
    return data;
  } catch (error) {
    Logger.log('Error fetching accounts and transactions: ' + error.message);
    SpreadsheetApp.getUi().alert('Error', 'An error occurred while fetching data: ' + error.message, SpreadsheetApp.getUi().ButtonSet.OK);
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
  
  const url = `${baseUrl}/accounts`;
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
      Logger.log('API Error: HTTP ' + responseCode + ' - ' + response.getContentText());
      SpreadsheetApp.getUi().alert('Error', 'Failed to fetch data from SimpleFin API. HTTP Status: ' + responseCode, SpreadsheetApp.getUi().ButtonSet.OK);
      return null;
    }
    
    const data = JSON.parse(response.getContentText());
    return data;
  } catch (error) {
    Logger.log('Error fetching accounts and transactions: ' + error.message);
    SpreadsheetApp.getUi().alert('Error', 'An error occurred while fetching data: ' + error.message, SpreadsheetApp.getUi().ButtonSet.OK);
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
 * Updates all accounts and transactions by fetching from the SimpleFin API.
 * Uses the configured lookback period to determine the date range.
 */
function updateAccountsAndTransactions() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const accessCodeUrl = scriptProperties.getProperty('accessCodeUrl');
  Logger.log('Access Code URL from properties: ' + accessCodeUrl);

  const currentDate = new Date();
  const otherDate = new Date();
  otherDate.setDate(currentDate.getDate() - LOOKBACK_DAYS);
  const startDate = Math.floor(otherDate / 1000);
  const endDate = Math.floor(currentDate / 1000);

  const responseData = getAccountsAndTransactions(accessCodeUrl, startDate, endDate);
  if (responseData && Array.isArray(responseData.accounts)) {
    updateAccountsSheet(responseData.accounts);
    updateTransactionsSheet(responseData.accounts);
    updateBalancesSheet(responseData.accounts);
  } else {
    Logger.log('Error: responseData.accounts is not an array');
  }
}

/**
 * Updates the Accounts sheet with the latest account data.
 * Uses batch operations for improved performance.
 * @param {Array} accounts - Array of account objects from the API.
 */
function updateAccountsSheet(accounts) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Accounts');
  sheet.clearContents();
  
  const data = [
    ['Domain', 'Org Name', 'SFIN URL', 'Account ID', 'Account Name', 'Currency',
     'Balance', 'Available Balance', 'Balance Date', 'Account Open Date']
  ];

  accounts.forEach((account) => {
    const org = account.org;
    data.push([
      org.domain, org.name, org['sfin-url'],
      account.id, account.name, account.currency,
      account.balance, account['available-balance'], new Date(account['balance-date'] * 1000)
    ]);
  });
  
  if (data.length > 0) {
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  }
}

/**
 * Updates the Transactions sheet with new transactions.
 * Uses Set for O(1) duplicate checking and batch operations for improved performance.
 * @param {Array} accounts - Array of account objects from the API.
 */
function updateTransactionsSheet(accounts) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Transactions');
  
  // Check if the header row exists, and if not, add it.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Account ID', 'Account Name', 'Transaction ID', 'Posted',
      'Amount', 'Description', 'Pending', 'Extra'
    ]);
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
        newTransactions.push([
          account.id, account.name, transaction.id, new Date(transaction.posted * 1000),
          transaction.amount, transaction.description, transaction.pending,
          JSON.stringify(transaction.extra)
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

