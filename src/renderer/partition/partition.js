'use strict';

(() => {
  const partitionId = new URLSearchParams(location.search).get('id');

  const $ = (sel) => document.querySelector(sel);
  const panel = $('#panel');
  const titleEl = $('#title');
  const contentEl = $('#content');
  const btnArrow = $('#btn-arrow');

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
    panel.classList.toggle('collapsed', !!partition.collapsed);
    panel.style.setProperty('--opacity', String(partition.opacity == null ? 0.62 : partition.opacity));
    titleEl.textContent = partition.name;
    titleEl.title = `${partition.name} 分区 · ${items.length} 项`;
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
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      dz.showMenu(partitionId, 'item', { path: it.path, name: it.name, isDir: it.isDir, pinned: it.pinned });
    });
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
      if (e.target.closest('#tb-btns') || e.target.closest('#btn-arrow')) return;
      e.preventDefault();
      try { titlebar.setPointerCapture(e.pointerId); } catch (err) {}
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
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
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

    btnArrow.addEventListener('click', () => {
      const next = !(partition && partition.collapsed);
      dz.collapse(partitionId, next);
      if (partition) partition.collapsed = next;
      panel.classList.toggle('collapsed', next);
    });

    $('#btn-close').addEventListener('click', () => {
      confirmModal(`解散「${partition.name}」分区？`, '分区窗口会被关闭，文件夹仍保留在磁盘上。', async () => {
        await dz.removePartition(partitionId);
      });
    });

    $('#titlebar').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      dz.showMenu(partitionId, 'title', null);
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

  init();
})();
