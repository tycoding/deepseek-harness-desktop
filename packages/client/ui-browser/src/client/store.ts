import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** A blank tab, a remote web page, or a local object-URL-backed HTML page. */
export type BrowserTabKind = 'empty' | 'web' | 'local'

/** Where the shared browser workspace is docked. */
export type BrowserPlacement = 'closed' | 'right' | 'bottom' | 'both'

/** One browser tab kept alive while the browser panel is mounted. */
export interface BrowserTab {
  id: string
  kind: BrowserTabKind
  title: string
  source: string
  address: string
  revision: number
}

/** Transient shared state for the sidebar trigger and frame overlay. */
export interface BrowserState {
  rightOpen: boolean
  bottomOpen: boolean
  tabs: BrowserTab[]
  activeTabId: string | undefined
  nextTabId: number
}

type BrowserActions = {
  openPanel: (draft: BrowserState, placement: 'right' | 'bottom') => void
  closePanel: (draft: BrowserState, placement: 'right' | 'bottom') => void
  addTab: (draft: BrowserState) => void
  openTab: (draft: BrowserState, tab: Omit<BrowserTab, 'id' | 'revision'>) => void
  selectTab: (draft: BrowserState, tabId: string) => void
  closeTab: (draft: BrowserState, tabId: string) => void
  navigate: (draft: BrowserState, tabId: string, tab: Omit<BrowserTab, 'id' | 'revision'>) => void
  reload: (draft: BrowserState, tabId: string) => void
}

function appendBlankTab(draft: BrowserState): void {
  const id = `browser-tab-${String(draft.nextTabId)}`
  draft.nextTabId += 1
  draft.tabs.push({ id, kind: 'empty', title: '', source: '', address: '', revision: 0 })
  draft.activeTabId = id
}

function appendTab(draft: BrowserState, tab: Omit<BrowserTab, 'id' | 'revision'>): void {
  const active = draft.tabs.find(entry => entry.id === draft.activeTabId)
  if (active?.kind === 'empty') {
    Object.assign(active, tab)
    active.revision += 1
    draft.rightOpen = true
    return
  }
  const id = `browser-tab-${String(draft.nextTabId)}`
  draft.nextTabId += 1
  draft.tabs.push({ id, ...tab, revision: 1 })
  draft.activeTabId = id
  draft.rightOpen = true
}

/**
 * Create the shared browser store handle. State is not persisted because
 * local HTML object URLs are valid only for the current renderer lifetime.
 * @returns a transient store handle shared by both browser registrations.
 */
export function createBrowserStore(): EngineStoreHandle<BrowserState, BrowserActions> {
  return defineStore({
    init: (): BrowserState => ({ rightOpen: false, bottomOpen: false, tabs: [], activeTabId: undefined, nextTabId: 1 }),
    actions: {
      openPanel: (d, placement) => {
        if (placement === 'right') d.rightOpen = true
        else d.bottomOpen = true
        if (d.tabs.length === 0) appendBlankTab(d)
      },
      closePanel: (d, placement) => {
        if (placement === 'right') d.rightOpen = false
        else d.bottomOpen = false
      },
      addTab: (d) => { appendBlankTab(d) },
      openTab: (d, tab) => { appendTab(d, tab) },
      selectTab: (d, tabId: string) => {
        if (d.tabs.some(tab => tab.id === tabId)) d.activeTabId = tabId
      },
      closeTab: (d, tabId: string) => {
        const index = d.tabs.findIndex(tab => tab.id === tabId)
        if (index === -1) return
        d.tabs.splice(index, 1)
        if (d.tabs.length === 0) {
          appendBlankTab(d)
          return
        }
        if (d.activeTabId !== tabId) return
        d.activeTabId = d.tabs[Math.min(index, d.tabs.length - 1)]?.id
      },
      navigate: (d, tabId: string, tab) => {
        const current = d.tabs.find(entry => entry.id === tabId)
        if (current === undefined) return
        current.kind = tab.kind
        current.title = tab.title
        current.source = tab.source
        current.address = tab.address
        current.revision += 1
      },
      reload: (d, tabId: string) => {
        const current = d.tabs.find(entry => entry.id === tabId)
        if (current !== undefined && current.kind !== 'empty') current.revision += 1
      },
    },
  })
}

/**
 * Normalize user input into an embeddable web URL.
 * @param input - address-bar text.
 * @param applicationOrigin - current application origin rejected to prevent recursive embedding.
 * @returns the normalized URL, or a stable error discriminator.
 */
export function normalizeWebAddress(
  input: string,
  applicationOrigin: string,
): { ok: true; url: URL } | { ok: false; reason: 'invalid' | 'internal' } {
  const value = input.trim()
  if (value.length === 0) return { ok: false, reason: 'invalid' }
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'invalid' }
    if (url.origin === applicationOrigin) return { ok: false, reason: 'internal' }
    return { ok: true, url }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}
