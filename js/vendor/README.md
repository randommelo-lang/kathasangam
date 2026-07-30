# KathaSangam Vendored Browser Libraries

This directory (`js/vendor/`) contains standalone, minified browser builds of third-party libraries. These libraries are loaded globally via `<script>` tags in `index.html` or loaded dynamically as Web Workers.

---

## 1. Library Inventory & Integrity Hashes

The following libraries are currently managed under this directory:

### **Mammoth.js**
*   **Filename**: [mammoth.browser.min.js](file:///d:/App/kathasangam/js/vendor/mammoth.browser.min.js)
*   **Version**: `1.11.0`
*   **Purpose**: Extracts raw text and structure from Word Document (`.docx`) files directly in the browser for novel chapter ingestion.
*   **Upstream Source**: [mammoth npm package](https://www.npmjs.com/package/mammoth) / [cdnjs](https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.11.0/mammoth.browser.min.js)
*   **Integrity Hash**: `sha384-nFoSjZIoH3CCp8W639jJyQkuPHinJ2NHe7on1xvlUA7SuGfJAfvMldrsoAVm6ECz`

### **PDF.js (Main Library)**
*   **Filename**: [pdf.min.js](file:///d:/App/kathasangam/js/vendor/pdf.min.js)
*   **Version**: `3.11.174`
*   **Purpose**: Parses and extracts text content from PDF documents for novel chapters, and renders pages to canvas coordinates for comic page extraction.
*   **Upstream Source**: [pdfjs-dist npm package](https://www.npmjs.com/package/pdfjs-dist) / [cdnjs](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js)
*   **Integrity Hash**: `sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e`

### **PDF.js (Web Worker)**
*   **Filename**: [pdf.worker.min.js](file:///d:/App/kathasangam/js/vendor/pdf.worker.min.js)
*   **Version**: `3.11.174` (Must match the main library version exactly)
*   **Purpose**: Offloads heavy PDF decoding operations to a background thread to keep the main UI thread responsive.
*   **Upstream Source**: [pdfjs-dist npm package](https://www.npmjs.com/package/pdfjs-dist) / [cdnjs](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js)
*   **Integrity Hash**: `sha384-NbxU6xKHY6BAL3QYJUP32LivAiP3h6aes7GqvZvF5GJcOidrz/s+YmP8ETF8GLWC`

### **Supabase JS Client**
*   **Filename**: [supabase.min.js](file:///d:/App/kathasangam/js/vendor/supabase.min.js)
*   **Version**: `2.43.0`
*   **Purpose**: UMD build of the official Supabase client providing database queries, user authentication, and storage bucket uploads.
*   **Upstream Source**: [@supabase/supabase-js npm package](https://www.npmjs.com/package/@supabase/supabase-js) / [jsDelivr](https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.0/dist/umd/supabase.js)
*   **Integrity Hash**: `sha384-GMmlk3PgEaV4QITo1ucN4bsD8RYSEL/EIfi3r1o+fi2ZOqjwXBDr5HvUyyt8XBBB`

---

## 2. Update Process

To update any vendored dependency, follow these steps:

1.  **Download Upstream Bundle**: Get the minified UMD/browser build of the target version from a reliable, pinned CDN:
    *   **jsDelivr**: `https://cdn.jsdelivr.net/npm/<package>@<version>/dist/...`
    *   **cdnjs**: `https://cdnjs.cloudflare.com/ajax/libs/<package>/<version>/...`
2.  **Generate Integrity Hash**: Compute the SHA-384 digest of the downloaded file.
    *   *Windows (PowerShell)*:
        ```powershell
        $hash = [Convert]::ToBase64String((Get-FileHash -Path .\filename.js -Algorithm SHA384).Hash)
        Write-Output "sha384-$hash"
        ```
    *   *macOS/Linux (Terminal)*:
        ```bash
        openssl dgst -sha384 -binary filename.js | openssl base64 -A
        ```
3.  **Replace File**: Overwrite the file in the `js/vendor/` directory.
4.  **Update HTML/JS References**:
    *   Update script tags in `index.html` to reflect the new version number and update the `integrity` attribute with the new SHA-384 string.
    *   If updating **PDF.js**, also update the Web Worker script path in [js/editor.js](file:///d:/App/kathasangam/js/editor.js) (look for `pdfjsLib.GlobalWorkerOptions.workerSrc`).

---

## 3. Policy: Vendored vs. Package-Managed Dependencies

### **When to Vendor (Add to `js/vendor/`):**
*   **Zero-Build Frontend Architecture**: The KathaSangam frontend is designed as a modular, buildless application loading ES6 modules natively in the browser. Third-party packages that do not publish clean ES Modules require script tag import via UMD/global declarations, which must be served locally.
*   **Static Asset Dependencies**: Dependencies that require separate static assets at runtime (such as `pdf.worker.min.js`) must be served from a predictable local path rather than depending on external CDN roundtrips which can trigger Content Security Policy (CSP) blocking or failure when offline.
*   **Privacy & Reliability**: Pinned local copies guarantee that third-party code cannot be altered downstream and prevents issues if an external CDN goes down.

### **When to use Package-Managed (`package.json`):**
*   **Development Tools**: Node.js-based developer dependencies, testing suites (such as Playwright), and configuration utilities that do not ship to the client.
*   **Future Build Steps**: If a bundler (e.g., Vite, Webpack, or Rollup) is introduced to compile frontend assets, these vendored modules should be migrated to `dependencies` in `package.json` and bundled during release.
