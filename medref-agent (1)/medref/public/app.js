// MedRef Agent — front end. Plain JS, no build step.

const $ = (s, el = document) => el.querySelector(s);
const state = { mode: 'medicine', es: null, timer: null, started: 0 };

const PLACEHOLDER = {
  medicine: 'Medicine name — e.g. amoxicillin, Eliquis, metformin',
  pathology: 'Condition — e.g. community-acquired pneumonia, atrial fibrillation',
};

// ---------- utilities ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (v) => {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.some(has);
  if (typeof v === 'object') return has(v.text) || Object.entries(v).some(([k, x]) => k !== 'refs' && has(x));
  return true;
};
const refs = (r) => (Array.isArray(r) && r.length)
  ? r.map((n) => `<sup class="ref"><a href="#src-${+n}" title="Source ${+n}">${+n}</a></sup>`).join('')
  : '';
const txt = (it) => (typeof it === 'string' ? esc(it) : `${esc(it?.text)}${refs(it?.refs)}`);
const list = (arr) => (arr || []).filter(has).length
  ? `<ul>${arr.filter(has).map((it) => `<li>${txt(it)}</li>`).join('')}</ul>` : '';
const para = (it) => (has(it) ? `<p>${txt(it)}</p>` : '');
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

function store(key, val) {
  try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); } catch { return null; }
}

// ---------- mode + search ----------
document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.seg-btn').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  $('#q').placeholder = PLACEHOLDER[mode];
}

$('#lang').value = store('medref.lang') || 'en';
$('#lang').addEventListener('change', () => store('medref.lang', $('#lang').value));

$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (q.length >= 2) research(q, state.mode, $('#lang').value);
});
$('#stopBtn').addEventListener('click', () => { stop(); $('#progress').hidden = true; $('#goBtn').disabled = false; });

function renderRecent() {
  const items = store('medref.recent') || [];
  $('#recent').innerHTML = items.map((r, i) =>
    `<button type="button" class="chip" data-i="${i}"><b>${r.mode === 'medicine' ? 'Rx' : 'Dx'}</b>${esc(r.q)}</button>`).join('');
  $('#recent').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    const r = items[+c.dataset.i];
    setMode(r.mode); $('#q').value = r.q; research(r.q, r.mode, $('#lang').value);
  }));
}
function remember(q, mode) {
  const items = (store('medref.recent') || []).filter((r) => !(r.q.toLowerCase() === q.toLowerCase() && r.mode === mode));
  items.unshift({ q, mode });
  store('medref.recent', items.slice(0, 8));
  renderRecent();
}

function stop() {
  state.es?.close(); state.es = null;
  clearInterval(state.timer);
}

function research(q, mode, lang, fresh = false) {
  stop();
  const params = new URLSearchParams({ mode, q, lang });
  if (fresh) params.set('fresh', '1');
  history.replaceState(null, '', `?${new URLSearchParams({ mode, q })}`);

  $('#empty').hidden = true; $('#error').hidden = true; $('#result').hidden = true;
  $('#progress').hidden = false; $('#goBtn').disabled = true;
  $('#progressTitle').textContent = `Researching “${q}”`;
  $('#steps').innerHTML = ''; $('#foundList').innerHTML = ''; $('#foundCount').textContent = '0';
  state.started = Date.now();
  state.timer = setInterval(() => { $('#progressTimer').textContent = `${Math.round((Date.now() - state.started) / 1000)} s`; }, 1000);
  let found = 0;

  const es = new EventSource(`/api/research?${params}`);
  state.es = es;
  es.addEventListener('status', (e) => {
    const d = JSON.parse(e.data);
    const li = document.createElement('li');
    li.innerHTML = d.step === 'search' ? `Searching <span class="q">${esc(d.text)}</span>` : esc(d.text);
    $('#steps').append(li);
  });
  es.addEventListener('source', (e) => {
    const d = JSON.parse(e.data);
    found++;
    $('#foundCount').textContent = found;
    let host = ''; try { host = new URL(d.url).hostname.replace(/^www\./, ''); } catch {}
    const s = document.createElement('span'); s.textContent = host; $('#foundList').prepend(s);
  });
  es.addEventListener('result', (e) => {
    stop();
    $('#progress').hidden = true; $('#goBtn').disabled = false;
    const payload = JSON.parse(e.data);
    remember(q, mode);
    render(payload);
  });
  es.addEventListener('fail', (e) => { stop(); showError(JSON.parse(e.data).message); });
  es.onerror = () => { if (state.es === es) { stop(); showError('Connection lost. Please try again.'); } };
}

function showError(msg) {
  $('#progress').hidden = true; $('#goBtn').disabled = false;
  $('#error').hidden = false; $('#error').textContent = msg;
}

// ---------- rendering ----------
function render({ data, meta }) {
  const el = $('#result');
  el.hidden = false;
  if (!data || data.type === 'not_found') {
    el.className = 'result';
    el.innerHTML = `<div class="sec"><h2>No result</h2><p>${esc(data?.message || 'Nothing found for this search.')}</p></div>`;
    return;
  }
  const isMed = data.type === 'medicine';
  el.className = `result ${isMed ? '' : 'patho'}`;
  const sections = isMed ? medicineSections(data) : pathologySections(data);
  sections.push(sourcesSection(data, meta));

  el.innerHTML = `
    ${isMed ? medicineHead(data, meta) : pathologyHead(data, meta)}
    <div class="layout">
      <nav class="toc" aria-label="Sections">${sections.map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join('')}</nav>
      <div class="sections">${sections.map((s) => `<section class="sec ${s.cls || ''}" id="${s.id}"><h2>${esc(s.title)}</h2>${s.html}</section>`).join('')}</div>
    </div>`;

  wireHead(meta);
  if (!isMed) wireAlgorithm(data.algorithm);
  const filter = $('#ixFilter');
  if (filter) filter.addEventListener('input', () => {
    const v = filter.value.toLowerCase();
    el.querySelectorAll('#ixTable tbody tr').forEach((tr) => { tr.hidden = !tr.textContent.toLowerCase().includes(v); });
  });
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function headActions(meta) {
  const when = new Date(meta.generated_at).toLocaleString();
  return `<div class="head-actions">
    <button class="btn-ghost" id="printBtn" type="button">Print / PDF</button>
    ${meta.demo ? '' : '<button class="btn-ghost" id="refreshBtn" type="button">Re-research now</button>'}
    <span class="muted">${meta.demo ? 'Demo data' : `${meta.cached ? 'Cached · ' : ''}Researched ${esc(when)} · ${meta.searches.length} searches`}</span>
  </div>`;
}
function wireHead(meta) {
  $('#printBtn')?.addEventListener('click', () => window.print());
  $('#refreshBtn')?.addEventListener('click', () => research(meta.query, meta.mode, meta.lang, true));
}

function medicineHead(d, meta) {
  const tags = [
    ['Class', d.drug_class], ['ATC', d.atc], ['Status', d.rx_status], ['Label revised', d.label_revision_date],
  ].filter(([, v]) => has(v)).map(([k, v]) => `<span class="tag"><b>${k}</b>${esc(v)}</span>`).join('');
  return `<header class="mono-head">
    <div class="kicker">Drug monograph</div>
    <h1>${esc(d.name)}</h1>
    ${has(d.inn) ? `<div class="inn">${esc(d.inn)}${has(d.brand_names) ? ` — ${esc(d.brand_names.join(', '))}` : ''}</div>` : ''}
    <div class="tags">${tags}</div>
    ${has(d.forms) ? `<div class="muted">Forms: ${esc(d.forms.join(' · '))}</div>` : ''}
    ${has(d.summary) ? `<p class="summary">${esc(d.summary)}</p>` : ''}
    ${has(d.boxed_warning) ? `<div class="boxed"><strong>Boxed warning</strong>${txt(d.boxed_warning)}</div>` : ''}
    ${headActions(meta)}
  </header>`;
}

function doseTable(rows) {
  rows = (rows || []).filter(has);
  if (!rows.length) return '';
  return `<div class="tbl-wrap"><table class="resp"><thead><tr><th>Indication</th><th>Dose</th><th>Duration</th><th>Notes</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td data-l="Indication">${esc(r.indication)}</td><td class="dose" data-l="Dose">${esc(r.dose)}${refs(r.refs)}</td><td data-l="Duration">${esc(r.duration)}</td><td data-l="Notes">${esc(r.notes)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function medicineSections(d) {
  const S = [];
  const add = (id, title, html, cls) => { if (html && html.replace(/<[^>]+>/g, '').trim()) S.push({ id, title, html, cls }); };
  const dz = d.dosing || {};

  add('indications', 'Indications', list(d.indications));
  add('dosing', 'Dosage', [
    has(dz.adult) ? `<h3>Adults</h3>${doseTable(dz.adult)}` : '',
    has(dz.pediatric) ? `<h3>Children</h3>${doseTable(dz.pediatric)}` : '',
    has(dz.renal) ? `<h3>Renal impairment</h3>${para(dz.renal)}` : '',
    has(dz.hepatic) ? `<h3>Hepatic impairment</h3>${para(dz.hepatic)}` : '',
    has(dz.elderly) ? `<h3>Elderly</h3>${para(dz.elderly)}` : '',
    has(dz.max_dose) ? `<h3>Maximum dose</h3>${para(dz.max_dose)}` : '',
    has(dz.administration) ? `<h3>Administration</h3>${para(dz.administration)}` : '',
  ].join(''));
  add('contraindications', 'Contraindications', list(d.contraindications), 'danger');
  add('warnings', 'Warnings & precautions', list(d.warnings), 'warn');

  const ae = (d.adverse_effects || []).filter(has);
  add('adverse', 'Adverse effects',
    ae.map((g) => `<div class="freq"><div class="freq-label">${esc(g.frequency)}${refs(g.refs)}</div><div>${esc((g.effects || []).join(', '))}</div></div>`).join('') +
    (has(d.serious_complications) ? `<h3 style="margin-top:14px">Serious complications</h3>${list(d.serious_complications)}` : ''));

  const order = { contraindicated: 0, major: 1, moderate: 2, minor: 3 };
  const ix = (d.interactions || []).filter(has).sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  add('interactions', 'Interactions', ix.length ? `
    ${ix.length > 6 ? '<input id="ixFilter" class="filter" placeholder="Filter interactions…" />' : ''}
    <div class="tbl-wrap"><table id="ixTable" class="resp"><thead><tr><th>Drug</th><th>Severity</th><th>Effect</th><th>Management</th></tr></thead><tbody>
    ${ix.map((i) => `<tr><td data-l="Drug"><strong>${esc(i.drug)}</strong></td><td><span class="sev sev-${esc((i.severity || '').toLowerCase())}">${esc(i.severity)}</span></td><td data-l="Effect">${esc(i.effect)}${refs(i.refs)}</td><td data-l="Management">${esc(i.management)}</td></tr>`).join('')}
    </tbody></table></div>` : '');

  add('pregnancy', 'Pregnancy & lactation', `${has(d.pregnancy) ? `<h3>Pregnancy</h3>${para(d.pregnancy)}` : ''}${has(d.lactation) ? `<h3>Breastfeeding</h3>${para(d.lactation)}` : ''}`);
  add('overdose', 'Overdose', para(d.overdose));
  add('monitoring', 'Monitoring', list(d.monitoring));

  const p = d.pharmacology || {};
  const pk = [['Mechanism', p.mechanism], ['Absorption', p.absorption], ['Half-life', p.half_life], ['Metabolism', p.metabolism], ['Excretion', p.excretion]].filter(([, v]) => has(v));
  add('pharmacology', 'Pharmacology', pk.length ? `<dl class="kv">${pk.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '');

  add('updates', 'Safety updates & regional notes', [
    has(d.recent_safety_updates) ? `<h3>Recent safety updates</h3><ul>${d.recent_safety_updates.filter(has).map((u) => `<li>${u.date ? `<strong>${esc(u.date)}</strong> — ` : ''}${txt(u)}</li>`).join('')}</ul>` : '',
    has(d.regional_differences) ? `<h3>US / EU / UK differences</h3>${para(d.regional_differences)}` : '',
  ].join(''));
  return S;
}

function pathologyHead(d, meta) {
  const tags = [['ICD-10', d.icd10], ['Specialty', d.specialty]].filter(([, v]) => has(v))
    .map(([k, v]) => `<span class="tag"><b>${k}</b>${esc(v)}</span>`).join('');
  return `<header class="mono-head patho">
    <div class="kicker">Clinical algorithm</div>
    <h1>${esc(d.name)}</h1>
    <div class="tags">${tags}</div>
    ${has(d.summary) ? `<p class="summary">${esc(d.summary)}</p>` : ''}
    ${headActions(meta)}
  </header>`;
}

function pathologySections(d) {
  const S = [];
  const add = (id, title, html, cls) => { if (html && html.replace(/<[^>]+>/g, '').trim()) S.push({ id, title, html, cls }); };
  const algo = d.algorithm;
  if (algo?.nodes?.length) {
    add('algorithm', algo.title || 'Algorithm', `
      <div class="algo-tabs">
        <button type="button" class="btn-ghost active" data-view="step">Step-by-step</button>
        <button type="button" class="btn-ghost" data-view="flow">Full pathway</button>
      </div>
      <div id="stepView" class="stepper"></div>
      <div id="flowView" class="flow" hidden></div>`);
  }
  add('redflags', 'Red flags', list(d.red_flags), 'danger');
  add('overview', 'Definition & presentation', `${para(d.definition)}${has(d.key_features) ? `<h3>Key features</h3>${list(d.key_features)}` : ''}`);
  const dx = d.diagnosis || {};
  add('diagnosis', 'Diagnosis', [
    has(dx.criteria) ? `<h3>Criteria</h3>${list(dx.criteria)}` : '',
    has(dx.workup) ? `<h3>Work-up</h3>${list(dx.workup)}` : '',
    has(dx.differentials) ? `<h3>Differential diagnosis</h3><p>${esc(dx.differentials.join(' · '))}</p>` : '',
  ].join(''));
  add('severity', 'Severity scores', (d.severity_scores || []).filter(has).map((s) => `
    <h3>${esc(s.name)}${refs(s.refs)}</h3>
    ${has(s.items) ? `<ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    ${has(s.interpretation) ? `<p class="muted" style="margin-top:6px">${s.interpretation.map(esc).join('<br>')}</p>` : ''}`).join(''));
  add('treatment', 'Treatment', (d.treatment || []).filter(has).map((t) => `
    <div class="treat"><div class="line">${esc(t.line)}</div>${has(t.setting) ? `<div class="setting">${esc(t.setting)}</div>` : ''}
    <div class="reg">${esc(t.regimen)}${refs(t.refs)}</div>${has(t.notes) ? `<div class="muted">${esc(t.notes)}</div>` : ''}</div>`).join(''));
  add('complications', 'Complications', list(d.complications), 'warn');
  add('followup', 'Follow-up', list(d.follow_up));
  add('guidelines', 'Guidelines', [
    has(d.guidelines) ? `<ul>${d.guidelines.filter(has).map((g) => `<li><a href="${esc(safeUrl(g.url))}" target="_blank" rel="noopener">${esc(g.name)}</a> — ${esc(g.organization)}${g.year ? `, ${esc(g.year)}` : ''}</li>`).join('')}</ul>` : '',
    has(d.guideline_differences) ? `<h3 style="margin-top:12px">Where guidelines differ</h3>${para(d.guideline_differences)}` : '',
  ].join(''));
  return S;
}

function sourcesSection(d, meta) {
  const src = (d.sources || []).filter((s) => s && s.url);
  return {
    id: 'sources', title: 'Sources', cls: 'sources',
    html: `
      ${has(d.gaps) ? `<div class="gaps"><strong>Gaps / caveats:</strong> ${esc(d.gaps)}</div><br>` : ''}
      <ol>${src.map((s, i) => `<li id="src-${i + 1}"><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>${s.publisher ? ` — ${esc(s.publisher)}` : ''}${s.date ? ` <span class="muted">(${esc(s.date)})</span>` : ''}</li>`).join('')}</ol>
      ${meta.searches?.length ? `<details class="searched"><summary>Searches performed (${meta.searches.length}) · ${meta.consulted?.length || 0} pages consulted</summary><ul>${meta.searches.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></details>` : ''}
      <div class="meta-line">Model: ${esc(meta.model)} · Generated ${esc(new Date(meta.generated_at).toLocaleString())}. Verify against official product information before prescribing.</div>`,
  };
}

// ---------- algorithm ----------
const KIND = { start: 'Start', decision: 'Decision', action: 'Action', end: 'Outcome' };

function wireAlgorithm(algo) {
  if (!algo?.nodes?.length) return;
  const byId = new Map(algo.nodes.map((n) => [n.id, n]));
  const startId = byId.has(algo.start) ? algo.start : algo.nodes[0].id;

  // Number nodes in breadth-first order so the full pathway reads top-down.
  const order = []; const seen = new Set([startId]); const queue = [startId];
  while (queue.length) {
    const id = queue.shift(); order.push(id);
    for (const b of byId.get(id)?.next || []) if (byId.has(b.to) && !seen.has(b.to)) { seen.add(b.to); queue.push(b.to); }
  }
  algo.nodes.forEach((n) => { if (!seen.has(n.id)) order.push(n.id); });
  const num = new Map(order.map((id, i) => [id, i + 1]));

  $('#flowView').innerHTML = order.map((id) => {
    const n = byId.get(id);
    const go = (n.next || []).filter((b) => byId.has(b.to));
    return `<div class="fnode" id="node-${esc(id)}">
      <div class="num k-${esc(n.kind)}-n"><span>${num.get(id)}</span></div>
      <div class="fbody"><div class="t">${esc(n.text)}${refs(n.refs)}</div>${has(n.detail) ? `<div class="d">${esc(n.detail)}</div>` : ''}
      ${go.length ? `<div class="go">${go.map((b) => `<a href="#node-${esc(b.to)}">${b.label ? `<b>${esc(b.label)}</b> → ` : '→ '}step ${num.get(b.to)}</a>`).join('')}</div>` : ''}</div>
    </div>`;
  }).join('');

  const path = [startId];
  const draw = () => {
    const n = byId.get(path[path.length - 1]);
    const go = (n.next || []).filter((b) => byId.has(b.to));
    $('#stepView').innerHTML = `
      <div class="trail">${path.map((id, i) => `<button type="button" data-i="${i}">${num.get(id)}. ${esc(byId.get(id).text.slice(0, 28))}${byId.get(id).text.length > 28 ? '…' : ''}</button>`).join('<span>›</span>')}</div>
      <div class="node-card k-${esc(n.kind)}">
        <div class="kind">${KIND[n.kind] || 'Step'} · step ${num.get(n.id)}</div>
        <div class="text">${esc(n.text)}${refs(n.refs)}</div>
        ${has(n.detail) ? `<div class="detail">${esc(n.detail)}</div>` : ''}
      </div>
      <div class="branches">
        ${go.map((b, i) => `<button type="button" data-to="${esc(b.to)}">${esc(b.label || 'Next')} →</button>`).join('')}
        ${path.length > 1 ? '<button type="button" data-back="1" style="border-color:var(--line);font-weight:500">← Back</button>' : ''}
        ${!go.length ? '<button type="button" data-restart="1" style="border-color:var(--line);font-weight:500">↺ Restart</button>' : ''}
      </div>`;
    $('#stepView').querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => { path.push(b.dataset.to); draw(); }));
    $('#stepView').querySelectorAll('.trail [data-i]').forEach((b) => b.addEventListener('click', () => { path.length = +b.dataset.i + 1; draw(); }));
    $('#stepView [data-back]')?.addEventListener('click', () => { path.pop(); draw(); });
    $('#stepView [data-restart]')?.addEventListener('click', () => { path.length = 1; draw(); });
  };
  draw();

  document.querySelectorAll('.algo-tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.algo-tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $('#stepView').hidden = b.dataset.view !== 'step';
    $('#flowView').hidden = b.dataset.view !== 'flow';
  }));
}

// ---------- boot ----------
fetch('/api/config').then((r) => r.json()).then((c) => { $('#demoBadge').hidden = !c.demo; }).catch(() => {});
renderRecent();
const init = new URLSearchParams(location.search);
if (init.get('mode')) setMode(init.get('mode') === 'pathology' ? 'pathology' : 'medicine');
if (init.get('q')) { $('#q').value = init.get('q'); research(init.get('q'), state.mode, $('#lang').value); }
