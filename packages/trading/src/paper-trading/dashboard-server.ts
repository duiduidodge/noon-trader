/**
 * Paper Trading Dashboard Server
 *
 * Lightweight HTTP server that serves a monitoring dashboard for the paper
 * trading system. Exposes:
 *   GET /          → HTML dashboard
 *   GET /api/state → JSON { state, logs }
 *
 * Auth: optional ?token=<value> checked against DASHBOARD_AUTH_SECRET env var.
 */

import * as http from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type { PaperTradingState } from './types.js';
import { loadState } from './trade-state.js';

// ── Ring buffer for recent logs ───────────────────────────────────────────────

const MAX_LOGS = 200;
const _logBuffer: { ts: string; msg: string }[] = [];

export function appendLog(msg: string): void {
  _logBuffer.push({ ts: new Date().toISOString(), msg });
  if (_logBuffer.length > MAX_LOGS) _logBuffer.shift();
}

// ── Server singleton guard ────────────────────────────────────────────────────

let _serverStarted = false;
let _prisma: PrismaClient | undefined;

export function startDashboardServer(prisma?: PrismaClient, port = 8080): void {
  if (_serverStarted) return;
  _serverStarted = true;
  _prisma = prisma;

  try {
    const secret = process.env.DASHBOARD_AUTH_SECRET ?? '';

    const server = http.createServer((req, res) => {
      const rawUrl = req.url ?? '/';
      const url = new URL(rawUrl, 'http://localhost');
      const path = url.pathname;

      // ── Auth check ────────────────────────────────────────────────────────
      if (secret) {
        const token = url.searchParams.get('token') ?? '';
        if (token !== secret) {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('Unauthorized');
          return;
        }
      }

      if (path === '/api/state') {
        handleApiState(res);
      } else if (path === '/' || path === '') {
        handleDashboard(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });

    server.listen(port, '0.0.0.0', () => {
      console.log(`[dashboard] Listening on http://0.0.0.0:${port}`);
    });

    server.on('error', (err) => {
      console.error(`[dashboard] Server error: ${err.message}`);
    });
  } catch (err) {
    console.error(`[dashboard] Failed to start: ${(err as Error).message}`);
  }
}

// ── API handler ───────────────────────────────────────────────────────────────

async function handleApiState(res: http.ServerResponse): Promise<void> {
  try {
    const state: PaperTradingState = await loadState(1000, _prisma);
    const logs = [..._logBuffer].reverse(); // newest first
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    });
    res.end(JSON.stringify({ state, logs }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
}

// ── Dashboard HTML handler ────────────────────────────────────────────────────

function handleDashboard(res: http.ServerResponse): void {
  const html = buildHtml();
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

// ── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml(): string {
  const js = buildJs();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Paper Trading Dashboard</title>
<style>
  :root {
    --bg:       #0a0a0a;
    --bg1:      #111111;
    --bg2:      #161616;
    --border:   #1e1e1e;
    --text:     #c8c8c8;
    --text-dim: #4a4a4a;
    --green:    #00e676;
    --red:      #ff5252;
    --amber:    #ffab40;
    --blue:     #448aff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.5;
  }
  a { color: var(--blue); text-decoration: none; }

  /* ── Header ── */
  .header {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .header-left { display: flex; flex-direction: column; gap: 2px; }
  .header-title { color: var(--green); font-size: 14px; font-weight: 700; letter-spacing: 1px; }
  .header-sub   { color: var(--text-dim); font-size: 11px; }
  .header-right { display: flex; align-items: center; gap: 12px; }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%; display: inline-block;
  }
  .status-active  { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .status-halted  { background: var(--red);   box-shadow: 0 0 6px var(--red);   }
  .status-unknown { background: var(--text-dim); }
  .header-meta { color: var(--text-dim); font-size: 11px; }
  .refresh-row { display: flex; align-items: center; gap: 6px; }
  .btn {
    background: var(--bg1);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: inherit;
    font-size: 11px;
    padding: 3px 8px;
    cursor: pointer;
    border-radius: 2px;
  }
  .btn:hover { border-color: var(--blue); color: var(--blue); }

  /* ── Main layout ── */
  .main { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }

  /* ── Cards grid ── */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .card {
    background: var(--bg1);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 10px 12px;
  }
  .card-label { color: var(--text-dim); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .card-value { font-size: 20px; font-weight: 700; }
  .card-sub   { color: var(--text-dim); font-size: 10px; margin-top: 4px; }
  .green { color: var(--green); }
  .red   { color: var(--red);   }
  .amber { color: var(--amber); }
  .blue  { color: var(--blue);  }
  .dim   { color: var(--text-dim); }

  /* ── Progress bar ── */
  .progress-wrap { background: var(--bg2); height: 3px; border-radius: 2px; margin-top: 6px; overflow: hidden; }
  .progress-bar  { height: 100%; border-radius: 2px; }

  /* ── Section ── */
  .section { background: var(--bg1); border: 1px solid var(--border); border-radius: 3px; }
  .section-header {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 6px 12px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-header .count {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 10px;
    color: var(--text);
  }

  /* ── Table ── */
  .tbl-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th {
    color: var(--text-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    font-weight: 400;
  }
  td {
    padding: 5px 10px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    font-size: 11px;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg2); }
  .empty-row td { color: var(--text-dim); text-align: center; padding: 14px; }

  /* ── Badges ── */
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 2px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .badge-long    { background: rgba(0,230,118,0.15); color: var(--green); border: 1px solid rgba(0,230,118,0.3); }
  .badge-short   { background: rgba(255,82,82,0.15);  color: var(--red);   border: 1px solid rgba(255,82,82,0.3);  }
  .badge-limit   { background: rgba(68,138,255,0.15); color: var(--blue);  border: 1px solid rgba(68,138,255,0.3); }
  .badge-tp1     { background: rgba(0,230,118,0.15); color: var(--green); border: 1px solid rgba(0,230,118,0.3); }
  .badge-tp2     { background: rgba(0,230,118,0.25); color: var(--green); border: 1px solid rgba(0,230,118,0.5); }
  .badge-sl      { background: rgba(255,82,82,0.15);  color: var(--red);   border: 1px solid rgba(255,82,82,0.3);  }
  .badge-time    { background: rgba(255,171,64,0.15); color: var(--amber); border: 1px solid rgba(255,171,64,0.3); }
  .badge-other   { background: rgba(74,74,74,0.3);   color: var(--text-dim); border: 1px solid var(--border); }
  .be-marker     { color: var(--blue); font-size: 9px; margin-left: 4px; }

  /* ── Log ── */
  .log-wrap {
    max-height: 200px;
    overflow-y: auto;
    padding: 6px 10px;
  }
  .log-line {
    padding: 1px 0;
    font-size: 11px;
    display: flex;
    gap: 8px;
  }
  .log-ts  { color: var(--text-dim); flex-shrink: 0; }
  .log-msg { word-break: break-all; }
  .log-amber { color: var(--amber); }
  .log-red   { color: var(--red);   }
  .log-green { color: var(--green); }
  .log-dim   { color: var(--text-dim); }

  /* ── Countdown ── */
  #countdown { color: var(--text-dim); font-size: 11px; min-width: 60px; text-align: right; }
  #error-banner {
    background: rgba(255,82,82,0.1);
    border: 1px solid rgba(255,82,82,0.3);
    color: var(--red);
    padding: 6px 12px;
    font-size: 11px;
    display: none;
  }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .cards-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 500px) {
    .cards-grid { grid-template-columns: 1fr 1fr; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <span class="header-title">&#x26A1; PAPER TRADING</span>
    <span class="header-sub">noon-feed-worker</span>
  </div>
  <div class="header-right">
    <span class="status-dot status-unknown" id="status-dot"></span>
    <span class="header-meta" id="status-label">loading...</span>
    <span class="header-meta" id="last-cycle">—</span>
    <div class="refresh-row">
      <span id="countdown">30s</span>
      <button class="btn" onclick="doRefresh()">Refresh</button>
    </div>
  </div>
</div>

<div id="error-banner"></div>

<div class="main">

  <!-- Account Overview -->
  <div class="cards-grid">
    <div class="card">
      <div class="card-label">Equity</div>
      <div class="card-value" id="card-equity">—</div>
      <div class="card-sub" id="card-unrealised">Unrealised: —</div>
    </div>
    <div class="card">
      <div class="card-label">Total P&amp;L</div>
      <div class="card-value" id="card-pnl">—</div>
      <div class="card-sub" id="card-daily-pnl">Daily: —</div>
    </div>
    <div class="card">
      <div class="card-label">Drawdown</div>
      <div class="card-value" id="card-dd">—</div>
      <div class="progress-wrap"><div class="progress-bar" id="dd-bar" style="width:0%"></div></div>
    </div>
    <div class="card">
      <div class="card-label">Win Rate</div>
      <div class="card-value" id="card-wr">—</div>
      <div class="card-sub" id="card-wr-sub">—</div>
    </div>
  </div>

  <!-- Open Positions -->
  <div class="section">
    <div class="section-header">
      <span>Open Positions</span>
      <span class="count" id="open-count">0</span>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Dir</th>
            <th>Entry</th>
            <th>Current</th>
            <th>Unrealised P&amp;L</th>
            <th>SL</th>
            <th>TP1</th>
            <th>TP2</th>
            <th>Hold Time</th>
            <th>TP1 Hit</th>
          </tr>
        </thead>
        <tbody id="open-body">
          <tr class="empty-row"><td colspan="10">No open positions</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Pending Limit Orders -->
  <div class="section">
    <div class="section-header">
      <span>Pending Limit Orders</span>
      <span class="count" id="pending-count">0</span>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Dir</th>
            <th>Type</th>
            <th>Limit Price</th>
            <th>SL</th>
            <th>TP1</th>
            <th>TP2</th>
            <th>R:R</th>
            <th>Score</th>
            <th>Expires</th>
          </tr>
        </thead>
        <tbody id="pending-body">
          <tr class="empty-row"><td colspan="10">No pending orders</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Recent Trades -->
  <div class="section">
    <div class="section-header">
      <span>Recent Trades</span>
      <span class="count" id="trades-count">0</span>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Dir</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Realised P&amp;L</th>
            <th>Exit Reason</th>
            <th>Opened</th>
            <th>Closed</th>
          </tr>
        </thead>
        <tbody id="trades-body">
          <tr class="empty-row"><td colspan="8">No recent trades</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Cycle Log -->
  <div class="section">
    <div class="section-header">
      <span>Cycle Log</span>
      <span class="count" id="log-count">0</span>
    </div>
    <div class="log-wrap" id="log-wrap"></div>
  </div>

</div>

<script>
${js}
</script>
</body>
</html>`;
}

// ── JS builder (uses only single quotes + concatenation, no backticks) ────────

function buildJs(): string {
  // All JS uses single quotes and string concatenation to avoid escaping issues
  // when embedded inside the template literal above.
  return `
(function() {
  'use strict';

  var REFRESH_INTERVAL = 30;
  var countdown = REFRESH_INTERVAL;
  var timer = null;
  var refreshTimer = null;

  // Token from localStorage
  function getToken() {
    try { return localStorage.getItem('dashboard_token') || ''; } catch(e) { return ''; }
  }
  function setToken(t) {
    try { localStorage.setItem('dashboard_token', t); } catch(e) {}
  }

  // Extract token from URL on first load
  var urlParams = new URLSearchParams(window.location.search);
  var urlToken = urlParams.get('token');
  if (urlToken) { setToken(urlToken); }

  function apiUrl() {
    var t = getToken();
    return t ? ('/api/state?token=' + encodeURIComponent(t)) : '/api/state';
  }

  // ── Fetch & render ──────────────────────────────────────────────────────────
  function doRefresh() {
    countdown = REFRESH_INTERVAL;
    el('countdown').textContent = countdown + 's';
    fetch(apiUrl())
      .then(function(r) {
        if (r.status === 401) { showError('Authentication required. Add ?token=YOUR_SECRET to the URL.'); return null; }
        if (!r.ok) { showError('Server error: ' + r.status); return null; }
        hideError();
        return r.json();
      })
      .then(function(data) {
        if (!data) return;
        render(data.state, data.logs || []);
      })
      .catch(function(e) { showError('Fetch failed: ' + e.message); });
  }

  function el(id) { return document.getElementById(id); }
  function showError(msg) {
    var b = el('error-banner');
    b.textContent = msg;
    b.style.display = 'block';
  }
  function hideError() { el('error-banner').style.display = 'none'; }

  // ── Formatting helpers ──────────────────────────────────────────────────────
  function fmtUsd(v) {
    var n = Number(v) || 0;
    var sign = n >= 0 ? '+' : '';
    return sign + '$' + Math.abs(n).toFixed(2);
  }
  function fmtPrice(v) {
    var n = Number(v) || 0;
    if (n >= 1000) return '$' + n.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return '$' + n.toFixed(4);
  }
  function fmtTimeAgo(isoStr) {
    if (!isoStr) return '—';
    var diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }
  function fmtHoldTime(isoStr) {
    if (!isoStr) return '—';
    var diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    var h = Math.floor(diff / 3600);
    var m = Math.floor((diff % 3600) / 60);
    return h + 'h ' + m + 'm';
  }
  function fmtExpiry(createdAt, expiresAfterHours) {
    if (!createdAt) return '—';
    var expMs = new Date(createdAt).getTime() + (expiresAfterHours * 3600 * 1000);
    var diffSec = Math.floor((expMs - Date.now()) / 1000);
    if (diffSec <= 0) return 'expired';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm';
    return Math.floor(diffSec / 3600) + 'h ' + Math.floor((diffSec % 3600) / 60) + 'm';
  }
  function pnlClass(v) {
    return Number(v) >= 0 ? 'green' : 'red';
  }
  function dirBadge(dir) {
    var cls = dir === 'LONG' ? 'badge-long' : 'badge-short';
    return '<span class="badge ' + cls + '">' + dir + '</span>';
  }
  function exitBadge(reason) {
    if (!reason) return '—';
    if (reason === 'TP1_HIT') return '<span class="badge badge-tp1">TP1</span>';
    if (reason === 'TP2_HIT') return '<span class="badge badge-tp2">TP2</span>';
    if (reason === 'SL_HIT')  return '<span class="badge badge-sl">SL HIT</span>';
    if (reason === 'TIME_EXIT' || reason === 'STRUCTURE_INVALIDATED') return '<span class="badge badge-time">' + reason + '</span>';
    return '<span class="badge badge-other">' + reason + '</span>';
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function render(state, logs) {
    if (!state) return;
    var acc = state.account || {};

    // Status dot + label
    var dot = el('status-dot');
    var lbl = el('status-label');
    dot.className = 'status-dot ' + (acc.isHalted ? 'status-halted' : 'status-active');
    lbl.textContent = acc.isHalted ? ('HALTED: ' + (acc.haltReason || '')) : 'ACTIVE';
    lbl.className = 'header-meta ' + (acc.isHalted ? 'red' : 'green');

    // Last cycle
    el('last-cycle').textContent = state.lastCycleAt ? ('cycle ' + fmtTimeAgo(state.lastCycleAt)) : '—';

    // Unrealised sum
    var openPos = state.openPositions || [];
    var totalUnreal = openPos.reduce(function(s, p) { return s + (Number(p.unrealisedPnl) || 0); }, 0);

    // Equity card
    var equityEl = el('card-equity');
    equityEl.textContent = '$' + Number(acc.equity || 0).toFixed(2);
    equityEl.className = 'card-value';
    el('card-unrealised').textContent = 'Unrealised: ' + fmtUsd(totalUnreal);
    el('card-unrealised').className = 'card-sub ' + pnlClass(totalUnreal);

    // PnL card
    var pnlVal = Number(acc.totalPnlUsd || 0);
    var pnlEl = el('card-pnl');
    pnlEl.textContent = fmtUsd(pnlVal);
    pnlEl.className = 'card-value ' + pnlClass(pnlVal);
    var dailyPnl = Number(acc.dailyPnlUsd || 0);
    el('card-daily-pnl').textContent = 'Daily: ' + fmtUsd(dailyPnl);
    el('card-daily-pnl').className = 'card-sub ' + pnlClass(dailyPnl);

    // Drawdown card
    var dd = Number(acc.drawdownPct || 0);
    var ddEl = el('card-dd');
    var ddColor = dd >= 7 ? 'red' : dd >= 4 ? 'amber' : 'green';
    ddEl.textContent = dd.toFixed(1) + '%';
    ddEl.className = 'card-value ' + ddColor;
    var bar = el('dd-bar');
    bar.style.width = Math.min(dd * 10, 100) + '%';
    bar.style.background = dd >= 7 ? 'var(--red)' : dd >= 4 ? 'var(--amber)' : 'var(--green)';

    // Win rate card
    var total = Number(acc.totalTrades || 0);
    var wins  = Number(acc.winCount || 0);
    var losses= Number(acc.lossCount || 0);
    var wr = total > 0 ? ((wins / total) * 100).toFixed(0) : '—';
    var wrEl = el('card-wr');
    wrEl.textContent = total > 0 ? (wr + '%') : '—';
    wrEl.className = 'card-value';
    el('card-wr-sub').textContent = wins + 'W / ' + losses + 'L / ' + total + ' trades';

    // Open positions
    var openBody = el('open-body');
    el('open-count').textContent = String(openPos.length);
    if (openPos.length === 0) {
      openBody.innerHTML = '<tr class="empty-row"><td colspan="10">No open positions</td></tr>';
    } else {
      openBody.innerHTML = openPos.map(function(p) {
        var upnl = Number(p.unrealisedPnl || 0);
        var beMarker = p.slMovedToBreakeven ? '<span class="be-marker">[BE]</span>' : '';
        return '<tr>' +
          '<td><strong>' + p.asset + '</strong></td>' +
          '<td>' + dirBadge(p.direction) + '</td>' +
          '<td>' + fmtPrice(p.entryPrice) + '</td>' +
          '<td>' + fmtPrice(p.currentPrice) + '</td>' +
          '<td class="' + pnlClass(upnl) + '">' + fmtUsd(upnl) + '</td>' +
          '<td class="dim">' + fmtPrice(p.slPrice) + '</td>' +
          '<td>' + fmtPrice(p.tp1Price) + '</td>' +
          '<td>' + fmtPrice(p.tp2Price) + '</td>' +
          '<td class="dim">' + fmtHoldTime(p.openedAt) + '</td>' +
          '<td>' + (p.tp1Hit ? '<span class="badge badge-tp1">YES</span>' : '<span class="dim">—</span>') + beMarker + '</td>' +
          '</tr>';
      }).join('');
    }

    // Pending orders
    var pending = state.pendingOrders || [];
    var pendingBody = el('pending-body');
    el('pending-count').textContent = String(pending.length);
    if (pending.length === 0) {
      pendingBody.innerHTML = '<tr class="empty-row"><td colspan="10">No pending orders</td></tr>';
    } else {
      pendingBody.innerHTML = pending.map(function(o) {
        return '<tr>' +
          '<td><strong>' + o.asset + '</strong></td>' +
          '<td>' + dirBadge(o.direction) + '</td>' +
          '<td><span class="badge badge-limit">LIMIT</span></td>' +
          '<td>' + fmtPrice(o.limitPrice) + '</td>' +
          '<td class="dim">' + fmtPrice(o.slPrice) + '</td>' +
          '<td>' + fmtPrice(o.tp1Price) + '</td>' +
          '<td>' + fmtPrice(o.tp2Price) + '</td>' +
          '<td>' + Number(o.rrRatio || 0).toFixed(1) + 'R</td>' +
          '<td class="amber">' + (o.score || '—') + '</td>' +
          '<td class="dim">' + fmtExpiry(o.createdAt, o.expiresAfterHours) + '</td>' +
          '</tr>';
      }).join('');
    }

    // Recent trades (last 20)
    var trades = (state.recentTrades || []).slice(0, 20);
    var tradesBody = el('trades-body');
    el('trades-count').textContent = String((state.recentTrades || []).length);
    if (trades.length === 0) {
      tradesBody.innerHTML = '<tr class="empty-row"><td colspan="8">No recent trades</td></tr>';
    } else {
      tradesBody.innerHTML = trades.map(function(t) {
        var rpnl = Number(t.realisedPnl || 0);
        var exitPrice = t.currentPrice || 0;
        return '<tr>' +
          '<td><strong>' + t.asset + '</strong></td>' +
          '<td>' + dirBadge(t.direction) + '</td>' +
          '<td>' + fmtPrice(t.entryPrice) + '</td>' +
          '<td>' + fmtPrice(exitPrice) + '</td>' +
          '<td class="' + pnlClass(rpnl) + '">' + fmtUsd(rpnl) + '</td>' +
          '<td>' + exitBadge(t.exitReason) + '</td>' +
          '<td class="dim">' + fmtTimeAgo(t.openedAt) + '</td>' +
          '<td class="dim">' + fmtTimeAgo(t.closedAt) + '</td>' +
          '</tr>';
      }).join('');
    }

    // Cycle log
    var logWrap = el('log-wrap');
    el('log-count').textContent = String(logs.length);
    if (logs.length === 0) {
      logWrap.innerHTML = '<div class="log-dim" style="padding:8px 0">No logs yet</div>';
    } else {
      logWrap.innerHTML = logs.map(function(entry) {
        var ts = entry.ts ? new Date(entry.ts).toLocaleTimeString() : '';
        var msg = String(entry.msg || '');
        var cls = 'log-dim';
        var up = msg.toUpperCase();
        if (up.indexOf('OPENED') !== -1 || up.indexOf('LIMIT ORDER') !== -1 || up.indexOf('FILLED') !== -1) {
          cls = 'log-amber';
        } else if (up.indexOf('SL_HIT') !== -1 || up.indexOf('REJECTED') !== -1 || up.indexOf('HALTED') !== -1) {
          cls = 'log-red';
        } else if (up.indexOf('TP1') !== -1 || up.indexOf('TP2') !== -1 || up.indexOf('WIN') !== -1) {
          cls = 'log-green';
        }
        return '<div class="log-line"><span class="log-ts">' + ts + '</span><span class="log-msg ' + cls + '">' + escHtml(msg) + '</span></div>';
      }).join('');
    }
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Countdown timer ─────────────────────────────────────────────────────────
  function startCountdown() {
    if (refreshTimer) clearInterval(refreshTimer);
    countdown = REFRESH_INTERVAL;
    refreshTimer = setInterval(function() {
      countdown--;
      if (countdown <= 0) {
        countdown = REFRESH_INTERVAL;
        doRefresh();
      }
      el('countdown').textContent = countdown + 's';
    }, 1000);
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  doRefresh();
  startCountdown();

})();
`;
}
