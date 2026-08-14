'use strict';

(() => {
  const partitionId = new URLSearchParams(location.search).get('id');

  const $ = (sel) => document.querySelector(sel);
  const panel = $('#panel');
  const titleEl = $('#title');
  const contentEl = $('#content');
  const ctxMenu = $('#ctx-menu');
  const btnCollapse = $('#btn-collapse');

  let partition = null;
  let items = [];
  let lastBounds = { x: 0, y: 0, width: 270, height: 260 };

  // ---------------- 初始化 ----------------

  async function init() {
    const data = await dz.getPartition(partitionId);
    if (!data) return;
    applyData(data);
    dz.onRefresh((d) => { if (d && d.partition && d.partition.id === partitionId) applyData(d); });
    bindWindowControls();
    bindDragDrop();
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      lastBounds = { x: screenX, y: screenY, width: w, height: h };
    });
  }

  function applyData(data) {
    partition = data.partition;
    items = data.items || [];
    lastBounds = { x: partition.x, y: partition.y, width: partition.width, height: partition.height };
    document.documentElement.style.setProperty('--accent', partition.color);
    panel.classList.toggle('round-off', !partition.rounded);
    panel.style.setProperty('--opacity', String(partition.opacity == null ? 0.62 : partition.opacity));
    titleEl.textContent = partition.name;
    titleEl.title = `${partition.name} 分区 · ${items.length} 项`;
    btnCollapse.textContent = partition.collapsed ? '＋' : '–';
    renderItems();
  }

  // ---------------- 渲染条目 ----------------

  function tileHtml(it, index) {
    const div = document.createElement('div');
    div.className = 'tile' + (it.pinned ? ' pinned' : '');
    div.draggable = true;
    div.dataset.index = index;
    div.dataset.path = it.path;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'icon';
    if (it.iconUrl) {
      const img = document.createElement('img');
      img.src = it.iconUrl;
      img.alt = it.name;
      img.addEventListener('error', () => {
        iconWrap.innerHTML = `<span class="emoji">${it.iconFallback}</span>`;
      });
      iconWrap.appendChild(img);
    } else {
      iconWrap.innerHTML = `<span class="emoji">${it.iconFallback}</span>`;
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = it.name;

    div.appendChild(iconWrap);
    div.appendChild(nameEl);

    div.addEventListener('click', () => dz.open(it.path));
    div.addEventListener('dblclick', () => dz.open(it.path));
    div.addEventListener('contextmenu', (e) => { e.preventDefault(); showItemMenu(e, it); });
    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/dz-path', it.path);
      e.dataTransfer.effectAllowed = 'copyMove';
      div.classList.add('dragging');
      setTimeout(() => div.classList.remove('dragging'), 300);
    });
    return div;
  }

  function renderItems() {
    contentEl.innerHTML = '';
    contentEl.classList.toggle('empty', items.length === 0);
    items.forEach((it, i) => contentEl.appendChild(tileHtml(it, i)));
  }

  // ---------------- 窗口拖动 / 缩放 ----------------

  function bindWindowControls() {
    const titlebar = $('#titlebar');
    const handle = $('#resize-handle');

    let drag = null;
    titlebar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('#tb-btns')) return;
      e.preventDefault();
      titlebar.setPointerCapture(e.pointerId);
      drag = {
        kind: 'move',
        startX: e.screenX, startY: e.screenY,
        baseX: lastBounds.x, baseY: lastBounds.y,
      };
    });
    titlebar.addEventListener('pointermove', (e) => {
      if (!drag || drag.kind !== 'move') return;
      const nx = drag.baseX + (e.screenX - drag.startX);
      const ny = drag.baseY + (e.screenY - drag.startY);
      lastBounds.x = nx; lastBounds.y = ny;
      dz.updateConfig(partitionId, { x: Math.round(nx), y: Math.round(ny) });
    });

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      drag = {
        kind: 'resize',
        startX: e.screenX, startY: e.screenY,
        baseW: lastBounds.width, baseH: lastBounds.height,
      };
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag || drag.kind !== 'resize') return;
      const nw = Math.max(140, drag.baseW + (e.screenX - drag.startX));
      const nh = Math.max(60, drag.baseH + (e.screenY - drag.startY));
      lastBounds.width = nw; lastBounds.height = nh;
      dz.updateConfig(partitionId, { width: Math.round(nw), height: Math.round(nh) });
    });

    const endDrag = () => { drag = null; };
    titlebar.addEventListener('pointerup', endDrag);
    titlebar.addEventListener('pointercancel', endDrag);
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    btnCollapse.addEventListener('click', () => {
      const next = !(partition && partition.collapsed);
      dz.collapse(partitionId, next);
      if (partition) partition.collapsed = next;
      btnCollapse.textContent = next ? '＋' : '–';
    });

    $('#btn-close').addEventListener('click', () => {
      confirmModal(`解散「${partition.name}」分区？`, '分区窗口会被关闭，文件夹仍保留在磁盘上。', async () => {
        await dz.removePartition(partitionId);
      });
    });

    $('#titlebar').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTitleMenu(e);
    });
  }

  // ---------------- 拖入文件 ----------------

  function bindDragDrop() {
    document.body.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/dz-path')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('dragging-over');
      }
    });
    document.body.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget) document.body.classList.remove('dragging-over');
    });
    document.body.addEventListener('drop', async (e) => {
      e.preventDefault();
      document.body.classList.remove('dragging-over');
      const paths = [];
      const selfPath = e.dataTransfer.getData('application/dz-path');
      if (selfPath) paths.push(selfPath);
      for (const f of e.dataTransfer.files) {
        try {
          const p = dz.getPathForFile(f);
          if (p) paths.push(p);
        } catch (err) { /* 非本地文件忽略 */ }
      }
      if (paths.length) {
        await dz.dropFiles(partitionId, paths);
      }
    });
  }

  // ---------------- 右键菜单 ----------------

  function showMenu(e, items) {
    ctxMenu.innerHTML = '';
    for (const it of items) {
      if (it === 'sep') { ctxMenu.appendChild(Object.assign(document.createElement('div'), { className: 'sep' })); continue; }
      if (it.labelOnly) { ctxMenu.appendChild(Object.assign(document.createElement('div'), { className: 'label', textContent: it.labelOnly })); continue; }
      const el = Object.assign(document.createElement('div'), { className: 'item' + (it.danger ? ' danger' : ''), textContent: it.label });
      el.addEventListener('click', () => { hideMenu(); it.action(); });
      ctxMenu.appendChild(el);
    }
    ctxMenu.hidden = false;
    ctxMenu.style.left = '0px';
    ctxMenu.style.top = '0px';
    // 移到光标处并防止溢出
    const mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
    ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - mw - 4) + 'px';
    ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - mh - 4) + 'px';
  }

  function hideMenu() { ctxMenu.hidden = true; ctxMenu.innerHTML = ''; }
  document.addEventListener('click', hideMenu);
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('.tile') && !e.target.closest('#titlebar')) hideMenu(); });
  window.addEventListener('blur', hideMenu);

  function showItemMenu(e, it) {
    showMenu(e, [
      { label: it.isDir ? '打开文件夹' : '打开', action: () => dz.open(it.path) },
      { label: '打开所在文件夹', action: () => dz.showInFolder(it.path) },
      'sep',
      it.pinned
        ? { label: '取消置顶', action: () => dz.pin(partitionId, it.path, false) }
        : { label: '置顶', action: () => dz.pin(partitionId, it.path, true) },
      { label: '重命名', action: () => renameModal(it) },
      'sep',
      { label: '移出分区（不再自动归类）', action: () => dz.moveOut(partitionId, it.path) },
      { label: '删除', danger: true, action: () => confirmModal('删除该文件？', '文件将被移入回收站。', () => dz.remove(partitionId, it.path)) },
    ]);
  }

  function showTitleMenu(e) {
    showMenu(e, [
      { labelOnly: partition.name },
      { label: partition.collapsed ? '展开分区' : '收起分区', action: () => btnCollapse.click() },
      { label: '打开设置', action: () => dz.openSettings() },
      'sep',
      { label: '解散分区', danger: true, action: () => confirmModal('解散该分区？', '窗口将关闭，文件夹保留。', () => dz.removePartition(partitionId)) },
    ]);
  }

  // ---------------- 重命名 / 确认弹窗 ----------------

  function confirmModal(title, desc, onOk) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:200';
    const box = document.createElement('div');
    box.style.cssText = 'background:rgba(28,30,40,.97);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:18px 20px;width:280px;box-shadow:0 10px 40px rgba(0,0,0,.5)';
    const t = Object.assign(document.createElement('div'), { textContent: title, style: 'font-size:14px;font-weight:600;color:#fff;margin-bottom:6px' });
    const d = Object.assign(document.createElement('div'), { textContent: desc, style: 'font-size:12px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:14px' });
    const btns = Object.assign(document.createElement('div'), { style: 'display:flex;justify-content:flex-end;gap:8px' });
    const cancel = Object.assign(document.createElement('button'), { textContent: '取消', style: btnStyle(false) });
    const ok = Object.assign(document.createElement('button'), { textContent: '确定', style: btnStyle(true) });
    cancel.onclick = () => overlay.remove();
    ok.onclick = () => { overlay.remove(); onOk(); };
    btns.append(cancel, ok);
    box.append(t, d, btns);
    overlay.append(box);
    document.body.append(overlay);
  }

  function btnStyle(primary) {
    return primary
      ? 'border:none;padding:6px 16px;border-radius:8px;background:var(--accent);color:#fff;font-size:12.5px;cursor:pointer'
      : 'border:1px solid rgba(255,255,255,.2);padding:6px 16px;border-radius:8px;background:transparent;color:#ccc;font-size:12.5px;cursor:pointer';
  }

  function renameModal(it) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:200';
    const box = document.createElement('div');
    box.style.cssText = 'background:rgba(28,30,40,.97);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:18px 20px;width:300px';
    const t = Object.assign(document.createElement('div'), { textContent: '重命名', style: 'font-size:14px;font-weight:600;color:#fff;margin-bottom:10px' });
    const input = document.createElement('input');
    input.value = it.name;
    input.style.cssText = 'width:100%;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:13px;outline:none';
    const btns = Object.assign(document.createElement('div'), { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px' });
    const cancel = Object.assign(document.createElement('button'), { textContent: '取消', style: btnStyle(false) });
    const ok = Object.assign(document.createElement('button'), { textContent: '确定', style: btnStyle(true) });
    const doRename = async () => {
      const name = input.value.trim();
      if (name && name !== it.name) await dz.rename(partitionId, it.path, name);
      overlay.remove();
    };
    cancel.onclick = () => overlay.remove();
    ok.onclick = doRename;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') overlay.remove(); });
    btns.append(cancel, ok);
    box.append(t, input, btns);
    overlay.append(box);
    document.body.append(overlay);
    input.focus();
    input.select();
  }

  init();
})();
