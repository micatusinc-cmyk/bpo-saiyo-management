const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

webpush.setVapidDetails(
  "mailto:" + (process.env.VAPID_SUBJECT_EMAIL || "admin@example.com"),
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function jstNow() {
  var now = new Date();
  var utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 9 * 3600000);
}

function todayStrJST(jst) {
  return jst.getFullYear() + "-" + String(jst.getMonth() + 1).padStart(2, "0") + "-" + String(jst.getDate()).padStart(2, "0");
}

function parseDate(s) {
  if (!s) return null;
  var p = s.split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function daysBetween(a, b) {
  return Math.round((a - b) / 86400000);
}

function computeAlerts(items, todayLocal) {
  var over = [], soon = [];
  (items || []).forEach(function (c) {
    if (c.status === "rejected") return;
    var due = c.due && c.due[c.stage];
    if (!due) return;
    var n = daysBetween(parseDate(due), todayLocal);
    if (n < 0) over.push(c); else if (n <= 1) soon.push(c);
  });
  return { over: over, soon: soon };
}

async function supaFetch(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign(
    { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
    opts.headers || {}
  );
  var res = await fetch(SUPABASE_URL + path, opts);
  return res;
}

module.exports = async (req, res) => {
  try {
    var stateRes = await supaFetch("/rest/v1/app_state?id=eq.1&select=data");
    var rows = await stateRes.json();
    if (!rows || !rows[0]) return res.status(200).json({ ok: true, skip: "no-data" });
    var appData = rows[0].data;
    var s = appData.settings || {};
    if (!s.notify) return res.status(200).json({ ok: true, skip: "disabled" });
    var times = Array.isArray(s.notifyTimes) ? s.notifyTimes : [];
    if (!times.length) return res.status(200).json({ ok: true, skip: "no-times" });

    var jst = jstNow();
    var todayStr = todayStrJST(jst);
    var curMinutes = jst.getHours() * 60 + jst.getMinutes();
    var todayLocalMidnight = new Date(jst.getFullYear(), jst.getMonth(), jst.getDate());

    var sentLog = s.notifySentLog || {};
    var dueSlot = null;
    for (var i = 0; i < times.length; i++) {
      var t = times[i];
      var parts = t.split(":").map(Number);
      var slotMinutes = parts[0] * 60 + parts[1];
      if (slotMinutes <= curMinutes && sentLog[t] !== todayStr) { dueSlot = t; break; }
    }
    if (!dueSlot) return res.status(200).json({ ok: true, skip: "no-due-slot" });

    sentLog[dueSlot] = todayStr;
    s.notifySentLog = sentLog;
    appData.settings = s;
    await supaFetch("/rest/v1/app_state?id=eq.1", { method: "PATCH", body: JSON.stringify({ data: appData }) });

    var alerts = computeAlerts(appData.items, todayLocalMidnight);
    if (!alerts.over.length && !alerts.soon.length) {
      return res.status(200).json({ ok: true, sent: dueSlot, skip: "no-alerts" });
    }

    var names = alerts.over.slice(0, 3).map(function (c) { return c.name; }).join("・");
    var body = "遅延 " + alerts.over.length + "件 ・ 要注意 " + alerts.soon.length + "件" +
      (names ? "\n" + names + (alerts.over.length > 3 ? " 他" : "") : "");
    var payload = JSON.stringify({ title: "BPO採用管理", body: body });

    var subsRes = await supaFetch("/rest/v1/push_subscriptions?select=*");
    var subs = await subsRes.json();

    var results = await Promise.all((subs || []).map(async function (sub) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        return "ok";
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supaFetch("/rest/v1/push_subscriptions?endpoint=eq." + encodeURIComponent(sub.endpoint), { method: "DELETE" });
        }
        return "fail";
      }
    }));

    return res.status(200).json({ ok: true, sent: dueSlot, subscribers: subs.length, results: results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
