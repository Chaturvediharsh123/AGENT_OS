// AgentOS workspace — a small hash-routed single-page app over the local JSON API.
(() => {
  'use strict';

  // ------------------------------------------------------------------ utils
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('agentos-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('agentos-' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
    return data;
  }

  const ts = s => s ? new Date(s).getTime() : 0;
  function ago(s) {
    const d = (Date.now() - ts(s)) / 1000;
    if (d < 45) return 'just now';
    if (d < 3600) return Math.round(d / 60) + 'm ago';
    if (d < 86400) return Math.round(d / 3600) + 'h ago';
    return Math.round(d / 86400) + 'd ago';
  }
  function dur(a, b) {
    if (!a) return '';
    const s = ((b ? ts(b) : Date.now()) - ts(a)) / 1000;
    if (s < 0) return '';
    return s < 60 ? s.toFixed(1) + 's' : Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's';
  }
  const initial = n => (String(n || '?').trim()[0] || '?').toUpperCase();
  const avatar = (a, size = '') => `<span class="av ${size} g${(a?.id ?? a?.agent_id ?? 0) % 6}">${esc(initial(a?.name ?? a?.agent_name))}</span>`;

  const ICONS = {
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    flow: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.3 11l9.4-4M7.3 13l9.4 4"/>',
    page: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
    plug: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 01-10 0zM12 16v5"/>',
    chip: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/>',
    book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5"/>',
    grid: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  };
  const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

  // Minimal, escape-first markdown renderer for model output.
  function md(src) {
    const text = String(src || '').replace(/\r\n/g, '\n');
    const blocks = [];
    const withFences = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      blocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
      return `\u0000${blocks.length - 1}\u0000`;
    });
    const inline = s => esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const out = [];
    let list = null, para = [], quote = [], table = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.t}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.t}>`); list = null; } };
    const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = []; } };
    const flushTable = () => {
      if (!table.length) return;
      const rows = table.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\s*\||\|\s*$/g, '').split('|').map(c => c.trim()));
      out.push(`<table>${rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('')}</tr>`).join('')}</table>`);
      table = [];
    };
    const flush = () => { flushPara(); flushList(); flushQuote(); flushTable(); };
    for (const line of withFences.split('\n')) {
      let m;
      if (/^\u0000\d+\u0000$/.test(line.trim())) { flush(); out.push(blocks[+line.trim().slice(1, -1)]); }
      else if ((m = line.match(/^(#{1,4})\s+(.*)/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
      else if (/^\s*([-*_])\s*\1\s*\1\s*$/.test(line)) { flush(); out.push('<hr>'); }
      else if ((m = line.match(/^\s*[-*+]\s+(.*)/))) { flushPara(); flushQuote(); flushTable(); if (!list || list.t !== 'ul') { flushList(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushPara(); flushQuote(); flushTable(); if (!list || list.t !== 'ol') { flushList(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); }
      else if ((m = line.match(/^>\s?(.*)/))) { flushPara(); flushList(); flushTable(); quote.push(m[1]); }
      else if (/^\s*\|.*\|\s*$/.test(line)) { flushPara(); flushList(); flushQuote(); table.push(line); }
      else if (!line.trim()) flush();
      else { flushList(); flushQuote(); flushTable(); para.push(line); }
    }
    flush();
    return out.join('');
  }

  function toast(msg, kind = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<span class="dot"></span><span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
    setTimeout(() => el.remove(), 3600);
  }

  function download(name, text, type = 'text/markdown') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------------ state
  const S = { agents: [], runs: [], health: null, stats: null, models: null, loaded: false };

  function missionsFrom(runs) {
    const map = new Map();
    for (const r of runs) {
      const id = r.mission_id || 'run-' + r.id;
      if (!map.has(id)) map.set(id, { id, task: r.task, routing: r.routing || 'Balanced', runs: [] });
      map.get(id).runs.push(r);
    }
    return [...map.values()].map(m => {
      m.runs.sort((a, b) => (a.step || 0) - (b.step || 0) || a.id - b.id);
      const st = m.runs.map(r => r.status);
      m.status = st.some(s => s === 'running' || s === 'queued') ? 'running'
        : st.every(s => s === 'completed') ? 'completed' : st.every(s => s === 'failed') ? 'failed' : 'partial';
      m.created = m.runs.reduce((a, r) => (!a || r.created_at < a ? r.created_at : a), '');
      const fin = m.runs.map(r => r.finished_at).filter(Boolean).sort().pop();
      m.finished = m.status === 'running' ? null : fin;
      m.crew = m.routing === 'Crew handoff' && m.runs.length > 1;
      return m;
    }).sort((a, b) => ts(b.created) - ts(a.created));
  }

  const agentById = id => S.agents.find(a => a.id === id);
  const PROVIDER_LABEL = { ollama: 'Ollama', openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', demo: 'Demo' };
  const DEFAULT_MODELS = { ollama: 'qwen3.5:4b', openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-5', gemini: 'gemini-2.5-flash', demo: 'simulated' };

  async function refresh() {
    const [agents, runs, health, stats] = await Promise.all([
      api('/api/agents').catch(() => S.agents),
      api('/api/runs?limit=300').catch(() => S.runs),
      api('/api/health').catch(() => null),
      api('/api/stats').catch(() => S.stats),
    ]);
    Object.assign(S, { agents, runs, health, stats, loaded: true });
    paintChrome();
  }

  function paintChrome() {
    const h = S.health;
    const setDot = (el, cls) => { el.className = 'dot ' + cls; };
    setDot($('#rtOllama'), h?.ollama ? 'ok' : 'bad');
    $('#rtOllamaTxt').textContent = h ? (h.ollama ? `${h.models} models` : 'offline') : '…';
    const keys = h ? Object.values(h.providers || {}).filter(Boolean).length : 0;
    setDot($('#rtCloud'), keys ? 'ok' : '');
    $('#rtCloudTxt').textContent = h ? `${keys}/3 set` : '…';
    $('#rtVersion').textContent = h ? 'v' + h.version : 'offline';
    const active = S.runs.filter(r => r.status === 'running' || r.status === 'queued').length;
    const na = $('#navActive');
    na.textContent = active ? `${active} live` : (S.stats?.missions || '');
    na.className = 'count' + (active ? ' live' : '');
    $('#navAgents').textContent = S.agents.length || '';
  }

  // ------------------------------------------------------------------ shared bits
  function statusBadge(status) {
    const label = { completed: 'Completed', failed: 'Failed', running: 'Running', queued: 'Queued', partial: 'Partial' }[status] || status;
    const lead = status === 'running' ? '<span class="spinner"></span>' : status === 'completed' ? '✓' : status === 'failed' ? '✕' : status === 'queued' ? '◌' : '◐';
    return `<span class="status ${esc(status)}">${lead} ${label}</span>`;
  }

  function pipeline(m) {
    const link = on => `<div class="p-link ${on ? 'on' : ''}"><svg viewBox="0 0 34 20"><path d="M2 10h28M24 4l6 6-6 6"/></svg></div>`;
    return `<div class="pipeline">${m.runs.map((r, i) => {
      const a = agentById(r.agent_id) || { id: r.agent_id, name: r.agent_name };
      const done = r.status === 'completed' || r.status === 'failed';
      const sep = i ? (m.crew ? link(m.runs[i - 1].status === 'completed' || r.status !== 'queued') : '<div class="p-gap"></div>') : '';
      return `${sep}<button class="p-node ${esc(r.status)}" ${done ? `data-run="${r.id}"` : ''} data-mission="${esc(m.id)}">
        <div class="top">${avatar(a, 'sm')}<div><b>${esc(r.agent_name)}</b><small>${esc(a.role || 'Agent')}</small></div></div>
        <div class="bar"><i></i></div>
        <div class="meta"><span>${statusBadge(r.status)}</span><span>${esc(dur(r.started_at, r.finished_at))}</span></div>
        ${r.status === 'failed' ? `<div class="err" title="${esc(r.error)}">${esc(r.error)}</div>` : ''}
      </button>`;
    }).join('')}</div>`;
  }

  function missionRow(m) {
    const agents = m.runs.slice(0, 4).map(r => avatar(agentById(r.agent_id) || { id: r.agent_id, name: r.agent_name }, 'sm')).join('');
    return `<a class="m-row" href="#/mission/${esc(m.id)}">
      <div><div class="t">${esc(m.task)}</div>
      <div class="d">${statusBadge(m.status)}<span>${m.crew ? 'Crew handoff' : esc(m.routing)}</span><span>${m.runs.length} agent${m.runs.length > 1 ? 's' : ''}</span><span>${ago(m.created)}</span>${m.finished ? `<span class="mono">${dur(m.created, m.finished)}</span>` : ''}</div></div>
      <div class="right"><div class="av-stack">${agents}</div></div></a>`;
  }

  const emptyState = (ic, title, sub, cta = '') => `<div class="empty"><div class="ic">${icon(ic)}</div><b>${title}</b><div>${sub}</div>${cta ? `<div style="margin-top:16px">${cta}</div>` : ''}</div>`;

  function ollamaBanner() {
    if (!S.health || S.health.ollama) return '';
    const onOllama = S.agents.filter(a => a.provider === 'ollama').length;
    if (!onOllama) return '';
    return `<div class="banner"><span class="dot warn"></span><div><b>Ollama is offline</b><span>${onOllama} agent${onOllama > 1 ? 's use' : ' uses'} Ollama. Run <code class="mono">ollama serve</code>, or switch the crew to the labelled demo provider for a live presentation.</span></div><button class="btn sm" data-act="demo-on">Use demo mode</button></div>`;
  }

  async function setAllProviders(provider) {
    const targets = S.agents.filter(a => a.provider !== provider && (provider === 'demo' ? a.provider === 'ollama' : a.provider === 'demo'));
    const models = S.models?.models || [];
    const model = provider === 'demo' ? DEFAULT_MODELS.demo : (models[0] || DEFAULT_MODELS.ollama);
    await Promise.all(targets.map(a => api('/api/agents/' + a.id, { method: 'PATCH', body: { provider, model } })));
    await refresh();
    toast(provider === 'demo' ? `Demo mode on for ${targets.length} agents` : `${targets.length} agents back on Ollama`);
    route();
  }

  // ------------------------------------------------------------------ views
  const TEMPLATES = [
    { label: '🚀 Launch brief', text: 'Research the market for an AI study-planner app for college students, analyse the top 3 competitors, and draft a one-page launch brief with a clear recommendation.' },
    { label: '🔍 Market scan', text: 'Scan the landscape of open-source AI agent frameworks, compare their strengths and weaknesses, and recommend one for a small team.' },
    { label: '🧑‍💻 Code review', text: 'Review this approach: a Python HTTP server using threads and SQLite for a multi-agent app. List risks, then propose concrete improvements.' },
    { label: '🎤 Pitch script', text: 'Write a 2-minute hackathon pitch for AgentOS: the problem, the demo flow, the tech, and why it matters. Then critique it and tighten it.' },
    { label: '📚 Study plan', text: 'Create a 7-day study plan to learn the basics of transformers, with daily goals, resources, and a self-check quiz.' },
  ];
  const STRATEGIES = {
    'Balanced': 'Agents work in parallel — independent perspectives, fastest wall-clock time.',
    'Crew handoff': 'Agents run in order, each building on the previous agents’ output — research → analysis → draft → review.',
    'Local only': 'Parallel, but refuses to send anything to a cloud provider.',
  };

  const views = {};
  let current = null;

  views.dashboard = {
    title: 'Mission Control',
    render() {
      const picked = new Set(store.get('picked', S.agents.map(a => a.id)));
      const routing = store.get('routing', 'Crew handoff');
      const draft = store.get('draft', '');
      return `<div class="page">
        <div class="page-head"><div><div class="eyebrow">Mission Control</div><h1>What should your crew ship today?</h1><p>Describe an outcome, assemble agents, and watch the work unfold live.</p></div></div>
        <div id="dashBanner">${ollamaBanner()}</div>
        <div class="stat-grid" id="dashStats">${this.stats()}</div>
        <div class="grid-2">
          <div class="stack">
            <section class="card composer" id="composer">
              <textarea id="task" placeholder="Describe the outcome you need…  e.g. Research a market, challenge the evidence, and draft a decision brief.">${esc(draft)}</textarea>
              <div class="templates">${TEMPLATES.map((t, i) => `<button class="chip" data-tpl="${i}">${t.label}</button>`).join('')}</div>
              <div class="strategy-hint" id="stratHint">${STRATEGIES[routing] || ''}</div>
              <div class="composer-foot">
                <span class="lbl">CREW</span>
                <div class="crew-picker" id="crewPicker">${S.agents.map(a => `<button class="chip ${picked.has(a.id) ? 'on' : ''}" data-pick="${a.id}">${avatar(a)}${esc(a.name)}</button>`).join('') || '<span class="sub">No agents yet — <a href="#/agents">create one</a></span>'}
                  ${S.agents.length > 1 ? '<button class="btn ghost sm" data-act="pick-all">All</button>' : ''}</div>
                <span class="grow"></span>
              </div>
              <div class="composer-foot">
                <span class="lbl">STRATEGY</span>
                <div class="seg" id="routingSeg">${Object.keys(STRATEGIES).map(k => `<button class="${k === routing ? 'on' : ''}" data-routing="${k}">${k === 'Balanced' ? 'Parallel' : k}</button>`).join('')}</div>
                <span class="grow"></span>
                <span class="sub" style="color:var(--muted);font-size:12px"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
                <button class="btn primary" id="dispatchBtn">Dispatch mission ${icon('arrow').replace('<svg', '<svg width="16" height="16"')}</button>
              </div>
            </section>
            <section class="card panel"><div class="panel-head"><h2>${icon('flow').replace('<svg', '<svg width="16" height="16"')} Live pipeline</h2><span class="sub" id="pipeSub"></span></div><div id="dashPipe">${this.pipe()}</div></section>
          </div>
          <div class="stack">
            <section class="card panel"><div class="panel-head"><h2>Recent missions</h2><a class="btn ghost sm" href="#/missions">View all →</a></div><div id="dashRecent">${this.recent()}</div></section>
            <section class="card panel"><div class="panel-head"><h2>Crew status</h2><a class="btn ghost sm" href="#/agents">Manage →</a></div><div id="dashCrew">${this.crew()}</div></section>
          </div>
        </div></div>`;
    },
    stats() {
      const s = S.stats || {};
      const spark = () => {
        const ms = missionsFrom(S.runs).slice(0, 14).reverse();
        if (ms.length < 2) return '';
        const pts = ms.map((m, i) => `${(i / (ms.length - 1)) * 70},${22 - Math.min(20, m.runs.length * 5)}`).join(' ');
        return `<svg class="spark" width="72" height="24"><polyline points="${pts}" fill="none" stroke="url(#sg)" stroke-width="2" stroke-linejoin="round"/><defs><linearGradient id="sg"><stop stop-color="#8b6cff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs></svg>`;
      };
      return `
        <div class="card stat"><small>${icon('bolt')} Missions</small><b>${s.missions ?? '—'}</b><em>${s.runs ?? 0} agent runs total</em>${spark()}</div>
        <div class="card stat"><small>${icon('check')} Success rate</small><b>${s.success_rate != null ? s.success_rate + '%' : '—'}</b><em>${s.completed ?? 0} completed · ${s.failed ?? 0} failed</em></div>
        <div class="card stat"><small>${icon('clock')} Avg. step time</small><b>${s.avg_seconds != null ? s.avg_seconds + 's' : '—'}</b><em>per completed agent run</em></div>
        <div class="card stat"><small>${icon('users')} Agents</small><b>${S.agents.length}</b><em>${s.active ? `<span style="color:var(--accent-2)">${s.active} step${s.active > 1 ? 's' : ''} in flight</span>` : 'all idle, ready'}</em></div>`;
    },
    pipe() {
      const m = missionsFrom(S.runs)[0];
      if (!m) return emptyState('flow', 'No missions yet', 'Dispatch a mission and each agent step will appear here in real time.');
      return `<a href="#/mission/${esc(m.id)}" style="text-decoration:none;display:block;margin-bottom:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.task)}</a>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">${statusBadge(m.status)}<span class="pill ${m.crew ? 'accent' : 'info'}">${m.crew ? 'CREW HANDOFF' : 'PARALLEL'}</span><span class="pill">${ago(m.created)}</span></div>${pipeline(m)}`;
    },
    recent() {
      const ms = missionsFrom(S.runs).slice(0, 5);
      return ms.length ? `<div class="m-list">${ms.map(missionRow).join('')}</div>` : emptyState('clock', 'Nothing here yet', 'Your mission history will show up here.');
    },
    crew() {
      if (!S.agents.length) return emptyState('users', 'No agents', 'Create your first agent.', '<a class="btn primary sm" href="#/agents">Create agent</a>');
      return `<div class="m-list">${S.agents.map(a => `<div class="m-row" style="grid-template-columns:auto 1fr auto"><span>${avatar(a)}</span><div><div class="t">${esc(a.name)} <span style="color:var(--muted);font-weight:500">· ${esc(a.role)}</span></div><div class="d"><span class="mono">${esc(PROVIDER_LABEL[a.provider] || a.provider)} · ${esc(a.model)}</span></div></div>${a.status === 'running' ? '<span class="pill info"><span class="dot live"></span>Working</span>' : '<span class="pill ok"><span class="dot ok"></span>Ready</span>'}</div>`).join('')}</div>`;
    },
    mount(el) {
      const ta = $('#task', el);
      ta.addEventListener('input', () => store.set('draft', ta.value));
      ta.addEventListener('focus', () => $('#composer').classList.add('focus'));
      ta.addEventListener('blur', () => $('#composer').classList.remove('focus'));
      el.addEventListener('click', e => {
        const t = e.target.closest('[data-tpl]');
        if (t) { ta.value = TEMPLATES[+t.dataset.tpl].text; store.set('draft', ta.value); ta.focus(); }
        const p = e.target.closest('[data-pick]');
        if (p) {
          const picked = new Set(store.get('picked', S.agents.map(a => a.id)));
          const id = +p.dataset.pick;
          picked.has(id) ? picked.delete(id) : picked.add(id);
          store.set('picked', [...picked]); p.classList.toggle('on');
        }
        if (e.target.closest('[data-act="pick-all"]')) {
          const all = S.agents.map(a => a.id);
          const picked = store.get('picked', all);
          const next = picked.length === all.length ? [] : all;
          store.set('picked', next);
          $$('[data-pick]', el).forEach(b => b.classList.toggle('on', next.includes(+b.dataset.pick)));
        }
        const r = e.target.closest('[data-routing]');
        if (r) {
          store.set('routing', r.dataset.routing);
          $$('[data-routing]', el).forEach(b => b.classList.toggle('on', b === r));
          $('#stratHint').textContent = STRATEGIES[r.dataset.routing];
        }
      });
      $('#dispatchBtn', el).addEventListener('click', dispatch);
      if (!ta.value) setTimeout(() => ta.focus(), 50);
    },
    update() {
      const set = (id, html) => { const el = $(id); if (el && el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } };
      set('#dashBanner', ollamaBanner());
      set('#dashStats', this.stats());
      set('#dashPipe', this.pipe());
      set('#dashRecent', this.recent());
      set('#dashCrew', this.crew());
    },
  };

  async function dispatch() {
    const ta = $('#task');
    const task = ta?.value.trim();
    if (!task) { toast('Describe the mission first', 'bad'); ta?.focus(); return; }
    const ids = store.get('picked', S.agents.map(a => a.id)).filter(id => agentById(id));
    if (!ids.length) { toast('Pick at least one agent for the crew', 'bad'); return; }
    const routing = store.get('routing', 'Crew handoff');
    const btn = $('#dispatchBtn');
    btn.disabled = true;
    try {
      const res = await api('/api/runs', { method: 'POST', body: { task, agent_ids: ids, routing } });
      ta.value = ''; store.set('draft', '');
      toast(`Mission dispatched to ${res.count} agent${res.count > 1 ? 's' : ''}`);
      await refresh();
      current?.update?.();
      startFastPoll();
    } catch (e) { toast(e.message, 'bad'); }
    finally { btn.disabled = false; }
  }

  views.missions = {
    title: 'Missions',
    render() {
      return `<div class="page">
        <div class="page-head"><div><div class="eyebrow">History</div><h1>Missions</h1><p>Every mission your crew has run, newest first.</p></div>
          <div class="actions"><div class="seg" id="mFilter">${['all', 'running', 'completed', 'partial', 'failed'].map(f => `<button data-f="${f}" class="${f === (this.f || 'all') ? 'on' : ''}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
          <input class="input" id="mSearch" placeholder="Filter by text…" style="width:220px;height:34px" value="${esc(this.q || '')}"></div></div>
        <section class="card panel" id="mList">${this.list()}</section></div>`;
    },
    list() {
      let ms = missionsFrom(S.runs);
      if (this.f && this.f !== 'all') ms = ms.filter(m => m.status === this.f);
      if (this.q) { const q = this.q.toLowerCase(); ms = ms.filter(m => m.task.toLowerCase().includes(q) || m.runs.some(r => r.agent_name.toLowerCase().includes(q))); }
      return ms.length ? `<div class="m-list">${ms.map(missionRow).join('')}</div>` : emptyState('clock', 'No missions match', 'Try another filter, or dispatch a new mission.', '<a class="btn primary sm" href="#/">New mission</a>');
    },
    mount(el) {
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-f]');
        if (b) { this.f = b.dataset.f; $$('[data-f]', el).forEach(x => x.classList.toggle('on', x === b)); this.update(true); }
      });
      $('#mSearch', el).addEventListener('input', e => { this.q = e.target.value; this.update(true); });
    },
    update() { const el = $('#mList'); const h = this.list(); if (el && el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } },
  };

  views.mission = {
    title: 'Mission',
    tab: 'timeline',
    async load(id) { this.id = id; this.runs = await api('/api/missions/' + encodeURIComponent(id)).catch(() => null); },
    render() {
      if (!this.runs) return `<div class="page">${emptyState('page', 'Mission not found', 'It may have been deleted.', '<a class="btn sm" href="#/missions">Back to missions</a>')}</div>`;
      const m = missionsFrom(this.runs)[0];
      this.m = m;
      return `<div class="page">
        <div class="page-head" style="margin-bottom:14px"><a class="btn ghost sm" href="#/missions">← All missions</a>
          <div class="actions">
            <button class="btn sm" data-act="copy">Copy result</button>
            <button class="btn sm" data-act="md">Export .md</button>
            <button class="btn sm" data-act="print">Print / PDF</button>
            <button class="btn sm primary" data-act="replay">↻ Replay</button>
            <button class="btn sm danger" data-act="delete">Delete</button>
          </div></div>
        <section class="card detail-head" id="mdHead">${this.head(m)}</section>
        <section class="card panel" style="margin-bottom:20px"><div class="panel-head"><h2>Pipeline</h2><span class="sub">${m.crew ? 'Each step received every earlier step’s output' : 'Steps ran independently in parallel'}</span></div><div id="mdPipe">${pipeline(m)}</div></section>
        <div class="tabs">${[['timeline', 'Timeline'], ['compare', 'Side by side'], ['final', 'Final answer']].map(([k, l]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div id="mdBody">${this.body(m)}</div></div>`;
    },
    head(m) {
      return `<div class="detail-meta">${statusBadge(m.status)}<span class="pill ${m.crew ? 'accent' : 'info'}">${m.crew ? 'Crew handoff' : esc(m.routing)}</span><span class="pill">${m.runs.length} agent${m.runs.length > 1 ? 's' : ''}</span><span class="pill">${new Date(m.created).toLocaleString()}</span>${m.finished ? `<span class="pill mono">⏱ ${dur(m.created, m.finished)}</span>` : ''}<span class="pill mono">#${esc(m.id)}</span></div><h1>${esc(m.task)}</h1>`;
    },
    output(r) {
      if (r.status === 'failed') return `<div class="error-box">${esc(r.error)}</div>`;
      if (r.status !== 'completed') return `<div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:95%"></div><div class="skeleton" style="width:60%"></div>`;
      return `<div class="md">${md(r.result)}</div>`;
    },
    stepCard(r) {
      const a = agentById(r.agent_id) || { id: r.agent_id, name: r.agent_name };
      return `<article class="card t-body" id="run-${r.id}"><header><b>${esc(r.agent_name)}</b><span class="pill">${esc(a.role || 'Agent')}</span><span class="pill mono">${esc(PROVIDER_LABEL[r.provider] || r.provider || '')} · ${esc(r.model)}</span><span class="grow"></span>${statusBadge(r.status)}<span class="mono" style="color:var(--muted);font-size:12px">${esc(dur(r.started_at, r.finished_at))}</span>${r.status === 'completed' ? `<button class="btn ghost sm" data-copy="${r.id}">Copy</button>` : ''}</header>${this.output(r)}</article>`;
    },
    final(m) {
      const done = m.runs.filter(r => r.status === 'completed');
      if (!done.length) return m.status === 'running' ? null : '';
      return m.crew ? [done[done.length - 1]] : done;
    },
    body(m) {
      if (this.tab === 'compare') return `<div class="compare">${m.runs.map(r => this.stepCard(r)).join('')}</div>`;
      if (this.tab === 'final') {
        const f = this.final(m);
        if (f === null) return `<section class="card final">${emptyState('spark', 'Still cooking…', 'The final answer will appear when the crew finishes.')}</section>`;
        if (!f.length) return `<section class="card final">${emptyState('page', 'No successful output', 'Every step failed. Check the Timeline tab for errors, then replay.')}</section>`;
        return f.map(r => `<section class="card final" style="margin-bottom:16px"><div class="eyebrow" style="margin-bottom:12px">${m.crew ? 'Final answer · ' : ''}${esc(r.agent_name)}</div><div class="md">${md(r.result)}</div></section>`).join('');
      }
      return `<div class="timeline">${m.runs.map(r => {
        const a = agentById(r.agent_id) || { id: r.agent_id, name: r.agent_name };
        return `<div class="t-item">${avatar(a, 'lg')}${this.stepCard(r)}</div>`;
      }).join('')}</div>`;
    },
    markdown() {
      const m = this.m;
      return `# ${m.task}\n\n- Mission: ${m.id}\n- Strategy: ${m.crew ? 'Crew handoff' : m.routing}\n- Status: ${m.status}\n- Created: ${new Date(m.created).toLocaleString()}\n\n` +
        m.runs.map((r, i) => `## Step ${i + 1} — ${r.agent_name} (${r.model})\n\n${r.status === 'completed' ? r.result : `_${r.status}${r.error ? ': ' + r.error : ''}_`}\n`).join('\n');
    },
    mount(el) {
      el.addEventListener('click', async e => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { this.tab = tab.dataset.tab; $$('[data-tab]', el).forEach(b => b.classList.toggle('on', b === tab)); $('#mdBody').innerHTML = this.body(this.m); return; }
        const node = e.target.closest('.p-node[data-run]');
        if (node) {
          if (this.tab === 'final') { this.tab = 'timeline'; $$('[data-tab]', el).forEach(b => b.classList.toggle('on', b.dataset.tab === 'timeline')); $('#mdBody').innerHTML = this.body(this.m); }
          $('#run-' + node.dataset.run)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        const c = e.target.closest('[data-copy]');
        if (c) { const r = this.m.runs.find(x => x.id === +c.dataset.copy); await navigator.clipboard.writeText(r.result || ''); toast('Copied to clipboard'); return; }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'copy') {
          const f = this.final(this.m) || [];
          if (!f.length) return toast('No finished output to copy yet', 'bad');
          await navigator.clipboard.writeText(f.map(r => r.result).join('\n\n---\n\n')); toast('Final answer copied');
        }
        if (act === 'md') download(`agentos-mission-${this.m.id}.md`, this.markdown());
        if (act === 'print') window.print();
        if (act === 'replay') {
          try {
            const res = await api('/api/runs', { method: 'POST', body: { task: this.m.task, agent_ids: this.m.runs.map(r => r.agent_id), routing: this.m.routing } });
            toast('Mission replayed'); await refresh(); startFastPoll(); location.hash = '#/mission/' + res.mission_id;
          } catch (err) { toast(err.message, 'bad'); }
        }
        if (act === 'delete') {
          if (this.m.status === 'running') return toast('Wait for the mission to finish before deleting it', 'bad');
          const ok = await confirmModal('Delete this mission?', 'Its agent outputs will be permanently removed from workspace memory.', 'Delete mission');
          if (!ok) return;
          if (this.m.id.startsWith('run-')) return toast('Legacy runs without a mission id cannot be deleted here', 'bad');
          try { await api('/api/missions/' + this.m.id, { method: 'DELETE' }); toast('Mission deleted'); await refresh(); location.hash = '#/missions'; }
          catch (err) { toast(err.message, 'bad'); }
        }
      });
    },
    async update() {
      if (!this.m || this.m.status !== 'running') return;
      await this.load(this.id);
      if (!this.runs) return;
      const m = missionsFrom(this.runs)[0];
      this.m = m;
      $('#mdHead').innerHTML = this.head(m);
      $('#mdPipe').innerHTML = pipeline(m);
      const y = window.scrollY;
      $('#mdBody').innerHTML = this.body(m);
      window.scrollTo(0, y);
    },
  };

  views.agents = {
    title: 'Agents',
    render() {
      return `<div class="page">
        <div class="page-head"><div><div class="eyebrow">Crew</div><h1>Agents</h1><p>Each agent has a role, a model, and a system instruction. Mix local and cloud agents in one crew.</p></div>
          <div class="actions"><button class="btn primary" data-act="new-agent">+ New agent</button></div></div>
        <div class="agent-grid" id="agentGrid">${this.grid()}</div></div>`;
    },
    grid() {
      return S.agents.map(a => `<article class="card agent-card">
        <div class="head">${avatar(a, 'lg')}<div><b>${esc(a.name)}</b><small>${esc(a.role)}</small></div><span style="margin-left:auto">${a.status === 'running' ? '<span class="pill info"><span class="dot live"></span>Working</span>' : '<span class="pill ok">Ready</span>'}</span></div>
        <div class="prompt">${esc(a.system_prompt)}</div>
        <div class="tags"><span class="pill ${a.provider === 'demo' ? 'warn' : a.provider === 'ollama' ? 'ok' : 'accent'}">${esc(PROVIDER_LABEL[a.provider] || a.provider)}</span><span class="pill mono">${esc(a.model)}</span></div>
        <div class="foot"><button class="btn sm" data-run-agent="${a.id}">Run solo</button><button class="btn sm" data-edit="${a.id}">Edit</button><button class="btn sm danger" data-del="${a.id}">Delete</button></div>
      </article>`).join('') + `<button class="card agent-card new" data-act="new-agent"><div><div class="plus">+</div><b>Add an agent</b><div style="font-size:13px">Start from a role preset</div></div></button>`;
    },
    mount(el) {
      el.addEventListener('click', async e => {
        if (e.target.closest('[data-act="new-agent"]')) return agentModal();
        const ed = e.target.closest('[data-edit]');
        if (ed) return agentModal(agentById(+ed.dataset.edit));
        const run = e.target.closest('[data-run-agent]');
        if (run) { store.set('picked', [+run.dataset.runAgent]); location.hash = '#/'; return; }
        const del = e.target.closest('[data-del]');
        if (del) {
          const a = agentById(+del.dataset.del);
          if (!await confirmModal(`Delete ${a.name}?`, 'Past missions keep their output, but this agent will no longer be available.', 'Delete agent')) return;
          try { await api('/api/agents/' + a.id, { method: 'DELETE' }); toast(`${a.name} deleted`); await refresh(); this.update(); }
          catch (err) { toast(err.message, 'bad'); }
        }
      });
    },
    update() { const el = $('#agentGrid'); const h = this.grid(); if (el && el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } },
  };

  const PRESETS = [
    { name: 'Scout', role: 'Researcher', prompt: 'Find reliable evidence. Cite uncertainties and sources.' },
    { name: 'Miller', role: 'Analyst', prompt: 'Synthesize evidence into clear reasoning, risks, and a recommendation.' },
    { name: 'Juniper', role: 'Writer', prompt: 'Write clear, useful drafts based only on supplied work.' },
    { name: 'Clover', role: 'Reviewer', prompt: 'Critique accuracy, gaps, and next steps. Be specific and constructive.' },
    { name: 'Atlas', role: 'Planner', prompt: 'Break the mission into concrete, ordered steps with owners and deadlines.' },
    { name: 'Byte', role: 'Engineer', prompt: 'Propose working code and technical designs. Explain trade-offs briefly.' },
  ];

  async function agentModal(agent) {
    const models = (await api('/api/models').catch(() => null))?.models || [];
    const a = agent || { name: '', role: '', provider: S.health?.ollama || !S.agents.some(x => x.provider === 'demo') ? 'ollama' : 'demo', model: '', system_prompt: '' };
    openModal(`<h2>${agent ? 'Edit ' + esc(agent.name) : 'New agent'}</h2><p>${agent ? 'Changes apply to the next mission.' : 'Pick a preset or define your own specialist.'}</p>
      <form id="agentForm">
        ${agent ? '' : `<div class="presets">${PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(p.role)}</button>`).join('')}</div>`}
        <div class="row2"><label class="field"><span>Name</span><input class="input" name="name" required maxlength="60" value="${esc(a.name)}"></label>
        <label class="field"><span>Role</span><input class="input" name="role" required maxlength="60" value="${esc(a.role)}"></label></div>
        <div class="row2"><label class="field"><span>Provider</span><select class="select" name="provider">${Object.entries(PROVIDER_LABEL).map(([k, l]) => `<option value="${k}" ${k === a.provider ? 'selected' : ''}>${l}${k === 'demo' ? ' (simulated)' : ''}</option>`).join('')}</select></label>
        <label class="field"><span>Model</span><input class="input mono" name="model" required list="modelList" value="${esc(a.model || DEFAULT_MODELS[a.provider])}"><datalist id="modelList">${models.map(m => `<option value="${esc(m)}">`).join('')}</datalist></label></div>
        <label class="field"><span>System instruction</span><textarea class="textarea" name="system_prompt" rows="4" required maxlength="4000">${esc(a.system_prompt)}</textarea><small>How this agent should think and what it should return.</small></label>
        <div class="actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${agent ? 'Save changes' : 'Create agent'}</button></div>
      </form>`);
    const f = $('#agentForm');
    f.provider.addEventListener('change', () => { f.model.value = f.provider.value === 'ollama' ? (models[0] || DEFAULT_MODELS.ollama) : DEFAULT_MODELS[f.provider.value]; });
    f.addEventListener('click', e => {
      const p = e.target.closest('[data-preset]');
      if (!p) return;
      const pr = PRESETS[+p.dataset.preset];
      const taken = new Set(S.agents.map(x => x.name));
      f.name.value = taken.has(pr.name) ? pr.name + ' ' + (S.agents.length + 1) : pr.name;
      f.role.value = pr.role; f.system_prompt.value = pr.prompt;
      $$('[data-preset]', f).forEach(x => x.classList.toggle('on', x === p));
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      try {
        await api(agent ? '/api/agents/' + agent.id : '/api/agents', { method: agent ? 'PATCH' : 'POST', body });
        closeModal(); toast(agent ? 'Agent updated' : `${body.name} joined the crew`);
        if (!agent) { const res = await api('/api/agents'); const n = res[res.length - 1]; if (n) store.set('picked', [...store.get('picked', []), n.id]); }
        await refresh(); current?.update?.();
      } catch (err) { toast(err.message, 'bad'); }
    });
    setTimeout(() => (agent ? f.name : f.querySelector('[data-preset]'))?.focus(), 30);
  }

  views.models = {
    title: 'Models & Keys',
    async load() { S.models = await api('/api/models').catch(() => null); },
    render() {
      const m = S.models || { ollama: false, models: [], providers: {} };
      const demoCount = S.agents.filter(a => a.provider === 'demo').length;
      const ollamaCount = S.agents.filter(a => a.provider === 'ollama').length;
      const cloud = [
        ['openai', 'OpenAI', 'OA', 'General reasoning and tool orchestration.'],
        ['anthropic', 'Anthropic', 'AN', 'Long-form analysis and careful writing.'],
        ['gemini', 'Gemini', 'GE', 'Fast multimodal cloud tasks.'],
      ];
      return `<div class="page">
        <div class="page-head"><div><div class="eyebrow">Configure</div><h1>Models &amp; keys</h1><p>Run locally on Ollama, add cloud keys, or use the labelled demo provider when presenting offline.</p></div>
          <div class="actions"><button class="btn" data-act="refresh-models">↻ Refresh</button></div></div>
        <div class="grid-2">
          <section class="card panel">
            <div class="panel-head"><h2>${icon('chip').replace('<svg', '<svg width="16" height="16"')} Ollama · local models</h2>${m.ollama ? '<span class="pill ok"><span class="dot ok"></span>Online</span>' : '<span class="pill bad"><span class="dot bad"></span>Offline</span>'}</div>
            ${m.ollama ? (m.models.length ? `<div class="model-list">${m.models.map(x => `<div class="model-item"><span class="dot ok"></span><span class="mono grow">${esc(x)}</span><button class="btn sm" data-use-model="${esc(x)}">Use for all Ollama agents</button></div>`).join('')}</div>`
              : emptyState('chip', 'No models pulled', 'Pull one with <code class="mono">ollama pull qwen3.5:4b</code>'))
              : `<div class="md"><p>AgentOS could not reach Ollama at <code>127.0.0.1:11434</code>.</p><ol><li>Install Ollama from <a href="https://ollama.com" target="_blank" rel="noopener">ollama.com</a></li><li>Run <code>ollama serve</code></li><li>Pull a model: <code>ollama pull qwen3.5:4b</code></li><li>Hit <b>Refresh</b></li></ol></div>`}
          </section>
          <section class="card panel">
            <div class="panel-head"><h2>${icon('spark').replace('<svg', '<svg width="16" height="16"')} Demo mode</h2>${demoCount ? `<span class="pill warn">${demoCount} agent${demoCount > 1 ? 's' : ''} simulated</span>` : '<span class="pill">Off</span>'}</div>
            <p style="color:var(--text-2);margin:0 0 16px">No Ollama and no API key on stage? The demo provider returns clearly labelled, simulated output so you can still show the full crew flow, pipeline, and exports.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn ${demoCount ? '' : 'primary'}" data-act="demo-on" ${ollamaCount ? '' : 'disabled'}>Switch Ollama agents → Demo</button>
              <button class="btn" data-act="demo-off" ${demoCount ? '' : 'disabled'}>Switch Demo agents → Ollama</button>
            </div>
          </section>
        </div>
        <div class="panel-head" style="margin:28px 0 14px"><h2>Cloud providers</h2><span class="sub">Keys stay in server memory only — never written to disk or returned.</span></div>
        <div class="provider-grid">${cloud.map(([k, name, ab, desc]) => `<section class="card provider">
          <div class="head"><div class="logo-box">${ab}</div><div><b>${name}</b><small>${m.providers?.[k] ? 'Key configured' : 'Not configured'}</small></div><span style="margin-left:auto">${m.providers?.[k] ? '<span class="pill ok"><span class="dot ok"></span>Ready</span>' : '<span class="pill">Optional</span>'}</span></div>
          <p>${desc}</p>
          <form class="key-row" data-key="${k}"><input class="input" type="password" name="key" placeholder="${m.providers?.[k] ? '•••••••• replace key' : 'Paste API key'}" autocomplete="off"><button class="btn">Save</button></form>
        </section>`).join('')}</div></div>`;
    },
    mount(el) {
      el.addEventListener('click', async e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'refresh-models') { await this.load(); await refresh(); route(); toast('Model list refreshed'); }
        if (act === 'demo-off') await setAllProviders('ollama');
        const use = e.target.closest('[data-use-model]');
        if (use) {
          const targets = S.agents.filter(a => a.provider === 'ollama');
          await Promise.all(targets.map(a => api('/api/agents/' + a.id, { method: 'PATCH', body: { model: use.dataset.useModel } })));
          await refresh(); toast(`${targets.length} agents now use ${use.dataset.useModel}`);
        }
      });
      el.addEventListener('submit', async e => {
        const f = e.target.closest('[data-key]');
        if (!f) return;
        e.preventDefault();
        try { await api('/api/credentials', { method: 'POST', body: { provider: f.dataset.key, key: f.key.value } }); f.reset(); toast('Key saved for this server session'); await this.load(); await refresh(); route(); }
        catch (err) { toast(err.message, 'bad'); }
      });
    },
  };

  const CONNECTORS = [
    { id: 'slack', name: 'Slack', scopes: ['read', 'draft', 'post'] },
    { id: 'gmail', name: 'Gmail', scopes: ['read', 'draft', 'send'] },
    { id: 'github', name: 'GitHub', scopes: ['read', 'comment', 'write'] },
    { id: 'notion', name: 'Notion', scopes: ['read', 'draft', 'write'] },
    { id: 'calcom', name: 'Cal.com', scopes: ['read', 'hold', 'book'] },
  ];
  views.integrations = {
    title: 'Integrations',
    async load() { this.servers = await api('/api/mcp/servers').catch(() => []); },
    render() {
      const scopes = store.get('scopes', {});
      return `<div class="page">
        <div class="page-head"><div><div class="eyebrow">Configure</div><h1>Integrations</h1><p>Connect MCP servers and decide what each connector is allowed to do.</p></div></div>
        <div class="grid-2">
          <section class="card panel"><div class="panel-head"><h2>${icon('plug').replace('<svg', '<svg width="16" height="16"')} MCP servers</h2><span class="sub">${this.servers.length} connected</span></div>
            <div class="mcp-list">${this.servers.length ? this.servers.map(s => `<div class="model-item"><span class="dot ${s.connected ? 'ok' : 'bad'}"></span><div class="grow"><b>${esc(s.name)}</b><div class="mono" style="font-size:12px;color:var(--muted)">${esc(s.url)}</div></div><span class="pill ${s.connected ? 'ok' : 'bad'}">${s.connected ? 'Handshake OK' : 'Failed'}</span></div>`).join('')
              : emptyState('plug', 'No MCP servers yet', 'Add a streamable-HTTP MCP endpoint below. AgentOS runs an initialize handshake to verify it.')}</div>
          </section>
          <section class="card panel"><div class="panel-head"><h2>Connect a server</h2></div>
            <form id="mcpForm" style="display:grid;gap:12px">
              <div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><label class="field"><span>ID</span><input class="input" name="id" placeholder="github" required></label><label class="field"><span>Display name</span><input class="input" name="name" placeholder="GitHub"></label></div>
              <label class="field"><span>Endpoint URL</span><input class="input mono" name="url" placeholder="https://example.com/mcp" required></label>
              <label class="field"><span>Bearer token <small>(optional, kept in memory)</small></span><input class="input" type="password" name="token" autocomplete="off"></label>
              <button class="btn primary">Connect &amp; verify</button>
            </form></section>
        </div>
        <div class="panel-head" style="margin:28px 0 14px"><h2>Approval policy</h2><span class="sub">Anything beyond <b>read</b> pauses for human approval. Saved in this browser.</span></div>
        <div class="scope-grid">${CONNECTORS.map(c => `<div class="scope"><b><span class="dot ${scopes[c.id]?.length ? 'ok' : ''}"></span>${c.name}</b><div class="perm">${c.scopes.map((s, i) => `<button class="chip ${scopes[c.id]?.includes(s) ? 'on' : ''}" data-scope="${c.id}:${s}">${i === 2 ? '⚠ ' : ''}${s}</button>`).join('')}</div><small style="color:var(--muted)">${c.scopes[2]} actions always require approval</small></div>`).join('')}</div></div>`;
    },
    mount(el) {
      el.addEventListener('click', e => {
        const sc = e.target.closest('[data-scope]');
        if (!sc) return;
        const [id, s] = sc.dataset.scope.split(':');
        const scopes = store.get('scopes', {});
        const set = new Set(scopes[id] || []);
        set.has(s) ? set.delete(s) : set.add(s);
        scopes[id] = [...set]; store.set('scopes', scopes);
        sc.classList.toggle('on');
        sc.closest('.scope').querySelector('.dot').className = 'dot ' + (set.size ? 'ok' : '');
      });
      $('#mcpForm', el).addEventListener('submit', async e => {
        e.preventDefault();
        const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Connecting…';
        try { await api('/api/mcp/servers', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('MCP server connected'); }
        catch (err) { toast(err.message, 'bad'); }
        await this.load(); route();
      });
    },
  };

  views.guide = {
    title: 'Guide & API',
    render() {
      const api = [['GET', '/api/health', 'Server + Ollama status'], ['GET', '/api/stats', 'Workspace totals'], ['GET', '/api/agents', 'List agents'], ['POST', '/api/agents', 'Create an agent'],
        ['PATCH', '/api/agents/{id}', 'Update an agent'], ['DELETE', '/api/agents/{id}', 'Delete an agent'], ['POST', '/api/runs', '{task, agent_ids, routing}'], ['GET', '/api/runs?limit=', 'Latest runs'],
        ['GET', '/api/missions/{id}', 'Every step of one mission'], ['DELETE', '/api/missions/{id}', 'Delete a finished mission'], ['GET', '/api/search?q=', 'Search workspace memory'], ['GET', '/api/models', 'Local models + key status']];
      return `<div class="page">
        <div class="page-head"><div><div class="eyebrow">Guide</div><h1>Run your first mission in 60 seconds</h1><p>Everything you need to demo AgentOS — and the API behind it.</p></div><div class="actions"><a class="btn primary" href="#/">Start a mission →</a></div></div>
        <div class="guide-grid" style="margin-bottom:20px">
          <article class="card guide-step"><div class="n">01 · DESCRIBE</div><h3>Write the outcome</h3><p>Say what “done” looks like, or click a template chip in Mission Control.</p></article>
          <article class="card guide-step"><div class="n">02 · ASSEMBLE</div><h3>Pick crew &amp; strategy</h3><p>Toggle agents on, then choose Parallel, Crew handoff, or Local only.</p></article>
          <article class="card guide-step"><div class="n">03 · SHIP</div><h3>Watch, compare, export</h3><p>Follow the live pipeline, open the mission, compare steps side-by-side, then export or replay.</p></article>
        </div>
        <div class="grid-2">
          <section class="card panel"><div class="panel-head"><h2>Strategies</h2></div><div class="md">
            <h3>Parallel (Balanced)</h3><p>${STRATEGIES['Balanced']}</p>
            <h3>Crew handoff</h3><p>${STRATEGIES['Crew handoff']} Earlier output is passed as <em>input, not instructions</em>, so one agent can’t hijack the next.</p>
            <h3>Local only</h3><p>${STRATEGIES['Local only']} Ollama and demo agents are allowed; OpenAI, Anthropic and Gemini agents are blocked.</p>
            <h3>Demo provider</h3><p>For stages without Ollama or keys. Output is simulated and labelled as such in every answer. Toggle it in <a href="#/models">Models &amp; Keys</a>.</p></div></section>
          <section class="card panel"><div class="panel-head"><h2>Keyboard shortcuts</h2></div><div class="kbd-list">
            <div><span>Command palette &amp; search</span><span><kbd>Ctrl</kbd> <kbd>K</kbd></span></div>
            <div><span>Dispatch mission</span><span><kbd>Ctrl</kbd> <kbd>Enter</kbd></span></div>
            <div><span>New mission</span><span><kbd>N</kbd></span></div>
            <div><span>Toggle theme</span><span><kbd>T</kbd></span></div>
            <div><span>Close dialog</span><span><kbd>Esc</kbd></span></div></div>
            <div class="panel-head" style="margin-top:22px"><h2>Pitch flow (2 min)</h2></div>
            <div class="md"><ol><li>Open the landing page — the problem in one line.</li><li>Mission Control → pick <b>🚀 Launch brief</b>, all 4 agents, <b>Crew handoff</b>.</li><li>Dispatch — narrate the live pipeline.</li><li>Open the mission → <b>Side by side</b> → <b>Final answer</b>.</li><li>Export .md, then show <b>Ctrl K</b> search across memory.</li></ol></div></section>
        </div>
        <section class="card panel" style="margin-top:20px"><div class="panel-head"><h2>REST API</h2><span class="sub">Served by <code class="mono">server.py</code> — standard library only</span></div>
          <table class="api-table">${api.map(([m, p, d]) => `<tr><td class="m-${m.toLowerCase()}">${m}</td><td>${esc(p)}</td><td>${esc(d)}</td></tr>`).join('')}</table></section></div>`;
    },
  };

  // ------------------------------------------------------------------ modal
  let modalResolve = null;
  function openModal(html) { $('#modal').innerHTML = html; $('#overlay').classList.add('open'); }
  function closeModal() { $('#overlay').classList.remove('open'); if (modalResolve) { modalResolve(false); modalResolve = null; } }
  function confirmModal(title, text, label) {
    openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="actions"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="confirmOk">${esc(label)}</button></div>`);
    setTimeout(() => $('#confirmOk')?.focus(), 30);
    return new Promise(res => {
      modalResolve = res;
      $('#confirmOk').onclick = () => { modalResolve = null; $('#overlay').classList.remove('open'); res(true); };
    });
  }
  $('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay' || e.target.closest('[data-close]')) closeModal(); });

  // ------------------------------------------------------------------ command palette
  const PAGES = [
    ['Mission Control', '#/', 'grid'], ['Missions', '#/missions', 'clock'], ['Agents', '#/agents', 'users'],
    ['Models & Keys', '#/models', 'chip'], ['Integrations', '#/integrations', 'plug'], ['Guide & API', '#/guide', 'book'], ['Landing page', '/', 'page'],
  ];
  let palItems = [], palSel = 0, palTimer = 0;
  function openPalette() { $('#paletteOverlay').classList.add('open'); const i = $('#paletteInput'); i.value = ''; renderPalette([]); setTimeout(() => i.focus(), 20); }
  function closePalette() { $('#paletteOverlay').classList.remove('open'); }
  function renderPalette(results) {
    const q = $('#paletteInput').value.trim().toLowerCase();
    const pages = PAGES.filter(p => !q || p[0].toLowerCase().includes(q)).map(p => ({ group: 'PAGES', title: p[0], href: p[1], ic: p[2] }));
    const agents = S.agents.filter(a => q && (a.name + ' ' + a.role).toLowerCase().includes(q)).map(a => ({ group: 'AGENTS', title: a.name, sub: a.role + ' · ' + a.model, href: '#/agents', ic: 'users' }));
    const seen = new Set();
    const hits = results.filter(r => { const k = r.mission_id || r.id; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(r => ({ group: 'WORKSPACE MEMORY', title: r.task || r.agent_name, sub: `${r.agent_name} · ${(r.result || r.error || '').replace(/[#*_>`|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 90)}`, href: '#/mission/' + (r.mission_id || 'run-' + r.id), ic: 'search' }));
    const actions = !q || 'new mission dispatch'.includes(q) ? [{ group: 'ACTIONS', title: 'New mission', sub: 'Open the composer', href: '#/', ic: 'bolt' }] : [];
    if (!q || 'toggle theme dark light'.includes(q)) actions.push({ group: 'ACTIONS', title: 'Toggle theme', sub: 'Switch light / dark', run: toggleTheme, ic: 'spark' });
    palItems = [...hits, ...actions, ...pages, ...agents];
    palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
    let last = '';
    $('#paletteList').innerHTML = palItems.length ? palItems.map((it, i) => {
      const head = it.group !== last ? `<div class="palette-group">${it.group}</div>` : ''; last = it.group;
      return `${head}<button class="palette-item ${i === palSel ? 'sel' : ''}" data-i="${i}">${icon(it.ic)}<span class="t"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`;
    }).join('') : `<div class="empty" style="padding:24px">No results for “${esc(q)}”</div>`;
  }
  function choosePalette(i) {
    const it = palItems[i]; if (!it) return;
    closePalette();
    if (it.run) it.run(); else if (it.href.startsWith('#')) location.hash = it.href; else location.href = it.href;
  }
  $('#paletteInput').addEventListener('input', e => {
    palSel = 0; renderPalette([]);
    clearTimeout(palTimer);
    const q = e.target.value.trim();
    if (q.length > 1) palTimer = setTimeout(async () => renderPalette(await api('/api/search?q=' + encodeURIComponent(q)).catch(() => [])), 160);
  });
  $('#paletteInput').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      palSel = (palSel + (e.key === 'ArrowDown' ? 1 : -1) + palItems.length) % Math.max(1, palItems.length);
      $$('.palette-item').forEach(b => b.classList.toggle('sel', +b.dataset.i === palSel));
      $(`.palette-item[data-i="${palSel}"]`)?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') { e.preventDefault(); choosePalette(palSel); }
  });
  $('#paletteList').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choosePalette(+b.dataset.i); });
  $('#paletteOverlay').addEventListener('click', e => { if (e.target.id === 'paletteOverlay') closePalette(); });
  $('#searchBtn').addEventListener('click', openPalette);

  // ------------------------------------------------------------------ chrome + keys
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('agentos-theme', next); } catch { /* ignore */ }
  }
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#newMissionBtn').addEventListener('click', () => setTimeout(() => $('#task')?.focus(), 60));
  document.addEventListener('click', e => {
    if (e.target.closest('[data-act="demo-on"]')) setAllProviders('demo');
    if (e.target.closest('.p-node[data-mission]') && current !== views.mission) location.hash = '#/mission/' + e.target.closest('.p-node').dataset.mission;
    if (e.target.closest('.nav-item')) $('#sidebar').classList.remove('open');
  });
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#paletteOverlay').classList.contains('open') ? closePalette() : openPalette(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement?.id === 'task') { e.preventDefault(); dispatch(); }
    else if (e.key === 'Escape') { closePalette(); closeModal(); }
    else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'n') { e.preventDefault(); location.hash = '#/'; setTimeout(() => $('#task')?.focus(), 60); }
      if (e.key === 't') toggleTheme();
    }
  });

  // ------------------------------------------------------------------ router
  async function route() {
    const hash = location.hash.replace(/^#/, '') || (location.pathname.startsWith('/guide') || location.pathname.startsWith('/readme') ? '/guide' : '/');
    const [, name = '', arg] = hash.split('/');
    const key = { '': 'dashboard', missions: 'missions', mission: 'mission', agents: 'agents', models: 'models', integrations: 'integrations', guide: 'guide' }[name] || 'dashboard';
    const v = views[key];
    if (!S.loaded) await refresh();
    if (v.load) await v.load(arg ? decodeURIComponent(arg) : undefined);
    current = v;
    const nav = key === 'mission' ? 'missions' : key;
    $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
    $('#crumbs').innerHTML = `<span>AgentOS</span><span>/</span><b>${esc(key === 'mission' ? 'Mission' : v.title)}</b>`;
    document.title = `${v.title} · AgentOS`;
    const view = $('#view');
    view.innerHTML = v.render();
    v.mount?.(view.firstElementChild || view);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { closePalette(); closeModal(); route(); });

  // Poll quickly while anything is running, slowly otherwise.
  let pollTimer = 0;
  function schedule(ms) { clearTimeout(pollTimer); pollTimer = setTimeout(tick, ms); }
  function startFastPoll() { schedule(800); }
  async function tick() {
    await refresh();
    try { await current?.update?.(); } catch { /* keep polling */ }
    const live = S.runs.some(r => r.status === 'running' || r.status === 'queued');
    schedule(live ? 1200 : 5000);
  }

  route().then(() => schedule(1500));
})();
