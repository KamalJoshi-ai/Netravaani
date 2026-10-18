// NetraVaani mock backend, updated for nv-2.0.0's fixed command table
// (C01..C07 / YES, NO, CALL_NURSE, PAIN, WATER, I_WANT_TO_REST, CANT_BREATHE_NEED_SUCTION).
// Lets the hardware person test the device end to end before the real backend is ready.
//   node mock-backend.js        then open http://localhost:4000
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;
const devices = {};
const events = new Set();
const requests = [];
const log = [];
let nextDevice = 1, nextRequest = 1;

const configPath = path.join(__dirname, 'config.json');
const readConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));

function note(msg) {
  const line = new Date().toLocaleTimeString() + '  ' + msg;
  console.log(line);
  log.unshift(line);
  log.length = Math.min(log.length, 300);
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); } });
  });
}
function authDevice(req, deviceId) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const d = devices[deviceId];
  return d && d.token === token ? d : null;
}
function lanIps() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    return res.end();
  }
  if (req.method === 'GET' && (p === '/' || p === '/setup')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(path.join(__dirname, p === '/' ? 'dashboard.html' : 'nv-setup.html')));
  }
  if (req.method === 'GET' && p === '/api/info') return send(res, 200, { port: PORT, lanIps: lanIps() });
  if (req.method === 'GET' && p === '/api/state') return send(res, 200, { devices, requests, log, config: readConfig() });

  if (req.method === 'POST' && p === '/api/devices/register') {
    const b = await body(req);
    if (!b || !b.hardwareId) return send(res, 400, { error: 'hardwareId required' });
    let id = Object.keys(devices).find((k) => devices[k].hardwareId === b.hardwareId);
    if (!id) {
      id = 'NPG-' + String(nextDevice++).padStart(3, '0');
      devices[id] = { hardwareId: b.hardwareId, token: crypto.randomBytes(24).toString('hex'),
                      lastSeen: null, status: {}, appliedVersion: 0, silencePending: false };
      note(`registered ${id} (${b.hardwareId})`);
    } else {
      note(`${id} already registered, returning same id`);
    }
    return send(res, 200, { deviceId: id, token: devices[id].token });
  }

  if (req.method === 'POST' && p === '/api/device-events') {
    const b = await body(req);
    if (!b || !b.eventId || !b.deviceId) return send(res, 400, { error: 'eventId and deviceId required' });
    const d = authDevice(req, b.deviceId);
    if (!d) return send(res, 401, { error: 'bad device credentials' });
    if (events.has(b.eventId)) { note(`duplicate ${b.eventId} ignored`); return send(res, 200, { duplicate: true }); }
    events.add(b.eventId);
    d.lastSeen = Date.now();
    if (b.eventType === 'PATIENT_REQUEST') {
      const r = { id: nextRequest++, deviceId: b.deviceId, action: b.action, gestureId: b.gestureId,
                  gesture: b.gesture, urgent: !!b.urgent, status: 'NEW',
                  occurredAt: b.occurredAt, receivedAt: new Date().toISOString() };
      requests.unshift(r);
      note(`REQUEST #${r.id} ${b.action}${r.urgent ? ' [URGENT]' : ''} from ${b.deviceId} (${b.gesture || b.gestureId})`);
      return send(res, 201, { accepted: true, requestId: r.id });
    }
    if (b.eventType === 'CONFIG_APPLIED') d.appliedVersion = b.appliedVersion;
    note(`${b.eventType} from ${b.deviceId} ${JSON.stringify(b.channels || b.error || b.appliedVersion || b.reason || '')}`);
    return send(res, 201, { accepted: true });
  }

  let m = p.match(/^\/api\/devices\/([^/]+)\/(heartbeat|config)$/);
  if (m) {
    const d = authDevice(req, m[1]);
    if (!d) return send(res, 401, { error: 'bad device credentials' });
    d.lastSeen = Date.now();
    if (m[2] === 'heartbeat' && req.method === 'POST') {
      d.status = await body(req);
      const reply = { desiredConfigVersion: readConfig().version, silenceAlarm: d.silencePending };
      d.silencePending = false;
      return send(res, 200, reply);
    }
    if (m[2] === 'config' && req.method === 'GET') return send(res, 200, { ...readConfig(), deviceId: m[1] });
  }

  m = p.match(/^\/api\/requests\/(\d+)\/(acknowledge|resolve)$/);
  if (m && req.method === 'POST') {
    const r = requests.find((x) => x.id === Number(m[1]));
    if (!r) return send(res, 404, { error: 'not found' });
    r.status = m[2] === 'acknowledge' ? 'ACKNOWLEDGED' : 'RESOLVED';
    if (m[2] === 'acknowledge' && r.urgent && devices[r.deviceId]) devices[r.deviceId].silencePending = true;
    note(`request #${r.id} ${r.status}`);
    return send(res, 200, r);
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nNetraVaani mock backend (nv-2.0.0 command set) on port ${PORT}`);
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log(`  Setup page: http://localhost:${PORT}/setup`);
  console.log(`  Backend URL for the device (same Wi-Fi):`);
  lanIps().forEach((ip) => console.log(`     http://${ip}:${PORT}`));
  console.log('');
});
