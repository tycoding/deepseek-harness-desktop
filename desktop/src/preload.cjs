const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deepSeekDesktop', {
  readHtml: path => ipcRenderer.invoke('dsh:read-local-html', path),
  workspaceTree: workspace => ipcRenderer.invoke('dsh:workspace-tree', workspace),
  readWorkspaceFile: (workspace, path) => ipcRenderer.invoke('dsh:read-workspace-file', workspace, path),
  writeWorkspaceFile: (workspace, path, content) => ipcRenderer.invoke('dsh:write-workspace-file', workspace, path, content),
  gitStatus: workspace => ipcRenderer.invoke('dsh:git-status', workspace),
  gitDiff: (workspace, path) => ipcRenderer.invoke('dsh:git-diff', workspace, path),
  createTerminal: (workspace, columns, rows) => ipcRenderer.invoke('dsh:terminal-create', workspace, columns, rows),
  writeTerminal: (id, data) => ipcRenderer.send('dsh:terminal-input', id, data),
  resizeTerminal: (id, columns, rows) => ipcRenderer.send('dsh:terminal-resize', id, columns, rows),
  closeTerminal: id => ipcRenderer.send('dsh:terminal-close', id),
  onTerminalData: callback => {
    const listener = (_event, id, data) => callback(id, data)
    ipcRenderer.on('dsh:terminal-data', listener)
    return () => { ipcRenderer.removeListener('dsh:terminal-data', listener) }
  },
})
