import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import {
  IconChevronRightOutline14, IconCodeOutline16, IconFolderClose16, IconFolderOpen16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceEntry } from './service.ts'
import css from './BrowserPanel.module.css'

interface FileTreeContextValue {
  expandedPaths: Set<string>
  togglePath: (path: string) => void
  selectedPath?: string | undefined
  onSelect?: ((path: string) => void) | undefined
}

const FileTreeContext = createContext<FileTreeContextValue>({ expandedPaths: new Set(), togglePath: () => {} })

/** AI Elements FileTree root adapted to the Harness theme system. */
export interface FileTreeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  expanded?: Set<string>
  defaultExpanded?: Set<string>
  selectedPath?: string | undefined
  onSelect?: ((path: string) => void) | undefined
  onExpandedChange?: ((expanded: Set<string>) => void) | undefined
}

/** Provide controlled selection and expansion state for tree subcomponents. */
export function FileTree({
  expanded, defaultExpanded = new Set(), selectedPath, onSelect, onExpandedChange, children, className, ...props
}: FileTreeProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const expandedPaths = expanded ?? internalExpanded
  const togglePath = useCallback((path: string) => {
    const next = new Set(expandedPaths)
    if (next.has(path)) next.delete(path); else next.add(path)
    setInternalExpanded(next)
    onExpandedChange?.(next)
  }, [expandedPaths, onExpandedChange])
  const value = useMemo(() => ({ expandedPaths, onSelect, selectedPath, togglePath }), [expandedPaths, onSelect, selectedPath, togglePath])
  return <FileTreeContext.Provider value={value}><div className={`${css.fileTree} ${className ?? ''}`} role="tree" {...props}>{children}</div></FileTreeContext.Provider>
}

/** Expandable folder row from the AI Elements FileTree composition. */
export function FileTreeFolder({ path, name, children }: { path: string; name: string; children?: ReactNode }) {
  const { expandedPaths, togglePath, selectedPath, onSelect } = useContext(FileTreeContext)
  const open = expandedPaths.has(path)
  return <div role="treeitem" aria-expanded={open}>
    <div className={`${css.fileTreeRow} ${selectedPath === path ? css.fileTreeSelected : ''}`}>
      <button type="button" className={css.fileTreeToggle} aria-label={open ? `Collapse ${name}` : `Expand ${name}`} onClick={() => { togglePath(path) }}><IconChevronRightOutline14 className={`${css.fileTreeChevron} ${open ? css.fileTreeChevronOpen : ''}`} /></button>
      <button type="button" className={css.fileTreeSelect} onClick={() => { onSelect?.(path); togglePath(path) }}>{open ? <IconFolderOpen16 className={css.folderIcon} /> : <IconFolderClose16 className={css.folderIcon} />}<span>{name}</span></button>
    </div>
    {open && <div className={css.fileTreeChildren} role="group">{children}</div>}
  </div>
}

/** Selectable file row from the AI Elements FileTree composition. */
export function FileTreeFile({ path, name, icon }: { path: string; name: string; icon?: ReactNode }) {
  const { selectedPath, onSelect } = useContext(FileTreeContext)
  const activate = (): void => { onSelect?.(path) }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate() } }
  return <div className={`${css.fileTreeFile} ${selectedPath === path ? css.fileTreeSelected : ''}`} role="treeitem" tabIndex={0} onClick={activate} onKeyDown={onKeyDown}><span className={css.fileTreeSpacer} /><span className={css.fileIcon}>{icon ?? <FileIcon />}</span><span>{name}</span></div>
}

function FileIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 1.5H9.3L12.5 4.7V14.5H4C3.2 14.5 2.5 13.8 2.5 13V3C2.5 2.2 3.2 1.5 4 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M9 1.8V5H12.2M5 8H10M5 10.5H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
}

function Entries({ entries }: { entries: WorkspaceEntry[] }) {
  return <>{entries.map(entry => entry.kind === 'directory'
    ? <FileTreeFolder key={entry.path} path={entry.path} name={entry.name}><Entries entries={entry.children ?? []} /></FileTreeFolder>
    : <FileTreeFile
      key={entry.path}
      path={entry.path}
      name={entry.name}
      icon={/\.(?:ts|tsx|js|jsx|css|html|json|ya?ml|md)$/i.test(entry.name) ? <IconCodeOutline16 size={15} /> : undefined}
    />)}</>
}

/** Map desktop workspace entries into the AI Elements FileTree composition. */
export function WorkspaceFileTree({
  entries, selectedPath, onSelect,
}: { entries: WorkspaceEntry[]; selectedPath?: string | undefined; onSelect: (path: string) => void }) {
  const defaultExpanded = useMemo(
    () => new Set(entries.filter(entry => entry.kind === 'directory').slice(0, 2).map(entry => entry.path)),
    [entries],
  )
  return <FileTree defaultExpanded={defaultExpanded} selectedPath={selectedPath} onSelect={onSelect}>
    <Entries entries={entries} />
  </FileTree>
}
