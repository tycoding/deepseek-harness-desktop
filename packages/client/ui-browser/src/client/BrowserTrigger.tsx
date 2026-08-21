import { useSyncExternalStore } from 'react'
import {
  IconPanelBottomOutline16, IconPanelRightOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { BrowserController } from './service.ts'
import css from './BrowserPanel.module.css'

/** Session header trigger props from the owner, browser controller, and locale seat. */
export type BrowserTriggerProps = PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<{ browser: BrowserController }>
  & PropsLocale<'browser'>

/**
 * Render the icon-only panel trigger beside Session log for a live conversation.
 * @param props - composed slot props.
 * @returns the browser trigger.
 */
export function BrowserTrigger({ browser, t }: BrowserTriggerProps) {
  const placement = useSyncExternalStore(browser.subscribe, browser.getSnapshot)
  const bottomOpen = placement === 'bottom' || placement === 'both'
  const rightOpen = placement === 'right' || placement === 'both'
  return (
    <div className={css.triggerGroup}>
      <Tooltip label={t(bottomOpen ? 'trigger.bottom.close' : 'trigger.bottom')} delayMs={500}>
        <button
          type="button"
          className={css.trigger}
          aria-label={t(bottomOpen ? 'trigger.bottom.close' : 'trigger.bottom')}
          aria-pressed={bottomOpen}
          onClick={() => {
            if (bottomOpen) browser.closePanel('bottom')
            else browser.openPanel('bottom')
          }}
        >
          <IconPanelBottomOutline16 size={18} />
        </button>
      </Tooltip>
      <Tooltip label={t(rightOpen ? 'trigger.right.close' : 'trigger.right')} delayMs={500}>
        <button
          type="button"
          className={css.trigger}
          aria-label={t(rightOpen ? 'trigger.right.close' : 'trigger.right')}
          aria-pressed={rightOpen}
          onClick={() => {
            if (rightOpen) browser.closePanel('right')
            else browser.openPanel('right')
          }}
        >
          <IconPanelRightOutline16 size={18} />
        </button>
      </Tooltip>
    </div>
  )
}
