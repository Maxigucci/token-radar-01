/* Token Radar dashboard. Everything here reads window.RADAR, written next to this folder at build
   time. There is no fetch, no socket and no external script: the page works from a file:// URL. */
'use strict';
(function () {
  const data = window.RADAR;
  const byId = (id) => document.getElementById(id);
  if (!data || !Array.isArray(data.rows)) {
    document.body.innerHTML = '<p style="padding:40px;font:16px system-ui;color:#e9f5ef">data.js did not load. Rebuild the entry with main.ts.</p>';
    return;
  }

  const rows = data.rows;
  const state = { tab: 'board', q: '', category: 'all', watchOnly: false, sort: 'implied' };
  const watchlist = new Set(rows.filter((r) => r.watchlist).map((r) => r.slug));

  const esc = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function usd(value) {
    if (value == null || !Number.isFinite(value)) return '—';
    const n = Math.abs(value);
    const sign = value < 0 ? '−' : '';
    if (n >= 1e12) return `${sign}$${(n / 1e12).toFixed(n >= 1e13 ? 0 : 1)}T`;
    if (n >= 1e9) return `${sign}$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
    if (n >= 1e6) return `${sign}$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1e3) return `${sign}$${(n / 1e3).toFixed(0)}K`;
    return `${sign}$${Math.round(n)}`;
  }
  function pct(value) {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}%`;
  }
  function age(days) {
    if (days == null) return 'unknown';
    if (days >= 730) return `${(days / 365).toFixed(1)}y`;
    if (days >= 60) return `${Math.round(days / 30)}mo`;
    return `${Math.round(days)}d`;
  }
  const num = (value, digits) =>
    value == null ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits == null ? 0 : digits });

  function categoryClass(category) {
    const c = String(category || '').toLowerCase();
    if (/rwa|real.?world|treasury|private.?credit/.test(c)) return 'rwa';
    if (/lend|borrow|credit|yield|cdp|stable/.test(c)) return 'lend';
    if (/dex|exchange|amm|liquidity|perps|deriv|options/.test(c)) return 'dex';
    if (/bridge|cross.?chain|interop|messag/.test(c)) return 'bridge';
    return '';
  }
  const chip = (category) => `<span class="chip ${categoryClass(category)}">${esc(category || 'Unclassified')}</span>`;

  /* Headline totals */
  byId('as-of').textContent = `${data.as_of} · snapshot`;
  byId('model-version').textContent = data.model_version;
  byId('foot-source').textContent = `Source: ${data.source}. Snapshot dated ${data.as_of}; floor ${usd(data.floor_usd)} TVL.`;
  byId('foot-model').textContent = `Model ${data.model_version} · ${data.model_note}. Base ${(data.model.base_multiple * 100).toFixed(0)}% of TVL, growth ×0.6, maturity 0.55–1.0, +2% per chain to +8%.`;

  byId('stats').innerHTML = [
    [num(data.tracked_size), 'protocols tracked'],
    [num(data.board_size), 'on the board'],
    [num(data.watchlist_size), 'watchlist'],
    [usd(data.covered_tvl_usd), 'TVL covered'],
  ].map(([value, label]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join('');

  /* Three signals, each one row that the current view already earned. They follow the filters so a
     category never shows a global leader beside its own narrower table. */
  function renderSignals(list) {
    byId('signals').hidden = list.length === 0;
    if (!list.length) return;
    const top = [...list].sort((a, b) => b.implied_value_usd - a.implied_value_usd)[0];
    const fastest = [...list].filter((r) => r.change_7d != null).sort((a, b) => b.change_7d - a.change_7d)[0];
    const oldest = [...list].filter((r) => r.age_days != null).sort((a, b) => b.age_days - a.age_days)[0];
    const signals = [
      ['Highest implied launch', top, `${usd(top.implied_value_usd)} implied · ${num(top.implied_multiple, 1)}× TVL`],
      ['Fastest seven-day growth', fastest, fastest ? `${pct(fastest.change_7d)} in a week · ${usd(fastest.tvl_usd)} TVL` : ''],
      ['Longest wait for a token', oldest, oldest ? `${age(oldest.age_days)} without one · ${usd(oldest.tvl_usd)} TVL` : ''],
    ];
    byId('signals').innerHTML = signals
      .filter((s) => s[1])
      .map(([label, row, value]) => `<button type="button" class="signal" data-open="${esc(row.slug)}"><span class="k">${esc(label)}</span><span class="n">${esc(row.name)}</span><span class="v">${value}</span></button>`)
      .join('');
  }

  /* Category filter, by frequency so the long tail stays at the bottom. */
  const counts = new Map();
  for (const row of rows) {
    const key = row.category || 'Unclassified';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const categories = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  byId('category').insertAdjacentHTML(
    'beforeend',
    categories.map(([name, count]) => `<option value="${esc(name)}">${esc(name)} (${count})</option>`).join(''),
  );

  /* Board */
  function visibleRows() {
    const needle = state.q.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (state.watchOnly && !row.watchlist) return false;
      if (state.category !== 'all' && (row.category || 'Unclassified') !== state.category) return false;
      if (!needle) return true;
      return `${row.name} ${row.slug} ${row.category || ''} ${row.chains.join(' ')}`.toLowerCase().includes(needle);
    });
    const by = {
      implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
      tvl: (a, b) => b.tvl_usd - a.tvl_usd,
      growth: (a, b) => (b.change_7d == null ? -Infinity : b.change_7d) - (a.change_7d == null ? -Infinity : a.change_7d),
      age: (a, b) => (b.age_days == null ? -Infinity : b.age_days) - (a.age_days == null ? -Infinity : a.age_days),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(by[state.sort] || by.implied);
  }

  function chainLine(chains) {
    const shown = chains.slice(0, 2);
    return `${shown.join(' / ')}${chains.length > shown.length ? ` +${chains.length - shown.length}` : ''}`;
  }

  function boardMarkup(list) {
    const max = list.length ? Math.max(...list.map((r) => r.implied_value_usd)) : 1;
    return list
      .map((row) => {
        const width = Math.max(4, Math.min(100, (row.implied_value_usd / max) * 100));
        const deltaClass = row.change_7d == null ? '' : row.change_7d >= 0 ? 'up' : 'down';
        return `<tr tabindex="0" data-open="${esc(row.slug)}" aria-label="${esc(row.name)}, rank ${row.rank}, implied value ${usd(row.implied_value_usd)}">
          <td class="c-rank"><span class="rank${row.rank <= 3 ? ' top' : ''}">${row.rank}</span></td>
          <td class="c-name"><span class="name"><b>${esc(row.name)}${row.watchlist ? '<span class="wm" aria-label="On the watchlist">W</span>' : ''}</b><span>${esc(row.slug)}${row.chains.length ? ` · ${esc(chainLine(row.chains))}` : ''}</span></span></td>
          <td class="c-cat">${chip(row.category)}</td>
          <td class="c-num">${usd(row.tvl_usd)}</td>
          <td class="c-num"><span class="delta ${deltaClass}">${pct(row.change_7d)}</span></td>
          <td class="c-num muted">${age(row.age_days)}</td>
          <td class="c-value"><span class="value"><b>${usd(row.implied_value_usd)}</b><span class="bar"><i style="width:${width.toFixed(1)}%"></i></span><span class="visually-hidden">${num(row.implied_multiple, 1)} times TVL</span></span></td>
          <td class="c-open"><svg class="open" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 8h8M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></td>
        </tr>`;
      })
      .join('');
  }

  function render() {
    const list = visibleRows();
    byId('rows').innerHTML = boardMarkup(list);
    byId('empty').hidden = list.length > 0;
    renderSignals(list);
    byId('count').innerHTML = `Showing <b>${num(list.length)}</b> of ${num(rows.length)} pre-token protocols${state.watchOnly ? ' on the watchlist' : ''} · ranks stay global`;
  }

  /* Live set */
  byId('live-rows').innerHTML = data.live
    .map(
      (row) => `<tr>
        <td class="c-name"><span class="name"><b>${esc(row.name)}</b><span>${esc(row.slug)}${row.chains.length ? ` · ${esc(row.chains.join(' / '))}` : ''}</span></span></td>
        <td class="c-cat">${chip(row.category)}</td>
        <td class="c-num">${usd(row.tvl_usd)}</td>
        <td class="c-num">${usd(row.mcap_usd)}</td>
        <td class="c-num">${row.mcap_tvl == null ? '—' : `${num(row.mcap_tvl, 2)}×`}</td>
        <td class="c-num"><span class="delta ${row.change_7d == null ? '' : row.change_7d >= 0 ? 'up' : 'down'}">${pct(row.change_7d)}</span></td>
      </tr>`,
    )
    .join('');

  /* Detail drawer */
  const drawer = byId('detail');
  const scrim = byId('scrim');
  let lastFocus = null;

  function factorRows(row) {
    const f = row.factors;
    return [
      ['Base value', usd(f.base_usd), `${(data.model.base_multiple * 100).toFixed(0)}% of TVL`],
      ['Growth', `×${f.growth_multiplier.toFixed(3)}`, `7d ${pct(row.change_7d)}`],
      ['Maturity', `×${f.maturity_multiplier.toFixed(3)}`, `${age(row.age_days)} without a token`],
      ['Category', `×${f.category_multiplier.toFixed(3)}`, row.category || 'Unclassified'],
      ['Chains', `×${f.chain_multiplier.toFixed(3)}`, `${row.chains.length || 1} chain${row.chains.length === 1 ? '' : 's'}`],
      ['Record quality', `×${f.quality_multiplier.toFixed(3)}`, 'snapshot completeness'],
    ];
  }

  function stepMarkup(step, index) {
    const ci = step.lastIndexOf(' Cost: ');
    const ti = step.lastIndexOf(' Time: ');
    if (ci < 0 || ti < 0) return `<li class="step"><i>${index + 1}</i><p>${esc(step)}</p></li>`;
    const action = step.slice(0, ci);
    const cost = step.slice(ci + 7, ti).replace(/\.$/, '');
    const time = step.slice(ti + 7).replace(/\.$/, '');
    return `<li class="step"><i>${index + 1}</i><p>${esc(action)}<br><b>Cost</b> ${esc(cost)} <span class="dot">·</span> <b>Time</b> ${esc(time)}</p></li>`;
  }

  function open(slug, focus) {
    const row = rows.find((r) => r.slug === slug);
    if (!row) return;
    lastFocus = focus || document.activeElement;
    const recomputed = Math.round(
      row.factors.base_usd *
        row.factors.growth_multiplier *
        row.factors.maturity_multiplier *
        row.factors.category_multiplier *
        row.factors.chain_multiplier *
        row.factors.quality_multiplier,
    );
    const matches = Math.abs(recomputed - row.implied_value_usd) <= Math.max(2, row.implied_value_usd * 1e-6);
    const chips = [chip(row.category), ...row.chains.slice(0, 3).map((c) => `<span class="chip">${esc(c)}</span>`)];
    if (row.chains.length > 3) chips.push(`<span class="chip">+${row.chains.length - 3} chains</span>`);
    if (row.watchlist) chips.unshift('<span class="chip rwa">Watchlist</span>');

    drawer.innerHTML = `
      <div class="d-head">
        <div class="d-kicker"><span>Rank ${row.rank} of ${data.board_size} · pre-token</span><button type="button" class="d-close" data-close aria-label="Close detail">×</button></div>
        <h3 id="detail-title">${esc(row.name)}</h3>
        <div class="d-chips">${chips.join('')}</div>
      </div>
      <div class="d-body">
        <div class="d-val"><div><b>${usd(row.implied_value_usd)}</b><span>implied launch value</span></div><em>${num(row.implied_multiple, 2)}× recorded TVL</em></div>
        <p class="d-why">${esc(row.why)}</p>
        <div class="section"><h4>How the figure is built</h4>
          <div class="factors">${factorRows(row)
            .map(([label, value, note]) => `<div class="factor"><span>${esc(label)}</span><b>${value}</b><i>${esc(note)}</i></div>`)
            .join('')}</div>
          <p class="formula">${usd(row.factors.base_usd)} × ${row.factors.growth_multiplier.toFixed(3)} × ${row.factors.maturity_multiplier.toFixed(3)} × ${row.factors.category_multiplier.toFixed(3)} × ${row.factors.chain_multiplier.toFixed(3)} × ${row.factors.quality_multiplier.toFixed(3)} = <b>${usd(row.implied_value_usd)}</b>${matches ? '' : '<span class="muted"> · rounded factors</span>'}</p>
        </div>
        <div class="section"><h4>Farm plan</h4><ol class="steps">${row.farm_steps.map(stepMarkup).join('')}</ol></div>
        <div class="section"><h4>What to watch</h4><p class="risk">${esc(row.risk)}</p></div>
        <div class="section"><h4>Recorded facts</h4>
          <div class="facts">
            <div class="fact"><span>TVL</span><b>${usd(row.tvl_usd)}</b></div>
            <div class="fact"><span>7-day change</span><b>${pct(row.change_7d)}</b></div>
            <div class="fact"><span>Without a token</span><b>${age(row.age_days)}</b></div>
            <div class="fact"><span>First listed</span><b>${esc(row.listed_at || 'unknown')}</b></div>
          </div>
        </div>
      </div>`;
    drawer.setAttribute('aria-hidden', 'false');
    scrim.hidden = false;
    document.body.style.overflow = 'hidden';
    drawer.scrollTop = 0;
    const close = drawer.querySelector('[data-close]');
    if (close) close.focus();
  }

  function close() {
    if (drawer.getAttribute('aria-hidden') === 'true') return;
    drawer.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    document.body.style.overflow = '';
    if (location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  /* Wiring */
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open]');
    if (opener) {
      open(opener.getAttribute('data-open'), opener);
      return;
    }
    if (event.target.closest('[data-close]') || event.target === scrim) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    const row = event.target.closest('tr[data-open]');
    if (row && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      open(row.getAttribute('data-open'), row);
    }
  });

  byId('q').addEventListener('input', (event) => {
    state.q = event.target.value;
    render();
  });
  byId('category').addEventListener('change', (event) => {
    state.category = event.target.value;
    render();
  });
  byId('sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    render();
  });
  byId('watch-only').addEventListener('change', (event) => {
    state.watchOnly = event.target.checked;
    render();
  });

  function setTab(tab) {
    state.tab = tab;
    const isBoard = tab === 'board';
    byId('tab-board').setAttribute('aria-selected', String(isBoard));
    byId('tab-live').setAttribute('aria-selected', String(!isBoard));
    byId('board-panel').hidden = !isBoard;
    byId('live-panel').hidden = isBoard;
  }
  byId('tab-board').addEventListener('click', () => setTab('board'));
  byId('tab-live').addEventListener('click', () => setTab('live'));

  function readHash() {
    const hash = location.hash.replace(/^#/, '');
    if (hash.startsWith('p=')) {
      open(decodeURIComponent(hash.slice(2)));
    } else if (hash.startsWith('q=')) {
      state.q = decodeURIComponent(hash.slice(2));
      byId('q').value = state.q;
      render();
    } else if (hash.startsWith('category=')) {
      state.category = decodeURIComponent(hash.slice(9));
      byId('category').value = state.category;
      render();
    }
  }
  window.addEventListener('hashchange', readHash);

  render();
  readHash();

  /* A tiny hook the screenshot harness can drive without guessing at the DOM. */
  window.TokenRadar = {
    open: (slug) => open(slug),
    close,
    filter: (category) => {
      state.category = category;
      byId('category').value = category;
      render();
    },
    search: (q) => {
      state.q = q;
      byId('q').value = q;
      render();
    },
    tab: setTab,
  };
})();
