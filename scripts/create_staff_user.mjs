// Usage: node scripts/create_staff_user.mjs <username> <display-name> <password> [owner|admin|manager|staff]
import { webcrypto } from 'node:crypto';
const [username, displayName, password, role = "staff"] = process.argv.slice(2);
if (!username || !displayName || !password || password.length < 12 || !["owner","admin","manager","staff"].includes(role)) {
  console.error('Usage: node scripts/create_staff_user.mjs <username> <display-name> <password at least 12 chars> [owner|admin|manager|staff]');
  process.exit(1);
}
const enc = new TextEncoder();
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const key = await webcrypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await webcrypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},key,256);
const hex = a => Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
const esc = s => "'" + s.replace(/'/g,"''") + "'";
console.log(`INSERT INTO hapkek_staff_users(username,display_name,password_salt,password_hash,active,role) VALUES(${esc(username)},${esc(displayName)},'${hex(salt)}','${hex(bits)}',1,${esc(role)});`);
