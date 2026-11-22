// Securely provision the one-time Webmaster login in the configured Cloudflare D1 database.
// PowerShell:
//   $env:HAPKEK_BOOTSTRAP_PIN = "<one-time PIN>"
//   node scripts/provision_webmaster.mjs
//   Remove-Item Env:HAPKEK_BOOTSTRAP_PIN
//
// The PIN is read only from the process environment, never echoed, logged, or written to disk.
// First login requires Webmaster to replace this temporary PIN immediately.

import { webcrypto } from "node:crypto";
import { spawnSync } from "node:child_process";

const pin = process.env.HAPKEK_BOOTSTRAP_PIN || "";
if (!/^\d{4}$/.test(pin)) {
  console.error("Set HAPKEK_BOOTSTRAP_PIN to your four-digit one-time PIN, then rerun this script.");
  process.exit(1);
}

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const key = await webcrypto.subtle.importKey(
  "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]
);
const bits = await webcrypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
  key,
  256
);
const hex = value =>
  Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, "0")).join("");
const sql = `INSERT INTO hapkek_staff_users
(username,display_name,password_salt,password_hash,active,role,must_change_pin,failed_pin_attempts,locked_until)
VALUES('Webmaster','Webmaster','${hex(salt)}','${hex(bits)}',1,'owner',1,0,0)
ON CONFLICT(username) DO UPDATE SET
display_name='Webmaster',password_salt=excluded.password_salt,
password_hash=excluded.password_hash,active=1,role='owner',
must_change_pin=1,failed_pin_attempts=0,locked_until=0;
DELETE FROM hapkek_staff_sessions
WHERE staff_id=(SELECT id FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE);`;

const command = [
  "wrangler", "d1", "execute", "hapkek-leaderboard",
  "--remote", "--command", sql, "--config", "wrangler.toml"
];
const isWindows = process.platform === "win32";
const result = spawnSync(isWindows ? "npx.cmd" : "npx", command, {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: isWindows,
  stdio: ["ignore", "pipe", "pipe"]
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  console.error("Could not start Wrangler. Install Node.js/npm and run npx wrangler login first.");
  process.exit(1);
}
if (result.status !== 0) {
  console.error("Webmaster provisioning did not complete. Check Wrangler authentication and D1 access.");
  process.exit(result.status || 1);
}

console.log("Webmaster is provisioned as owner with a one-time PIN.");
console.log("Open https://rms.kelbric.com/ and choose Webmaster.");
console.log("The first login will require setting a new permanent PIN.");
