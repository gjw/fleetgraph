# Manual Testing Checklist — 2b4 Lazy-load Heavy Deps

**Setup:** `pnpm dev`, open browser, open DevTools Network tab.

## 1. Emoji Picker (ProjectSidebar)

- Navigate to any Project document
- In the right Properties sidebar, find the "Icon" row (below Approvals, above Color)
- Click the colored square icon
- **Verify:** Emoji picker popover opens (may show brief loading skeleton on first click)
- **Verify:** Select an emoji — it appears on the icon
- **Verify:** Click "Remove emoji" — icon reverts to letter
- **Network tab:** On first click, you should see a new chunk load (contains emoji-picker-react)

> **KNOWN ISSUE:** Selecting an emoji currently fails with a 400 Bad Request.
> The `emoji` field is missing from the `updateDocumentSchema` in
> `api/src/routes/documents.ts`. The picker UI loads correctly (lazy-loading
> works), but the API rejects the save.
>
> **Before writing the final report:** Roll back to the original fork (before
> any GFA changes) and test whether emoji save worked there.
>
> - **If it worked on the original fork →** we broke it during type-safety
>   hardening (q6y or later). We need to fix it.
> - **If it was already broken →** pre-existing bug. Call out as extra finding.
>
> **This is NOT caused by the lazy-loading change (2b4).** The onChange path is
> identical before and after.

## 2. Code Block Syntax Highlighting (Editor)

- Open any document (wiki, issue, etc.)
- In the editor body, type ` ```javascript ` (triple backticks + language name) and press Enter
- Type some code, e.g.: `const x = "hello";`
- **Verify:** Syntax highlighting colors appear (keywords in red, strings in blue, etc.)
- Try another language: type ` ```python ` + Enter, then `def foo(): return True`
- **Verify:** Python keywords highlight differently from JS
- Alternative: type `/code` slash command to insert a plain code block (no highlighting until language is set)
- **Network tab:** A lowlight/highlight chunk may have loaded when you first navigated to the editor page

## 3. Diff Viewer (ApprovalButton)

> **Where to find it:** Approval buttons only appear on **Project** documents,
> in the Properties sidebar, under an "Approvals" section. Requirements:
>
> - You must be the project's accountable person or a workspace admin (`canApprove`)
> - The project must have a non-empty **plan** (for plan approval) or a **retro** (for retro approval)
>
> If you can't easily set this up, the diff viewer test can be skipped — the
> lazy-loading is verified by the build output (separate `DiffViewer-*.js` chunk).

- Open a Project document that has a plan written and where you have approval rights
- In the Properties sidebar, find the Approvals section → click "Approve Plan"
- Edit the plan content, save
- The approval state should change to "changed_since_approved" with an amber "View changes since last approval" link
- Click it
- **Verify:** A modal opens showing the diff with red (deletions) and green (additions) highlighting
- **Network tab:** On click, you should see a new chunk load (contains diff-match-patch)

## 4. Full Page Reload Check

- Hard refresh the app (Cmd+Shift+R)
- **Verify:** Initial page loads without errors
- **Verify:** None of the three lazy-loaded deps appear in the initial network waterfall
