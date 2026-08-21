import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  readProfileDependencyNames,
  classifyPluginBuiltin,
  packageNameOfSpecifier,
  repositoryBrowseUrl,
  profileNameFromArgv,
  profileNameFromPluginPath,
  profileNameFromHomeLinks,
  classifyInstall,
  deriveProfileName,
  resolvePluginVersion,
  listInstalledPlugins,
  collectAboutSnapshot,
} from '../collect.js'

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-about-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function writeJson(file, obj) {
  writeFileSync(file, JSON.stringify(obj))
}

describe('packageNameOfSpecifier', () => {
  it('collapses scoped subpaths', () => {
    assert.equal(packageNameOfSpecifier('@scope/pkg'), '@scope/pkg')
    assert.equal(packageNameOfSpecifier('@scope/pkg/client'), '@scope/pkg')
  })

  it('collapses bare subpaths', () => {
    assert.equal(packageNameOfSpecifier('pkg'), 'pkg')
    assert.equal(packageNameOfSpecifier('pkg/startup'), 'pkg')
  })

  it('returns undefined for protocol and malformed specs', () => {
    assert.equal(packageNameOfSpecifier('cordis:include'), undefined)
    assert.equal(packageNameOfSpecifier(''), undefined)
    assert.equal(packageNameOfSpecifier('@scope'), undefined)
    assert.equal(packageNameOfSpecifier('/pkg'), undefined)
  })
})

describe('classifyPluginBuiltin', () => {
  it('is null when profile deps are unknown', () => {
    assert.equal(classifyPluginBuiltin('pkg', undefined), null)
  })

  it('marks protocol specs as builtin', () => {
    assert.equal(classifyPluginBuiltin('cordis:include', new Set()), true)
  })

  it('marks dependency-listed packages as non-builtin', () => {
    assert.equal(classifyPluginBuiltin('user-pkg', new Set(['user-pkg'])), false)
    assert.equal(classifyPluginBuiltin('@scope/pkg', new Set(['@scope/pkg'])), false)
  })

  it('marks unlisted packages as builtin', () => {
    assert.equal(classifyPluginBuiltin('other-pkg', new Set(['user-pkg'])), true)
  })
})

describe('repositoryBrowseUrl', () => {
  it('converts git+ and git:// and strips .git', () => {
    assert.equal(repositoryBrowseUrl({ url: 'git+https://github.com/a/b.git' }), 'https://github.com/a/b')
    assert.equal(repositoryBrowseUrl({ url: 'git://github.com/a/b.git' }), 'https://github.com/a/b')
  })

  it('passes through plain https urls', () => {
    assert.equal(repositoryBrowseUrl({ url: 'https://github.com/a/b' }), 'https://github.com/a/b')
  })

  it('returns undefined for non-convertible values', () => {
    assert.equal(repositoryBrowseUrl({ url: 'github.com/a/b' }), undefined)
    assert.equal(repositoryBrowseUrl({ url: '' }), undefined)
    assert.equal(repositoryBrowseUrl({}), undefined)
    assert.equal(repositoryBrowseUrl(null), undefined)
    assert.equal(repositoryBrowseUrl('x'), undefined)
  })
})

describe('profileNameFromArgv', () => {
  it('reads --profile', () => {
    assert.equal(profileNameFromArgv(['node', 'bin.js', '--profile', 'foo']), 'foo')
  })

  it('reads the web alias', () => {
    assert.equal(profileNameFromArgv(['node', 'bin.js', 'web']), 'web')
  })

  it('returns undefined otherwise', () => {
    assert.equal(profileNameFromArgv(['node', 'bin.js']), undefined)
    assert.equal(profileNameFromArgv(['node', 'bin.js', '--profile']), undefined)
    assert.equal(profileNameFromArgv(['node', 'bin.js', '--profile', '-x']), undefined)
  })
})

describe('profileNameFromPluginPath', () => {
  it('extracts the profile segment', () => {
    assert.equal(
      profileNameFromPluginPath('/home/x/.dsh/profiles/web/node_modules/dsh-settings-about/index.js'),
      'web',
    )
  })

  it('handles backslashes', () => {
    assert.equal(profileNameFromPluginPath('C:\\dsh\\profiles\\web\\index.js'), 'web')
  })

  it('returns undefined without a profiles marker', () => {
    assert.equal(profileNameFromPluginPath('/plain/index.js'), undefined)
    assert.equal(profileNameFromPluginPath('/profiles//index.js'), undefined)
    assert.equal(profileNameFromPluginPath('/profiles/../index.js'), undefined)
  })
})

describe('profileNameFromHomeLinks', () => {
  it('finds a unique matching profile', (t) => {
    const dir = tempDir(t)
    const target = join(dir, 'target')
    mkdirSync(target, { recursive: true })
    const link = join(dir, 'profiles', 'web', 'node_modules', 'dsh-settings-about')
    mkdirSync(join(dir, 'profiles', 'web', 'node_modules'), { recursive: true })
    symlinkSync(target, link)
    const packageRoot = realpathSync(target)
    assert.equal(profileNameFromHomeLinks(dir, packageRoot), 'web')
  })

  it('returns undefined when ambiguous', (t) => {
    const dir = tempDir(t)
    const target = join(dir, 'target')
    mkdirSync(target, { recursive: true })
    for (const name of ['web', 'web2']) {
      const link = join(dir, 'profiles', name, 'node_modules', 'dsh-settings-about')
      mkdirSync(join(dir, 'profiles', name, 'node_modules'), { recursive: true })
      symlinkSync(target, link)
    }
    const packageRoot = realpathSync(target)
    assert.equal(profileNameFromHomeLinks(dir, packageRoot), undefined)
  })

  it('returns undefined when no profiles dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-about-test-'))
    try {
      assert.equal(profileNameFromHomeLinks(join(dir, 'nope'), '/some/root'), undefined)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('classifyInstall', () => {
  it('labels npx cache', () => {
    assert.equal(classifyInstall('/x/.npm/_npx/abc/package.json').kind, 'npx-cache')
  })

  it('labels node_modules dsh', () => {
    assert.equal(classifyInstall('/x/node_modules/@deepseek-ai/dsh/package.json').kind, 'node_modules')
  })

  it('labels anything else as path', () => {
    assert.equal(classifyInstall('/x/foo/package.json').kind, 'path')
  })
})

describe('deriveProfileName', () => {
  it('falls back to the path marker', () => {
    assert.equal(deriveProfileName('/x/profiles/web/index.js', undefined, undefined), 'web')
  })
})

describe('resolvePluginVersion', () => {
  it('resolves a linked package from the profile tree', (t) => {
    const dir = tempDir(t)
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true })
    writeJson(join(dir, 'node_modules', 'pkg', 'package.json'), { name: 'pkg', version: '1.2.3' })
    assert.equal(resolvePluginVersion('pkg', { profileDir: dir }), '1.2.3')
  })

  it('returns null for protocol specs', () => {
    assert.equal(resolvePluginVersion('cordis:include', {}), null)
  })

  it('returns null without anchors', () => {
    assert.equal(resolvePluginVersion('pkg', {}), null)
  })
})

describe('listInstalledPlugins', () => {
  it('projects loader entries with builtin/version/enabled', (t) => {
    const dir = tempDir(t)
    writeJson(join(dir, 'package.json'), { dependencies: { 'user-pkg': '1.0.0' } })
    mkdirSync(join(dir, 'node_modules', 'user-pkg'), { recursive: true })
    writeJson(join(dir, 'node_modules', 'user-pkg', 'package.json'), { name: 'user-pkg', version: '9.9.9' })

    const loader = {
      entries: () => [
        { id: 'p1', options: { name: 'user-pkg' }, fiber: { state: 2 } },
        { id: 'p2', options: { name: 'builtin-pkg' }, disabled: true },
        { id: 'grp', options: { group: true, name: 'grp' } },
        { id: 'p3', options: { name: 'cordis:include' } },
        { options: { name: 'no-id' } },
      ],
    }
    const plugins = listInstalledPlugins(loader, { profileDir: dir })
    assert.equal(plugins.length, 3)

    const p1 = plugins[0]
    assert.equal(p1.entryId, 'p1')
    assert.equal(p1.moduleName, 'user-pkg')
    assert.equal(p1.version, '9.9.9')
    assert.equal(p1.enabled, true)
    assert.equal(p1.fiberPhase, 'active')
    assert.equal(p1.builtin, false)

    const p2 = plugins[1]
    assert.equal(p2.moduleName, 'builtin-pkg')
    assert.equal(p2.version, null)
    assert.equal(p2.enabled, false)
    assert.equal(p2.builtin, true)

    const p3 = plugins[2]
    assert.equal(p3.moduleName, 'cordis:include')
    assert.equal(p3.builtin, true)
    assert.equal(p3.fiberPhase, null)
  })

  it('returns [] for a missing loader', () => {
    assert.deepEqual(listInstalledPlugins(undefined, {}), [])
    assert.deepEqual(listInstalledPlugins({}, {}), [])
  })
})

describe('collectAboutSnapshot', () => {
  it('returns a well-formed snapshot even without dsh', () => {
    const snap = collectAboutSnapshot({ plugins: [] })
    assert.equal(typeof snap.collectedAt, 'string')
    assert.ok(Array.isArray(snap.fields))
    assert.ok(snap.fields.some((f) => f.key === 'node'))
    assert.ok(snap.fields.some((f) => f.key === 'platform'))
    assert.ok(Array.isArray(snap.notes))
    assert.ok(Array.isArray(snap.plugins))
    assert.equal(typeof snap.diagnostics, 'string')
    assert.ok(snap.notes.some((n) => n.includes('Could not resolve @deepseek-ai/dsh')))
  })
})
