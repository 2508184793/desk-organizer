'use strict';

(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let config = null; // {partitions, rules, settings}

  const COLOR_PALETTE = ['#4c8bf5', '#31b15f', '#e06c00', '#c2408f', '#8a5cf6', '#1ba1c9', '#6c7a89', '#d63a3a'];

  // ---------------- 初始化 ----------------

  async function init() {
    config = await dz.getSettings();
    bindTabs();
    bindAsideActions();
    renderPartitions();
    renderRules();
    renderPrefs();
    loadHistory();
    dz.onConfigChanged(async (data) => {
      config = data;
      renderPartitions();
      renderRules();
      renderPrefs();
    });
  }

  function bindTabs() {
    $$('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.nav-btn').forEach((b) => b.classList.remove('active'));
        $$('.tab').forEach((t) => t.classList.remove('active'));
        btn.classList.add('active');
        const tab = $('#tab-' + btn.dataset.tab);
        if (tab) tab.classList.add('active');
        if (btn.dataset.tab === 'history') loadHistory();
      });
    });
  }

  // ---------------- 一键整理 / 撤销 ----------------

  function bindAsideActions() {
    $('#btn-organize').addEventListener('click', async () => {
      const btn = $('#btn-organize');
      btn.disabled = true;
      btn.textContent = '整理中…';
      try {
        const r = await dz.organizeRun();
        const parts = Object.entries(r.byPartition || {}).map(([k, v]) => `${k}×${v}`).join('，');
        showStatus(`已按规则归组 ${r.total} 个文件` + (parts ? `：${parts}` : ''));
        loadHistory();
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ 一键整理';
      }
    });
  }

  function showStatus(text) {
    const el = $('#organize-status');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 6000);
  }

  // ---------------- 分区卡片 ----------------

  async function renderPartitions() {
    const grid = $('#partitions-grid');
    grid.innerHTML = '';

    let counts = {};
    try {
      const ov = await dz.organizeHistory();
      counts = Object.fromEntries((ov.partitions || []).map((p) => [p.id, p.count]));
    } catch (e) {}

    for (const p of config.partitions) {
      const card = document.createElement('div');
      card.className = 'p-card';

      const head = document.createElement('div');
      head.className = 'p-card-head';
      const swatch = document.createElement('div');
      swatch.className = 'p-color';
      swatch.style.background = p.color;
      const nameInput = document.createElement('input');
      nameInput.className = 'p-name';
      nameInput.value = p.name;
      nameInput.title = '双击或直接编辑重命名';
      nameInput.addEventListener('change', () => {
        const v = nameInput.value.trim();
        if (v && v !== p.name) dz.renamePartition(p.id, v);
      });
      const del = document.createElement('button');
      del.className = 'p-del';
      del.textContent = '✕';
      del.title = '解散分区';
      del.addEventListener('click', () => {
        if (confirm(`确定解散分区「${p.name}」？窗口会关闭，文件夹保留在磁盘。`)) dz.removePartition(p.id);
      });
      head.append(swatch, nameInput, del);

      const colorRow = document.createElement('div');
      colorRow.className = 'p-row';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = p.color;
      colorInput.style.cssText = 'width:22px;height:22px;border:none;background:none;cursor:pointer';
      colorInput.title = '主题色';
      colorInput.addEventListener('input', () => { swatch.style.background = colorInput.value; dz.updatePartition(p.id, { color: colorInput.value }); });
      colorRow.append(colorInput, rangeRow(p, '不透明度', 0.1, 0.9, 0.05, 'opacity'), checkboxRow(p, '圆角', 'rounded'));

      const countLine = document.createElement('div');
      countLine.className = 'p-folder';
      countLine.textContent = `当前 ${counts[p.id] || 0} 个文件`;
      card.append(head, colorRow, countLine);
      grid.appendChild(card);
    }

    // 新增分区卡片
    const add = document.createElement('div');
    add.className = 'p-card-add';
    add.innerHTML = '<div class="big">＋</div><div>新建分区</div>';
    add.addEventListener('click', () => addPartitionModal());
    grid.appendChild(add);
  }

  function rangeRow(p, label, min, max, step, key) {
    const wrap = document.createElement('label');
    const range = document.createElement('input');
    range.type = 'range'; range.min = min; range.max = max; range.step = step;
    range.value = p[key];
    range.addEventListener('input', () => dz.updatePartition(p.id, { [key]: Number(range.value) }));
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(span, range);
    return wrap;
  }

  function checkboxRow(p, label, key) {
    const wrap = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!p[key];
    cb.addEventListener('change', () => dz.updatePartition(p.id, { [key]: cb.checked }));
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(cb, span);
    return wrap;
  }

  function addPartitionModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:100';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:14px;padding:20px;width:300px;box-shadow:0 12px 40px rgba(0,0,0,.2)';
    const title = Object.assign(document.createElement('div'), { textContent: '新建分区', style: 'font-size:15px;font-weight:700;margin-bottom:12px' });
    const input = document.createElement('input');
    input.placeholder = '分区名称，如：工作资料';
    input.style.cssText = 'width:100%;padding:9px 11px;border:1px solid #e6e8ef;border-radius:9px;font-size:13.5px;outline:none';
    const palette = document.createElement('div');
    palette.style.cssText = 'display:flex;gap:8px;margin:14px 0';
    let picked = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    COLOR_PALETTE.forEach((c) => {
      const dot = document.createElement('div');
      dot.style.cssText = `width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;${c === picked ? 'box-shadow:0 0 0 2px #fff, 0 0 0 4px ' + c : ''}`;
      dot.addEventListener('click', () => {
        picked = c;
        palette.querySelectorAll('div').forEach((d) => d.style.boxShadow = '');
        dot.style.boxShadow = `0 0 0 2px #fff, 0 0 0 4px ${c}`;
      });
      palette.appendChild(dot);
    });
    const btns = Object.assign(document.createElement('div'), { style: 'display:flex;justify-content:flex-end;gap:8px' });
    const cancel = Object.assign(document.createElement('button'), { textContent: '取消', style: 'border:1px solid #e6e8ef;background:#fff;padding:8px 16px;border-radius:9px;cursor:pointer;font-size:13px' });
    const ok = Object.assign(document.createElement('button'), { textContent: '创建', style: 'border:none;background:#4c8bf5;color:#fff;padding:8px 16px;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600' });
    const submit = () => {
      const name = input.value.trim();
      if (name) dz.addPartition(name, picked);
      overlay.remove();
    };
    cancel.onclick = () => overlay.remove();
    ok.onclick = submit;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') overlay.remove(); });
    btns.append(cancel, ok);
    box.append(title, input, palette, btns);
    overlay.append(box);
    document.body.append(overlay);
    input.focus();
  }

  // ---------------- 规则 ----------------

  function renderRules() {
    const list = $('#rules-list');
    list.innerHTML = '';
    config.rules.forEach((rule, i) => {
      const row = document.createElement('div');
      row.className = 'rule-row';

      const name = input('r-name', rule.name);
      name.addEventListener('change', () => saveRules());

      const type = select('r-type', [['ext', '后缀名'], ['keyword', '关键字'], ['regex', '正则']], rule.matchType);
      type.addEventListener('change', () => { updatePatternHint(row); saveRules(); });

      const patterns = input('r-patterns', (rule.patterns || []).join(','));
      patterns.placeholder = rule.matchType === 'ext' ? '.docx,.pdf,.txt' : rule.matchType === 'keyword' ? '合同,方案,报告' : '\\\\.\\d+$';
      patterns.addEventListener('change', () => saveRules());

      const target = select('r-target', config.partitions.map((p) => [p.name, p.name]), rule.partitionName);
      target.addEventListener('change', () => saveRules());

      const pri = Object.assign(document.createElement('span'), { className: 'r-pri', textContent: i + 1, title: '优先级（越小越先）' });
      const up = Object.assign(document.createElement('button'), { className: 'r-up', textContent: '▲', title: '上移' });
      const down = Object.assign(document.createElement('button'), { className: 'r-down', textContent: '▼', title: '下移' });
      const del = Object.assign(document.createElement('button'), { className: 'r-del', textContent: '✕', title: '删除规则' });
      up.addEventListener('click', () => moveRule(i, -1));
      down.addEventListener('click', () => moveRule(i, 1));
      del.addEventListener('click', () => { config.rules.splice(i, 1); saveRules(); });

      row.append(name, type, patterns, target, pri, up, down, del);
      updatePatternHint(row);
      list.appendChild(row);
    });
  }

  function input(cls, value) {
    return Object.assign(document.createElement('input'), { type: 'text', className: cls, value });
  }

  function select(cls, options, value) {
    const s = document.createElement('select');
    s.className = cls;
    for (const [v, label] of options) {
      const o = document.createElement('option');
      o.value = v; o.textContent = label;
      if (v === value) o.selected = true;
      s.appendChild(o);
    }
    return s;
  }

  function updatePatternHint(row) {
    const type = row.querySelector('.r-type').value;
    const pat = row.querySelector('.r-patterns');
    pat.placeholder = type === 'ext' ? '.docx,.pdf,.txt' : type === 'keyword' ? '合同,方案,报告' : '\\\\.\\d+$';
  }

  function moveRule(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= config.rules.length) return;
    [config.rules[i], config.rules[j]] = [config.rules[j], config.rules[i]];
    saveRules();
  }

  function saveRules() {
    const rules = $$('#rules-list .rule-row').map((row, i) => {
      const patterns = row.querySelector('.r-patterns').value.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
      return {
        id: (config.rules[i] && config.rules[i].id) || 'rule-' + Date.now().toString(36) + '-' + i,
        name: row.querySelector('.r-name').value.trim() || '未命名规则',
        matchType: row.querySelector('.r-type').value,
        patterns,
        partitionName: row.querySelector('.r-target').value,
        priority: i + 1,
      };
    });
    config.rules = rules;
    dz.saveRules(rules);
    renderRules(); // 刷新优先级数字
  }

  function bindAddRule() {
    $('#btn-add-rule').addEventListener('click', () => {
      config.rules.push({
        id: 'rule-' + Date.now().toString(36),
        name: '新规则',
        matchType: 'ext',
        patterns: [],
        partitionName: config.partitions[0] ? config.partitions[0].name : '未分类',
        priority: config.rules.length + 1,
      });
      renderRules();
    });
  }

  // ---------------- 历史 ----------------

  async function loadHistory() {
    const list = $('#history-list');
    const data = await dz.organizeHistory();
    if (!data || !data.partitions) return;
    list.innerHTML = '';
    const total = data.total || 0;
    if (!total) {
      list.innerHTML = '<div class="h-empty">桌面暂无文件。</div>';
      return;
    }
    const grouped = data.partitions.reduce((a, p) => a + p.count, 0);

    const sum = document.createElement('div');
    sum.className = 'h-item';
    sum.style.cssText = 'display:flex;justify-content:space-between;align-items:center';
    const b = document.createElement('b');
    b.textContent = `共 ${total} 个文件`;
    const span = document.createElement('span');
    span.textContent = `已归组 ${grouped} 个 · 未分类 ${total - grouped} 个`;
    sum.append(b, span);
    list.appendChild(sum);

    for (const p of data.partitions) {
      if (!p.count) continue;
      const item = document.createElement('div');
      item.className = 'h-item';
      const head = document.createElement('div');
      head.className = 'h-head';
      const name = document.createElement('b');
      name.textContent = p.name;
      const count = document.createElement('span');
      count.textContent = `${p.count} 个`;
      head.append(name, count);
      item.append(head);
      list.appendChild(item);
    }
  }

  // ---------------- 其他设置 ----------------

  async function renderPrefs() {
    const iconsCb = $('#pref-icons');
    const autoCb = $('#pref-autostart');
    const iconsHidden = await dz.getIconsHidden();
    const autoStart = await dz.getAutoStart();
    iconsCb.checked = iconsHidden;
    autoCb.checked = autoStart;

    iconsCb.onchange = () => dz.setIconsHidden(iconsCb.checked);
    autoCb.onchange = () => dz.setAutoStart(autoCb.checked);
  }

  init();
  bindAddRule();
})();
