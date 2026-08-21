#!/usr/bin/env node
/**
 * Settings nav icons are hard-coded in @deepseek-ai/dsh-client-ui-settings-general
 * by section id. Unknown ids fall back to the gear. This script maps `about` →
 * IconWarningOutline16 (exclamation / warning glyph from the shared primitives).
 *
 * Re-run after upgrading @deepseek-ai/dsh.
 */
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function resolveSettingsGeneralClient() {
  const dshEntry = process.argv[2] // optional: path to dsh bin or package.json
  const bases = []
  if (typeof dshEntry === 'string' && dshEntry.length > 0) bases.push(dshEntry)
  bases.push('/opt/homebrew/bin/dsh', '/usr/local/bin/dsh')
  for (const base of bases) {
    try {
      const req = createRequire(base)
      const root = dirname(req.resolve('@deepseek-ai/dsh-client-ui-settings-general/package.json'))
      const client = join(root, 'lib', 'client.js')
      if (existsSync(client)) return client
    } catch {
      // try next
    }
  }
  // Fall back: resolve from global dsh package tree
  try {
    const req = createRequire('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json')
    const nested = join(
      dirname(req.resolve('@deepseek-ai/dsh/package.json')),
      'node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js',
    )
    if (existsSync(nested)) return nested
  } catch {
    // ignore
  }
  throw new Error('Could not locate dsh-client-ui-settings-general/lib/client.js')
}

const needle = `if (id === "plugins") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPersonalizationOutline16, {
\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,
\t\t\t\tsize: 16
\t\t\t});
\t\t\treturn (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, {`

const insert = `if (id === "plugins") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPersonalizationOutline16, {
\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,
\t\t\t\tsize: 16
\t\t\t});
\t\t\tif (id === "about") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {
\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,
\t\t\t\tsize: 16
\t\t\t});
\t\t\treturn (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, {`

const file = resolveSettingsGeneralClient()
const text = readFileSync(file, 'utf8')
if (text.includes('id === "about"') && text.includes('IconWarningOutline16')) {
  console.log('already patched:', file)
  process.exit(0)
}
if (!text.includes(needle)) {
  console.error('navIcon pattern not found; dsh UI may have changed:', file)
  process.exit(1)
}
copyFileSync(file, `${file}.bak-about-icon`)
writeFileSync(file, text.replace(needle, insert))
console.log('patched about → IconWarningOutline16:', file)
