'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 通道名由主进程在创建时通过 query 传入（每次 prompt 唯一），避免多窗串扰
const chan = new URLSearchParams(location.search).get('chan') || 'prompt:result';

contextBridge.exposeInMainWorld('promptApi', {
  submit: (value) => ipcRenderer.send(chan, value),
  close: () => ipcRenderer.send(chan, null),
});
