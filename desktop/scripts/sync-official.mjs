import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { run, repoRoot } from './process.mjs'

const OFFICIAL_REMOTE = 'upstream'
const OFFICIAL_URL = 'https://github.com/deepseek-ai/deepseek-harness.git'
const OFFICIAL_BRANCH = 'master'
const DESKTOP_BRANCH = 'main'
const repoPath = fileURLToPath(repoRoot)
const upstreamStatePath = resolve(repoPath, 'desktop', 'upstream.json')

async function git(args, options = {}) {
  if (typeof options === 'boolean') options = { capture: options }
  return run('git', args, { cwd: repoPath, ...options })
}

async function readUpstreamState() {
  const state = JSON.parse(await readFile(upstreamStatePath, 'utf8'))
  if (state.repository !== OFFICIAL_URL || state.branch !== OFFICIAL_BRANCH || !/^[0-9a-f]{40}$/.test(state.commit)) {
    throw new Error(`desktop/upstream.json must identify ${OFFICIAL_URL} ${OFFICIAL_BRANCH} with a full commit hash.`)
  }
  return state
}

export async function syncOfficial() {
  const branch = (await git(['branch', '--show-current'], true)).stdout
  if (branch !== DESKTOP_BRANCH) {
    throw new Error(`Official sync requires branch ${DESKTOP_BRANCH}; current branch is ${branch || '(detached)'}.`)
  }

  const status = (await git(['status', '--porcelain'], true)).stdout
  if (status !== '') {
    throw new Error('Official sync requires a clean working directory. Commit or remove local changes first.')
  }

  let remoteUrl
  try {
    remoteUrl = (await git(['remote', 'get-url', OFFICIAL_REMOTE], true)).stdout
  } catch {
    await git(['remote', 'add', OFFICIAL_REMOTE, OFFICIAL_URL])
    remoteUrl = OFFICIAL_URL
  }
  if (!remoteUrl.endsWith('github.com/deepseek-ai/deepseek-harness.git')) {
    throw new Error(`Remote ${OFFICIAL_REMOTE} must point to ${OFFICIAL_URL}; found ${remoteUrl}.`)
  }

  console.log(`Syncing ${OFFICIAL_URL} ${OFFICIAL_BRANCH}...`)
  await git(['fetch', '--no-tags', OFFICIAL_REMOTE, OFFICIAL_BRANCH])
  const state = await readUpstreamState()
  const target = `${OFFICIAL_REMOTE}/${OFFICIAL_BRANCH}`
  const targetCommit = (await git(['rev-parse', target], true)).stdout

  try {
    await git(['merge-base', '--is-ancestor', state.commit, target])
  } catch {
    throw new Error(`Recorded official commit ${state.commit} is not an ancestor of ${target}. Refusing to apply a rewritten upstream history.`)
  }
  if (state.commit === targetCommit) {
    console.log('Official source is already current.')
    return
  }

  try {
    const patch = (await git([
      'diff', '--binary', '--full-index', state.commit, target,
    ], { capture: true, trimOutput: false })).stdout
    if (patch !== '') {
      await git(['apply', '--index', '--3way', '--whitespace=nowarn', '-'], { input: patch })
    }
    await writeFile(upstreamStatePath, `${JSON.stringify({ ...state, commit: targetCommit }, null, 2)}\n`)
    await git(['add', '--', 'desktop/upstream.json'])
    await git(['commit', '-m', `chore: sync official master to ${targetCommit.slice(0, 12)}`])
  } catch (error) {
    try {
      await git(['restore', '--source=HEAD', '--staged', '--worktree', '--', '.'])
    } catch {
      // The original synchronization failure remains the actionable error.
    }
    throw new Error(`Official update could not be applied automatically. The attempted update was rolled back.\n${error instanceof Error ? error.message : String(error)}`)
  }
  console.log(`Official source updated to ${targetCommit}.`)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await syncOfficial()
}
