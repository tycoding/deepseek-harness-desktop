/** Browser workspace plugin, browser half. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { BrowserPanel, type BrowserPanelInjected } from './BrowserPanel.tsx'
import { BottomPanel, type BottomPanelInjected } from './BottomPanel.tsx'
import { BrowserTrigger } from './BrowserTrigger.tsx'
import { BrowserController, type IBrowser } from './service.ts'
import { createBrowserStore } from './store.ts'
import { en, zh, type BrowserKey } from './locales.ts'

export { createBrowserStore } from './store.ts'
export { BrowserController } from './service.ts'
export type { DesktopBrowserBridge, IBrowser, LocalHtmlDocument } from './service.ts'
export type { BrowserKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Browser trigger, tab chrome, and address controls. */
    browser: BrowserKey
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Internal multi-tab browser available to client plugins. */
    browser: IBrowser
  }
}

const NS = 'browser'

/** Required services: target slots, layout actions, and locale dictionaries. */
export const inject = ['slots', 'layout', 'locale', 'theme']

/**
 * Register the browser trigger in the Session header and share its browser
 * controller with the root-level utility panels.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-browser: dictionaries')
  if (window.deepSeekDesktop !== undefined) ctx.theme.setTheme('system')
  const store = createBrowserStore()
  const browser = new BrowserController()

  ctx.effect(() => {
    const dispose = ctx.reflect.provide('browser', browser)
    return () => {
      browser.detach()
      void dispose()
    }
  }, 'ui-browser: service')

  ctx.effect(() => {
    const openInternalLink = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (target === null || !browser.openUrl(target.href)) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('click', openInternalLink, true)
    return () => { document.removeEventListener('click', openInternalLink, true) }
  }, 'ui-browser: internal link routing')

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'browser',
    order: 100,
    locale: NS,
    inject: (): { browser: BrowserController } => ({ browser }),
  }, BrowserTrigger))

  ctx.slots.inject('shell.utility-panel', () => ctx.slots.register({
    name: 'shell.utility-panel',
    locale: NS,
    store,
    inject: (actions): BrowserPanelInjected => {
      browser.attach(actions)
      return {
        closeDetails: () => { ctx.layout.closeDetails() },
        openExternal: (url) => { window.open(url, '_blank', 'noopener,noreferrer') },
        onPanelState: (placement) => { browser.setPlacement(placement) },
      }
    },
  }, BrowserPanel))

  ctx.slots.inject('shell.bottom-panel', () => ctx.slots.register({
    name: 'shell.bottom-panel',
    locale: NS,
    store,
    inject: (actions): BottomPanelInjected => {
      browser.attach(actions)
      return {
        onPanelState: (placement) => { browser.setPlacement(placement) },
      }
    },
  }, BottomPanel))
}
