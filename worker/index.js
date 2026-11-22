const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};
const reply = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, ...extraHeaders, "Content-Type": "application/json; charset=utf-8" }
});
const validId = value => typeof value === "string" && /^[a-f0-9-]{20,40}$/i.test(value);
const cleanName = value => String(value || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 20);
const periods = {
  daily: "date(created_at, '+8 hours') = date('now', '+8 hours')",
  weekly: "date(created_at, '+8 hours') >= date('now', '+8 hours', '-' || ((CAST(strftime('%w','now','+8 hours') AS INTEGER)+6)%7) || ' days')",
  alltime: "1=1"
};
async function getBoard(env, period, playerId) {
  const sql = `WITH attempts AS (
    SELECT player_id, display_name, elapsed_ms, created_at,
      ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY elapsed_ms ASC, created_at ASC) AS personal_rank
    FROM hapkek_scores WHERE ${periods[period]}
  ), best AS (
    SELECT player_id, display_name, elapsed_ms AS best_ms, created_at AS achieved_at
    FROM attempts WHERE personal_rank = 1
  ), ranked AS (
    SELECT player_id, display_name, best_ms, achieved_at,
      ROW_NUMBER() OVER (ORDER BY best_ms ASC, achieved_at ASC, player_id ASC) AS rank,
      COUNT(*) OVER () AS total_players
    FROM best
  )
  SELECT player_id, display_name, best_ms, achieved_at, rank, total_players
  FROM ranked WHERE rank <= 3 OR player_id = ? ORDER BY rank LIMIT 4`;
  const result = await env.DB.prepare(sql).bind(playerId || "").all();
  const rows = result.results || [];
  return { period, top: rows.filter(row => row.rank <= 3),
    you: rows.find(row => row.player_id === playerId) || null,
    totalPlayers: rows[0]?.total_players || 0, timezone: "Asia/Manila" };
}

const randomInt = max => {
  const range = 0x100000000;
  const limit = Math.floor(range / max) * max;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
};
// Real voucher campaign opens at 09:00 Asia/Manila on 22 Nov 2026.
const VOUCHER_LAUNCH_AT = Date.parse("2026-11-22T01:00:00.000Z");

const makeVoucherCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return "HAP-" + Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
};
async function getExistingVoucher(env, playerId) {
  return env.DB.prepare(`SELECT c.voucher_code, c.prize_id, p.label, c.claim_date, c.created_at
    FROM hapkek_voucher_claims c JOIN hapkek_voucher_prizes p ON p.prize_id=c.prize_id
    WHERE c.player_id=? AND c.claim_date=date('now','+8 hours') LIMIT 1`).bind(playerId).first();
}
async function claimVoucher(env, playerId) {
  // Enforce the campaign start using the server clock, before looking up or issuing claims.
  if (Date.now() < VOUCHER_LAUNCH_AT) {
    return {
      ok: false,
      notStarted: true,
      launchAt: "2026-11-22T09:00:00+08:00",
      timezone: "Asia/Manila",
      error: "Real HAPKEK vouchers start on 22 November 2026 at 9:00 AM Philippine time."
    };
  }
  const existing = await getExistingVoucher(env, playerId);
  if (existing) return { ok: true, alreadyClaimed: true, voucher: existing, timezone: "Asia/Manila" };

  for (let attempt = 0; attempt < 5; attempt++) {
    const stock = await env.DB.prepare(`SELECT p.prize_id, p.label, p.weight, p.daily_limit,
      (SELECT COUNT(*) FROM hapkek_voucher_claims c WHERE c.prize_id=p.prize_id AND c.claim_date=date('now','+8 hours')) AS claimed
      FROM hapkek_voucher_prizes p WHERE p.active=1 AND p.daily_limit >
      (SELECT COUNT(*) FROM hapkek_voucher_claims c WHERE c.prize_id=p.prize_id AND c.claim_date=date('now','+8 hours'))
      ORDER BY p.prize_id`).all();
    const available = stock.results || [];
    if (!available.length) return { ok: false, soldOut: true, error: "Today's voucher pool is fully claimed. New vouchers reset at 00:00 Philippine time.", timezone: "Asia/Manila" };

    // If a prize category sells out, its weight is redistributed proportionally
    // across the prize categories that still have daily stock.
    const totalWeight = available.reduce((sum, row) => sum + Number(row.weight), 0);
    let pick = randomInt(totalWeight);
    let prize = available[available.length - 1];
    for (const row of available) {
      pick -= Number(row.weight);
      if (pick < 0) { prize = row; break; }
    }

    const code = makeVoucherCode();
    try {
      const inserted = await env.DB.prepare(`INSERT INTO hapkek_voucher_claims
        (voucher_code, player_id, prize_id, claim_date)
        SELECT ?, ?, ?, date('now','+8 hours')
        WHERE (SELECT COUNT(*) FROM hapkek_voucher_claims
          WHERE prize_id=? AND claim_date=date('now','+8 hours')) <
          (SELECT daily_limit FROM hapkek_voucher_prizes WHERE prize_id=? AND active=1)
        AND NOT EXISTS (SELECT 1 FROM hapkek_voucher_claims
          WHERE player_id=? AND claim_date=date('now','+8 hours'))`).bind(
            code, playerId, prize.prize_id, prize.prize_id, prize.prize_id, playerId
          ).run();
      if (inserted.meta?.changes) {
        const voucher = await env.DB.prepare(`SELECT c.voucher_code, c.prize_id, p.label, c.claim_date, c.created_at
          FROM hapkek_voucher_claims c JOIN hapkek_voucher_prizes p ON p.prize_id=c.prize_id
          WHERE c.voucher_code=?`).bind(code).first();
        return { ok: true, alreadyClaimed: false, voucher, timezone: "Asia/Manila" };
      }
      const raced = await getExistingVoucher(env, playerId);
      if (raced) return { ok: true, alreadyClaimed: true, voucher: raced, timezone: "Asia/Manila" };
    } catch (error) {
      // A concurrent request from this player may have won the daily unique slot.
      const raced = await getExistingVoucher(env, playerId);
      if (raced) return { ok: true, alreadyClaimed: true, voucher: raced, timezone: "Asia/Manila" };
      // A unique-code collision or concurrent stock claim is retried safely.
      if (attempt === 4) throw error;
    }
  }
  const raced = await getExistingVoucher(env, playerId);
  if (raced) return { ok: true, alreadyClaimed: true, voucher: raced, timezone: "Asia/Manila" };
  return { ok: false, soldOut: true, error: "Today's voucher pool is fully claimed. New vouchers reset at 00:00 Philippine time.", timezone: "Asia/Manila" };
}


const STAFF_SESSION_SECONDS = 12 * 60 * 60;
const bytesToHex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
const hexToBytes = hex => Uint8Array.from(hex.match(/.{2}/g) || [], b => parseInt(b, 16));
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const sha256Hex = async value => bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
async function verifyStaffPassword(password, saltHex, expectedHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 210000, hash: "SHA-256" }, key, 256);
  const actual = new Uint8Array(bits), expected = hexToBytes(expectedHex);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
const cookieValue = (request, name) => {
  const header = request.headers.get("Cookie") || "";
  const part = header.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
};
async function staffFromRequest(request, env) {
  const token = cookieValue(request, "hapkek_staff");
  if (!token) return null;
  const hash = await sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.must_change_pin
    FROM hapkek_staff_sessions s JOIN hapkek_staff_users u ON u.id=s.staff_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).bind(hash, now).first();
  if (!row) return null;
  return row;
}
const staffCookie = (token, maxAge) => `hapkek_staff=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
async function staffDirectory(env) {
  const rows = await env.DB.prepare(`SELECT username,display_name,role,active FROM hapkek_staff_users ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END, display_name COLLATE NOCASE`).all();
  return reply({ users:(rows.results||[]).map(u=>({nickname:u.display_name,active:Boolean(u.active),role:u.role})) });
}
async function staffLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return reply({ error: "Invalid request" }, 400); }
  const username = String(body?.nickname || "").trim().slice(0, 20);
  const pin = String(body?.pin || "");
  if (!username || !/^\d{4}$/.test(pin)) return reply({ error: "Choose your nickname and enter a 4-digit PIN" }, 400);
  const user = await env.DB.prepare(`SELECT id,username,display_name,password_salt,password_hash,role,must_change_pin,failed_pin_attempts,locked_until,active FROM hapkek_staff_users WHERE username=? COLLATE NOCASE`).bind(username).first();
  const now = Math.floor(Date.now()/1000);
  if (user && Number(user.locked_until||0)>now) return reply({error:"Account temporarily locked. Ask Ana to reset your access."},423);
  const salt = user?.password_salt || "00112233445566778899aabbccddeeff";
  const hash = user?.password_hash || "00".repeat(32);
  const valid = await verifyStaffPassword(pin, salt, hash);
  if (!user || !user.active || !valid) {
    if (user && user.active) {
      const attempts=Number(user.failed_pin_attempts||0)+1;
      const lockUntil=attempts>=5?now+15*60:0;
      await env.DB.prepare("UPDATE hapkek_staff_users SET failed_pin_attempts=?,locked_until=? WHERE id=?").bind(lockUntil?0:attempts,lockUntil,user.id).run();
    }
    return reply({ error: user&&!user.active ? "Access has not been issued for this nickname. Ask Ana." : "Incorrect nickname or PIN" }, 401);
  }
  await env.DB.prepare("UPDATE hapkek_staff_users SET failed_pin_attempts=0,locked_until=0 WHERE id=?").bind(user.id).run();
  const token = randomToken(), tokenHash = await sha256Hex(token);
  const expires = Math.floor(Date.now()/1000) + STAFF_SESSION_SECONDS;
  await env.DB.prepare("INSERT INTO hapkek_staff_sessions(token_hash,staff_id,expires_at) VALUES(?,?,?)").bind(tokenHash,user.id,expires).run();
  await rmsAudit(env, {id:user.id}, "staff.login", "staff", user.username, {role:user.role || "staff"});
  return reply({ ok:true, mustChangePin:Boolean(user.must_change_pin), staff:{ nickname:user.display_name, username:user.username, displayName:user.display_name, role:user.role || "staff", mustChangePin:Boolean(user.must_change_pin) } },200,{
    "Set-Cookie": staffCookie(token, STAFF_SESSION_SECONDS)
  });
}
async function staffChangePin(request, env, staff) {
  let body; try { body=await request.json(); } catch { return reply({error:"Invalid request"},400); }
  const pin=String(body?.pin||"");
  if(!/^\d{4}$/.test(pin)) return reply({error:"Choose a 4-digit PIN"},400);
  const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:hexToBytes(salt),iterations:210000,hash:"SHA-256"},key,256);
  const hash=bytesToHex(new Uint8Array(bits));
  await env.DB.prepare(`UPDATE hapkek_staff_users SET password_salt=?,password_hash=?,must_change_pin=0,failed_pin_attempts=0,locked_until=0 WHERE id=?`).bind(salt,hash,staff.id).run();
  await env.DB.prepare("DELETE FROM hapkek_staff_sessions WHERE staff_id=? AND token_hash<>?").bind(staff.id,await sha256Hex(cookieValue(request,"hapkek_staff"))).run();
  await rmsAudit(env,staff,"staff.pin_changed","staff",staff.username,{});
  return reply({ok:true});
}
async function staffLogout(request, env) {
  const token = cookieValue(request,"hapkek_staff");
  if (token) await env.DB.prepare("DELETE FROM hapkek_staff_sessions WHERE token_hash=?").bind(await sha256Hex(token)).run();
  return reply({ok:true},200,{"Set-Cookie":staffCookie("",0)});
}
async function staffRedeem(request, env, staff) {
  let body;
  try { body = await request.json(); } catch { return reply({error:"Invalid QR payload"},400); }
  const code = String(body?.code || "").trim().toUpperCase();
  if (!/^HAP-[A-HJ-NP-Z2-9]{10}$/.test(code)) return reply({error:"QR code is not a valid HAPKEK voucher"},400);
  const claim = await env.DB.prepare(`SELECT c.id,c.voucher_code,c.prize_id,p.label,c.claim_date,c.created_at,c.redeemed_at
    FROM hapkek_voucher_claims c JOIN hapkek_voucher_prizes p ON p.prize_id=c.prize_id
    WHERE c.voucher_code=?`).bind(code).first();
  if (!claim) return reply({valid:false,status:"not_found",error:"Voucher not found"},404);
  if (claim.redeemed_at) return reply({valid:false,status:"already_redeemed",error:"This voucher has already been redeemed",voucher:claim},409);
  const now = new Date().toISOString();
  // D1 batch is transactional: claim update and audit record either both commit or neither.
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE hapkek_voucher_claims SET redeemed_at=? WHERE id=? AND redeemed_at IS NULL`).bind(now,claim.id),
    env.DB.prepare(`INSERT INTO hapkek_voucher_redemptions(claim_id,staff_id)
      SELECT ?,? WHERE EXISTS (SELECT 1 FROM hapkek_voucher_claims WHERE id=? AND redeemed_at=?)`).bind(claim.id,staff.id,claim.id,now)
  ]);
  if (!results[0]?.meta?.changes) {
    const latest = await env.DB.prepare("SELECT redeemed_at FROM hapkek_voucher_claims WHERE id=?").bind(claim.id).first();
    return reply({valid:false,status:"already_redeemed",error:"This voucher has already been redeemed",redeemedAt:latest?.redeemed_at},409);
  }
  await rmsAudit(env, staff, "voucher.redeemed", "voucher", claim.voucher_code, { prizeId:claim.prize_id, label:claim.label });
  return reply({valid:true,status:"redeemed",voucher:{voucher_code:claim.voucher_code,prize_id:claim.prize_id,label:claim.label,claim_date:claim.claim_date,redeemed_at:now},staff:{username:staff.username,nickname:staff.display_name,displayName:staff.display_name,role:staff.role || "staff",mustChangePin:Boolean(staff.must_change_pin)}},200);
}


async function rmsUsers(env) {
  const rows=await env.DB.prepare(`SELECT id,username,display_name,role,active,must_change_pin,locked_until FROM hapkek_staff_users ORDER BY display_name COLLATE NOCASE`).all();
  return reply({users:(rows.results||[]).map(u=>({nickname:u.display_name,role:u.role,active:Boolean(u.active),mustChangePin:Boolean(u.must_change_pin),locked:Boolean(Number(u.locked_until||0)>Math.floor(Date.now()/1000))}))});
}
function generateStaffTemporaryPin() {
  const range = 0x100000000;
  const limit = Math.floor(range / 10000) * 10000;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return String(value[0] % 10000).padStart(4, "0");
}
async function rmsIssueTemporaryPin(request,env,admin) {
  // Ana is the designated initial administrator and the only person permitted
  // to issue Anmer's temporary PIN. Do not accept a PIN supplied by the browser.
  if (String(admin?.username || "").toLowerCase() !== "ana")
    return reply({error:"Only Ana can issue Anmer's temporary PIN"},403);
  let body; try { body=await request.json(); } catch { return reply({error:"Invalid request"},400); }
  const nickname=String(body?.nickname || "").trim();
  if (nickname.toLowerCase() !== "anmer")
    return reply({error:"This action is reserved for Anmer's staff account"},403);
  const user=await env.DB.prepare(
    "SELECT id,username,display_name,role FROM hapkek_staff_users WHERE username='Anmer' COLLATE NOCASE"
  ).first();
  if (!user || String(user.role || "").toLowerCase() !== "staff")
    return reply({error:"Anmer's pre-provisioned staff account was not found"},404);

  const pin=generateStaffTemporaryPin();
  const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:hexToBytes(salt),iterations:210000,hash:"SHA-256"},key,256);
  const hash=bytesToHex(new Uint8Array(bits));

  await env.DB.prepare(`UPDATE hapkek_staff_users
    SET password_salt=?,password_hash=?,active=1,must_change_pin=1,failed_pin_attempts=0,locked_until=0
    WHERE id=?`).bind(salt,hash,user.id).run();
  await env.DB.prepare("DELETE FROM hapkek_staff_sessions WHERE staff_id=?").bind(user.id).run();
  await rmsAudit(env,admin,"staff.temporary_pin_issued","staff",user.username,{
    role:"staff",issued_by:"Ana",delivery:"manual_by_Ana",requires_pin_change:true
  });
  // The clear-text PIN is returned only in this authenticated response to Ana.
  // It is never stored in the database, audit log, or shared staff directory.
  return reply({ok:true,nickname:user.display_name,temporaryPin:pin,requiresPinChange:true},200,{
    "Cache-Control":"no-store, private"
  });
}

const RMS_READ_ROLES = new Set(["owner", "admin", "manager"]);
const RMS_ADMIN_ROLES = new Set(["owner", "admin"]);
async function rmsOverview(env) {
  const [claims, prizes, scores, redemptions, staff] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS issued,
      SUM(CASE WHEN redeemed_at IS NOT NULL THEN 1 ELSE 0 END) AS redeemed,
      SUM(CASE WHEN redeemed_at IS NULL THEN 1 ELSE 0 END) AS outstanding
      FROM hapkek_voucher_claims WHERE claim_date=date('now','+8 hours')`).first(),
    env.DB.prepare(`SELECT p.prize_id,p.label,p.weight,p.daily_limit,p.active,
      (SELECT COUNT(*) FROM hapkek_voucher_claims c WHERE c.prize_id=p.prize_id AND c.claim_date=date('now','+8 hours')) AS issued_today
      FROM hapkek_voucher_prizes p ORDER BY p.prize_id`).all(),
    env.DB.prepare(`SELECT COUNT(*) AS plays FROM hapkek_scores WHERE date(created_at,'+8 hours')=date('now','+8 hours')`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM hapkek_voucher_redemptions WHERE date(redeemed_at,'+8 hours')=date('now','+8 hours')`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS active FROM hapkek_staff_users WHERE active=1`).first()
  ]);
  const c = claims || {};
  return { timezone:"Asia/Manila", date: new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10),
    metrics:{ playsToday:Number(scores?.plays||0), vouchersIssuedToday:Number(c.issued||0),
      vouchersRedeemedToday:Number(redemptions?.total||0), outstandingToday:Number(c.outstanding||0),
      activeStaff:Number(staff?.active||0) }, prizes:prizes.results||[] };
}
async function rmsVoucherList(env, url) {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const status = url.searchParams.get("status") || "all";
  const date = url.searchParams.get("date") || "";
  if (!(["all","issued","redeemed"].includes(status)) || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)))
    return reply({error:"Invalid voucher filters"},400);
  const conditions = [];
  const values = [];
  if (status === "issued") conditions.push("c.redeemed_at IS NULL");
  if (status === "redeemed") conditions.push("c.redeemed_at IS NOT NULL");
  if (date) { conditions.push("c.claim_date=?"); values.push(date); }
  const where = conditions.length ? "WHERE "+conditions.join(" AND ") : "";
  const rows = await env.DB.prepare(`SELECT c.voucher_code,c.player_id,c.prize_id,p.label,c.claim_date,c.created_at,c.redeemed_at,
      u.display_name AS redeemed_by
    FROM hapkek_voucher_claims c JOIN hapkek_voucher_prizes p ON p.prize_id=c.prize_id
    LEFT JOIN hapkek_voucher_redemptions r ON r.claim_id=c.id
    LEFT JOIN hapkek_staff_users u ON u.id=r.staff_id
    ${where} ORDER BY c.created_at DESC LIMIT ?`).bind(...values,limit).all();
  return reply({vouchers:rows.results||[],limit});
}
async function rmsAudit(env, staff, action, entityType, entityId, details={}) {
  await env.DB.prepare(`INSERT INTO hapkek_rms_audit_logs(actor_staff_id,action,entity_type,entity_id,details_json)
    VALUES(?,?,?,?,?)`).bind(staff?.id||null,action,entityType,String(entityId||""),JSON.stringify(details)).run();
}

const isWebmaster = staff =>
  String(staff?.username || "").toLowerCase() === "webmaster" &&
  String(staff?.role || "").toLowerCase() === "owner";

async function rmsWebmasterExport(env) {
  const [scores, prizes, claims, redemptions, users, sales, saleItems, audit] = await Promise.all([
    env.DB.prepare("SELECT * FROM hapkek_scores ORDER BY id").all(),
    env.DB.prepare("SELECT * FROM hapkek_voucher_prizes ORDER BY prize_id").all(),
    env.DB.prepare("SELECT * FROM hapkek_voucher_claims ORDER BY id").all(),
    env.DB.prepare("SELECT * FROM hapkek_voucher_redemptions ORDER BY id").all(),
    env.DB.prepare("SELECT username,display_name,role,active,must_change_pin,created_at,failed_pin_attempts,locked_until FROM hapkek_staff_users ORDER BY id").all(),
    env.DB.prepare("SELECT * FROM hapkek_pos_sales ORDER BY id").all(),
    env.DB.prepare("SELECT * FROM hapkek_pos_sale_items ORDER BY id").all(),
    env.DB.prepare("SELECT id,actor_staff_id,action,entity_type,entity_id,details_json,created_at FROM hapkek_rms_audit_logs ORDER BY id").all()
  ]);
  const exportedAt = new Date().toISOString();
  return reply({
    format:"hapkek-rms-state-export",
    version:1,
    exportedAt,
    timezone:"Asia/Manila",
    data:{
      scores:scores.results||[],
      voucherPrizes:prizes.results||[],
      voucherClaims:claims.results||[],
      voucherRedemptions:redemptions.results||[],
      staffUsers:users.results||[],
      posSales:sales.results||[],
      posSaleItems:saleItems.results||[],
      auditLogs:audit.results||[]
    },
    security:{
      included:"Operational records and staff account status",
      excluded:"PIN hashes, PIN salts, authentication sessions, and API secrets"
    }
  },200,{
    "Cache-Control":"no-store, private",
    "Content-Disposition":`attachment; filename="HAPKEK_RMS_state_${exportedAt.slice(0,10)}.json"`
  });
}

async function rmsWebmasterMasterReset(request, env, webmaster) {
  if (!isWebmaster(webmaster)) return reply({error:"Webmaster access required"},403);
  let body;
  try { body=await request.json(); } catch { return reply({error:"Invalid confirmation"},400); }
  if (body?.confirmation !== "RESET STAFF ACCESS")
    return reply({error:"Type RESET STAFF ACCESS exactly to confirm"},400);

  const before=await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM hapkek_staff_users WHERE username <> 'Webmaster' COLLATE NOCASE AND active=1"
  ).first();
  const token=cookieValue(request,"hapkek_staff");
  if(!token) return reply({error:"Authentication required"},401);
  const tokenHash=await sha256Hex(token);

  await env.DB.prepare(`UPDATE hapkek_staff_users
    SET active=0,must_change_pin=1,failed_pin_attempts=0,locked_until=0
    WHERE username <> 'Webmaster' COLLATE NOCASE`).run();
  const revoked=await env.DB.prepare(
    "DELETE FROM hapkek_staff_sessions WHERE token_hash <> ?"
  ).bind(tokenHash).run();

  await rmsAudit(env,webmaster,"webmaster.master_reset","staff_access","all_non_webmaster",{
    disabledAccounts:Number(before?.total||0),
    revokedSessions:Number(revoked.meta?.changes||0),
    preserved:["game scores","voucher claims","voucher redemptions","POS sales","POS sale items","audit history","voucher prize inventory"]
  });
  return reply({
    ok:true,
    disabledAccounts:Number(before?.total||0),
    revokedSessions:Number(revoked.meta?.changes||0),
    message:"All non-Webmaster staff accounts were disabled and their sessions revoked. Operational records were preserved."
  });
}



const POS_UNIT_PRICE_PESOS = 150;
const POS_PIECES_PER_BOX = 15;
const POS_MAX_BOXES = 99;
const POS_FLAVORS = new Set(["bavarian","cheese","ube","choco","strawberry"]);
const POS_FLAVOR_LABELS = {bavarian:"Bavarian",cheese:"Cheese",ube:"Ube",choco:"Choco",strawberry:"Strawberry"};
const posManilaDate = () => new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);
function posReceiptNumber() {
  const bytes=crypto.getRandomValues(new Uint8Array(4));
  return "HAP-"+posManilaDate().replace(/-/g,"")+"-"+Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
}
async function posLoadSale(env,requestId,duplicate=false) {
  const sale=await env.DB.prepare("SELECT * FROM hapkek_pos_sales WHERE client_request_id=?").bind(requestId).first();
  if(!sale)return null;
  const rows=await env.DB.prepare("SELECT flavor,boxes_sold AS boxes,pieces_sold AS pieces,unit_price_pesos AS unitPricePesos,line_total_pesos AS lineTotalPesos FROM hapkek_pos_sale_items WHERE sale_id=? ORDER BY flavor").bind(sale.id).all();
  return {id:Number(sale.id),receiptNo:sale.receipt_no,boxes:Number(sale.boxes_sold),pieces:Number(sale.pieces_sold),
    unitPricePesos:Number(sale.unit_price_pesos),totalPesos:Number(sale.total_pesos),paymentMethod:sale.payment_method,
    amountTenderedPesos:Number(sale.amount_tendered_pesos),changeDuePesos:Number(sale.change_due_pesos),
    customerName:sale.customer_name||"",orderNotes:sale.order_notes||"",paymentReference:sale.payment_reference||"",
    cashierName:sale.cashier_name,createdAt:sale.created_at,
    items:(rows.results||[]).map(x=>({flavor:x.flavor,flavorLabel:POS_FLAVOR_LABELS[x.flavor],boxes:Number(x.boxes),pieces:Number(x.pieces),unitPricePesos:Number(x.unitPricePesos),lineTotalPesos:Number(x.lineTotalPesos)})),
    duplicate};
}
async function rmsPosCheckout(request,env,staff) {
  let body;try{body=await request.json();}catch{return reply({error:"Invalid checkout request"},400);}
  const requestId=String(body?.requestId||""),paymentMethod=String(body?.paymentMethod||"cash").toLowerCase();
  if(!/^[A-Za-z0-9_-]{16,80}$/.test(requestId))return reply({error:"A valid checkout request ID is required"},400);
  if(!["cash","gcash","card"].includes(paymentMethod))return reply({error:"Choose cash, GCash, or card"},400);
  if(!Array.isArray(body?.items)||body.items.length<1||body.items.length>5)return reply({error:"Choose at least one flavor"},400);
  const seen=new Set(),items=[];let boxes=0;
  for(const item of body.items){
    const flavor=String(item?.flavor||"").toLowerCase(),count=Number(item?.boxes);
    if(!POS_FLAVORS.has(flavor)||seen.has(flavor)||!Number.isInteger(count)||count<1||count>POS_MAX_BOXES)
      return reply({error:"Invalid flavor or box quantity"},400);
    seen.add(flavor);boxes+=count;
    items.push({flavor,boxes:count,pieces:count*POS_PIECES_PER_BOX,lineTotal:count*POS_UNIT_PRICE_PESOS});
  }
  if(boxes<1||boxes>POS_MAX_BOXES)return reply({error:"An order can contain between 1 and 99 boxes"},400);
  const total=boxes*POS_UNIT_PRICE_PESOS;
  const customerName=String(body?.customerName||"").replace(/[<>\x00-\x1f]/g,"").trim();
  const orderNotes=String(body?.orderNotes||"").replace(/[<>\x00-\x1f]/g,"").trim();
  const paymentReference=String(body?.paymentReference||"").replace(/[<>\x00-\x1f]/g,"").trim();
  if(customerName.length>80||orderNotes.length>500||paymentReference.length>100)
    return reply({error:"Customer name, order notes, or payment reference is too long"},400);
  const tendered=paymentMethod==="cash"?Number(body?.amountTenderedPesos):total;
  if(!Number.isSafeInteger(tendered)||tendered<total)return reply({error:"Cash received must be a whole peso amount at least equal to the total"},400);
  const duplicate=await posLoadSale(env,requestId,true);
  if(duplicate)return reply({ok:true,sale:duplicate},200);
  const receiptNo=posReceiptNumber(),createdAt=new Date().toISOString();
  const statements=[env.DB.prepare("INSERT INTO hapkek_pos_sales (receipt_no,client_request_id,boxes_sold,pieces_sold,unit_price_pesos,total_pesos,payment_method,amount_tendered_pesos,change_due_pesos,cashier_staff_id,cashier_name,created_at,customer_name,order_notes,payment_reference) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(receiptNo,requestId,boxes,boxes*POS_PIECES_PER_BOX,POS_UNIT_PRICE_PESOS,total,paymentMethod,tendered,tendered-total,staff.id,staff.display_name,createdAt,customerName,orderNotes,paymentReference)];
  for(const item of items)statements.push(env.DB.prepare("INSERT INTO hapkek_pos_sale_items (sale_id,flavor,boxes_sold,pieces_sold,unit_price_pesos,line_total_pesos) SELECT id,?,?,?,?,? FROM hapkek_pos_sales WHERE client_request_id=?")
    .bind(item.flavor,item.boxes,item.pieces,POS_UNIT_PRICE_PESOS,item.lineTotal,requestId));
  try{await env.DB.batch(statements);}catch(error){
    const retry=await posLoadSale(env,requestId,true);if(retry)return reply({ok:true,sale:retry},200);
    console.error("POS D1 batch failed",error);return reply({error:"Sale was not saved. No receipt was issued."},500);
  }
  const sale=await posLoadSale(env,requestId,false);
  if(!sale)return reply({error:"Sale saved but receipt could not be loaded. Check recent sales before retrying."},500);
  try{await rmsAudit(env,staff,"pos.sale_created","pos_sale",sale.receiptNo,{boxes:sale.boxes,pieces:sale.pieces,totalPesos:sale.totalPesos,paymentMethod,customerName,orderNotes,paymentReference,items:sale.items.map(x=>({flavor:x.flavor,boxes:x.boxes}))});}
  catch(error){console.error("POS audit write failed",error);}
  return reply({ok:true,sale},201);
}
async function rmsPosSummary(env) {
  const row=await env.DB.prepare("SELECT COUNT(*) AS orders,COALESCE(SUM(boxes_sold),0) AS boxes,COALESCE(SUM(pieces_sold),0) AS pieces,COALESCE(SUM(total_pesos),0) AS gross_pesos FROM hapkek_pos_sales WHERE date(created_at,'+8 hours')=date('now','+8 hours')").first();
  const flavorRows=await env.DB.prepare("SELECT i.flavor,SUM(i.boxes_sold) AS boxes,SUM(i.pieces_sold) AS pieces FROM hapkek_pos_sale_items i JOIN hapkek_pos_sales s ON s.id=i.sale_id WHERE date(s.created_at,'+8 hours')=date('now','+8 hours') GROUP BY i.flavor ORDER BY i.flavor").all();
  return reply({timezone:"Asia/Manila",date:posManilaDate(),metrics:{orders:Number(row?.orders||0),boxes:Number(row?.boxes||0),pieces:Number(row?.pieces||0),grossPesos:Number(row?.gross_pesos||0)},
    flavors:(flavorRows.results||[]).map(x=>({flavor:x.flavor,label:POS_FLAVOR_LABELS[x.flavor]||x.flavor,boxes:Number(x.boxes||0),pieces:Number(x.pieces||0)}))});
}
async function rmsPosSales(url,env) {
  const limit=Math.min(50,Math.max(1,Number(url.searchParams.get("limit")||15)));
  if(!Number.isInteger(limit))return reply({error:"Invalid sales limit"},400);
  const rows=await env.DB.prepare("SELECT * FROM hapkek_pos_sales ORDER BY created_at DESC,id DESC LIMIT ?").bind(limit).all();
  const sales=[];
  for(const row of rows.results||[]){
    const items=await env.DB.prepare("SELECT flavor,boxes_sold AS boxes,pieces_sold AS pieces FROM hapkek_pos_sale_items WHERE sale_id=? ORDER BY flavor").bind(row.id).all();
    sales.push({id:Number(row.id),receiptNo:row.receipt_no,boxes:Number(row.boxes_sold),pieces:Number(row.pieces_sold),totalPesos:Number(row.total_pesos),
      paymentMethod:row.payment_method,customerName:row.customer_name||"",orderNotes:row.order_notes||"",paymentReference:row.payment_reference||"",
      cashierName:row.cashier_name,createdAt:row.created_at,
      items:(items.results||[]).map(x=>({flavor:x.flavor,label:POS_FLAVOR_LABELS[x.flavor]||x.flavor,boxes:Number(x.boxes),pieces:Number(x.pieces)}))});
  }
  return reply({sales});
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const staffOrigin = env.STAFF_APP_ORIGIN || "";
    const staffCors = origin && staffOrigin && origin === staffOrigin
      ? { "Access-Control-Allow-Origin": staffOrigin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" }
      : {};
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      ...cors, ...staffCors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }});
    const url = new URL(request.url);
    const staffPath = url.pathname.startsWith("/api/staff/") || url.pathname.startsWith("/api/rms/") || url.pathname.startsWith("/api/webmaster/");
    if (staffPath && origin && origin !== staffOrigin) return reply({error:"Origin not allowed"},403);
    if (url.pathname === "/api/webmaster/bootstrap" && request.method === "POST") {
      const secret=env.WEBMASTER_BOOTSTRAP_TOKEN||"";
      const supplied=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
      const suppliedHash=await sha256Hex(supplied), expectedHash=await sha256Hex(secret);
      let authDiff=suppliedHash.length^expectedHash.length;
      for(let i=0;i<Math.min(suppliedHash.length,expectedHash.length);i++) authDiff|=suppliedHash.charCodeAt(i)^expectedHash.charCodeAt(i);
      if(!secret || !supplied || authDiff!==0) {
        const response=reply({error:"Setup link is invalid or expired"},403);
        for (const [k,v] of Object.entries(staffCors)) response.headers.set(k,v);
        return response;
      }
      let body; try{body=await request.json();}catch{return reply({error:"Invalid request"},400);}
      const pin=String(body?.temporaryPin||"");
      if(!/^\d{4}$/.test(pin)) return reply({error:"Enter a 4-digit temporary PIN"},400);
      const existing=await env.DB.prepare("SELECT id FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE").first();
      if(existing) return reply({error:"Webmaster is already provisioned. Use the normal login or recovery process."},409);
      const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
      const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:hexToBytes(salt),iterations:210000,hash:"SHA-256"},key,256);
      const hash=bytesToHex(new Uint8Array(bits));
      const inserted=await env.DB.prepare(`INSERT INTO hapkek_staff_users
        (username,display_name,password_salt,password_hash,active,role,must_change_pin,failed_pin_attempts,locked_until)
        VALUES('Webmaster','Webmaster',?,?,1,'owner',1,0,0)`).bind(salt,hash).run();
      const staffId=inserted.meta?.last_row_id || null;
      await rmsAudit(env,{id:staffId},"webmaster.provisioned","staff","Webmaster",{requiresPinChange:true});
      const response=reply({ok:true,nickname:"Webmaster",requiresPinChange:true});
      for (const [k,v] of Object.entries(staffCors)) response.headers.set(k,v);
      return response;
    }
    if (url.pathname === "/api/webmaster/recovery/temporary-pin" && request.method === "POST") {
      const secret=env.WEBMASTER_RECOVERY_TOKEN||"";
      const supplied=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
      const suppliedHash=await sha256Hex(supplied), expectedHash=await sha256Hex(secret); let authDiff=suppliedHash.length^expectedHash.length; for(let i=0;i<Math.min(suppliedHash.length,expectedHash.length);i++) authDiff|=suppliedHash.charCodeAt(i)^expectedHash.charCodeAt(i); if(!secret || !supplied || authDiff!==0) return reply({error:"Not authorized"},403);
      let body; try{body=await request.json();}catch{return reply({error:"Invalid request"},400);}
      const pin=String(body?.temporaryPin||""); if(!/^\d{4}$/.test(pin)) return reply({error:"A 4-digit temporary PIN is required"},400);
      const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
      const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:hexToBytes(salt),iterations:210000,hash:"SHA-256"},key,256);
      const hash=bytesToHex(new Uint8Array(bits));
      const webmaster=await env.DB.prepare("SELECT id FROM hapkek_staff_users WHERE username='Webmaster' COLLATE NOCASE AND role='owner'").first();
      if(!webmaster) return reply({error:"Webmaster account has not been provisioned"},404);
      await env.DB.prepare("UPDATE hapkek_staff_users SET password_salt=?,password_hash=?,active=1,must_change_pin=1,failed_pin_attempts=0,locked_until=0 WHERE id=?").bind(salt,hash,webmaster.id).run();
      await env.DB.prepare("DELETE FROM hapkek_staff_sessions WHERE staff_id=?").bind(webmaster.id).run();
      await rmsAudit(env,{id:webmaster.id},"webmaster.pin_reset","staff","Webmaster",{});
      return reply({ok:true,nickname:"Webmaster",requiresPinChange:true});
    }
    if (url.pathname === "/api/staff/users" && request.method === "GET") {
      const response = await staffDirectory(env); for (const [k,v] of Object.entries(staffCors)) response.headers.set(k,v); return response;
    }
    if (url.pathname === "/api/staff/login" && request.method === "POST") {
      const response = await staffLogin(request, env);
      for (const [k,v] of Object.entries(staffCors)) response.headers.set(k,v);
      return response;
    }
    if (url.pathname === "/api/staff/change-pin" && request.method === "POST") {
      const staff=await staffFromRequest(request,env); const response=staff?await staffChangePin(request,env,staff):reply({error:"Authentication required"},401); for (const [k,v] of Object.entries(staffCors)) response.headers.set(k,v); return response;
    }
    if (url.pathname === "/api/staff/logout" && request.method === "POST") {
      const response = await staffLogout(request, env);
      for (const [k,v] of Object.entries(staffCors)) response.headers.set(k,v);
      return response;
    }
    if (url.pathname === "/api/staff/me" && request.method === "GET") {
      const staff = await staffFromRequest(request,env);
      const response = staff ? reply({ok:true,staff:{username:staff.username,nickname:staff.display_name,displayName:staff.display_name,role:staff.role || "staff",mustChangePin:Boolean(staff.must_change_pin)}})
        : reply({error:"Authentication required"},401);
      for (const [k,v] of Object.entries(staffCors)) response.headers.set(k,v);
      return response;
    }
    if (url.pathname === "/api/staff/redeem" && request.method === "POST") {
      const staff = await staffFromRequest(request,env);
      const response = !staff ? reply({error:"Authentication required"},401) : staff.must_change_pin ? reply({error:"Set your permanent PIN before using the staff app"},403) : await staffRedeem(request,env,staff);
      for (const [k,v] of Object.entries(staffCors)) response.headers.set(k,v);
      return response;
    }
    if (url.pathname.startsWith("/api/rms/")) {
      const staff = await staffFromRequest(request,env);
      let response;
      if (!staff) response = reply({error:"Authentication required"},401);
      else if (staff.must_change_pin) response = reply({error:"Set your permanent PIN before using RMS"},403);
      else if (url.pathname === "/api/rms/webmaster/export" && request.method === "GET") {
        if (!isWebmaster(staff)) response = reply({error:"Webmaster access required"},403);
        else { try { response = await rmsWebmasterExport(env); } catch (error) { console.error("Webmaster export failed",error); response = reply({error:"Could not export current RMS state"},500); } }
      } else if (url.pathname === "/api/rms/webmaster/master-reset" && request.method === "POST") {
        if (!isWebmaster(staff)) response = reply({error:"Webmaster access required"},403);
        else { try { response = await rmsWebmasterMasterReset(request,env,staff); } catch (error) { console.error("Webmaster master reset failed",error); response = reply({error:"Master reset did not complete"},500); } }
      } else if (url.pathname === "/api/rms/pos/checkout" && request.method === "POST") {
        try { response = await rmsPosCheckout(request,env,staff); }
        catch (error) { console.error("POS checkout error",error); response = reply({error:"Could not complete checkout"},500); }
      } else if (url.pathname === "/api/rms/pos/summary" && request.method === "GET" && RMS_READ_ROLES.has(staff.role || "staff")) {
        try { response = await rmsPosSummary(env); } catch { response = reply({error:"Could not load POS summary"},500); }
      } else if (url.pathname === "/api/rms/pos/sales" && request.method === "GET" && RMS_READ_ROLES.has(staff.role || "staff")) {
        try { response = await rmsPosSales(url,env); } catch { response = reply({error:"Could not load POS sales"},500); }
      } else if (url.pathname.startsWith("/api/rms/pos/")) response = reply({error:"Management access required"},403);
      else if (url.pathname === "/api/rms/users" && request.method === "GET" && RMS_ADMIN_ROLES.has(staff.role)) response = await rmsUsers(env);
      else if (url.pathname === "/api/rms/users/temporary-pin" && request.method === "POST" && RMS_ADMIN_ROLES.has(staff.role)) response = await rmsIssueTemporaryPin(request,env,staff);
      else if (!RMS_READ_ROLES.has(staff.role || "staff")) response = reply({error:"RMS access required"},403);
      else if (url.pathname === "/api/rms/overview" && request.method === "GET") {
        try { response = reply(await rmsOverview(env)); }
        catch { response = reply({error:"Could not load RMS overview"},500); }
      } else if (url.pathname === "/api/rms/vouchers" && request.method === "GET") {
        try { response = await rmsVoucherList(env,url); }
        catch { response = reply({error:"Could not load voucher records"},500); }
      } else if (url.pathname === "/api/rms/audit" && request.method === "GET") {
        try {
          const rows = await env.DB.prepare(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.details_json,a.created_at,u.username,u.display_name
            FROM hapkek_rms_audit_logs a LEFT JOIN hapkek_staff_users u ON u.id=a.actor_staff_id
            ORDER BY a.created_at DESC LIMIT 100`).all();
          response = reply({events:rows.results||[]});
        } catch { response = reply({error:"Could not load audit history"},500); }
      } else response = reply({error:"Not found"},404);
      for (const [k,v] of Object.entries(staffCors)) response.headers.set(k,v);
      return response;
    }
    if (url.pathname === "/health") return reply({ ok: true, service: "hapkek-leaderboard" });
    if (url.pathname === "/api/vouchers/claim" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return reply({ error: "Invalid JSON" }, 400); }
      const playerId = body?.playerId;
      if (!validId(playerId)) return reply({ error: "Invalid player ID" }, 400);
      try {
        const result = await claimVoucher(env, playerId);
        return reply(result, result.ok ? 200 : 409);
      } catch (error) {
        return reply({ error: "Could not issue voucher" }, 500);
      }
    }
    if (url.pathname === "/api/scores" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return reply({ error: "Invalid JSON" }, 400); }
      const gameId = body?.gameId, playerId = body?.playerId;
      const displayName = cleanName(body?.displayName), elapsedMs = Number(body?.elapsedMs);
      if (!validId(gameId) || !validId(playerId) || displayName.length < 2 ||
          !Number.isInteger(elapsedMs) || elapsedMs < 100 || elapsedMs > 3600000)
        return reply({ error: "Invalid score submission" }, 400);
      try {
        const result = await env.DB.prepare(
          "INSERT OR IGNORE INTO hapkek_scores (game_id, player_id, display_name, elapsed_ms) VALUES (?, ?, ?, ?)"
        ).bind(gameId, playerId, displayName, elapsedMs).run();
        if (!result.meta?.changes) return reply({ error: "This game result was already submitted" }, 409);
        return reply({ ok: true, saved: true }, 201);
      } catch { return reply({ error: "Could not save score" }, 500); }
    }
    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      const period = url.searchParams.get("period") || "daily";
      const playerId = url.searchParams.get("playerId") || "";
      if (!periods[period] || (playerId && !validId(playerId)))
        return reply({ error: "Invalid leaderboard request" }, 400);
      try { return reply(await getBoard(env, period, playerId)); }
      catch { return reply({ error: "Could not load leaderboard" }, 500); }
    }
    return reply({ error: "Not found" }, 404);
  }
};
