import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  IconCloseOutline16, IconCodeOutline16, IconFolderOpenOutline16,
  IconBranchOutline16, IconGlobeOutline14, IconPlusOutline16,
  IconRefreshOutline16, IconRightUpOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { BrowserPlacement, BrowserTab, createBrowserStore } from './store.ts'
import type { WorkspaceEntry, WorkspacePreview } from './service.ts'
import { normalizeWebAddress } from './store.ts'
import { WorkspaceFileTree } from './FileTree.tsx'
import { PanelResizeHandle } from './PanelResizeHandle.tsx'
import css from './BrowserPanel.module.css'

/** Host callbacks used by the right utility panel. */
export interface BrowserPanelInjected {
  closeDetails: () => void
  openExternal: (url: string) => void
  onPanelState: (state: BrowserPlacement) => void
}

/** Right utility panel props. */
export type BrowserPanelProps = PropsRuntime<'shell.utility-panel'>
  & PropsStore<ReturnType<typeof createBrowserStore>>
  & BrowserPanelInjected
  & PropsLocale<'browser'>

type RightMode = 'browser' | 'files' | 'git'

function panelState(rightOpen: boolean, bottomOpen: boolean): BrowserPlacement {
  return rightOpen ? (bottomOpen ? 'both' : 'right') : (bottomOpen ? 'bottom' : 'closed')
}

function initialRightPanelWidth(): number {
  return Math.min(680, Math.max(420, window.innerWidth * 0.42))
}

function rightPanelWidth(requested: number): number {
  return Math.min(Math.max(320, window.innerWidth - 420), Math.max(320, requested))
}

function releaseLocalTab(tab: BrowserTab | undefined): void {
  if (tab?.kind === 'local' && tab.source.startsWith('blob:')) URL.revokeObjectURL(tab.source)
}

function Preview({ preview, t }: { preview: WorkspacePreview | null; t: BrowserPanelProps['t'] }) {
  if (preview === null) return <div className={css.empty}><IconCodeOutline16 size={28} /><span>{t('files.preview')}</span></div>
  if (preview.kind === 'image') return <div className={css.previewImage}><img src={`data:${preview.mime};base64,${preview.content}`} alt={preview.path} /></div>
  return <pre className={css.previewText}>{preview.content}</pre>
}

/** Render Web, Files, and Git as a dedicated right-side workspace. */
export function BrowserPanel({ useStore, useSessions, actions, closeDetails, openExternal, onPanelState, t }: BrowserPanelProps) {
  const state = useStore(value => value)
  const workspace = useSessions(s => s.current === undefined ? '' : s.byId[s.current]?.cwd ?? '')
  const active = state.tabs.find(tab => tab.id === state.activeTabId)
  const [mode, setMode] = useState<RightMode>('browser')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tree, setTree] = useState<WorkspaceEntry[]>([])
  const [workspaceRoot, setWorkspaceRoot] = useState('')
  const [preview, setPreview] = useState<WorkspacePreview | null>(null)
  const [gitOutput, setGitOutput] = useState('')
  const [panelWidth, setPanelWidth] = useState(initialRightPanelWidth)
  const addressInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const tabsRef = useRef(state.tabs)
  tabsRef.current = state.tabs

  const loadTree = (): void => {
    if (workspace === '') return
    void window.deepSeekDesktop?.workspaceTree(workspace)
      .then((result) => { setWorkspaceRoot(result.root); setTree(result.entries) })
      .catch(() => { setTree([]) })
  }
  const loadGit = (): void => {
    if (workspace === '') return
    void window.deepSeekDesktop?.gitStatus(workspace)
      .then((result) => { setWorkspaceRoot(result.cwd); setGitOutput(result.output) })
      .catch((errorValue) => { setGitOutput(String(errorValue)) })
  }

  useEffect(() => {
    setAddress(active?.address ?? '')
    setError(null)
    if (state.rightOpen && mode === 'browser' && active?.kind === 'empty') window.requestAnimationFrame(() => { addressInput.current?.focus() })
  }, [active?.address, active?.id, active?.kind, mode, state.rightOpen])
  useEffect(() => { if (state.rightOpen) closeDetails() }, [closeDetails, state.rightOpen])
  useEffect(() => { onPanelState(panelState(state.rightOpen, state.bottomOpen)) }, [onPanelState, state.bottomOpen, state.rightOpen])
  useEffect(() => { setTree([]); setWorkspaceRoot(''); setPreview(null); setGitOutput('') }, [workspace])
  useEffect(() => { if (state.rightOpen && mode === 'files') loadTree(); if (state.rightOpen && mode === 'git') loadGit() }, [mode, state.rightOpen, workspace])
  useEffect(() => () => { for (const tab of tabsRef.current) releaseLocalTab(tab) }, [])

  if (!state.rightOpen) return null

  const navigate = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (active === undefined) return
    const result = normalizeWebAddress(address, window.location.origin)
    if (!result.ok) { setError(t(result.reason === 'internal' ? 'address.internal' : 'address.invalid')); return }
    releaseLocalTab(active)
    actions.navigate(active.id, { kind: 'web', title: result.url.hostname, source: result.url.href, address: result.url.href })
    setAddress(result.url.href)
    setError(null)
  }

  const openLocalHtml = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file === undefined || active === undefined) return
    releaseLocalTab(active)
    const source = URL.createObjectURL(file)
    actions.navigate(active.id, { kind: 'local', title: file.name, source, address: file.name })
    setAddress(file.name)
  }

  const modes = [
    ['browser', IconGlobeOutline14, 'Web'],
    ['files', IconFolderOpenOutline16, 'Files'],
    ['git', IconBranchOutline16, 'Git'],
  ] as const

  return <section className={css.panel} style={{ width: panelWidth }} aria-label={t('panel.label')} data-browser-panel data-browser-placement="right">
    <PanelResizeHandle edge="left" size={panelWidth} onResize={(requested) => { setPanelWidth(rightPanelWidth(requested)) }} />
    <header className={css.primaryBar}>
      <nav className={css.modeBar} aria-label="Utility tools">{modes.map(([value, Icon, label]) => <button key={value} type="button" className={`${css.modeButton} ${mode === value ? css.modeActive : ''}`} aria-pressed={mode === value} onClick={() => { setMode(value) }}><Icon size={16} /><span>{label}</span></button>)}</nav>
      <Tooltip label={t('panel.close')} side="bottom" delayMs={400}><button type="button" className={css.closeButton} aria-label={t('panel.close')} onClick={() => { actions.closePanel('right') }}><IconCloseOutline16 size={16} /></button></Tooltip>
    </header>

    <div className={css.secondaryBar}>
      {mode === 'browser' && <><div className={css.tabs} role="tablist" aria-label={t('trigger')}>{state.tabs.map(tab => <div key={tab.id} className={`${css.tab} ${tab.id === state.activeTabId ? css.tabActive : ''}`}><button type="button" className={css.tabSelect} role="tab" aria-selected={tab.id === state.activeTabId} onClick={() => { actions.selectTab(tab.id) }}><IconGlobeOutline14 size={13} /><span>{tab.title || t('tab.new')}</span></button><button type="button" className={css.tabClose} aria-label={`${t('tab.close')}: ${tab.title || t('tab.new')}`} onClick={() => { releaseLocalTab(tab); actions.closeTab(tab.id) }}><IconCloseOutline16 size={13} /></button></div>)}</div><button type="button" className={css.smallIconButton} aria-label={t('tab.add')} onClick={() => { actions.addTab() }}><IconPlusOutline16 size={15} /></button></>}
      {mode === 'files' && <><IconFolderOpenOutline16 size={15} /><span className={css.contextTitle}>{workspaceRoot.split('/').pop() || workspaceRoot || 'Workspace'}</span><span className={css.secondarySpacer} /><button type="button" className={css.smallIconButton} aria-label={t('files.refresh')} onClick={loadTree}><IconRefreshOutline16 size={15} /></button></>}
      {mode === 'git' && <><IconBranchOutline16 size={15} /><span className={css.contextTitle}>{gitOutput.split('\n')[0]?.replace(/^##\s*/, '') || 'Working Tree'}</span><span className={css.secondarySpacer} /><button type="button" className={css.smallIconButton} aria-label={t('git.refresh')} onClick={loadGit}><IconRefreshOutline16 size={15} /></button></>}
    </div>

    {mode === 'browser' && <div className={css.toolbar}><form className={css.addressForm} onSubmit={navigate}><IconGlobeOutline14 className={css.addressIcon} /><input ref={addressInput} className={css.addressInput} value={address} aria-label={t('address.label')} aria-invalid={error === null ? undefined : true} placeholder={t('address.placeholder')} onChange={(event) => { setAddress(event.currentTarget.value); setError(null) }} /><button type="submit" className={css.openButton}>{t('address.open')}</button></form><input ref={fileInput} className={css.fileInput} type="file" accept=".html,.htm,text/html" onChange={openLocalHtml} /><button type="button" className={css.toolbarButton} aria-label={t('file.open')} onClick={() => { fileInput.current?.click() }}><IconFolderOpenOutline16 size={16} /></button><button type="button" className={css.toolbarButton} aria-label={t('page.reload')} disabled={active === undefined || active.kind === 'empty'} onClick={() => { if (active !== undefined) actions.reload(active.id) }}><IconRefreshOutline16 size={16} /></button><button type="button" className={css.toolbarButton} aria-label={t('page.external')} disabled={active?.kind !== 'web'} onClick={() => { if (active?.kind === 'web') openExternal(active.source) }}><IconRightUpOutline16 size={16} /></button></div>}
    {error !== null && <div className={css.error} role="alert">{error}</div>}

    <div className={css.viewport}>
      {mode === 'browser' && state.tabs.map(tab => tab.kind === 'empty' ? null : <webview key={`${tab.id}:${String(tab.revision)}`} className={css.frame} hidden={tab.id !== state.activeTabId} title={tab.title || t('tab.new')} src={tab.source} allowpopups />)}
      {mode === 'browser' && active?.kind === 'empty' && <div className={css.empty}><IconGlobeOutline14 size={30} /><span>{t('empty.title')}</span></div>}
      {mode === 'files' && <div className={css.workspaceView}><aside className={css.treePane}>{tree.length === 0 ? <div className={css.muted}>{t('files.empty')}</div> : <WorkspaceFileTree entries={tree} selectedPath={preview?.path} onSelect={(path) => { void window.deepSeekDesktop?.readWorkspaceFile(workspace, path).then(setPreview).catch(() => { setPreview(null) }) }} />}</aside><main className={css.previewPane}><Preview preview={preview} t={t} /></main></div>}
      {mode === 'git' && <div className={css.workspaceView}><aside className={css.treePane}>{gitOutput.split('\n').filter(line => line !== '' && !line.startsWith('##')).map((line) => { const target = line.slice(3).trim(); return <button key={line} type="button" className={css.gitRow} onClick={() => { if (target.includes(' -> ')) return; void window.deepSeekDesktop?.gitDiff(workspace, target).then((result) => { setPreview({ path: result.path, kind: 'text', content: result.output }) }) }}><span className={css.gitStatus}>{line.slice(0, 2)}</span><span>{target}</span></button> })}</aside><main className={css.previewPane}><Preview preview={preview} t={t} /></main></div>}
    </div>
  </section>
}
