import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import {
  IconCloseOutline16, IconCodeOutline16, IconFolderOpenOutline16,
  IconRefreshOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserPlacement, createBrowserStore } from './store.ts'
import type { WorkspaceEntry, WorkspacePreview } from './service.ts'
import { WorkspaceFileTree } from './FileTree.tsx'
import { PanelResizeHandle } from './PanelResizeHandle.tsx'
import css from './BrowserPanel.module.css'

function TerminalIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.25" y="2" width="13.5" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M4 6L6.2 8L4 10M8 10H11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

/** Host callbacks used by the bottom utility panel. */
export interface BottomPanelInjected {
  onPanelState: (state: BrowserPlacement) => void
}

/** Bottom terminal and editor panel props. */
export type BottomPanelProps = PropsRuntime<'shell.bottom-panel'>
  & PropsStore<ReturnType<typeof createBrowserStore>>
  & BottomPanelInjected
  & PropsLocale<'browser'>

function stateOf(rightOpen: boolean, bottomOpen: boolean): BrowserPlacement {
  return bottomOpen ? (rightOpen ? 'both' : 'bottom') : (rightOpen ? 'right' : 'closed')
}

function initialBottomPanelHeight(): number {
  return Math.min(480, Math.max(260, window.innerHeight * 0.38))
}

function bottomPanelHeight(requested: number): number {
  return Math.min(Math.max(180, window.innerHeight - 220), Math.max(180, requested))
}

const DARK_TERMINAL_THEME = {
  background: '#090a09', foreground: '#d8ddd4', cursor: '#8dd769', cursorAccent: '#090a09',
  selectionBackground: '#30442b', black: '#222522', red: '#ff6b68', green: '#8dd769',
  yellow: '#e3c66b', blue: '#72a7ff', magenta: '#c792ea', cyan: '#63d7da', white: '#d8ddd4',
  brightBlack: '#687068', brightRed: '#ff8b88', brightGreen: '#a9e482', brightYellow: '#f1d984',
  brightBlue: '#91bbff', brightMagenta: '#d9a7ed', brightCyan: '#83e5e7', brightWhite: '#f5f7f2',
}

const LIGHT_TERMINAL_THEME = {
  background: '#ffffff', foreground: '#252723', cursor: '#2f7d3b', cursorAccent: '#ffffff',
  selectionBackground: '#dbe8d8', black: '#252723', red: '#c43732', green: '#27763a',
  yellow: '#8a6500', blue: '#275fae', magenta: '#82499a', cyan: '#14717a', white: '#f4f4f1',
  brightBlack: '#747a72', brightRed: '#dd514a', brightGreen: '#358c49', brightYellow: '#a97d00',
  brightBlue: '#3977cf', brightMagenta: '#9a5eb1', brightCyan: '#258893', brightWhite: '#ffffff',
}

function terminalTheme() {
  return document.body.hasAttribute('data-ds-dark-theme') ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME
}

function TerminalView({ visible, workspace }: { visible: boolean; workspace: string }) {
  const host = useRef<HTMLDivElement>(null)
  const bridge = window.deepSeekDesktop
  useEffect(() => {
    if (!visible || workspace === '' || host.current === null || bridge === undefined) return
    const terminal = new Terminal({ cursorBlink: true, cursorStyle: 'block', convertEol: true, fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 13, lineHeight: 1.25, scrollback: 5000, theme: terminalTheme() })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    fit.fit()
    let id: string | undefined
    let disposed = false
    const offData = bridge.onTerminalData((terminalId, data) => { if (terminalId === id) terminal.write(data) })
    void bridge.createTerminal(workspace, terminal.cols, terminal.rows).then((created) => {
      if (disposed) { bridge.closeTerminal(created.id); return }
      id = created.id
      bridge.writeTerminal(id, '\r')
      terminal.focus()
    })
    const input = terminal.onData((data) => { if (id !== undefined) bridge.writeTerminal(id, data) })
    const observer = new ResizeObserver(() => { fit.fit(); if (id !== undefined) bridge.resizeTerminal(id, terminal.cols, terminal.rows) })
    observer.observe(host.current)
    const themeObserver = new MutationObserver(() => { terminal.options.theme = terminalTheme() })
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => {
      disposed = true
      themeObserver.disconnect()
      observer.disconnect()
      input.dispose()
      offData()
      if (id !== undefined) bridge.closeTerminal(id)
      terminal.dispose()
    }
  }, [bridge, visible, workspace])
  return <div ref={host} className={css.xtermHost} />
}

/** Render a persistent PTY terminal and workspace text editor in the bottom dock. */
export function BottomPanel({ useStore, useSessions, actions, onPanelState, t }: BottomPanelProps) {
  const state = useStore(value => value)
  const workspace = useSessions(s => s.current === undefined ? '' : s.byId[s.current]?.cwd ?? '')
  const [mode, setMode] = useState<'terminal' | 'editor'>('terminal')
  const [tree, setTree] = useState<WorkspaceEntry[]>([])
  const [preview, setPreview] = useState<WorkspacePreview | null>(null)
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const [panelHeight, setPanelHeight] = useState(initialBottomPanelHeight)

  const loadTree = (): void => { if (workspace === '') return; void window.deepSeekDesktop?.workspaceTree(workspace).then((result) => { setTree(result.entries) }).catch(() => { setTree([]) }) }
  useEffect(() => { onPanelState(stateOf(state.rightOpen, state.bottomOpen)) }, [onPanelState, state.bottomOpen, state.rightOpen])
  useEffect(() => { setTree([]); setPreview(null); setContent(''); setSaved(true) }, [workspace])
  useEffect(() => { if (state.bottomOpen && mode === 'editor') loadTree() }, [mode, state.bottomOpen, workspace])
  if (!state.bottomOpen) return null

  const selectFile = (path: string): void => {
    void window.deepSeekDesktop?.readWorkspaceFile(workspace, path).then((value) => { setPreview(value); setContent(value.kind === 'text' ? value.content : ''); setSaved(true) })
  }

  return <section className={css.bottomPanel} style={{ height: panelHeight }} aria-label="Terminal and editor" data-browser-placement="bottom">
    <PanelResizeHandle edge="top" size={panelHeight} onResize={(requested) => { setPanelHeight(bottomPanelHeight(requested)) }} />
    <header className={css.bottomHeader}>
      <nav className={css.modeBar} aria-label="Bottom tools"><button type="button" className={`${css.modeButton} ${mode === 'terminal' ? css.modeActive : ''}`} onClick={() => { setMode('terminal') }}><TerminalIcon /><span>Terminal</span></button><button type="button" className={`${css.modeButton} ${mode === 'editor' ? css.modeActive : ''}`} onClick={() => { setMode('editor') }}><IconCodeOutline16 size={16} /><span>Editor</span></button></nav>
      <span className={css.secondarySpacer} />
      {mode === 'editor' && <button type="button" className={css.smallIconButton} aria-label={t('files.refresh')} onClick={loadTree}><IconRefreshOutline16 size={15} /></button>}
      <Tooltip label={t('trigger.bottom.close')} side="top" delayMs={400}><button type="button" className={css.closeButton} aria-label={t('trigger.bottom.close')} onClick={() => { actions.closePanel('bottom') }}><IconCloseOutline16 size={16} /></button></Tooltip>
    </header>
    <div className={css.bottomBody}>
      {mode === 'terminal' && <TerminalView visible workspace={workspace} />}
      {mode === 'editor' && <div className={css.editorView}><aside className={css.editorTree}><WorkspaceFileTree entries={tree} selectedPath={preview?.path} onSelect={selectFile} /></aside><main className={css.editorPane}>{preview?.kind === 'text' ? <><div className={css.editorTitle}><span>{preview.path}</span><button type="button" className={css.saveButton} disabled={saved} onClick={() => { void window.deepSeekDesktop?.writeWorkspaceFile(workspace, preview.path, content).then(() => { setSaved(true) }) }}>{saved ? 'Saved' : 'Save'}</button></div><textarea value={content} spellCheck={false} onChange={(event) => { setContent(event.currentTarget.value); setSaved(false) }} /></> : <div className={css.empty}><IconFolderOpenOutline16 size={28} /><span>Select a text file to edit</span></div>}</main></div>}
    </div>
  </section>
}
