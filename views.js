// Server-rendered HTML. No frameworks, no AI.
import { CATEGORIES, ageLabel } from './db.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LABEL = {
  symptom: 'Symptom', temperature: 'Temperature', medicine: 'Medicine', feeding: 'Feeding',
  sleep: 'Sleep', doctor_visit: 'Doctor visit', vaccine: 'Vaccine', note: 'Note',
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dayLabel(when) {
  const [y, m, d] = when.slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[dow]}, ${d} ${MONTHS[m - 1]} ${y}`;
}
function timeLabel(when) {
  const [h, mi] = when.slice(11, 16).split(':').map(Number);
  return `${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const CSS = `
:root{--bg:#f7f6fd;--card:#fff;--ink:#1f1d3d;--muted:#6b6a85;--line:#e5e3f1;--brand:#4b45b0;--brand-ink:#fff;--soft:#eeecfb;--flag:#c2461f;--flag-soft:#fdeeea;--danger:#a3322a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--brand)}
.wrap{max-width:760px;margin:0 auto;padding:0 18px 64px}
header.top{background:var(--card);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:18px;padding-top:14px;padding-bottom:14px;flex-wrap:wrap}
.logo{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:19px;color:var(--ink);text-decoration:none;letter-spacing:-.01em}
.logo span{color:var(--brand)}
nav{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
nav a{padding:7px 12px;border-radius:999px;text-decoration:none;color:var(--muted);font-size:14.5px;font-weight:500}
nav a.on{background:var(--soft);color:var(--brand)}
h1{font-size:26px;line-height:1.2;margin:28px 0 6px;letter-spacing:-.02em}
h2{font-size:15px;margin:28px 0 10px;color:var(--muted);font-weight:600}
p.lead{color:var(--muted);margin:0 0 20px}
.btn{display:inline-block;background:var(--brand);color:var(--brand-ink);border:0;border-radius:10px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.btn.ghost{background:transparent;color:var(--brand);border:1px solid var(--line);background:var(--card)}
.btn.danger{background:transparent;color:var(--danger);border:1px solid var(--line)}
.btn.small{padding:6px 11px;font-size:14px;border-radius:8px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 4px}
.chips a{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);text-decoration:none;color:var(--ink);font-size:14.5px}
.chips a.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:10px 0}
.card.flag{border-color:var(--flag);box-shadow:inset 4px 0 0 var(--flag)}
.meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13.5px;color:var(--muted)}
.tag{background:var(--soft);color:var(--brand);border-radius:6px;padding:2px 8px;font-weight:600;font-size:12.5px}
.tag.flag{background:var(--flag-soft);color:var(--flag)}
.tag.plain{background:#eeedf3;color:var(--muted)}
.card h3{margin:8px 0 4px;font-size:17.5px;line-height:1.3}
.details{white-space:pre-wrap;margin:6px 0 0;color:#34325a}
.temp{font-weight:600;color:var(--ink)}
.actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.actions form{margin:0}
label{display:block;font-weight:600;font-size:14.5px;margin:16px 0 6px}
input[type=text],input[type=datetime-local],select,textarea{width:100%;padding:10px 12px;border:1px solid #cfcce0;border-radius:10px;font:inherit;background:#fff;color:var(--ink)}
textarea{min-height:150px;resize:vertical}
input:focus,select:focus,textarea:focus,.btn:focus-visible,a:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.check{display:flex;gap:10px;align-items:center;margin-top:16px;font-weight:500}
.check input{width:18px;height:18px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.copy{display:flex;gap:8px}
.copy input{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px}
ol.steps{padding-left:22px}ol.steps li{margin:8px 0}
.note{background:var(--soft);border-radius:12px;padding:12px 16px;color:#2f2b6b;font-size:15px}
.err{background:#fbe9e7;border-radius:12px;padding:12px 16px;color:var(--danger);margin-top:16px}
.empty{text-align:center;padding:36px 20px;color:var(--muted)}
.say{background:#fbfaff;border:1px dashed #cfcce0;border-radius:10px;padding:10px 14px;margin:8px 0;font-style:italic}
footer{color:var(--muted);font-size:13.5px;margin-top:40px;border-top:1px solid var(--line);padding-top:16px}
footer .flinks{display:block;margin-top:8px}footer a{color:var(--muted)}
.policy h2{font-size:18px;color:var(--ink);margin:30px 0 8px}.policy p,.policy li{color:#34325a}.policy ul{padding-left:22px}.policy li{margin:5px 0}
.allow{list-style:none;padding:0;margin:8px 0 0}.allow li{padding:5px 0 5px 26px;position:relative}.allow li::before{content:'';position:absolute;left:4px;top:13px;width:8px;height:8px;border-radius:50%;background:var(--brand)}.allow.no li::before{background:#b9b7c9}
@media(max-width:620px){.two{grid-template-columns:1fr}nav{margin-left:0}}
.wrap.wide{max-width:1120px}
.profile{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin:28px 0 8px}
.avatar{width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,#8b7fe8,#4b45b0);color:#fff;font-size:36px;font-weight:700;display:grid;place-items:center;flex:none}
.pname{padding-right:24px;border-right:1px solid var(--line);margin-right:4px}
.pname h1{margin:0;font-size:34px}.pname p{margin:2px 0 0;color:var(--muted)}
.stats{display:flex;gap:12px;flex-wrap:wrap}
.stat{display:flex;gap:12px;align-items:center;background:var(--soft);border-radius:14px;padding:12px 16px}
.stat div span{display:block;font-size:13.5px;color:var(--muted)}.stat b{font-size:16px}
.ico{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none}
.stat .ico,.counts .ico{width:32px;height:32px}.stat .ico svg,.counts .ico svg{width:17px;height:17px}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:28px;align-items:start;margin-top:18px}
.tlhead{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.tlhead h2.big{font-size:22px;color:var(--ink);margin:0;margin-right:auto;letter-spacing:-.01em}
.tlhead select{width:auto;padding:8px 12px}
.entry{display:grid;grid-template-columns:128px 40px minmax(0,1fr);gap:16px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:10px 0}
.entry.flag{background:var(--flag-soft);border-color:#f0a99b}
.entry.empty{display:block;text-align:center;color:var(--muted);padding:32px 20px}
.entry .when b{display:block;font-size:15px}.entry .when span{display:block;color:var(--muted);font-size:14px}
.entry .when .who{color:var(--brand);font-weight:600;margin-top:2px}
.entry h3{margin:8px 0 2px;font-size:17px;line-height:1.3}
.tag.c-symptom{background:#fde3df;color:#b93a26}.tag.c-temperature{background:#dff3e8;color:#1f7a4d}.tag.c-medicine{background:#ebe5fb;color:#5a3fb5}
.tag.c-feeding{background:#deedfb;color:#1f69ad}.tag.c-sleep{background:#daf1ed;color:#17786a}.tag.c-doctor_visit{background:#e1e9fa;color:#2c55a8}
.tag.c-vaccine{background:#fbecd7;color:#9a5f14}.tag.c-note{background:#eeedf3;color:#55546b}
.tag{text-transform:uppercase;letter-spacing:.03em}
.tag.flag{background:#fbd9c9;color:#a3401a}
.side{border-radius:16px;padding:18px;margin-bottom:16px}
.side h3{margin:0 0 4px;font-size:18px}.side p{margin:6px 0 12px;font-size:14.5px}.side .sub{color:var(--muted);margin:0 0 8px}
.side.green{background:#e3f6ee}.side.violet{background:#e9e6fb}.side.amber{background:#fdf1d8}
.counts{list-style:none;margin:0;padding:0}.counts li{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:15px}
.counts li span:nth-child(2){flex:1}.counts b{font-size:16px}
@media(max-width:900px){.cols{grid-template-columns:1fr}.pname{border-right:0;padding-right:0}}
@media(max-width:620px){.entry{grid-template-columns:40px minmax(0,1fr)}.entry .when{grid-column:1/-1;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.pname h1{font-size:28px}.avatar{width:64px;height:64px;font-size:28px}}
@media print{.cols{grid-template-columns:1fr}.entry{break-inside:avoid}}
.mini{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#8b7fe8,#4b45b0);color:#fff;font-weight:700;font-size:14px;display:grid;place-items:center;flex:none}
.mini.big{width:44px;height:44px;font-size:19px}
.kid{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin:10px 0;flex-wrap:wrap}
.kinfo{flex:1;min-width:140px}.kinfo b{display:block}.kinfo>span{display:block;color:var(--muted);font-size:14.5px}
input[type=date]{width:100%;padding:10px 12px;border:1px solid #cfcce0;border-radius:10px;font:inherit;background:#fff;color:var(--ink)}
.chips .gap{width:10px}
.side.plain{background:var(--card);border:1px solid var(--line)}
.card.ok{border-color:#9fd3b8;background:#f1faf5}
.kid.nextup{border-color:var(--brand);box-shadow:inset 4px 0 0 var(--brand)}
.kinfo .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;word-break:break-all}
.kid .ico{width:36px;height:36px}.kid .ico svg{width:19px;height:19px}
.upnext{background:var(--card);border:2px solid var(--brand);border-radius:16px;margin-bottom:16px;overflow:hidden}
.uphead{display:flex;align-items:center;gap:10px;background:#e9e6fb;padding:12px 16px}
.uphead h3{margin:0;font-size:16.5px;margin-right:auto;letter-spacing:-.01em}
.upico{color:var(--brand);display:grid;place-items:center}.upico svg{width:22px;height:22px}
.viewall{display:inline-flex;align-items:center;gap:4px;font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap}.viewall svg{width:15px;height:15px}
.upbody{padding:14px 16px 16px}.upbody .none{margin:0 0 12px;color:var(--muted)}
.upmain{display:flex;gap:14px;align-items:flex-start}
.datetile{flex:none;width:64px;border-radius:12px;background:var(--soft);color:var(--ink);text-align:center;padding:8px 0;line-height:1.15}
.datetile span{display:block;font-size:14px;font-weight:600}.datetile b{display:block;font-size:28px;letter-spacing:-.02em}
.datetile.k-vaccine{background:#fbecd7}
.upinfo{min-width:0;border-left:1px solid var(--line);padding-left:14px}
.upinfo>b{display:block;font-size:17px;line-height:1.3;margin-bottom:4px}
.upinfo>span{display:flex;gap:7px;align-items:flex-start;font-size:14px;color:#3d3a66;margin-top:3px}
.upinfo>span>svg{width:16px;height:16px;flex:none;margin-top:2px;color:var(--brand)}
.upinfo .ico{width:16px;height:16px;margin-top:2px}.upinfo .ico svg{width:10px;height:10px}
.upfoot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--soft);border-radius:10px;padding:8px 12px;margin:14px 0 12px;font-size:14px}
.upfoot .togo{display:inline-flex;align-items:center;gap:6px;color:var(--brand)}.upfoot .togo svg{width:16px;height:16px}
.upfoot .more{color:var(--muted);margin-left:auto}
.side.invite{display:flex;gap:14px;align-items:flex-start;border:1px solid #b9e3cf}
.side.invite .pico{flex:none;width:44px;height:44px;border-radius:50%;background:#1f9d8a;color:#fff;display:grid;place-items:center}.side.invite .pico svg{width:24px;height:24px}
.side.invite p{margin:4px 0 12px}
.side.invite .btn{display:inline-flex;align-items:center;gap:6px}.side.invite .btn svg{width:15px;height:15px}
nav.pub{align-items:center;gap:10px}nav.pub a{color:var(--ink);font-size:15.5px}
nav.pub a.pill{border:1.5px solid #bdb7ee;color:var(--brand);font-weight:600;padding:7px 18px;background:var(--card)}
.home{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.85fr);gap:56px;align-items:start;padding:40px 0 8px}
.pitch h1{font-size:54px;line-height:1.08;letter-spacing:-.03em;margin:0 0 20px}
.pitch h1 .hl{color:#7c6fe0;border-bottom:5px solid #7c6fe0;border-radius:0 0 6px 6px}
.pitch .lead{font-size:20px;line-height:1.5;color:#34325a;max-width:34em;margin:0 0 26px}
.demo{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:14px;box-shadow:0 10px 30px rgba(75,69,176,.08)}
.demo .said{display:flex;gap:14px;align-items:center;background:#e9e6fb;border-radius:16px;padding:14px 18px;font-size:17px;color:#2a2757}
.demo .said svg{flex:none;color:var(--brand)}
.demo .by{display:flex;flex-direction:column;align-items:center;gap:2px;margin:6px 0 10px;color:var(--muted)}
.demo .bypill{display:inline-flex;align-items:center;gap:8px;background:#f1f0f8;border-radius:999px;padding:6px 18px 6px 12px;font-weight:700;color:var(--ink)}
.demo .bypill svg{width:20px;height:20px;color:#d9892b}
.demo .saved{display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:14px 18px}
.demo .saved .when{border-left:3px solid #7c6fe0;padding-left:14px}.demo .saved .when b{display:block;font-size:17px}.demo .saved .when span{color:var(--muted);font-size:14.5px}
.chips2{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.chips2 span{background:var(--soft);border-radius:999px;padding:4px 14px;font-size:14.5px}
.perks{display:flex;flex-wrap:wrap;margin-top:28px}
.perk{display:flex;align-items:center;gap:12px;padding:0 26px;border-left:1px solid #cfcce0;color:#3a7d6b;font-size:16px;line-height:1.3}
.perk:first-child{padding-left:0;border-left:0}
.signin{background:var(--card);border:1px solid var(--line);border-radius:26px;padding:40px 34px 30px;text-align:center;box-shadow:0 14px 40px rgba(75,69,176,.10);margin-top:6px}
.signin h2{font-size:34px;color:var(--ink);margin:0 0 6px;letter-spacing:-.02em;font-weight:700}
.signin>p{margin:0 0 26px;color:#34325a;font-size:16.5px}
.gbtn{display:block;border:1.5px solid #cfcce0;border-radius:14px;padding:14px 18px;font-size:18px;font-weight:600;color:var(--ink);text-decoration:none;background:var(--card)}
.gbtn:hover{border-color:var(--brand);background:#fbfaff}
.signin .new{margin:22px 0 10px;font-size:15.5px;color:var(--ink)}.signin .fine{margin:0;font-size:13.5px;color:var(--muted)}
ol.hows{list-style:none;padding:0;margin:26px 0 8px}
.how{display:flex;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:10px 0}
.how .num{flex:none;width:34px;height:34px;border-radius:50%;background:var(--brand);color:#fff;font-weight:700;display:grid;place-items:center}
.how h3{margin:3px 0 4px;font-size:17.5px}.how p{margin:0;color:#34325a}.how .say{margin:10px 0 0}
body.homebg{background:radial-gradient(900px 500px at 78% -10%,#ebe8fb 0,transparent 60%),radial-gradient(700px 420px at -5% 105%,#ebe8fb 0,transparent 60%),var(--bg)}
@media(max-width:900px){.home{grid-template-columns:1fr;gap:32px;padding-top:26px}.pitch h1{font-size:40px}.pitch .lead{font-size:18px}}
@media(max-width:620px){.pitch h1{font-size:33px}.demo .saved{grid-template-columns:1fr}.perk{padding:8px 16px 8px 0;border-left:0}.signin{padding:30px 22px 24px}.signin h2{font-size:28px}}
@media print{header.top,.noprint{display:none!important}body{background:#fff}.card{break-inside:avoid}}
`;

// KidLog's own mark: a heart with a pulse line.
const LOGO = '<svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 27S4.5 20.3 4.5 12a6.2 6.2 0 0 1 11.5-3.2A6.2 6.2 0 0 1 27.5 12C27.5 20.3 16 27 16 27z" fill="#fff" stroke="#1f6f63" stroke-width="2.4"/><path d="M8 15.5h4l2-4 3.5 8 2-4H24" stroke="#e5533d" stroke-width="2.2"/></svg>';

function page({ title, nav = '', body, head = '', wide = false, bodyClass = '' }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${CSS}</style>${head}
<script>try{document.cookie='tz='+(-new Date().getTimezoneOffset())+';path=/;max-age=31536000;samesite=lax'}catch(e){}</script>
</head><body${bodyClass ? ` class="${bodyClass}"` : ''}>
<header class="top"><div class="wrap${wide ? ' wide' : ''}"><a class="logo" href="/">${LOGO}<b>Kid<span>Log</span></b></a>${nav}</div></header>
<main class="wrap${wide ? ' wide' : ''}">${body}
<footer>KidLog records what you tell it so you can show your doctor. It does not give medical advice. If you are worried about your child, contact your doctor.
<span class="flinks noprint"><a href="/how-it-works">How it works</a> · <a href="/privacy">Privacy</a></span></footer>
</main></body></html>`;
}

function spaceNav(space, on) {
  const b = `/f/${esc(space.key)}`;
  const a = (href, id, label) => `<a href="${href}"${on === id ? ' class="on" aria-current="page"' : ''}>${label}</a>`;
  return `<nav>${a(b, 'timeline', 'Timeline')}${a(b + '/kids', 'kids', 'Children')}${a(b + '/parents', 'parents', 'Parents')}${a(b + '/connect', 'connect', 'Connect Claude')}${a(b + '/share', 'share', 'Share with doctor')}</nav><form method="post" action="/logout" class="noprint" style="margin:0"><button class="btn ghost small">Sign out</button></form>`;
}

const clean = (v) => String(v ?? '').trim().slice(0, 60);
const initial = (name) => esc(String(name).trim().charAt(0).toUpperCase() || '?');

const ICON = {
  symptom: ['#e5533d', '<path d="M3 12h4l3-8 4 16 3-8h4"/>'],
  temperature: ['#2fa36b', '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'],
  medicine: ['#7c5cd6', '<path d="M10.5 20.5a5 5 0 0 1-7-7l9-9a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>'],
  feeding: ['#2f8fe0', '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 3c-2 2-3 5-3 9h3v9"/>'],
  sleep: ['#1f9d8a', '<path d="M20.5 13A8.5 8.5 0 1 1 11 3.5a6.6 6.6 0 0 0 9.5 9.5z"/>'],
  doctor_visit: ['#3b6fd4', '<path d="M12 6v12M6 12h12"/><rect x="3" y="3" width="18" height="18" rx="5"/>'],
  vaccine: ['#d9892b', '<path d="M17 3l4 4M19 5l-3 3M14 6l4 4M16 8l-8.5 8.5H4.5v-3L13 5M4.5 19.5L2 22"/>'],
  note: ['#6b6a85', '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>'],
};
const icon = (cat) => {
  const [color, paths] = ICON[cat] || ICON.note;
  return `<span class="ico" style="background:${color}" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
};
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function shortDay(when) {
  const [y, m, d] = when.slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${SHORT_DAYS[dow]}, ${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

function entryCard(e, { base, readOnly, showChild }) {
  const tags = [
    `<span class="tag c-${esc(e.category)}">${esc(LABEL[e.category] || e.category)}</span>`,
    e.flagged ? '<span class="tag flag">Raise with doctor</span>' : '',
    !readOnly && e.source === 'claude' ? '<span class="tag plain">Added by Claude</span>' : '',
    !readOnly && e.edited ? '<span class="tag plain">Edited</span>' : '',
  ].join('');
  const actions = readOnly ? '' : `<div class="actions noprint">
    <a class="btn ghost small" href="${base}/e/${e.id}">Edit entry</a>
    <form method="post" action="${base}/e/${e.id}/flag"><button class="btn ghost small">${e.flagged ? 'Remove doctor flag' : 'Flag for doctor'}</button></form>
  </div>`;
  return `<article class="entry${e.flagged ? ' flag' : ''}">
    <div class="when"><b>${shortDay(e.occurred_at)}</b><span>${timeLabel(e.occurred_at)}</span>${showChild ? `<span class="who">${esc(e.child)}</span>` : ''}</div>
    ${icon(e.category)}
    <div class="body">
      <div class="meta">${tags}</div>
      <h3>${esc(e.title)}</h3>
      ${e.temperature ? `<div class="temp">Temperature: ${esc(e.temperature)}</div>` : ''}
      ${e.details ? `<p class="details">${esc(e.details)}</p>` : ''}
      ${actions}
    </div>
  </article>`;
}

const RANGES = [['all', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']];

const qs = (child, flagged, range) => {
  const p = new URLSearchParams();
  if (child) p.set('child', child);
  if (flagged) p.set('flagged', '1');
  if (range && range !== 'all') p.set('range', range);
  const s = p.toString();
  return s ? `?${s}` : '';
};

// Filter buttons above the list: one per child, then the flagged toggle. A locked share link hides what it pins.
function filterChips({ children, child, base, flagged, range, lock = {} }) {
  const chip = (label, href, on) => `<a href="${href}"${on ? ' class="on" aria-current="true"' : ''}>${esc(label)}</a>`;
  const kids = !lock.child && children.length > 1
    ? chip('All children', base + qs('', flagged, range), !child) +
      children.map((c) => chip(c.child, base + qs(c.child, flagged, range), !!child && c.child.toLowerCase() === child.toLowerCase())).join('')
    : '';
  const flag = lock.flaggedOnly ? '' : `<span class="gap"></span>${chip(flagged ? 'Showing flagged only' : 'Flagged only', base + qs(child, !flagged, range), flagged)}`;
  return kids || flag ? `<div class="chips noprint">${kids}${flag}</div>` : '';
}

const KIND = { doctor: ['doctor_visit', 'Doctor appointment'], vaccine: ['vaccine', 'Vaccine appointment'] };

const DAY_MS = 86400000;
const dayNumber = (w) => { const [y, m, d] = w.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY_MS; };
// "Today", "Tomorrow", "2 days to go": how far away an appointment is from the parent's local date.
function daysToGo(when, now) {
  const n = Math.round(dayNumber(when) - dayNumber(now));
  return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days to go`;
}

const glyph = (paths) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const G = {
  calendar: glyph('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>'),
  clock: glyph('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  note: glyph('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>'),
  bell: glyph('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  people: glyph('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>'),
  arrow: glyph('<path d="M5 12h14M13 6l6 6-6 6"/>'),
};

// Right-panel card: the next doctor or vaccine appointment, with the date on a tear-off tile.
function upcomingCard({ base, upcoming, shown, now }) {
  const q = shown ? `?child=${encodeURIComponent(shown.child)}` : '';
  const a = upcoming[0];
  const head = `<div class="uphead"><span class="upico">${G.calendar}</span><h3>Upcoming appointments</h3>
      <a class="viewall" href="${base}/appointments${q}">${a ? 'View all' : 'Past'} ${G.arrow}</a></div>`;
  if (!a) {
    return `<section class="upnext noprint" aria-label="Upcoming appointments">${head}
      <div class="upbody"><p class="none">Nothing booked${shown ? ` for ${esc(shown.child)}` : ''}.</p>
      <a class="btn small" href="${base}/appointments/new${q}">Add appointment</a></div></section>`;
  }
  const [y, m, d] = a.scheduled_at.slice(0, 10).split('-').map(Number);
  const dow = SHORT_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const more = upcoming.length - 1;
  return `<section class="upnext noprint" aria-label="Upcoming appointments">${head}
    <div class="upbody">
      <div class="upmain">
        <div class="datetile k-${esc(a.kind)}" aria-label="${shortDay(a.scheduled_at)}"><span>${dow}</span><b>${d}</b><span>${MONTHS[m - 1].slice(0, 3)}</span></div>
        <div class="upinfo">
          <b>${esc(a.title)}</b>
          <span>${G.clock}${timeLabel(a.scheduled_at)}</span>
          <span>${icon(KIND[a.kind][0])}${esc(KIND[a.kind][1])}${shown ? '' : ` · ${esc(a.child)}`}</span>
          ${a.notes ? `<span>${G.note}${esc(a.notes)}</span>` : ''}
        </div>
      </div>
      <div class="upfoot"><span class="togo">${G.bell}<b>${daysToGo(a.scheduled_at, now)}</b></span>${more > 0 ? `<span class="more">+ ${more} more coming up</span>` : ''}</div>
      <div class="row"><a class="btn small" href="${base}/appointments/${a.id}">View details</a><a class="btn ghost small" href="${base}/appointments/new${q}">Add appointment</a></div>
    </div>
  </section>`;
}

const pickShown = (children, child) =>
  child ? children.find((c) => c.child.toLowerCase() === child.toLowerCase()) : children.length === 1 ? children[0] : null;

// Shared by the family timeline and the read-only doctor view.
function board({ space, base, all, entries, children, child, flagged, range, readOnly, shareHref, connectHref, lock = {}, upcoming = [], now = '' }) {
  const shown = pickShown(children, child);
  const age = shown ? ageLabel(shown.dob) : '';
  const total = shown && !lock.flaggedOnly ? shown.entries : all.length; // a flagged-only link must not reveal the full count
  const name = shown ? shown.child : space.name;
  const latest = (cat) => {
    const e = all.find((x) => x.category === cat);
    return e ? shortDay(e.occurred_at).replace(/^\w+, /, '') : 'None logged';
  };
  const count = (cat) => entries.filter((e) => e.category === cat).length;
  const flaggedCount = all.filter((e) => e.flagged).length;
  const stat = (cat, label, value) => `<div class="stat">${icon(cat)}<div><span>${label}</span><b>${esc(value)}</b></div></div>`;
  const rangeLabel = (RANGES.find((r) => r[0] === range) || RANGES[0])[1];
  const row = (cat, label, n) => `<li>${icon(cat)}<span>${label}</span><b>${n}</b></li>`;
  const list = entries.length
    ? entries.map((e) => entryCard(e, { base, readOnly, showChild: !shown })).join('')
    : readOnly || all.length
      ? '<div class="entry empty">No entries match this view.</div>'
      : `<div class="entry empty"><div><p><b>Nothing here yet.</b></p><p>Connect Claude and tell it what happened, or add an entry yourself.</p>
         <p class="row" style="justify-content:center"><a class="btn" href="${connectHref}">Connect Claude</a><a class="btn ghost" href="${base}/new">Add an entry</a></p></div></div>`;
  return `<section class="profile">
      <div class="avatar" aria-hidden="true">${initial(name)}</div>
      <div class="pname"><h1>${esc(name)}</h1>
        <p>${shown ? (age ? esc(age) : readOnly ? '' : `<a href="${base}/kids/${shown.id}">Add birth date</a>`) : `${children.length} ${children.length === 1 ? 'child' : 'children'}`}${shown && (age || !readOnly) ? ' · ' : shown ? '' : ' · '}${total} ${total === 1 ? 'entry' : 'entries'} on record${shown && !readOnly && age ? ` · <a href="${base}/kids/${shown.id}">Edit profile</a>` : ''}</p></div>
      <div class="stats">
        ${stat('doctor_visit', 'Last doctor visit', latest('doctor_visit'))}
        ${stat('vaccine', 'Last vaccine', latest('vaccine'))}
        ${stat('symptom', 'Flagged for doctor', String(flaggedCount))}
      </div>
    </section>
    <div class="cols">
      <div>
        <div class="tlhead">
          <h2 class="big">Health timeline</h2>
          <form method="get" action="${base}" class="noprint">
            ${child ? `<input type="hidden" name="child" value="${esc(child)}">` : ''}${flagged ? '<input type="hidden" name="flagged" value="1">' : ''}
            <select name="range" aria-label="Period" onchange="this.form.submit()">${RANGES.map(([v, l]) => `<option value="${v}"${v === range ? ' selected' : ''}>${l}</option>`).join('')}</select>
            <noscript><button class="btn small">Show</button></noscript>
          </form>
          ${readOnly ? '<button class="btn ghost noprint" onclick="window.print()">Print</button>' : `<a class="btn noprint" href="${base}/new${shown ? `?child=${encodeURIComponent(shown.child)}` : ''}">Add an entry</a>`}
        </div>
        ${filterChips({ children, child, base, flagged, range, lock })}
        ${list}
      </div>
      <aside>
        ${readOnly ? '' : `${upcomingCard({ base, upcoming, shown, now })}
        <div class="side green invite noprint"><span class="pico">${G.people}</span><div><h3>Invite another parent</h3><p>Let your partner or a family member see and add to this timeline.</p><a class="btn small" href="${base}/parents">Invite ${G.arrow}</a></div></div>`}
        <div class="side amber"><h3>Quick overview</h3><p class="sub">${rangeLabel}</p><ul class="counts">
          ${row('symptom', 'Symptom entries', count('symptom'))}
          ${row('temperature', 'Temperature readings', count('temperature'))}
          ${row('medicine', 'Medicine doses', count('medicine'))}
          ${row('feeding', 'Feeding notes', count('feeding'))}
          ${row('sleep', 'Sleep notes', count('sleep'))}
        </ul></div>
        ${readOnly ? '' : `<div class="side plain noprint"><h3>Share with doctor</h3><p>Send a read-only link${shown ? ` for ${esc(shown.child)}` : ''}: everything, or only flagged entries.</p><a class="btn ghost small" href="${shareHref}${shown ? `?child=${encodeURIComponent(shown.child)}` : ''}">Create a link</a></div>
        <div class="side violet noprint"><h3>Tell Claude</h3><p>"Aarav had 5 ml paracetamol at 8 this morning. Temperature was 100.2 F before."</p><a class="btn ghost small" href="${connectHref}">Connect Claude</a></div>`}
      </aside>
    </div>`;
}

// Top bar for the public pages: How it works, then Sign in (or back to the timeline when signed in).
const publicNav = (user, on) => `<nav class="pub"><a href="/how-it-works"${on === 'how' ? ' class="on" aria-current="page"' : ''}>How it works</a>${user
  ? '<a class="pill" href="/">My timeline</a>' : '<a class="pill" href="/auth/google">Sign in</a>'}</nav>`;

const spark = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8zM18 14l.9 2.6 2.6.9-2.6.9L18 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg>';
const perk = (color, paths, a, b) => `<div class="perk"><svg viewBox="0 0 24 24" width="34" height="34" fill="${color}" aria-hidden="true">${paths}</svg><span>${a}<br>${b}</span></div>`;

export function landing({ error } = {}) {
  return page({
    title: 'KidLog: child health tracking, minus the forms',
    nav: publicNav(null),
    wide: true,
    bodyClass: 'homebg',
    body: `<div class="home">
      <section class="pitch">
        <h1>Child health tracking, <span class="hl">minus</span> the forms.</h1>
        <p class="lead">Just tell Claude what happened in your own words. KidLog turns late-night fevers, doses and feeds into a clean, dated timeline ready for your paediatrician.</p>
        <div class="demo" aria-label="Example: what you say, and what KidLog saves">
          <div class="said">${spark}<span>"Gave Aarav 5 ml of paracetamol at 2:15 AM, temp was 101.4 F. He seems a bit fussy."</span></div>
          <div class="by"><span class="down" aria-hidden="true">&darr;</span><span class="bypill">${spark}Organised by Claude</span></div>
          <div class="saved">
            <div class="when"><b>2:15 AM</b><span>15 Feb 2026</span></div>
            <div><div class="meta"><span class="tag c-temperature">Temperature</span><span class="tag c-medicine">Medicine</span></div>
              <div class="chips2"><span>101.4 F</span><span>Paracetamol, 5 ml</span><span>A bit fussy</span></div></div>
          </div>
        </div>
        <div class="perks">
          ${perk('#4f9b83', '<path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 'Private to', 'your family')}
          ${perk('#4f9b83', '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>', 'Instant', 'organisation')}
          ${perk('#4f9b83', '<path d="M12 21S3 15.5 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12z"/>', 'Ready for', 'your doctor')}
        </div>
      </section>
      <section class="signin" aria-labelledby="welcome">
        <h2 id="welcome">Welcome back</h2>
        <p>Sign in to view your child's health timeline.</p>
        ${error ? `<div class="err">${esc(error)}</div>` : ''}
        <a class="gbtn" href="/auth/google">Continue with Google</a>
        <p class="new">New to KidLog? <a href="/auth/google">Create a free family account</a></p>
        <p class="fine">No password to remember. Only you, and a parent you invite, can open your family's timeline.</p>
      </section>
    </div>`,
  });
}

export function howItWorks({ user } = {}) {
  const step = (n, title, text, say = '') => `<li class="how"><span class="num">${n}</span><div><h3>${title}</h3><p>${text}</p>${say ? `<div class="say">${say}</div>` : ''}</div></li>`;
  return page({
    title: 'How KidLog works',
    nav: publicNav(user, 'how'),
    body: `<h1>How KidLog works</h1>
      <p class="lead">You talk to Claude the way you would tell a friend. KidLog keeps what you said as a dated health timeline for each child, which you can correct and share with the doctor.</p>
      <ol class="hows">
        ${step(1, 'Create your family timeline', 'Sign in with your Google account and give your family a name. There is no password to set or remember.')}
        ${step(2, 'Connect Claude', 'Add KidLog to your connectors in Claude, on the web, desktop or phone. Claude opens a KidLog page where you sign in with Google and allow the connection. It takes about a minute, and there is nothing to copy or paste.')}
        ${step(3, 'Tell Claude what happened', 'In a chat with KidLog switched on, describe it in your own words. Claude saves one dated entry per event: symptoms, temperatures, medicine doses, feeds, sleep, doctor visits and vaccines. A child is added the first time you mention them.', 'Aarav woke up coughing at 2:15 last night, felt a bit warm but no high fever. Refused his milk and settled around 3. Log this, I want to raise it with the doctor.')}
        ${step(4, 'Check and correct the timeline', 'Each entry appears on the timeline within a few seconds. You can edit the time, wording or temperature of anything Claude wrote, add entries by hand, and flag the ones you want to raise with the doctor.')}
        ${step(5, 'Keep appointments in view', 'Add upcoming doctor and vaccine appointments yourself or by telling Claude. The next one shows beside the timeline with how many days are left.', 'Aarav has a follow-up with the paediatrician on 28 January at 5 PM.')}
        ${step(6, 'Invite the other parent', 'Create an invite link and send it to your partner or a family member. They sign in with their own Google account and see and add to the same timeline.')}
        ${step(7, 'Share with your doctor', 'Create a read-only link for one child or all of them, with everything or only the flagged entries. The doctor opens it in any browser, can read and print it, and cannot change anything. You can turn a link off at any time.')}
      </ol>
      <h2>Good to know</h2>
      <div class="card">
        <p style="margin-top:0"><b>KidLog has no AI inside.</b> Your own Claude does the reading and writing. KidLog only saves, shows and shares what you told it.</p>
        <p><b>It does not give medical advice.</b> KidLog does not diagnose, rate urgency or suggest treatment. If you are worried about your child, contact your doctor.</p>
        <p><b>Who can see your timeline.</b> Only the Google accounts on your Parents page can open it. Doctors see only the read-only links you create. The <a href="/privacy">privacy policy</a> says what KidLog stores.</p>
        <p style="margin-bottom:0"><b>What you need.</b> A Google account and a Claude account.</p>
      </div>
      <p class="row" style="margin-top:22px">${user ? '<a class="btn" href="/">Go to my timeline</a>' : '<a class="btn" href="/auth/google">Continue with Google</a><a class="btn ghost" href="/">Back to the home page</a>'}</p>`,
  });
}

// Shown once, right after the first Google sign-in.
export function signup({ user, error }) {
  return page({
    title: 'Create your family timeline · KidLog',
    body: `<h1>Create your family timeline</h1>
      <p class="lead">Signed in as ${esc(user.email)}. Give your family a name; you can add your children next.</p>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="/signup" class="card">
        <label for="name" style="margin-top:0">Family name</label>
        <input id="name" type="text" name="name" maxlength="80" placeholder="e.g. The Sharma family" autofocus>
        <div class="row" style="margin-top:16px"><button class="btn">Create my family timeline</button></div>
      </form>
      <form method="post" action="/logout"><button class="btn ghost small">Use a different Google account</button></form>`,
  });
}

// A timeline created before sign-in existed. Signing in from here attaches it to that account.
export function claim({ space }) {
  return page({
    title: 'Secure this timeline · KidLog',
    body: `<h1>Sign in to keep ${esc(space.name)} private</h1>
      <p class="lead">This timeline was created before KidLog had sign-in. Sign in with Google once and it becomes yours: after that, only your account can open it.</p>
      <p><a class="btn" href="/auth/google?claim=${encodeURIComponent(space.key)}">Sign in with Google</a></p>
      <p class="note">Your Claude connection and any doctor links you have shared keep working. If your Google account already has a KidLog family, you will be taken to that one instead.</p>`,
  });
}

// An invite link from another parent, opened by someone who is not in that family yet.
export function join({ space, token, user, mine }) {
  const t = encodeURIComponent(token);
  const body = !user
    ? `<p class="lead">Sign in with Google to see and add to this family's timeline alongside the parent who invited you.</p>
       <p><a class="btn" href="/auth/google?join=${t}">Sign in with Google to join</a></p>`
    : mine
      ? `<p class="lead">You are signed in as ${esc(user.email)}, which already belongs to the family "${esc(mine.name)}". A Google account can be in one family only.</p>
         <p class="row"><a class="btn" href="/f/${esc(mine.key)}">Go to ${esc(mine.name)}</a></p>
         <form method="post" action="/logout"><button class="btn ghost small">Sign out to use a different Google account</button></form>`
      : `<p class="lead">You are signed in as ${esc(user.email)}. Joining lets you see and add to this family's timeline.</p>
         <form method="post" action="/join/${t}" class="row"><button class="btn">Join ${esc(space.name)}</button></form>`;
  return page({ title: `Join ${space.name} · KidLog`, body: `<h1>You are invited to join ${esc(space.name)}</h1>${body}` });
}

const dateOnly = (d) => { const x = new Date(d); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()].slice(0, 3)} ${x.getUTCFullYear()}`; };

export function parents({ space, members, invite, base, me, isOwner }) {
  const b = `/f/${esc(space.key)}`;
  const row = (m) => {
    const self = m.id === me.id;
    const remove = m.owner ? '' : self
      ? `<form method="post" action="${b}/parents/${m.id}/remove" style="margin:0" onsubmit="return window.confirm('Leave this family? You will no longer be able to open its timeline.')"><button class="btn danger small">Leave</button></form>`
      : isOwner
        ? `<form method="post" action="${b}/parents/${m.id}/remove" style="margin:0" onsubmit="return window.confirm('Remove this parent? They will no longer be able to open the timeline.')"><button class="btn danger small">Remove</button></form>`
        : '';
    return `<div class="kid"><span class="mini big">${initial(m.name || m.email)}</span>
      <div class="kinfo"><b>${esc(m.name || m.email)}${self ? ' <span class="tag plain">You</span>' : ''}</b>
        <span>${esc(m.email)} · ${m.owner ? 'created this family' : `joined ${dateOnly(m.joined_at)}`}</span></div>${remove}</div>`;
  };
  const inviteBox = invite
    ? `<p style="margin:0 0 10px">Send this link to the other parent. They sign in with Google and join this family. It works once, until ${dateOnly(invite.expires_at)}.</p>
       ${copyBox('invite', `${base}/join/${invite.token}`)}
       <form method="post" action="${b}/parents/invite/delete" style="margin:12px 0 0"><button class="btn danger small">Cancel this invite</button></form>`
    : `<p style="margin:0 0 12px">Create a link and send it to the other parent yourself, for example on WhatsApp. They sign in with Google and get the same timeline, with full access to add and edit.</p>
       <form method="post" action="${b}/parents/invite" style="margin:0"><button class="btn">Create invite link</button></form>`;
  return page({
    title: 'Parents · KidLog',
    nav: spaceNav(space, 'parents'),
    body: `<h1>Parents</h1>
      <p class="lead">Everyone listed here can see and edit ${esc(space.name)}'s timeline.</p>
      ${members.map(row).join('')}
      <h2>Invite another parent</h2>
      <div class="card">${inviteBox}</div>
      <p class="note" style="margin-top:18px">Removing a parent stops their sign-in from opening this family, and their Claude can no longer read or add to it.</p>`,
  });
}

export function timeline({ space, all, entries, children, child, flagged, range, upcoming, now, stamp, welcome }) {
  const base = `/f/${esc(space.key)}`;
  return page({
    title: `${space.name} · KidLog`,
    nav: spaceNav(space, 'timeline'),
    wide: true,
    body: `${welcome ? `<p class="note" style="margin-top:20px">Your timeline is ready. Sign in with Google at any time to get back to it. Next,<a href="${base}/connect">connect Claude</a>.</p>` : ''}
      ${board({ space, base, all, entries, children, child, flagged, range, upcoming, now, readOnly: false, shareHref: `${base}/share`, connectHref: `${base}/connect` })}
      <script>
      (function(){var s=${JSON.stringify(stamp)};setInterval(function(){
        if(document.hidden)return;
        fetch(${JSON.stringify(`/f/${space.key}/stamp`)}).then(function(r){return r.text()}).then(function(t){if(t&&t!==s)location.reload()}).catch(function(){});
      },4000)})();
      </script>`,
  });
}

export function entryForm({ space, entry, error, isNew, children }) {
  const base = `/f/${esc(space.key)}`;
  const e = entry;
  const opts = CATEGORIES.map((c) => `<option value="${c}"${e.category === c ? ' selected' : ''}>${LABEL[c]}</option>`).join('');
  return page({
    title: `${isNew ? 'Add' : 'Edit'} entry · KidLog`,
    nav: spaceNav(space, 'timeline'),
    body: `<h1>${isNew ? 'Add an entry' : 'Edit entry'}</h1>
      <p class="lead">${isNew ? 'Write it yourself, or tell Claude and it will appear on the timeline.' : e.source === 'claude' ? 'Claude wrote this from what you said. Change anything that is not right.' : 'Change anything that is not right.'}</p>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="${isNew ? `${base}/entries` : `${base}/e/${e.id}`}">
        <div class="two">
          <div><label for="child">Child</label>${children.length
            ? `<select id="child" name="child" required>${!children.some((c) => c.child === e.child) ? `<option value="${esc(e.child)}" selected>${esc(e.child) || 'Choose a child'}</option>` : ''}${children.map((c) => `<option value="${esc(c.child)}"${c.child === e.child ? ' selected' : ''}>${esc(c.child)}</option>`).join('')}</select>`
            : `<input id="child" type="text" name="child" value="${esc(e.child)}" required maxlength="60" placeholder="First name">`}</div>
          <div><label for="when">Date and time</label><input id="when" type="datetime-local" name="occurred_at" value="${esc(e.occurred_at)}" required></div>
        </div>
        <div class="two">
          <div><label for="cat">Type</label><select id="cat" name="category">${opts}</select></div>
          <div><label for="temp">Temperature (optional)</label><input id="temp" type="text" name="temperature" value="${esc(e.temperature || '')}" placeholder="e.g. 100.4 F" maxlength="20"></div>
        </div>
        <label for="title">Summary</label><input id="title" type="text" name="title" value="${esc(e.title)}" required maxlength="120">
        <label for="details">Details</label><textarea id="details" name="details" maxlength="4000">${esc(e.details)}</textarea>
        <label class="check"><input type="checkbox" name="flagged"${e.flagged ? ' checked' : ''}> Raise this with the doctor</label>
        <div class="row" style="margin-top:22px">
          <button class="btn">${isNew ? 'Add to timeline' : 'Save changes'}</button>
          <a class="btn ghost" href="${base}">Cancel</a>
        </div>
      </form>
      ${isNew ? '' : `<form method="post" action="${base}/e/${e.id}/delete" style="margin-top:28px" onsubmit="return window.confirm('Delete this entry? This cannot be undone.')">
        <button class="btn danger small">Delete this entry</button></form>`}`,
  });
}

const copyBox = (id, value) => `<div class="copy"><input id="${id}" type="text" readonly value="${esc(value)}" aria-label="Link" onfocus="this.select()">
  <button type="button" class="btn" onclick="var i=document.getElementById('${id}');navigator.clipboard.writeText(i.value).then(()=>{this.textContent='Copied'})">Copy</button></div>`;

export function connect({ space, mcpUrl, connection, disconnected }) {
  const b = `/f/${esc(space.key)}`;
  const status = connection
    ? `<div class="card ok"><b>Claude is connected to your account</b><p style="margin:4px 0 12px">Connected since ${dateOnly(connection.since)}. Claude can read and add to ${esc(space.name)}'s timeline when you ask it to.</p>
        <form method="post" action="${b}/connect/disconnect" style="margin:0" onsubmit="return window.confirm('Disconnect Claude? It will no longer be able to read or add to your timeline until you connect it again.')"><button class="btn danger small">Disconnect Claude</button></form></div>`
    : disconnected
      ? '<p class="note">Claude is disconnected. It can no longer read or add to your timeline. To finish, remove KidLog from your connectors in Claude, or connect again from there.</p>'
      : '';
  return page({
    title: 'Connect Claude · KidLog',
    nav: spaceNav(space, 'connect'),
    body: `<h1>Connect Claude</h1>
      <p class="lead">One-time setup, about a minute. It works in Claude on the web, desktop and phone. Each parent connects their own Claude.</p>
      ${status}
      <h2>KidLog's connector address</h2>
      ${copyBox('mcp', mcpUrl)}
      <p style="font-size:14.5px;color:var(--muted)">This address is the same for everyone and is safe to share. Claude gets access only after you sign in and allow it.</p>
      <h2>Steps</h2>
      <ol class="steps">
        <li>Open <a href="https://claude.ai/customize/connectors" target="_blank" rel="noopener">Claude</a> and go to <b>Customize &gt; Connectors</b>.</li>
        <li>Click <b>Add</b>, then <b>Add custom connector</b> (on some plans: <b>Custom &gt; Web</b>).</li>
        <li>Name it <b>KidLog</b>, paste the address above as the server URL, and click <b>Add</b>.</li>
        <li>Click <b>Connect</b>. A KidLog page opens: sign in with Google if asked, then click <b>Allow</b>.</li>
        <li>In a new chat, make sure KidLog is switched on under the <b>+</b> menu &gt; <b>Connectors</b>.</li>
      </ol>
      <h2>Then try saying</h2>
      <div class="say">Aarav woke up coughing at 2:15 AM, felt a bit warm but no high fever. Refused his bottle, settled around 3. Log this for the doctor.</div>
      <div class="say">Gave Aarav 5 ml paracetamol at 8 this morning. Temperature was 100.2 F before.</div>
      <div class="say">Summarise Aarav's last two weeks for our doctor visit.</div>
      <p><a class="btn ghost" href="${b}">Back to the timeline</a></p>`,
  });
}

// The approval page Claude sends a parent to when they connect KidLog.
export function consent({ space, user, id, clientName, redirectHost }) {
  const app = clean(clientName) || 'Claude';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(redirectHost);
  return page({
    title: 'Connect Claude to KidLog',
    body: `<h1>Allow ${esc(app)} to use your KidLog timeline?</h1>
      <p class="lead">You are signed in as ${esc(user.email)}. This connects ${esc(app)} to the family "${esc(space.name)}".</p>
      <div class="card">
        <b>It will be able to</b>
        <ul class="allow"><li>Read your entries, children and appointments</li><li>Add new entries and appointments, and add a child</li><li>Correct an entry or set a birth date when you ask it to</li></ul>
        <b style="display:block;margin-top:14px">It will not be able to</b>
        <ul class="allow no"><li>Delete entries or appointments</li><li>Invite or remove parents</li><li>Create or turn off doctor links</li></ul>
      </div>
      <p style="font-size:14.5px;color:var(--muted)">After you choose, you will be sent back to <b>${esc(redirectHost)}</b>.${local ? ' That is an app running on this computer. Continue only if you started this from Claude on this computer.' : ''} You can disconnect at any time on the Connect Claude page.</p>
      <form method="post" action="/oauth/consent" class="row" style="margin-top:18px">
        <input type="hidden" name="id" value="${esc(id)}">
        <button class="btn" name="action" value="allow">Allow</button>
        <button class="btn ghost" name="action" value="deny">Cancel</button>
      </form>
      <form method="post" action="/logout" style="margin-top:22px"><button class="btn ghost small">Not ${esc(user.email)}? Sign out</button></form>`,
  });
}

export function privacy({ user, supportEmail }) {
  const contact = supportEmail
    ? `<a href="mailto:${esc(supportEmail)}">${esc(supportEmail)}</a>`
    : 'the contact address published on this page (not yet set)';
  return page({
    title: 'Privacy policy · KidLog',
    nav: publicNav(user),
    body: `<div class="policy"><h1>Privacy policy</h1>
      <p class="lead">Last updated 16 November 2026. This page says what KidLog stores, why, who else is involved, and how to have it removed.</p>

      <h2>Who this covers</h2>
      <p>KidLog is a service for parents and guardians. It is not meant to be used by children. You decide what you record about your child, and you are responsible for having the right to record and share it.</p>

      <h2>What KidLog stores</h2>
      <ul>
        <li><b>Your account:</b> the name, email address and account identifier that Google gives us when you sign in. We never receive or store your Google password.</li>
        <li><b>Your family:</b> the family name you choose and which accounts are its parents.</li>
        <li><b>Your children:</b> the first name you enter for each child and, if you give it, their birth date.</li>
        <li><b>Health entries:</b> what you or your Claude save to the timeline: date and time, type, a summary, details, a temperature if given, and whether you flagged it for the doctor.</li>
        <li><b>Appointments:</b> the doctor and vaccine appointments you add, with their notes.</li>
        <li><b>Links you create:</b> doctor share links and parent invite links.</li>
        <li><b>Sign-in records:</b> a record that your browser is signed in, and a record that your Claude is connected. These are stored in scrambled form (hashes), not as usable keys.</li>
      </ul>
      <p>KidLog uses two cookies: one that keeps you signed in, and one that remembers your time zone so dates show correctly. It has no advertising or analytics trackers.</p>

      <h2>What KidLog does not collect</h2>
      <p>KidLog does not read your Claude conversations. It receives only the specific entries, appointments and requests that Claude sends through the KidLog connector. It does not collect your location, contacts or payment details.</p>

      <h2>How your information is used</h2>
      <p>Only to run the service: to show your timeline to you and the parents you invite, to show a read-only view to someone you give a doctor link to, and to let your Claude read and add entries when you ask it to. We do not sell your information, use it for advertising, or use it to train AI models.</p>

      <h2>Who can see it</h2>
      <ul>
        <li>The Google accounts listed on your Parents page.</li>
        <li>Anyone who has a doctor share link you created, for as long as that link is turned on. They can read what the link covers and cannot change anything.</li>
        <li>Your own Claude, once you connect it and allow access.</li>
      </ul>

      <h2>Other companies involved</h2>
      <ul>
        <li><b>Google</b> handles sign-in and tells us your name and email address.</li>
        <li><b>Vercel</b> hosts the KidLog website, and <b>Neon</b> hosts the database where your information is kept. Their technical logs may record your IP address and the pages requested.</li>
        <li><b>Anthropic</b> provides Claude. What you say to Claude, and what Claude reads from KidLog on your behalf, is handled under Anthropic's own terms and privacy policy for your Claude account. KidLog does not control that.</li>
      </ul>
      <p>We share your information with no one else, unless the law requires it.</p>

      <h2>How long it is kept</h2>
      <ul>
        <li>Entries, appointments, children and your family stay until you delete them or ask us to.</li>
        <li>A browser sign-in lasts up to 30 days. An unused invite link expires after 7 days.</li>
        <li>A Claude connection that is not used for 90 days expires. You can end it sooner on the Connect Claude page.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Edit or delete any entry or appointment in the app at any time.</li>
        <li>Turn off a doctor link, cancel an invite, remove a parent, or disconnect Claude at any time.</li>
        <li>To get a copy of your information, or to have your account and your family's information deleted, write to ${contact}. We will act on it within 30 days.</li>
      </ul>

      <h2>Security</h2>
      <p>All connections to KidLog are encrypted in transit (HTTPS). Your timeline opens only for signed-in parents of your family. No system is perfectly secure, so please do not record anything you would not want stored online.</p>

      <h2>Changes and contact</h2>
      <p>If this policy changes in a way that matters, we will update the date above and say so on the KidLog home page. Questions and requests: ${contact}.</p>
    </div>`,
  });
}

const scopeLabel = (sh) => `${sh.child ? esc(sh.child) : 'All children'} · ${sh.flagged_only ? 'flagged entries only' : 'entire list'}`;

export function share({ space, base, children, shares, preselect = '', fresh, error }) {
  const b = `/f/${esc(space.key)}`;
  const newest = fresh ? shares.find((x) => String(x.id) === String(fresh)) : null;
  const url = (sh) => `${base}/d/${sh.token}`;
  const kidOpts = children.map((c) => `<option value="${esc(c.child)}"${c.child.toLowerCase() === preselect.toLowerCase() ? ' selected' : ''}>${esc(c.child)}</option>`).join('');
  return page({
    title: 'Share with doctor · KidLog',
    nav: spaceNav(space, 'share'),
    body: `<h1>Share with your doctor</h1>
      <p class="lead">Create a read-only link. The doctor can read and print it, cannot change anything, and sees only what you choose here.</p>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      ${newest ? `<div class="card ok"><b>Your link is ready: ${scopeLabel(newest)}</b>
        <div style="margin-top:10px">${copyBox('fresh', url(newest))}</div>
        <p class="row" style="margin:12px 0 0"><a class="btn ghost small" href="${esc(url(newest))}" target="_blank" rel="noopener">Preview what the doctor sees</a></p></div>` : ''}
      <form method="post" action="${b}/share" class="card">
        <div class="two">
          <div><label for="child" style="margin-top:0">Whose timeline</label>
            <select id="child" name="child"><option value="">All children</option>${kidOpts}</select></div>
          <div><label for="what" style="margin-top:0">What to include</label>
            <select id="what" name="what"><option value="all">Entire list</option><option value="flagged">Only entries flagged for the doctor</option></select></div>
        </div>
        <div class="row" style="margin-top:16px"><button class="btn">Create link</button></div>
      </form>
      <h2>Links you have created</h2>
      ${shares.length ? shares.map((sh) => `<div class="kid">
          <div class="kinfo"><b>${scopeLabel(sh)}</b><span class="mono">${esc(url(sh))}</span></div>
          <a class="btn ghost small" href="${esc(url(sh))}" target="_blank" rel="noopener">Open</a>
          <button type="button" class="btn ghost small" onclick="navigator.clipboard.writeText(${esc(JSON.stringify(url(sh)))}).then(()=>{this.textContent='Copied'})">Copy</button>
          <form method="post" action="${b}/share/${sh.id}/delete" style="margin:0" onsubmit="return window.confirm('Turn off this link? Anyone who has it will no longer be able to open it.')"><button class="btn danger small">Turn off</button></form>
        </div>`).join('') : '<div class="card empty">No links yet. Create one above.</div>'}
      <p class="note" style="margin-top:18px">A link for one child never shows another child's entries. Turn a link off at any time and it stops working straight away.</p>`,
  });
}

export function doctorView({ space, token, lock = {}, all, entries, children, child, flagged, range }) {
  const scope = `${lock.child ? esc(lock.child) : 'All children'}${lock.flaggedOnly ? ' · flagged entries only' : ''}`;
  return page({
    title: `${lock.child || space.name} · health timeline`,
    nav: `<nav><a class="on">Read-only view for the doctor · ${scope}</a></nav>`,
    wide: true,
    body: board({ space, base: `/d/${esc(token)}`, all, entries, children, child: lock.child || child, flagged: lock.flaggedOnly ? false : flagged, range, readOnly: true, lock }),
  });
}

export function appointments({ space, list, children, child, now }) {
  const base = `/f/${esc(space.key)}`;
  const q = child ? `?child=${encodeURIComponent(child)}` : '';
  const up = list.filter((a) => a.scheduled_at >= now);
  const past = list.filter((a) => a.scheduled_at < now).reverse();
  const row = (a, isNext) => `<div class="kid${isNext ? ' nextup' : ''}">
      ${icon(KIND[a.kind][0])}
      <div class="kinfo"><b>${esc(a.title)}${isNext ? ' <span class="tag plain">Next</span>' : ''}</b>
        <span>${shortDay(a.scheduled_at)} · ${timeLabel(a.scheduled_at)} · ${esc(a.child)} · ${esc(KIND[a.kind][1])}</span>
        ${a.notes ? `<span>${esc(a.notes)}</span>` : ''}</div>
      <a class="btn ghost small" href="${base}/appointments/${a.id}">Edit</a>
    </div>`;
  const chip = (label, href, on) => `<a href="${href}"${on ? ' class="on"' : ''}>${esc(label)}</a>`;
  return page({
    title: 'Appointments · KidLog',
    nav: spaceNav(space, 'timeline'),
    body: `<div class="row" style="justify-content:space-between;align-items:flex-end">
        <div><h1>Appointments</h1><p class="lead" style="margin:0">Doctor and vaccine appointments, soonest first.</p></div>
        <a class="btn" href="${base}/appointments/new${q}">Add appointment</a>
      </div>
      ${children.length > 1 ? `<div class="chips">${chip('All children', `${base}/appointments`, !child)}${children.map((c) => chip(c.child, `${base}/appointments?child=${encodeURIComponent(c.child)}`, !!child && c.child.toLowerCase() === child.toLowerCase())).join('')}</div>` : ''}
      <h2>Upcoming</h2>
      ${up.length ? up.map((a, i) => row(a, i === 0)).join('') : '<div class="card empty">Nothing coming up. Add one, or tell Claude: "Jay has a follow-up on 28 January at 5 PM."</div>'}
      ${past.length ? `<h2>Past</h2>${past.map((a) => row(a, false)).join('')}` : ''}
      <p style="margin-top:20px"><a class="btn ghost" href="${base}${q}">Back to the timeline</a></p>`,
  });
}

export function appointmentForm({ space, appt, error, isNew, children }) {
  const base = `/f/${esc(space.key)}`;
  const a = appt;
  return page({
    title: `${isNew ? 'Add' : 'Edit'} appointment · KidLog`,
    nav: spaceNav(space, 'timeline'),
    body: `<h1>${isNew ? 'Add an appointment' : 'Edit appointment'}</h1>
      <p class="lead">${isNew ? 'A doctor visit or vaccine that is coming up. You can add as many as you need.' : 'Change the date, time or details.'}</p>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="${isNew ? `${base}/appointments` : `${base}/appointments/${a.id}`}">
        <div class="two">
          <div><label for="child">Child</label>${children.length
            ? `<select id="child" name="child" required>${!children.some((c) => c.child === a.child) ? `<option value="${esc(a.child)}" selected>${esc(a.child) || 'Choose a child'}</option>` : ''}${children.map((c) => `<option value="${esc(c.child)}"${c.child === a.child ? ' selected' : ''}>${esc(c.child)}</option>`).join('')}</select>`
            : `<input id="child" type="text" name="child" value="${esc(a.child)}" required maxlength="60" placeholder="First name">`}</div>
          <div><label for="kind">Type</label><select id="kind" name="kind">
            <option value="doctor"${a.kind === 'doctor' ? ' selected' : ''}>Doctor appointment</option>
            <option value="vaccine"${a.kind === 'vaccine' ? ' selected' : ''}>Vaccine appointment</option></select></div>
        </div>
        <div class="two">
          <div><label for="when">Date and time</label><input id="when" type="datetime-local" name="scheduled_at" value="${esc(a.scheduled_at)}" required></div>
          <div><label for="title">What it is for</label><input id="title" type="text" name="title" value="${esc(a.title)}" maxlength="120" placeholder="e.g. Paediatrician follow-up, MMR second dose"></div>
        </div>
        <label for="notes">Notes (optional)</label><textarea id="notes" name="notes" maxlength="1000" style="min-height:90px" placeholder="Clinic, what to bring, questions to ask">${esc(a.notes)}</textarea>
        <div class="row" style="margin-top:22px"><button class="btn">${isNew ? 'Add appointment' : 'Save changes'}</button><a class="btn ghost" href="${base}/appointments">Cancel</a></div>
      </form>
      ${isNew ? '' : `<form method="post" action="${base}/appointments/${a.id}/delete" style="margin-top:28px" onsubmit="return window.confirm('Delete this appointment?')"><button class="btn danger small">Delete this appointment</button></form>`}`,
  });
}

export function kids({ space, children, error, draft = {} }) {
  const base = `/f/${esc(space.key)}`;
  const rows = children.map((c) => `<div class="kid">
      <span class="mini big">${initial(c.child)}</span>
      <div class="kinfo"><b>${esc(c.child)}</b><span>${c.dob ? esc(ageLabel(c.dob)) : 'Birth date not set'} · ${c.entries} ${c.entries === 1 ? 'entry' : 'entries'}</span></div>
      <a class="btn ghost small" href="${base}?child=${encodeURIComponent(c.child)}">Open timeline</a>
      <a class="btn ghost small" href="${base}/kids/${c.id}">Edit</a>
    </div>`).join('');
  return page({
    title: 'Children · KidLog',
    nav: spaceNav(space, 'kids'),
    body: `<h1>Children</h1>
      <p class="lead">Each child has their own timeline. A child is also added automatically the first time you tell Claude about them.</p>
      ${rows || '<div class="card empty">No children yet. Add your first below.</div>'}
      <h2>Add a child</h2>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="${base}/kids" class="card">
        <div class="two">
          <div><label for="name" style="margin-top:0">First name</label><input id="name" type="text" name="name" value="${esc(draft.name || '')}" required maxlength="60"></div>
          <div><label for="dob" style="margin-top:0">Birth date (optional)</label><input id="dob" type="date" name="dob" value="${esc(draft.dob || '')}"></div>
        </div>
        <div class="row" style="margin-top:16px"><button class="btn">Add child</button></div>
      </form>`,
  });
}

export function kidForm({ space, kid, error }) {
  const base = `/f/${esc(space.key)}`;
  return page({
    title: `Edit ${kid.child} · KidLog`,
    nav: spaceNav(space, 'kids'),
    body: `<h1>Edit ${esc(kid.child)}</h1>
      <p class="lead">The birth date is used to show age on the timeline and in the doctor's view.</p>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="${base}/kids/${kid.id}">
        <div class="two">
          <div><label for="name">First name</label><input id="name" type="text" name="name" value="${esc(kid.child)}" required maxlength="60"></div>
          <div><label for="dob">Birth date</label><input id="dob" type="date" name="dob" value="${esc(kid.dob || '')}"></div>
        </div>
        <div class="row" style="margin-top:22px"><button class="btn">Save changes</button><a class="btn ghost" href="${base}/kids">Cancel</a></div>
      </form>
      ${kid.entries ? `<p class="lead" style="margin-top:24px;font-size:14.5px">Renaming also renames ${kid.entries} ${kid.entries === 1 ? 'entry' : 'entries'}. Renaming to another child's name merges the two.</p>`
        : `<form method="post" action="${base}/kids/${kid.id}/delete" style="margin-top:28px"><button class="btn danger small">Remove this child</button></form>`}`,
  });
}

export function notFound(message) {
  return page({
    title: 'Not found · KidLog',
    body: `<h1>We could not find that page</h1><p class="lead">${esc(message || 'Check the link and try again.')}</p><p><a class="btn" href="/">Go to KidLog</a></p>`,
  });
}
