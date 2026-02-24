/**
 * VAULTEX — Investment Portfolio Dashboard
 * script.js  |  Vanilla JS ES6+ Modular Architecture
 */

/* ============================================================
   STATE & CONSTANTS
   ============================================================ */
const STORAGE_KEY  = 'vaultex_portfolio';
const THEME_KEY    = 'vaultex_theme';
const TOAST_DURATION = 3200;

// App state
const state = {
  portfolio:    [],   // Array of investment objects
  filtered:     [],   // Filtered/sorted view
  searchQuery:  '',
  filterType:   'all',
  sortBy:       'date-desc',
  charts:       { allocation: null, pl: null },
};

/* ============================================================
   DOM CACHE  — grab once, reuse everywhere
   ============================================================ */
const DOM = {
  loader:          () => document.getElementById('loader'),
  navbar:          () => document.getElementById('navbar'),
  hamburger:       () => document.getElementById('hamburger'),
  mobileNav:       () => document.getElementById('mobile-nav'),
  themeToggle:     () => document.getElementById('theme-toggle'),
  themeIcon:       () => document.getElementById('theme-icon'),

  // Hero
  heroTotal:       () => document.getElementById('hero-total'),
  heroReturn:      () => document.getElementById('hero-return'),

  // Summary
  totalInvested:   () => document.getElementById('total-invested'),
  currentTotal:    () => document.getElementById('current-total'),
  totalPL:         () => document.getElementById('total-pl'),
  totalAssets:     () => document.getElementById('total-assets'),
  bestPerformer:   () => document.getElementById('best-performer'),
  worstPerformer:  () => document.getElementById('worst-performer'),

  // Controls
  searchInput:     () => document.getElementById('search-input'),
  filterType:      () => document.getElementById('filter-type'),
  sortBy:          () => document.getElementById('sort-by'),

  // Table
  tbody:           () => document.getElementById('invest-tbody'),
  emptyState:      () => document.getElementById('empty-state'),
  tableContainer:  () => document.getElementById('table-container'),

  // Modals
  investModal:     () => document.getElementById('invest-modal'),
  confirmModal:    () => document.getElementById('confirm-modal'),
  modalTitle:      () => document.getElementById('modal-title'),
  formSubmitBtn:   () => document.getElementById('form-submit-btn'),

  // Form
  investForm:      () => document.getElementById('invest-form'),
  editId:          () => document.getElementById('edit-id'),
  assetName:       () => document.getElementById('asset-name'),
  assetType:       () => document.getElementById('asset-type'),
  investedAmount:  () => document.getElementById('invested-amount'),
  currentValue:    () => document.getElementById('current-value'),
  investDate:      () => document.getElementById('invest-date'),

  // Confirm
  confirmMessage:  () => document.getElementById('confirm-message'),
  confirmOk:       () => document.getElementById('confirm-ok'),
  confirmCancel:   () => document.getElementById('confirm-cancel'),

  // Charts
  allocChart:      () => document.getElementById('allocation-chart'),
  plChart:         () => document.getElementById('pl-chart'),

  // Data
  exportBtn:       () => document.getElementById('export-btn'),
  importBtn:       () => document.getElementById('import-btn'),
  importFile:      () => document.getElementById('import-file'),
  clearBtn:        () => document.getElementById('clear-btn'),

  // Toast
  toastContainer:  () => document.getElementById('toast-container'),
};

/* ============================================================
   UTILITIES
   ============================================================ */

/** Generate unique ID */
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Format currency */
const fmtCurrency = (n) => {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}$${str}`;
};

/** Format percent */
const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

/** Format date */
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Compute P&L data for an investment */
const calcPL = ({ investedAmount, currentValue }) => {
  const pl  = currentValue - investedAmount;
  const pct = investedAmount > 0 ? (pl / investedAmount) * 100 : 0;
  return { pl, pct };
};

/** Debounce helper */
const debounce = (fn, delay) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
};

/* ============================================================
   STORAGE
   ============================================================ */
const storage = {
  load: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },
  save: (data) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  },
  loadTheme: () => localStorage.getItem(THEME_KEY) || 'dark',
  saveTheme: (t) => localStorage.setItem(THEME_KEY, t),
};

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
const toast = {
  show(message, type = 'info') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    DOM.toastContainer().appendChild(el);
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 350);
    }, TOAST_DURATION);
  },
  success: (msg) => toast.show(msg, 'success'),
  error:   (msg) => toast.show(msg, 'error'),
  info:    (msg) => toast.show(msg, 'info'),
};

/* ============================================================
   THEME
   ============================================================ */
const themeManager = {
  current: 'dark',
  init() {
    this.current = storage.loadTheme();
    this.apply(this.current);
  },
  toggle() {
    this.current = this.current === 'dark' ? 'light' : 'dark';
    this.apply(this.current);
    storage.saveTheme(this.current);
    // Rebuild charts so they adopt new colors
    chartManager.buildAll();
  },
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    DOM.themeIcon().textContent = theme === 'dark' ? '☀️' : '🌙';
  },
};

/* ============================================================
   MODAL
   ============================================================ */
const modal = {
  open() {
    DOM.investModal().removeAttribute('hidden');
    DOM.assetName().focus();
  },
  close() {
    DOM.investModal().setAttribute('hidden', '');
    formManager.reset();
  },
  openConfirm(message) {
    return new Promise((resolve) => {
      DOM.confirmMessage().textContent = message;
      DOM.confirmModal().removeAttribute('hidden');
      const ok  = DOM.confirmOk();
      const can = DOM.confirmCancel();
      const cleanup = (val) => {
        DOM.confirmModal().setAttribute('hidden', '');
        ok.removeEventListener('click', onOk);
        can.removeEventListener('click', onCan);
        resolve(val);
      };
      const onOk  = () => cleanup(true);
      const onCan = () => cleanup(false);
      ok.addEventListener('click', onOk);
      can.addEventListener('click', onCan);
    });
  },
};

/* ============================================================
   FORM MANAGER
   ============================================================ */
const formManager = {
  reset() {
    DOM.investForm().reset();
    DOM.editId().value = '';
    DOM.modalTitle().textContent = 'Add Investment';
    DOM.formSubmitBtn().textContent = 'Add Investment';
    // Remove error classes
    [DOM.assetName(), DOM.assetType(), DOM.investedAmount(), DOM.currentValue(), DOM.investDate()]
      .forEach(el => el.classList.remove('error'));
  },

  loadEdit(investment) {
    DOM.editId().value       = investment.id;
    DOM.assetName().value    = investment.name;
    DOM.assetType().value    = investment.type;
    DOM.investedAmount().value = investment.investedAmount;
    DOM.currentValue().value = investment.currentValue;
    DOM.investDate().value   = investment.date;
    DOM.modalTitle().textContent  = 'Edit Investment';
    DOM.formSubmitBtn().textContent = 'Save Changes';
    modal.open();
  },

  validate() {
    const fields = [
      { el: DOM.assetName(),       check: (v) => v.trim().length > 0 },
      { el: DOM.assetType(),       check: (v) => v !== '' },
      { el: DOM.investedAmount(),  check: (v) => parseFloat(v) > 0 },
      { el: DOM.currentValue(),    check: (v) => parseFloat(v) >= 0 },
      { el: DOM.investDate(),      check: (v) => v !== '' },
    ];
    let valid = true;
    fields.forEach(({ el, check }) => {
      if (!check(el.value)) {
        el.classList.add('error');
        valid = false;
      } else {
        el.classList.remove('error');
      }
    });
    return valid;
  },

  collect() {
    return {
      id:             DOM.editId().value || uid(),
      name:           DOM.assetName().value.trim(),
      type:           DOM.assetType().value,
      investedAmount: parseFloat(DOM.investedAmount().value),
      currentValue:   parseFloat(DOM.currentValue().value),
      date:           DOM.investDate().value,
    };
  },
};

/* ============================================================
   PORTFOLIO MANAGER
   ============================================================ */
const portfolioManager = {
  add(investment) {
    state.portfolio.push(investment);
    this.persist();
  },

  update(investment) {
    const idx = state.portfolio.findIndex(i => i.id === investment.id);
    if (idx !== -1) state.portfolio[idx] = investment;
    this.persist();
  },

  delete(id) {
    state.portfolio = state.portfolio.filter(i => i.id !== id);
    this.persist();
  },

  clear() {
    state.portfolio = [];
    this.persist();
  },

  persist() {
    storage.save(state.portfolio);
    this.refresh();
  },

  refresh() {
    this.applyFiltersAndSort();
    summaryManager.render();
    tableManager.render();
    chartManager.buildAll();
  },

  applyFiltersAndSort() {
    let list = [...state.portfolio];

    // Search
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || i.type.toLowerCase().includes(q));
    }

    // Filter by type
    if (state.filterType !== 'all') {
      list = list.filter(i => i.type === state.filterType);
    }

    // Sort
    const { pl: getPL } = { pl: (i) => calcPL(i).pct };
    switch (state.sortBy) {
      case 'date-desc': list.sort((a,b) => new Date(b.date) - new Date(a.date)); break;
      case 'date-asc':  list.sort((a,b) => new Date(a.date) - new Date(b.date)); break;
      case 'pl-desc':   list.sort((a,b) => getPL(b) - getPL(a)); break;
      case 'pl-asc':    list.sort((a,b) => getPL(a) - getPL(b)); break;
      case 'value-desc':list.sort((a,b) => b.currentValue - a.currentValue); break;
      case 'value-asc': list.sort((a,b) => a.currentValue - b.currentValue); break;
    }

    state.filtered = list;
  },
};

/* ============================================================
   SUMMARY MANAGER
   ============================================================ */
const summaryManager = {
  // Animated number counter
  animateValue(el, end, prefix = '', suffix = '') {
    const startVal  = parseFloat(el.dataset.current || 0);
    const duration  = 900;
    const startTime = performance.now();

    const update = (now) => {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      const current  = startVal + (end - startVal) * eased;

      el.textContent = prefix + current.toLocaleString('en-US', {
        minimumFractionDigits: suffix === '%' ? 2 : (prefix === '$' ? 2 : 0),
        maximumFractionDigits: suffix === '%' ? 2 : (prefix === '$' ? 2 : 0),
      }) + suffix;

      if (progress < 1) requestAnimationFrame(update);
      else {
        el.dataset.current = end;
      }
    };
    requestAnimationFrame(update);
  },

  render() {
    const portfolio = state.portfolio;
    const totalInvested  = portfolio.reduce((s, i) => s + i.investedAmount, 0);
    const totalCurrent   = portfolio.reduce((s, i) => s + i.currentValue, 0);
    const totalPL        = totalCurrent - totalInvested;
    const totalPLPct     = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

    // Best / worst performer
    let best = '—', worst = '—';
    if (portfolio.length > 0) {
      const sorted = [...portfolio].sort((a, b) => calcPL(b).pct - calcPL(a).pct);
      best  = `${sorted[0].name} (${fmtPct(calcPL(sorted[0]).pct)})`;
      worst = `${sorted[sorted.length - 1].name} (${fmtPct(calcPL(sorted[sorted.length - 1]).pct)})`;
    }

    // Update summary cards with animation
    const ti = DOM.totalInvested();
    const ct = DOM.currentTotal();
    const tp = DOM.totalPL();
    const ta = DOM.totalAssets();

    ti.dataset.current = parseFloat(ti.dataset.current) || 0;
    ct.dataset.current = parseFloat(ct.dataset.current) || 0;
    tp.dataset.current = parseFloat(tp.dataset.current) || 0;
    ta.dataset.current = parseFloat(ta.dataset.current) || 0;

    this.animateValue(ti, totalInvested, '$');
    this.animateValue(ct, totalCurrent, '$');
    this.animateValue(ta, portfolio.length);

    // P&L with color
    tp.className = 'sc-value ' + (totalPL >= 0 ? 'positive' : 'negative');
    this.animateValue(tp, totalPL, '$');

    DOM.bestPerformer().textContent  = best;
    DOM.worstPerformer().textContent = worst;

    // Hero cards
    DOM.heroTotal().textContent  = fmtCurrency(totalCurrent);
    const heroRet = DOM.heroReturn();
    heroRet.textContent = fmtPct(totalPLPct);
    heroRet.className   = `fc-value ${totalPLPct >= 0 ? 'positive' : 'negative'}`;
  },
};

/* ============================================================
   TABLE MANAGER
   ============================================================ */
const tableManager = {
  render() {
    const tbody   = DOM.tbody();
    const empty   = DOM.emptyState();
    const tableWrap = DOM.tableContainer();

    if (state.filtered.length === 0) {
      empty.removeAttribute('hidden');
      tableWrap.style.display = 'none';
    } else {
      empty.setAttribute('hidden', '');
      tableWrap.style.display = '';
      tbody.innerHTML = state.filtered.map(i => this.rowHTML(i)).join('');
    }
  },

  rowHTML(i) {
    const { pl, pct } = calcPL(i);
    const plClass     = pl >= 0 ? 'positive' : 'negative';
    const typeClass   = `type-${i.type.replace(/\s+/g, '-')}`;

    return `
      <tr data-id="${i.id}">
        <td>
          <div class="asset-cell">
            <span class="asset-name">${escHtml(i.name)}</span>
          </div>
        </td>
        <td><span class="type-badge ${typeClass}">${escHtml(i.type)}</span></td>
        <td>${fmtCurrency(i.investedAmount)}</td>
        <td>${fmtCurrency(i.currentValue)}</td>
        <td class="pl-cell ${plClass}">${fmtCurrency(pl)}</td>
        <td class="pl-cell ${plClass}">${fmtPct(pct)}</td>
        <td><span class="asset-date">${fmtDate(i.date)}</span></td>
        <td>
          <div class="actions-cell">
            <button class="btn-edit"   data-action="edit"   data-id="${i.id}" aria-label="Edit ${escHtml(i.name)}">Edit</button>
            <button class="btn-delete" data-action="delete" data-id="${i.id}" aria-label="Delete ${escHtml(i.name)}">Delete</button>
          </div>
        </td>
      </tr>`;
  },
};

/** Escape HTML to prevent XSS */
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ============================================================
   CHART MANAGER
   ============================================================ */
const chartManager = {
  typeColors: {
    'Stock':       '#5ca8ff',
    'Crypto':      '#ffb84d',
    'ETF':         '#4fffb0',
    'Mutual Fund': '#bc82ff',
    'Bond':        '#ff5c7a',
    'Real Estate': '#ff8c3c',
    'Other':       '#8893a8',
  },

  getThemeColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return {
      gridColor:   theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      tickColor:   theme === 'dark' ? '#8893a8' : '#5a6578',
      textColor:   theme === 'dark' ? '#f0f4ff' : '#0a0e1a',
    };
  },

  buildAll() {
    if (typeof Chart === 'undefined') {
      // Chart.js not yet loaded, retry shortly
      setTimeout(() => this.buildAll(), 300);
      return;
    }
    this.buildAllocation();
    this.buildPL();
  },

  buildAllocation() {
    const portfolio = state.portfolio;
    const ctx = DOM.allocChart().getContext('2d');

    if (state.charts.allocation) {
      state.charts.allocation.destroy();
    }

    if (portfolio.length === 0) {
      // Draw empty state on canvas
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      return;
    }

    // Group by type
    const groups = {};
    portfolio.forEach(i => {
      groups[i.type] = (groups[i.type] || 0) + i.currentValue;
    });

    const labels = Object.keys(groups);
    const data   = Object.values(groups);
    const colors = labels.map(l => this.typeColors[l] || '#8893a8');
    const tc     = this.getThemeColor();

    state.charts.allocation = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => c + 'dd'),
          borderColor:     colors,
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: tc.tickColor,
              padding: 16,
              font: { family: 'DM Sans', size: 12 },
              usePointStyle: true,
              pointStyleWidth: 8,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${fmtCurrency(ctx.raw)}`,
            },
          },
        },
        cutout: '68%',
        animation: { animateRotate: true, duration: 700 },
      },
    });
  },

  buildPL() {
    const portfolio = state.portfolio;
    const ctx = DOM.plChart().getContext('2d');

    if (state.charts.pl) {
      state.charts.pl.destroy();
    }

    if (portfolio.length === 0) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      return;
    }

    const sorted = [...portfolio].sort((a,b) => calcPL(b).pct - calcPL(a).pct).slice(0, 12);
    const labels = sorted.map(i => i.name.length > 12 ? i.name.slice(0, 12) + '…' : i.name);
    const data   = sorted.map(i => parseFloat(calcPL(i).pct.toFixed(2)));
    const colors = data.map(v => v >= 0 ? '#4fffb0cc' : '#ff5c7acc');
    const borders = data.map(v => v >= 0 ? '#4fffb0' : '#ff5c7a');
    const tc = this.getThemeColor();

    state.charts.pl = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Return %',
          data,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1.5,
          borderRadius: 6,
          barThickness: 28,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${fmtPct(ctx.raw)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: tc.gridColor },
            ticks: { color: tc.tickColor, font: { family: 'DM Sans', size: 11 } },
          },
          y: {
            grid: { color: tc.gridColor },
            ticks: {
              color: tc.tickColor,
              font: { family: 'DM Sans', size: 11 },
              callback: (v) => v + '%',
            },
          },
        },
        animation: { duration: 600 },
      },
    });
  },
};

/* ============================================================
   DATA MANAGER  — Import / Export / Clear
   ============================================================ */
const dataManager = {
  export() {
    if (state.portfolio.length === 0) {
      toast.info('No data to export.');
      return;
    }
    const blob = new Blob([JSON.stringify(state.portfolio, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `vaultex-portfolio-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Portfolio exported successfully!');
  },

  import(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) throw new Error('Invalid format');

        // Validate shape
        const valid = parsed.every(i =>
          i.id && i.name && i.type &&
          typeof i.investedAmount === 'number' &&
          typeof i.currentValue === 'number'
        );
        if (!valid) throw new Error('Invalid investment data');

        const confirmed = await modal.openConfirm(
          `Import ${parsed.length} investments? This will replace your current portfolio.`
        );
        if (!confirmed) return;

        state.portfolio = parsed;
        portfolioManager.persist();
        toast.success(`Imported ${parsed.length} investments!`);
      } catch {
        toast.error('Import failed. Please use a valid Vaultex JSON file.');
      }
    };
    reader.readAsText(file);
    // Reset file input so same file can be imported again
    DOM.importFile().value = '';
  },

  async clear() {
    if (state.portfolio.length === 0) {
      toast.info('Portfolio is already empty.');
      return;
    }
    const confirmed = await modal.openConfirm(
      `This will permanently delete all ${state.portfolio.length} investments. This cannot be undone.`
    );
    if (!confirmed) return;
    portfolioManager.clear();
    toast.success('Portfolio cleared.');
  },
};

/* ============================================================
   SCROLL REVEAL
   ============================================================ */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

const initReveal = () => {
  document.querySelectorAll('.reveal, .reveal-right').forEach(el => revealObserver.observe(el));
};

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
const initEvents = () => {

  // Navbar scroll effect
  const navbar = DOM.navbar();
  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Hamburger
  DOM.hamburger().addEventListener('click', () => {
    const open = DOM.hamburger().classList.toggle('open');
    DOM.mobileNav().classList.toggle('open', open);
    DOM.hamburger().setAttribute('aria-expanded', open);
    DOM.mobileNav().setAttribute('aria-hidden', !open);
  });

  // Close mobile nav on link click
  DOM.mobileNav().querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      DOM.hamburger().classList.remove('open');
      DOM.mobileNav().classList.remove('open');
    });
  });

  // Theme toggle
  DOM.themeToggle().addEventListener('click', () => themeManager.toggle());

  // Open modal — multiple triggers
  const openAddModal = () => {
    formManager.reset();
    modal.open();
  };
  document.getElementById('add-investment-btn').addEventListener('click', openAddModal);
  document.getElementById('nav-add-btn').addEventListener('click', openAddModal);
  document.getElementById('empty-add-btn').addEventListener('click', openAddModal);

  // Close modal
  DOM.modal_close = document.getElementById('modal-close');
  DOM.modal_close.addEventListener('click', modal.close.bind(modal));
  DOM.investModal().addEventListener('click', (e) => {
    if (e.target === DOM.investModal()) modal.close();
  });
  DOM.confirmModal().addEventListener('click', (e) => {
    if (e.target === DOM.confirmModal()) {
      DOM.confirmModal().setAttribute('hidden', '');
    }
  });

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!DOM.investModal().hasAttribute('hidden'))  modal.close();
      if (!DOM.confirmModal().hasAttribute('hidden')) DOM.confirmModal().setAttribute('hidden', '');
    }
  });

  // Form submit
  DOM.investForm().addEventListener('submit', (e) => {
    e.preventDefault();
    if (!formManager.validate()) {
      toast.error('Please fill in all fields correctly.');
      return;
    }
    const data  = formManager.collect();
    const isEdit = !!data.id && state.portfolio.some(i => i.id === data.id);

    if (isEdit) {
      portfolioManager.update(data);
      toast.success(`"${data.name}" updated successfully!`);
    } else {
      portfolioManager.add(data);
      toast.success(`"${data.name}" added to portfolio!`);
    }
    modal.close();
  });

  // Table event delegation
  DOM.tbody().addEventListener('click', async (e) => {
    const btn    = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;

    if (action === 'edit') {
      const investment = state.portfolio.find(i => i.id === id);
      if (investment) formManager.loadEdit(investment);
    }

    if (action === 'delete') {
      const investment = state.portfolio.find(i => i.id === id);
      if (!investment) return;
      const confirmed = await modal.openConfirm(`Delete "${investment.name}"? This cannot be undone.`);
      if (confirmed) {
        portfolioManager.delete(id);
        toast.success(`"${investment.name}" removed from portfolio.`);
      }
    }
  });

  // Search (debounced)
  DOM.searchInput().addEventListener('input', debounce((e) => {
    state.searchQuery = e.target.value;
    portfolioManager.applyFiltersAndSort();
    tableManager.render();
  }, 250));

  // Filter & Sort
  DOM.filterType().addEventListener('change', (e) => {
    state.filterType = e.target.value;
    portfolioManager.applyFiltersAndSort();
    tableManager.render();
  });

  DOM.sortBy().addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    portfolioManager.applyFiltersAndSort();
    tableManager.render();
  });

  // Data management
  DOM.exportBtn().addEventListener('click', () => dataManager.export());
  DOM.importBtn().addEventListener('click', () => DOM.importFile().click());
  DOM.importFile().addEventListener('change', (e) => dataManager.import(e.target.files[0]));
  DOM.clearBtn().addEventListener('click', () => dataManager.clear());

  // Real-time form field validation feedback
  [DOM.assetName(), DOM.assetType(), DOM.investedAmount(), DOM.currentValue(), DOM.investDate()].forEach(el => {
    el.addEventListener('input', () => el.classList.remove('error'));
    el.addEventListener('change', () => el.classList.remove('error'));
  });
};

/* ============================================================
   LOADER
   ============================================================ */
const initLoader = () => {
  return new Promise(resolve => {
    setTimeout(() => {
      DOM.loader().classList.add('hide');
      setTimeout(resolve, 500);
    }, 1600);
  });
};

/* ============================================================
   SEED DATA  — for fresh installs
   ============================================================ */
const getSeedData = () => [
  { id: uid(), name: 'Apple Inc.',   type: 'Stock',  investedAmount: 5000, currentValue: 7200,  date: '2023-01-15' },
  { id: uid(), name: 'Bitcoin',      type: 'Crypto', investedAmount: 3000, currentValue: 5100,  date: '2023-03-10' },
  { id: uid(), name: 'Vanguard S&P', type: 'ETF',    investedAmount: 8000, currentValue: 9350,  date: '2022-11-20' },
  { id: uid(), name: 'Tesla Inc.',   type: 'Stock',  investedAmount: 4000, currentValue: 3200,  date: '2023-06-01' },
  { id: uid(), name: 'Ethereum',     type: 'Crypto', investedAmount: 2500, currentValue: 3800,  date: '2023-04-18' },
];

/* ============================================================
   INIT
   ============================================================ */
const init = async () => {
  // Apply saved theme immediately
  themeManager.init();

  // Load portfolio
  let saved = storage.load();
  if (saved.length === 0) {
    // Seed with sample data on first load
    saved = getSeedData();
    storage.save(saved);
  }
  state.portfolio = saved;

  // Wait for loader animation
  await initLoader();

  // Initial render
  portfolioManager.applyFiltersAndSort();
  summaryManager.render();
  tableManager.render();

  // Set up events
  initEvents();

  // Scroll reveal
  initReveal();

  // Build charts (Chart.js loads async)
  const waitForChart = () => {
    if (typeof Chart !== 'undefined') {
      chartManager.buildAll();
    } else {
      setTimeout(waitForChart, 100);
    }
  };
  waitForChart();
};

// Boot
document.addEventListener('DOMContentLoaded', init);
