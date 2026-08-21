/**
 * Host half: expose a read-only About snapshot over HTTP for the settings UI.
 * Values come only from collectAboutSnapshot (running process + official APIs).
 */
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectAboutSnapshot,
  deriveProfileName,
  listInstalledPlugins,
  loadHomePaths,
  resolveRunningDshPackage,
} from './collect.js'

export const name = 'settings-about'

/**
 * Resolve profile dir + running dsh package.json for version lookups.
 * @param {string} selfPath
 * @returns {{ dshPackageJsonPath?: string, profileDir?: string }}
 */
function versionAnchors(selfPath) {
  const running = resolveRunningDshPackage()
  /** @type {{ dshPackageJsonPath?: string, profileDir?: string }} */
  const anchors = {}
  if (running !== undefined) anchors.dshPackageJsonPath = running.path

  /** @type {string | undefined} */
  let resolvedHome
  if (running !== undefined) {
    try {
      resolvedHome = loadHomePaths(running.path)?.resolveDshHome()
    } catch {
      resolvedHome = undefined
    }
  }

  /** @type {string | undefined} */
  let packageRootReal
  try {
    packageRootReal = realpathSync(dirname(selfPath))
  } catch {
    packageRootReal = undefined
  }

  const profile = deriveProfileName(selfPath, resolvedHome, packageRootReal)

  if (typeof resolvedHome === 'string' && typeof profile === 'string') {
    anchors.profileDir = join(resolvedHome, 'profiles', profile)
  }
  return anchors
}

/** Soft-wait for webServer + loader; headless profiles simply skip the route. */
export function apply(ctx) {
  const selfPath = fileURLToPath(import.meta.url)

  ctx.inject(['webServer', 'loader'], (wctx) => {
    wctx.effect(() =>
      wctx.webServer.register({
        kind: 'exact',
        path: '/dsh-about/info',
        handler(_req, res) {
          const anchors = versionAnchors(selfPath)
          const snapshot = collectAboutSnapshot({
            selfPath,
            listen: {
              host: wctx.webServer.host,
              port: wctx.webServer.port,
            },
            plugins: listInstalledPlugins(wctx.loader, anchors),
          })
          const body = JSON.stringify(snapshot)
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(body)
        },
      }),
    )
  })
}
