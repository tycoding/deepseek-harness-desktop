import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserPlacement, BrowserTab, createBrowserStore } from './store.ts'
import { normalizeWebAddress } from './store.ts'

/** HTML content returned by the optional desktop bridge. */
export interface LocalHtmlDocument {
  /** Absolute path used as the tab address. */
  path: string
  /** File name shown in the tab. */
  title: string
  /** Complete UTF-8 HTML document. */
  content: string
}

/** Desktop-only file reader exposed by Electron's isolated preload. */
export interface DesktopBrowserBridge {
  /** Read one validated local HTML document. */
  readHtml(path: string): Promise<LocalHtmlDocument>
  workspaceTree(workspace: string): Promise<{ root: string; entries: WorkspaceEntry[] }>
  readWorkspaceFile(workspace: string, path: string): Promise<WorkspacePreview>
  writeWorkspaceFile(workspace: string, path: string, content: string): Promise<{ path: string }>
  gitStatus(workspace: string): Promise<{ cwd: string; output: string }>
  gitDiff(workspace: string, path: string): Promise<{ path: string; output: string }>
  createTerminal(workspace: string, columns: number, rows: number): Promise<{ id: string; cwd: string }>
  writeTerminal(id: string, data: string): void
  resizeTerminal(id: string, columns: number, rows: number): void
  closeTerminal(id: string): void
  onTerminalData(callback: (id: string, data: string) => void): () => void
}

/** One workspace-relative file or directory rendered by the desktop tree. */
export interface WorkspaceEntry { name: string; path: string; kind: 'file' | 'directory'; children?: WorkspaceEntry[] }
/** Workspace-relative file content returned for desktop preview or editing. */
export interface WorkspacePreview { path: string; kind: 'text' | 'image'; content: string; mime?: string }

declare global {
  interface Window {
    /** Present only inside the packaged desktop application. */
    deepSeekDesktop?: DesktopBrowserBridge
  }
}

type BrowserActions = BoundActions<ReturnType<typeof createBrowserStore>>

/** Browser operations available to other client plugins. */
export interface IBrowser {
  /** Open an HTTP(S) URL in the internal browser. */
  openUrl(url: string): boolean
  /** Open a desktop-readable HTML path; false leaves the caller responsible. */
  openPath(path: string): Promise<boolean>
}

/** Connect cross-plugin browser requests to the panel's shared store. */
export class BrowserController implements IBrowser {
  #actions: BrowserActions | undefined
  #placement: BrowserPlacement = 'closed'
  /** Subscribe to panel-placement changes. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  /** Read the current panel placement. */
  readonly getSnapshot = (): BrowserPlacement => this.#placement
  readonly #listeners = new Set<() => void>()

  private publish(placement: BrowserPlacement): void {
    if (this.#placement === placement) return
    this.#placement = placement
    for (const listener of this.#listeners) listener()
  }

  /**
   * Attach the browser panel's bound actions when its slot entry mounts.
   * @param actions - Bound actions for the shared browser store.
   */
  attach(actions: BrowserActions): void {
    this.#actions = actions
  }

  /** Detach panel actions before plugin teardown. */
  detach(): void {
    this.#actions = undefined
    this.publish('closed')
  }

  /**
   * Open the shared browser panel at the requested dock position.
   * @param placement - Dock position to open.
   */
  openPanel(placement: 'right' | 'bottom'): void {
    this.#actions?.openPanel(placement)
    this.publish(this.#placement === 'closed' ? placement : this.#placement === placement ? placement : 'both')
  }

  /**
   * Close one desktop panel without changing the other panel.
   * @param placement - Dock position to close.
   */
  closePanel(placement: 'right' | 'bottom'): void {
    this.#actions?.closePanel(placement)
    this.publish(this.#placement === 'both' ? (placement === 'right' ? 'bottom' : 'right') : 'closed')
  }

  /**
   * Mirror the panel store so the Session header trigger stays current.
   * @param placement - Current combined panel placement.
   */
  setPlacement(placement: BrowserPlacement): void {
    this.publish(placement)
  }

  /**
   * Open an HTTP(S) URL in the internal browser.
   * @param value - Absolute or scheme-free web address.
   * @returns Whether the address was accepted and opened.
   */
  openUrl(value: string): boolean {
    const result = normalizeWebAddress(value, window.location.origin)
    const actions = this.#actions
    if (!result.ok || actions === undefined) return false
    actions.openTab({
      kind: 'web',
      title: result.url.hostname,
      source: result.url.href,
      address: result.url.href,
    })
    this.publish(this.#placement === 'bottom' ? 'both' : 'right')
    return true
  }

  /**
   * Open a local HTML path through the packaged desktop bridge.
   * @param path - Absolute HTML path resolved by the conversation owner.
   * @returns Whether the desktop bridge accepted and opened the path.
   */
  async openPath(path: string): Promise<boolean> {
    if (!/\.html?$/i.test(path)) return false
    const bridge = window.deepSeekDesktop
    const actions = this.#actions
    if (bridge === undefined || actions === undefined) return false
    const document = await bridge.readHtml(path)
    if (this.#actions !== actions) return false
    const source = URL.createObjectURL(new Blob([document.content], { type: 'text/html' }))
    const tab: Omit<BrowserTab, 'id' | 'revision'> = {
      kind: 'local',
      title: document.title,
      source,
      address: document.path,
    }
    actions.openTab(tab)
    this.publish(this.#placement === 'bottom' ? 'both' : 'right')
    return true
  }
}
