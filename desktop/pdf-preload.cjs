'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hanxPDF',Object.freeze({request:(action,args={})=>ipcRenderer.invoke('hanx:pdf',action,args)}));
ipcRenderer.on('hanx:pdf-action',(_event,action)=>window.dispatchEvent(new CustomEvent('hanx-pdf-action',{detail:action})));
