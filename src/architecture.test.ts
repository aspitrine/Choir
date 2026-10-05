import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'

// Dependency rules of the hexagonal, feature-sliced layout (see README).
// Tests are exempt: they wire layers together on purpose.

const root = join(__dirname, '..')

function files(dir: string): Array<string> {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** Import specifiers of a file, relative ones resolved to `src/...` paths. */
function imports(file: string) {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s+'([^']+)'/g)].map(([, spec]) =>
    spec!.startsWith('.') ? `@/${relative(join(root, 'src'), normalize(join(dirname(file), spec!)))}` : spec!,
  )
}

const src = (path: string) => relative(root, path)
const layerOf = (spec: string) => spec.match(/^@\/features\/[\w-]+\/(domain|application|infrastructure|server|ui)\b/)?.[1]

type Rule = { files: RegExp; forbid: Array<RegExp>; why: string }

const rules: Array<Rule> = [
  {
    files: /^src\/features\/[\w-]+\/domain\//,
    forbid: [/^@\/features\/[\w-]+\/(application|infrastructure|server|ui)\b/, /^@\/(app|shared\/(application|infrastructure|server|ui))\b/, /^(react|drizzle-orm|better-auth|@tanstack|@aws-sdk|pg)\b/, /^node:/],
    why: 'the domain is pure: no I/O, framework or outer layer',
  },
  {
    files: /^src\/features\/[\w-]+\/application\//,
    forbid: [/^@\/features\/[\w-]+\/(infrastructure|server|ui)\b/, /^@\/(app|shared\/(infrastructure|server|ui))\b/, /^(react|drizzle-orm|better-auth|@tanstack|@aws-sdk|pg)\b/],
    why: 'use cases only talk to ports, never to adapters or frameworks',
  },
  {
    files: /^src\/features\/[\w-]+\/infrastructure\//,
    forbid: [/^@\/features\/[\w-]+\/(server|ui)\b/, /^@\/app\b/, /^react\b/],
    why: 'adapters implement ports; they are not driven by the UI',
  },
  {
    files: /^src\/features\/[\w-]+\/server\//,
    forbid: [/^@\/features\/[\w-]+\/(infrastructure|ui)\b/, /^react\b/],
    why: 'server functions decode input and run use cases; wiring lives in app/runtime',
  },
  {
    files: /^src\/features\/[\w-]+\/ui\//,
    forbid: [/^@\/features\/[\w-]+\/(application|infrastructure)\b/, /^@\/(app|shared\/(application|infrastructure))\b/, /^(drizzle-orm|pg|@aws-sdk)\b/, /^better-auth$/],
    why: 'the UI reaches the backend only through server functions',
  },
  {
    files: /^src\/shared\//,
    forbid: [/^@\/(features|app)\b/],
    why: 'the shared kernel knows no feature',
  },
]

describe('architecture', () => {
  const all = files(join(root, 'src')).map((path) => ({ path: src(path), imports: imports(path) }))

  it.each(rules.map((r) => [r.why, r] as const))('%s', (_why, rule) => {
    const violations = all
      .filter((f) => rule.files.test(f.path))
      .flatMap((f) => f.imports.filter((i) => rule.forbid.some((re) => re.test(i))).map((i) => `${f.path} → ${i}`))
    expect(violations).toEqual([])
  })

  it('keeps routes thin: pages live in features', () => {
    const fat = all
      .filter((f) => f.path.startsWith('src/routes/') && !f.path.endsWith('__root.tsx'))
      .filter((f) => /\nfunction [A-Z]/.test(readFileSync(join(root, f.path), 'utf8')))
      .map((f) => f.path)
    expect(fat).toEqual([])
  })

  it('only the composition root picks adapters', () => {
    const wiring = all
      .filter((f) => !f.path.startsWith('src/app/') && !f.path.startsWith('src/test/'))
      .filter((f) => f.imports.some((i) => layerOf(i) === 'infrastructure' && /drizzle-.*-repository|better-auth-(session|organization)/.test(i)))
      .filter((f) => !/\/infrastructure\//.test(f.path))
      .map((f) => f.path)
    expect(wiring).toEqual([])
  })
})
