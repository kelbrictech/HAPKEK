# HAPKEK Engineering Instructions

## Modern Web Guidance (required for browser-facing work)

For every change to HTML, CSS, browser APIs, or client-side JavaScript, consult Google's
[Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance) before choosing
an implementation. Do not use it for backend-only work, SQL migrations, Cloudflare Worker
routing, CI, scripts, or test-only changes unless browser behavior is involved.

### Workflow

1. Search the relevant capability before implementation:
   `npx -y modern-web-guidance@latest search "<focused 2–5 word UI or browser capability>"`
2. Retrieve the matching guide(s):
   `npx -y modern-web-guidance@latest retrieve "<guide-id>"`
3. Apply the guide's recommendations and compatibility fallbacks; verify the result.
4. In the change summary, identify the guide(s) consulted and explain any relevant fallback
   or compatibility decision. Do not claim a guide was applied if it was only searched.

If the CLI is not installed in the working environment, use the official quickstart:
`npx modern-web-guidance@latest install`. Do not add the CLI as a runtime dependency.

### HAPKEK areas where guidance is expected

- RMS dashboard, tables, dialogs, forms, filters, responsive navigation and charts.
- POS checkout, payment confirmation, validation and receipt views.
- Staff authentication, session UX, password/passkey interfaces and role-aware screens.
- QR scanning, camera permissions, manual-entry fallback and error announcements.
- Voucher claim and redemption flows, including dates, time zones and status feedback.
- Mobile layouts, installability, offline states, loading behavior and accessibility.

### Project guardrails

- Preserve the canonical HAPKEK game behavior, approved visual identity and existing
  leaderboard API contract unless the task explicitly authorizes a change.
- Prefer semantic HTML and native browser capabilities when the retrieved guidance supports
  them; do not add a dependency merely to recreate a built-in capability.
- Treat accessibility, keyboard operation, focus management, readable contrast and reduced
  motion as acceptance criteria, not optional polish.
- Use progressive enhancement. Do not ship experimental, origin-trial, or volatile browser
  features without explicit approval and a tested fallback.
- Check browser compatibility for the actual target devices. Camera access requires a secure
  context and permission; always provide a usable manual redemption path.
- Never put secrets, credentials, staff passwords, or production tokens in browser code,
  repository files, logs, or test fixtures.
- Keep authorization, voucher eligibility, stock counts, payment state and redemption decisions
  server-enforced. Client-side UI state is not an authority.
- Keep prize-voucher inventory distinct from saleable product inventory.
- Do not change production configuration or deploy as a side effect of a UI implementation.

### Install and update

The upstream project recommends the CLI for installation and automatic updates:

```sh
npx modern-web-guidance@latest install
npx modern-web-guidance@latest update
```

Upstream documentation: https://developer.chrome.com/docs/modern-web-guidance
