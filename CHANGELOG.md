## Changes

*   **Security and Configuration:** The `SIMPLEFIN_TOKEN` is no longer hardcoded. You can now set it securely via a "Set SimpleFin Token" menu item in the UI, which uses Script Properties.
*   **Error Handling:** The script is more robust with added error handling, including `try-catch` blocks and response code checks for API calls.
*   **Performance:** Sheet operations are now batched for better performance, and transaction duplicate checking is more efficient.
*   **Code Quality:** Unused constants have been removed, and JSDoc comments have been added to all public functions.