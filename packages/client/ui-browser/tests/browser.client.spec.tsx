// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { BrowserPanel, type BrowserPanelProps } from '../src/client/BrowserPanel.tsx'
import { apply, inject } from '../src/client/index.ts'
import { en } from '../src/client/locales.ts'
import { BrowserController } from '../src/client/service.ts'
import { createBrowserStore, normalizeWebAddress } from '../src/client/store.ts'

afterEach(() => {
  cleanup()
  delete window.deepSeekDesktop
  vi.restoreAllMocks()
})

const emptySessions = bindSnapshotSelector({
  getSnapshot: () => ({ current: undefined, byId: {} }),
  subscribe: () => () => {},
}) as BrowserPanelProps['useSessions']
const neverHook = (() => { throw new Error('browser panel must not read workspaces') }) as never
const t: BrowserPanelProps['t'] = key => (en as Record<string, string>)[key] ?? key

function mountPanel() {
  const store = createBrowserStore().create()
  act(() => { store.actions.openPanel('right') })
  const openExternal = vi.fn()
  const closeDetails = vi.fn()
  const onPanelState = vi.fn()
  const view = render(
    <BrowserPanel
      useSessions={emptySessions}
      useWorkspaces={neverHook}
      useStore={bindSnapshotSelector(store)}
      actions={store.actions}
      closeDetails={closeDetails}
      onPanelState={onPanelState}
      openExternal={openExternal}
      t={t}
    />,
  )
  return { store, closeDetails, onPanelState, openExternal, ...view }
}

describe('browser address policy and store', () => {
  it('normalizes web addresses and rejects unsafe or recursive sources', () => {
    expect(normalizeWebAddress('example.com/docs', 'http://localhost').ok).toBe(true)
    expect(normalizeWebAddress('javascript:alert(1)', 'http://localhost')).toEqual({ ok: false, reason: 'invalid' })
    expect(normalizeWebAddress('file:///tmp/page.html', 'http://localhost')).toEqual({ ok: false, reason: 'invalid' })
    expect(normalizeWebAddress('http://localhost/path', 'http://localhost')).toEqual({ ok: false, reason: 'internal' })
  })

  it('keeps a usable blank tab after the last tab closes', () => {
    const store = createBrowserStore().create()
    store.actions.openPanel('right')
    const first = store.getSnapshot().activeTabId!
    store.actions.addTab()
    expect(store.getSnapshot().tabs).toHaveLength(2)
    store.actions.closeTab(store.getSnapshot().activeTabId!)
    store.actions.closeTab(first)
    expect(store.getSnapshot().tabs).toHaveLength(1)
    expect(store.getSnapshot().tabs[0]?.kind).toBe('empty')
  })

  it('opens a desktop HTML path in the browser and leaves other files to the caller', async () => {
    const store = createBrowserStore().create()
    const browser = new BrowserController()
    browser.attach(store.actions)
    window.deepSeekDesktop = {
      readHtml: vi.fn(async (path: string) => ({ path, title: 'demo.html', content: '<h1>Demo</h1>' })),
    } as unknown as NonNullable<typeof window.deepSeekDesktop>
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:desktop-page')

    await expect(browser.openPath('/tmp/demo.html')).resolves.toBe(true)
    expect(store.getSnapshot()).toMatchObject({
      rightOpen: true,
      tabs: [{ kind: 'local', title: 'demo.html', source: 'blob:desktop-page', address: '/tmp/demo.html' }],
    })
    await expect(browser.openPath('/tmp/demo.txt')).resolves.toBe(false)
  })
})

describe('browser panel', () => {
  it('opens a normalized URL, retains another tab, reloads, and opens externally', () => {
    const b = mountPanel()
    expect(b.closeDetails).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByRole('textbox', { name: 'Web address' }), { target: { value: 'example.com/docs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const frame = b.container.querySelector('webview')
    expect(frame?.getAttribute('src')).toBe('https://example.com/docs')

    const revision = b.store.getSnapshot().tabs[0]!.revision
    fireEvent.click(screen.getByRole('button', { name: 'Reload current page' }))
    expect(b.store.getSnapshot().tabs[0]!.revision).toBe(revision + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Open in system browser' }))
    expect(b.openExternal).toHaveBeenCalledWith('https://example.com/docs')

    fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(b.container.querySelectorAll('webview')).toHaveLength(1)
    expect((b.container.querySelector('webview') as HTMLElement | null)?.hidden).toBe(true)
  })

  it('opens local HTML and releases its object URL when the tab closes', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-page')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const b = mountPanel()
    const input = b.container.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['<h1>Local</h1>'], 'demo.html', { type: 'text/html' })] } })
    expect(b.container.querySelector('webview')?.getAttribute('src')).toBe('blob:local-page')
    expect(screen.getByRole('tab', { name: 'demo.html' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close tab: demo.html' }))
    expect(revoke).toHaveBeenCalledWith('blob:local-page')
    within(screen.getByRole('region', { name: 'Web browser' })).getByRole('tab', { name: 'New tab' })
  })
})

describe('browser plugin assembly', () => {
  it('shares one store across both late-bound registrations and removes them on teardown', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('theme', { setTheme: vi.fn() })
    ctx.provide('layout', {
      toggleSidebar: () => {},
      openDetails: () => {},
      closeDetails: () => {},
    })
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({
      name: 'root',
      children: {
        'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
        'shell.utility-panel': { kind: 'single', scope: 'session' },
        'shell.bottom-panel': { kind: 'single', scope: 'session' },
      },
    } as never, () => null)

    expect(inject).toEqual(['slots', 'layout', 'locale', 'theme'])
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const trigger = slots.entries('conversation.session.header.utilities')[0]!
    const panel = slots.entries('shell.utility-panel')[0]!
    const bottomPanel = slots.entries('shell.bottom-panel')[0]!
    expect(trigger.inject).toBeDefined()
    expect(panel.store).toBe(bottomPanel.store)

    await fiber.dispose()
    expect(slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    expect(slots.entries('shell.utility-panel')).toHaveLength(0)
    expect(slots.entries('shell.bottom-panel')).toHaveLength(0)
  })
})
