/**
 * Collect About diagnostics from the *running* dsh process only.
 * Never guess homebrew vs npx paths; never invent missing fields.
 * @module dsh-settings-about/collect
 */
import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @typedef {object} AboutField
 * @property {string} key
 * @property {string} label
 * @property {string} value
 */

/**
 * @typedef {object} AboutLink
 * @property {string} label
 * @property {string} url
 */

/**
 * @typedef {object} InstalledPlugin
 * @property {string} entryId
 * @property {string} moduleName
 * @property {string | null} version From that package's package.json when resolvable; null otherwise
 * @property {boolean} enabled
 * @property {string | null} fiberPhase
 */

/**
 * @typedef {object} AboutSnapshot
 * @property {string} collectedAt ISO timestamp when this snapshot was built
 * @property {AboutField[]} fields Fields safe to render in the settings UI
 * @property {AboutLink[]} links
 * @property {InstalledPlugin[]} plugins Loader inventory at collect time (may be empty)
 * @property {string} diagnostics Plain-text block for copy/paste (may include absolute paths)
 * @property {string[]} notes Human-readable notes about unresolved items
 */

/**
 * @param {string} path
 * @returns {Record<string, unknown> | undefined}
 */
function readPackageJson(path) {
  if (!existsSync(path)) return undefined
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve the package.json of the dsh installation that launched this process.
 *
 * Prefer the same relative read as `@deepseek-ai/dsh` `lib/bin.js`:
 * `dirname(realpath(process.argv[1]))/../package.json`.
 * Fall back to `createRequire(entry).resolve('@deepseek-ai/dsh/package.json')`.
 * Never consult a hard-coded homebrew or npx path.
 *
 * @returns {{ path: string, pkg: Record<string, unknown> } | undefined}
 */
export function resolveRunningDshPackage() {
  const entry = process.argv[1]
  if (typeof entry !== 'string' || entry.length === 0) return undefined
  let absoluteEntry
  try {
    absoluteEntry = realpathSync(entry)
  } catch {
    absoluteEntry = entry
  }

  const siblingPath = join(dirname(absoluteEntry), '..', 'package.json')
  const siblingPkg = readPackageJson(siblingPath)
  if (siblingPkg?.name === '@deepseek-ai/dsh') {
    return { path: siblingPath, pkg: siblingPkg }
  }

  try {
    const requireFromEntry = createRequire(absoluteEntry)
    const path = requireFromEntry.resolve('@deepseek-ai/dsh/package.json')
    const pkg = readPackageJson(path)
    if (pkg === undefined || pkg.name !== '@deepseek-ai/dsh') return undefined
    return { path, pkg }
  } catch {
    return undefined
  }
}

/**
 * @param {string} dshPackageJsonPath
 * @returns {{ resolveDshHome: (configured?: string, env?: Record<string, string | undefined>) => string, dshHomeDisplay: (resolvedHome: string) => string } | undefined}
 */
function loadHomePaths(dshPackageJsonPath) {
  try {
    return createRequire(dshPackageJsonPath)('@deepseek-ai/dsh-home-paths')
  } catch {
    return undefined
  }
}

/**
 * Derive an https URL from npm `repository.url` when possible.
 * Returns undefined when missing or not convertible — never invents a URL.
 * @param {unknown} repository
 * @returns {string | undefined}
 */
export function repositoryBrowseUrl(repository) {
  if (repository === null || typeof repository !== 'object' || Array.isArray(repository)) {
    return undefined
  }
  const url = /** @type {{ url?: unknown }} */ (repository).url
  if (typeof url !== 'string' || url.trim() === '') return undefined
  let next = url.trim()
  if (next.startsWith('git+')) next = next.slice(4)
  if (next.startsWith('git://')) next = `https://${next.slice(6)}`
  if (next.endsWith('.git')) next = next.slice(0, -4)
  if (!/^https?:\/\//i.test(next)) return undefined
  return next
}

/**
 * Detect profile name from a path that still contains `.../profiles/<name>/...`
 * (works for logical node_modules paths; fails after realpath through a link).
 * @param {string} selfPath
 * @returns {string | undefined}
 */
export function profileNameFromPluginPath(selfPath) {
  const normalized = selfPath.split(/[/\\]/).join('/')
  const marker = '/profiles/'
  const idx = normalized.lastIndexOf(marker)
  if (idx < 0) return undefined
  const name = normalized.slice(idx + marker.length).split('/')[0]
  if (typeof name !== 'string' || name.length === 0 || name === '.' || name === '..') {
    return undefined
  }
  return name
}

/**
 * Profile from launcher argv: `--profile <name>` or the `web` subcommand alias.
 * @param {string[]} [argv]
 * @returns {string | undefined}
 */
export function profileNameFromArgv(argv = process.argv) {
  const flag = argv.indexOf('--profile')
  if (flag >= 0) {
    const name = argv[flag + 1]
    if (typeof name === 'string' && name.length > 0 && !name.startsWith('-')) return name
  }
  // `dsh web ...` → argv[1] is bin.js, argv[2] is `web`
  const afterEntry = argv.slice(2)
  if (afterEntry[0] === 'web') return 'web'
  return undefined
}

/**
 * When the package is `link:`'d, import.meta.url realpaths outside profiles/.
 * Match which profile's node_modules/dsh-settings-about points at this package root.
 * @param {string} resolvedHome Absolute DSH home
 * @param {string} packageRoot Absolute directory of this package (realpath)
 * @returns {string | undefined}
 */
export function profileNameFromHomeLinks(resolvedHome, packageRoot) {
  const profilesDir = join(resolvedHome, 'profiles')
  if (!existsSync(profilesDir)) return undefined
  let names
  try {
    names = readdirSync(profilesDir)
  } catch {
    return undefined
  }
  /** @type {string[]} */
  const matches = []
  for (const name of names) {
    if (name === '.' || name === '..') continue
    const candidate = join(profilesDir, name, 'node_modules', 'dsh-settings-about')
    try {
      if (realpathSync(candidate) === packageRoot) matches.push(name)
    } catch {
      // absent or unreadable — skip
    }
  }
  return matches.length === 1 ? matches[0] : undefined
}

/**
 * Classify install layout from a real resolved path. Labels only when unambiguous.
 * @param {string} packageJsonPath
 * @returns {{ kind: string, path: string }}
 */
export function classifyInstall(packageJsonPath) {
  const normalized = packageJsonPath.split(/[/\\]/).join('/')
  if (normalized.includes('/.npm/_npx/')) {
    return { kind: 'npx-cache', path: packageJsonPath }
  }
  if (normalized.includes('/node_modules/@deepseek-ai/dsh/package.json')) {
    // Could be global, prefix, or a project — report kind loosely; path is authoritative.
    return { kind: 'node_modules', path: packageJsonPath }
  }
  return { kind: 'path', path: packageJsonPath }
}

/**
 * Mirror of dsh-host-plugin-inventory FiberState → phase labels.
 * Keep in sync with @deepseek-ai/dsh-host-plugin-inventory (pending/loading/active/failed/unloading).
 */
const FIBER_STATE = {
  PENDING: 0,
  LOADING: 1,
  ACTIVE: 2,
  FAILED: 3,
  DISPOSED: 4,
  UNLOADING: 5,
}

const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
}

/**
 * Derive the npm package name from a Loader module specifier.
 * Subpaths (`pkg/startup`, `@scope/pkg/client`) collapse to the package root.
 * Protocol builtins (`cordis:include`) have no package and return undefined.
 * @param {string} specifier
 * @returns {string | undefined}
 */
export function packageNameOfSpecifier(specifier) {
  if (typeof specifier !== 'string' || specifier.length === 0) return undefined
  if (specifier.includes(':') && !specifier.startsWith('@')) return undefined
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    if (parts.length < 2 || parts[0].length < 2 || parts[1].length === 0) return undefined
    return `${parts[0]}/${parts[1]}`
  }
  const name = specifier.split('/')[0]
  return name.length > 0 ? name : undefined
}

/**
 * Read `version` from a package.json resolved through Node's algorithm from `fromFile`.
 * Returns undefined when unresolvable — never invents a version.
 * @param {string} packageName
 * @param {string} fromFile Absolute file path used as createRequire anchor
 * @returns {string | undefined}
 */
function readPackageVersionFrom(fromFile, packageName) {
  let req
  try {
    req = createRequire(fromFile)
  } catch {
    return undefined
  }
  try {
    const pkgPath = req.resolve(`${packageName}/package.json`)
    const pkg = readPackageJson(pkgPath)
    return typeof pkg?.version === 'string' ? pkg.version : undefined
  } catch {
    // Some packages omit exports["./package.json"]; resolve entry and walk up.
  }
  try {
    let dir = dirname(req.resolve(packageName))
    for (let i = 0; i < 8; i++) {
      const pkg = readPackageJson(join(dir, 'package.json'))
      if (pkg?.name === packageName && typeof pkg.version === 'string') return pkg.version
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    return undefined
  }
  return undefined
}

/**
 * Resolve a plugin package version: dsh installation first, then the profile tree
 * (same install-first order as in-box bundle resolution).
 * @param {string} moduleName
 * @param {{ dshPackageJsonPath?: string, profileDir?: string }} anchors
 * @returns {string | null}
 */
export function resolvePluginVersion(moduleName, anchors = {}) {
  const packageName = packageNameOfSpecifier(moduleName)
  if (packageName === undefined) return null
  const { dshPackageJsonPath, profileDir } = anchors
  if (typeof dshPackageJsonPath === 'string') {
    const fromDsh = readPackageVersionFrom(dshPackageJsonPath, packageName)
    if (fromDsh !== undefined) return fromDsh
  }
  if (typeof profileDir === 'string') {
    const profilePkg = join(profileDir, 'package.json')
    if (existsSync(profilePkg)) {
      const fromProfile = readPackageVersionFrom(profilePkg, packageName)
      if (fromProfile !== undefined) return fromProfile
    }
    const linked = join(profileDir, 'node_modules', ...packageName.split('/'), 'package.json')
    const pkg = readPackageJson(linked)
    if (pkg?.name === packageName && typeof pkg.version === 'string') return pkg.version
  }
  return null
}

/**
 * Read the live Cordis Loader inventory (same projection as pluginInventory.list),
 * plus package.json version when it can be resolved from the running install/profile.
 * @param {{ entries?: () => Iterable<{ id: string, disabled?: boolean, options: { group?: boolean, name?: string }, fiber?: { state: number } }> }} loader
 * @param {{ dshPackageJsonPath?: string, profileDir?: string }} [anchors]
 * @returns {InstalledPlugin[]}
 */
export function listInstalledPlugins(loader, anchors = {}) {
  if (loader === undefined || loader === null || typeof loader.entries !== 'function') return []
  /** @type {Map<string, string | null>} */
  const versionCache = new Map()
  /** @type {InstalledPlugin[]} */
  const plugins = []
  for (const entry of loader.entries()) {
    if (entry?.options?.group) continue
    const moduleName = entry?.options?.name
    const entryId = entry?.id
    if (typeof entryId !== 'string' || typeof moduleName !== 'string') continue
    const state = entry.fiber?.state
    const fiberPhase =
      entry.fiber === undefined || typeof state !== 'number'
        ? null
        : (FIBER_PHASE[state] ?? null)
    const packageName = packageNameOfSpecifier(moduleName) ?? moduleName
    let version
    if (versionCache.has(packageName)) {
      version = versionCache.get(packageName) ?? null
    } else {
      version = resolvePluginVersion(moduleName, anchors)
      versionCache.set(packageName, version)
    }
    plugins.push({
      entryId,
      moduleName,
      version,
      enabled: !entry.disabled,
      fiberPhase,
    })
  }
  return plugins
}

/**
 * @param {object} [options]
 * @param {string} [options.selfPath]
 * @param {{ host?: string, port?: number }} [options.listen]
 * @param {InstalledPlugin[]} [options.plugins] Pre-collected loader inventory (omit when unavailable)
 * @returns {AboutSnapshot}
 */
export function collectAboutSnapshot(options = {}) {
  /** @type {AboutField[]} */
  const fields = []
  /** @type {AboutLink[]} */
  const links = []
  /** @type {string[]} */
  const notes = []
  /** @type {string[]} */
  const diagnosticExtras = []

  const push = (key, label, value) => {
    if (typeof value !== 'string' || value.length === 0) return
    fields.push({ key, label, value })
  }

  const selfPath = options.selfPath ?? fileURLToPath(import.meta.url)
  const running = resolveRunningDshPackage()
  /** @type {string | undefined} */
  let resolvedHome

  if (running === undefined) {
    notes.push('Could not resolve @deepseek-ai/dsh from process.argv[1]; version and package metadata omitted.')
  } else {
    const { path: pkgPath, pkg } = running
    if (typeof pkg.version === 'string') push('dshVersion', 'dsh version', pkg.version)
    if (typeof pkg.name === 'string') push('packageName', 'Package', pkg.name)
    if (typeof pkg.description === 'string') push('description', 'Description', pkg.description)
    if (typeof pkg.license === 'string') push('license', 'License', pkg.license)

    const install = classifyInstall(pkgPath)
    push('installKind', 'Install kind', install.kind)
    push('installPath', 'Install package.json', install.path)

    const browse = repositoryBrowseUrl(pkg.repository)
    if (browse !== undefined) {
      links.push({ label: 'dsh', url: browse })
      const directory =
        pkg.repository !== null
        && typeof pkg.repository === 'object'
        && !Array.isArray(pkg.repository)
        && typeof /** @type {{ directory?: unknown }} */ (pkg.repository).directory === 'string'
          ? /** @type {{ directory: string }} */ (pkg.repository).directory
          : undefined
      if (directory !== undefined) push('repoDirectory', 'Repository directory', directory)
    } else {
      notes.push('package.json has no convertible repository.url; repository link omitted.')
    }

    const homePaths = loadHomePaths(pkgPath)
    if (homePaths === undefined) {
      notes.push('Could not load @deepseek-ai/dsh-home-paths from the running dsh install; DSH_HOME omitted.')
    } else {
      try {
        resolvedHome = homePaths.resolveDshHome()
        push('dshHome', 'DSH_HOME', homePaths.dshHomeDisplay(resolvedHome))
        diagnosticExtras.push(`dshHomeResolved: ${resolvedHome}`)
      } catch (error) {
        notes.push(`resolveDshHome failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  push('node', 'Node.js', process.version)
  push('platform', 'Platform', `${process.platform}-${process.arch}`)

  const packageRoot = dirname(fileURLToPath(import.meta.url))
  /** @type {string | undefined} */
  let packageRootReal
  try {
    packageRootReal = realpathSync(packageRoot)
  } catch {
    packageRootReal = undefined
  }
  const profile =
    profileNameFromArgv()
    ?? profileNameFromPluginPath(selfPath)
    ?? (typeof resolvedHome === 'string' && packageRootReal !== undefined
      ? profileNameFromHomeLinks(resolvedHome, packageRootReal)
      : undefined)

  if (profile === undefined) {
    notes.push('Profile name unresolved (no --profile/web argv, path marker, or unique home link).')
  } else {
    push('profile', 'Profile', profile)
    if (typeof resolvedHome === 'string') {
      const manifestPath = join(resolvedHome, 'profiles', profile, 'package.json')
      const manifest = readPackageJson(manifestPath)
      const bundles = manifest?.dsh
        && typeof manifest.dsh === 'object'
        && !Array.isArray(manifest.dsh)
        && /** @type {{ profile?: { bundles?: unknown } }} */ (manifest.dsh).profile
        && Array.isArray(/** @type {{ profile: { bundles?: unknown } }} */ (manifest.dsh).profile.bundles)
        ? /** @type {{ profile: { bundles: unknown[] } }} */ (manifest.dsh).profile.bundles
          .filter((b) => typeof b === 'string')
        : undefined
      if (bundles === undefined) {
        notes.push(`Could not read dsh.profile.bundles from ${manifestPath}.`)
      } else {
        push('bundles', 'Bundles', bundles.join(', '))
      }
    }
  }

  const listen = options.listen
  if (
    listen !== undefined
    && typeof listen.host === 'string'
    && typeof listen.port === 'number'
    && Number.isFinite(listen.port)
  ) {
    push('listen', 'Listen', `${listen.host}:${listen.port}`)
  }

  const ownPkg = readPackageJson(join(dirname(fileURLToPath(import.meta.url)), 'package.json'))
  if (typeof ownPkg?.version === 'string' && typeof ownPkg?.name === 'string') {
    push('aboutPlugin', 'About plugin', `${ownPkg.name}@${ownPkg.version}`)
  }
  // Below the dsh repo link: this plugin's own GitHub URL from its package.json.
  const aboutBrowse =
    ownPkg !== undefined ? repositoryBrowseUrl(ownPkg.repository) : undefined
  if (aboutBrowse !== undefined) {
    links.push({
      label: typeof ownPkg?.name === 'string' ? ownPkg.name : 'dsh-settings-about',
      url: aboutBrowse,
    })
  } else if (ownPkg !== undefined) {
    notes.push('About plugin package.json has no convertible repository.url; plugin repo link omitted.')
  }

  /** @type {InstalledPlugin[]} */
  const plugins = Array.isArray(options.plugins) ? options.plugins : []
  if (!Array.isArray(options.plugins)) {
    notes.push('Installed plugins omitted: host did not supply loader inventory.')
  } else {
    push('pluginCount', 'Installed plugins', String(plugins.length))
  }

  const collectedAt = new Date().toISOString()
  const diagnostics = [
    '# dsh about diagnostics',
    `collectedAt: ${collectedAt}`,
    ...fields.map((f) => `${f.key}: ${f.value}`),
    ...diagnosticExtras,
    ...links.map((l) => `link.${l.label}: ${l.url}`),
    ...notes.map((n) => `note: ${n}`),
    'plugins:',
    ...plugins.map((p) =>
      `  - ${p.entryId}\t${p.moduleName}\tversion=${p.version ?? 'null'}\tenabled=${p.enabled}\tphase=${p.fiberPhase ?? 'null'}`
    ),
    '',
  ].join('\n')

  return {
    collectedAt,
    fields,
    links,
    plugins,
    diagnostics,
    notes,
  }
}
