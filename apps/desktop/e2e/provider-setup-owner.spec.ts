/**
 * Provider setup must keep the Settings owner's gateway AND profile.
 * Setup surface: Providers -> Custom Endpoints. The API-keys "Local / custom
 * endpoint" row left with the onboarding carve (d28ab1995a); the Custom
 * Endpoints page is the surviving owner-scoped setup form, and it writes over
 * the gateway's REST control plane rather than the old Connect flow's socket
 * RPCs - so ownership is proven on disk: the write must land in the owning
 * gateway's owning profile's config.yaml and nowhere else.
 * Two real serve backends; only OpenAI-compatible model discovery is a fixture.
 * Build dist/ separately, then run this spec with HERMES_DESKTOP_PYTHON pointing
 * at a dependency-complete interpreter. No OAuth account or inference is used.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as net from 'node:net'
import * as path from 'node:path'

import { createSandbox, findElectron, type Sandbox } from './fixtures'
import {
  _electron,
  collectErrorBanners,
  type ElectronApplication,
  expect,
  installErrorBannerGuard,
  type Page,
  test
} from './test'

const DESKTOP_ROOT = path.resolve(import.meta.dirname, '..')
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..', '..')
const REMOTE_ID = 'athena-fixture'
const REMOTE_LABEL = 'Athena fixture'
const PROFILE = 'leverage-ai'
const REMOTE_TOKEN = 'provider-owner-fixture-token'
const ENDPOINT_ID = 'e2e-fixture'
const ENDPOINT_NAME = 'E2E fixture endpoint'

function isolatedEnv(home: string, hermesHome: string): Record<string, string> {
  // Allowlist rather than inheriting real provider keys, profile selection,
  // browser account state, live desktop overrides, or the host session bus.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    USERPROFILE: home,
    HERMES_HOME: hermesHome,
    PYTHONPATH: REPO_ROOT,
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    TMPDIR: process.env.TMPDIR ?? path.dirname(home),
    LANG: 'C.UTF-8',
    TZ: 'UTC',
    XDG_SESSION_TYPE: 'x11',
    ELECTRON_OZONE_PLATFORM_HINT: 'x11'
  }

  for (const key of ['DISPLAY', 'XAUTHORITY', 'TEST_WORKER_INDEX', 'SYSTEMROOT', 'WINDIR']) {
    if (process.env[key]) {
      env[key] = process.env[key]!
    }
  }

  for (const kind of ['CONFIG', 'CACHE', 'DATA', 'STATE', 'RUNTIME']) {
    const dir = path.join(home, `xdg-${kind.toLowerCase()}`)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    env[`XDG_${kind}_${kind === 'RUNTIME' ? 'DIR' : 'HOME'}`] = dir
  }

  // Windows: Electron derives userData from USERPROFILE\AppData\Roaming; a
  // fresh sandbox home must contain that subtree or app.getPath('userData')
  // throws during main-process load and hangs electron.launch.
  if (process.platform === 'win32') {
    for (const sub of ['AppData/Roaming', 'AppData/Local']) {
      fs.mkdirSync(path.join(home, ...sub.split('/')), { recursive: true, mode: 0o700 })
    }
  }

  return env
}

function pythonBinary(): string {
  const python =
    process.env.HERMES_DESKTOP_PYTHON ??
    path.join(REPO_ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

  if (!fs.existsSync(python)) {
    throw new Error('Set HERMES_DESKTOP_PYTHON to an isolated dependency-complete interpreter')
  }

  return python
}

function verifyImports(python: string, env: Record<string, string>): string {
  const probe = spawnSync(
    python,
    [
      '-c',
      [
        'import json, pathlib, sys',
        'import hermes_cli.main, hermes_cli.web_server, tui_gateway.server',
        'root = pathlib.Path.cwd().resolve()',
        'paths = {name: str(pathlib.Path(sys.modules[name].__file__).resolve()) for name in ("hermes_cli.main", "hermes_cli.web_server", "tui_gateway.server")}',
        'assert all(pathlib.Path(p).is_relative_to(root) for p in paths.values()), paths',
        'sys.__stdout__.write(json.dumps(paths))'
      ].join('\n')
    ],
    { cwd: REPO_ROOT, env, encoding: 'utf8', timeout: 60_000 }
  )

  expect(probe.status, probe.stderr).toBe(0)

  return probe.stdout
}

function seedConfig(home: string, endpoint: string, model: string): void {
  fs.mkdirSync(home, { recursive: true })
  // JSON is YAML, and these fixtures need no secret file at all.
  fs.writeFileSync(
    path.join(home, 'config.yaml'),
    JSON.stringify(
      {
        model: { provider: 'custom', default: model, base_url: `${endpoint}/v1` },
        auxiliary: { title_generation: { enabled: false } }
      },
      null,
      2
    )
  )
}

function configModel(python: string, env: Record<string, string>, home: string): unknown {
  const read = spawnSync(
    python,
    [
      '-c',
      // The runtime pins pyyaml off (pyproject) and reads config with ruamel; the
      // probe must use the same YAML lib the venv actually ships.
      'import json, pathlib, sys; from ruamel.yaml import YAML; print(json.dumps(YAML(typ="safe").load(pathlib.Path(sys.argv[1]).read_text())["model"]))',
      path.join(home, 'config.yaml')
    ],
    { cwd: REPO_ROOT, env, encoding: 'utf8', timeout: 10_000 }
  )

  expect(read.status, read.stderr).toBe(0)

  return JSON.parse(read.stdout)
}

async function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port))
  })
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function startRemote(python: string, env: Record<string, string>, logPath: string) {
  const reservation = net.createServer()
  const port = await listen(reservation)
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const url = `http://127.0.0.1:${port}`
  const log = fs.openSync(logPath, 'w')

  const child = spawn(
    python,
    ['-m', 'hermes_cli.main', 'serve', '--isolated', '--host', '127.0.0.1', '--port', String(port), '--skip-build'],
    {
      cwd: REPO_ROOT,
      env: { ...env, HERMES_DASHBOARD_SESSION_TOKEN: REMOTE_TOKEN },
      stdio: ['ignore', log, log]
    }
  )

  fs.closeSync(log)

  try {
    await expect
      .poll(
        async () => {
          if (child.exitCode !== null) {
            throw new Error(`Remote serve exited: ${child.exitCode}; see ${logPath}`)
          }

          return fetch(`${url}/api/status`, {
            headers: { 'X-Hermes-Session-Token': REMOTE_TOKEN },
            signal: AbortSignal.timeout(2_000)
          })
            .then(response => response.status)
            .catch(() => 0)
        },
        { timeout: 90_000, intervals: [200, 500, 1000] }
      )
      .toBe(200)
  } catch (error) {
    await stopChild(child)
    throw error
  }

  return { url, child }
}

const gatewayGroup = (page: Page, id: string) =>
  page.locator(`[data-slot="profile-rail-gateway"][data-connection-id="${id}"]`)

async function selectGateway(page: Page, id: string, label: string, profile: string): Promise<void> {
  const group = gatewayGroup(page, id)
  await expect(group).toBeVisible({ timeout: 60_000 })
  // Re-homing onto This device is confirmed first (d45d6f0eb9): the switch
  // replaces the center with a fresh session, so the prompt - not the pill -
  // is what a move from another gateway lands on. Re-picking a profile on the
  // gateway you're already on never prompts.
  const currentGateway = await page.getByRole('button', { name: /^Registered gateways: / }).getAttribute('aria-label')
  const reHoming = id === 'local' && currentGateway !== `Registered gateways: ${label}`

  // At rest, a gateway's default face is its home/local pill - a different
  // label from the named squares; named profiles read `<profile> · <label>`.
  const square =
    id === 'local' && profile === 'default'
      ? group.locator('[data-slot="profile-rail-local-device"]')
      : group.getByRole('button', { name: `${profile} · ${label}`, exact: true })

  await square.click()

  if (reHoming) {
    await page
      .getByRole('dialog', { name: 'Switch to This device?' })
      .getByRole('button', { name: 'Switch', exact: true })
      .click()
  }

  await expect(page.getByRole('button', { name: /^Registered gateways: / })).toHaveAttribute(
    'aria-label',
    `Registered gateways: ${label}`,
    { timeout: 90_000 }
  )
  await expect(group).toHaveAttribute('data-active', 'true')
  await expect(group.getByRole('button', { name: profile, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-slot="statusbar"]').getByText('ready', { exact: true })).toBeVisible({
    timeout: 60_000
  })
}

/**
 * Providers -> Custom Endpoints. The Add Endpoint form is the page's
 * load-bearing surface, so assert it rather than the nav selection alone.
 */
async function openCustomEndpoints(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByRole('button', { name: 'Providers', exact: true }).click()
  await page.getByRole('button', { name: 'Custom Endpoints', exact: true }).click()
  await expect(page.getByPlaceholder('http://127.0.0.1:8081/v1')).toBeVisible()
}

/**
 * Save the fixture endpoint as the active profile's default model route.
 * "Use for new chats" stays at its default (checked) so the save also switches
 * the owning profile's model - the write this spec's ownership assertions watch
 * for. Re-saving with the same Provider ID updates the entry in place.
 */
async function saveFixtureEndpoint(page: Page, endpointUrl: string, model: string): Promise<void> {
  await page.getByPlaceholder('Axet Proxy').fill(ENDPOINT_NAME)
  await page.getByPlaceholder('axet-proxy').fill(ENDPOINT_ID)
  await page.getByPlaceholder('http://127.0.0.1:8081/v1').fill(`${endpointUrl}/v1`)
  await page.getByPlaceholder('gpt-5.4').fill(model)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  // The row above the form is the save landing; the config poll below is the
  // ownership assertion that actually carries the test.
  await expect(page.getByRole('button', { name: ENDPOINT_NAME })).toBeVisible({ timeout: 45_000 })
}

test('Settings provider setup stays on its gateway/profile across A → B → A', async () => {
  test.setTimeout(300_000)
  const original = createSandbox('provider-owner')
  const localHome = path.join(original.root, 'local')
  const remoteHome = path.join(original.root, 'remote')
  const sandbox: Sandbox = { ...original, hermesHome: path.join(localHome, '.hermes') }
  const remoteHermesHome = path.join(remoteHome, '.hermes')
  const remoteProfileHome = path.join(remoteHermesHome, 'profiles', PROFILE)
  const python = pythonBinary()
  const localEnv = isolatedEnv(localHome, sandbox.hermesHome)
  const remoteEnv = isolatedEnv(remoteHome, remoteHermesHome)
  const discoveryRequests: string[] = []
  let advertisedModel = 'remote-first'

  const endpoint = http.createServer((request, response) => {
    discoveryRequests.push(request.url ?? '')
    // Discovery only. An unexpected inference request must not look successful.
    response.writeHead(request.url === '/v1/models' ? 200 : 404, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify(
        request.url === '/v1/models'
          ? { object: 'list', data: [{ id: advertisedModel, object: 'model', owned_by: 'e2e-fixture' }] }
          : { error: 'This regression fixture only serves model discovery' }
      )
    )
  })

  let app: ElectronApplication | undefined
  let page: Page | undefined
  let remote: Awaited<ReturnType<typeof startRemote>> | undefined

  try {
    const endpointUrl = `http://127.0.0.1:${await listen(endpoint)}`
    seedConfig(sandbox.hermesHome, endpointUrl, 'local-sentinel')
    seedConfig(remoteHermesHome, endpointUrl, 'remote-default-sentinel')
    seedConfig(remoteProfileHome, endpointUrl, 'remote-before-setup')
    await test
      .info()
      .attach('worktree-imports', { body: verifyImports(python, remoteEnv), contentType: 'application/json' })
    remote = await startRemote(python, remoteEnv, test.info().outputPath('remote-serve.log'))
    fs.writeFileSync(
      path.join(sandbox.userDataDir, 'connections.json'),
      JSON.stringify({
        version: 2,
        primary: 'local',
        launchMode: 'primary',
        lastUsed: 'local',
        connections: [
          { id: 'local', kind: 'local', label: 'This device' },
          {
            id: REMOTE_ID,
            kind: 'remote',
            label: REMOTE_LABEL,
            url: remote.url,
            authMode: 'token',
            token: { encoding: 'plain', value: REMOTE_TOKEN }
          }
        ]
      })
    )
    expect(fs.existsSync(path.join(DESKTOP_ROOT, 'dist/electron-main.mjs')), 'Build desktop dist before E2E').toBe(true)
    app = await _electron.launch({
      executablePath: findElectron(),
      args: [DESKTOP_ROOT, '--disable-gpu', '--no-sandbox'],
      cwd: DESKTOP_ROOT,
      ...(process.env.PROVIDER_SETUP_VIDEO === '1'
        ? {
            recordVideo: { dir: test.info().outputPath('video'), size: { width: 1220, height: 800 } }
          }
        : {}),
      env: {
        ...localEnv,
        HERMES_DESKTOP_PYTHON: python,
        HERMES_DESKTOP_USER_DATA_DIR: sandbox.userDataDir,
        HERMES_DESKTOP_IGNORE_EXISTING: '1',
        HERMES_DESKTOP_HERMES_ROOT: REPO_ROOT,
        HERMES_DESKTOP_APP_NAME: `ProviderOwnerE2E-${Date.now()}`,
        HERMES_DESKTOP_SKIP_QUIT_CONFIRM: '1'
      }
    })
    page = await app.firstWindow()
    installErrorBannerGuard(page)
    await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('[data-slot="statusbar"]').getByText('ready', { exact: true })).toBeVisible({
      timeout: 60_000
    })
    const localConfig = fs.readFileSync(path.join(sandbox.hermesHome, 'config.yaml'), 'utf8')
    const remoteDefault = fs.readFileSync(path.join(remoteHermesHome, 'config.yaml'), 'utf8')

    const localProfiles = () =>
      fs.existsSync(path.join(sandbox.hermesHome, 'profiles'))
        ? fs.readdirSync(path.join(sandbox.hermesHome, 'profiles')).sort()
        : []

    expect(localProfiles()).toEqual([])

    // A: open the setup surface on the local default without changing it.
    await openCustomEndpoints(page)
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await selectGateway(page, REMOTE_ID, REMOTE_LABEL, PROFILE)

    for (const model of ['remote-first', 'remote-second']) {
      advertisedModel = model
      await openCustomEndpoints(page)
      await expect(page.getByText(new RegExp(`Changes on this page apply to.*${PROFILE}`))).toBeVisible()
      const input = page.getByPlaceholder('http://127.0.0.1:8081/v1')
      await expect(input).toBeVisible()
      await input.scrollIntoViewIfNeeded()
      await page.screenshot({ path: test.info().outputPath(`${model}-endpoint-form.png`) })
      await saveFixtureEndpoint(page, endpointUrl, model)
      await expect
        .poll(() => configModel(python, remoteEnv, remoteProfileHome), { timeout: 45_000 })
        .toMatchObject({
          provider: ENDPOINT_ID,
          default: model,
          base_url: `${endpointUrl}/v1`
        })

      // Ownership, measured where it now lives: the write landed in the owning
      // gateway's owning profile's config.yaml - and nothing else moved: not
      // the local machine's config, not its profile list, not the remote's
      // default profile.
      expect(fs.readFileSync(path.join(sandbox.hermesHome, 'config.yaml'), 'utf8')).toBe(localConfig)
      expect(localProfiles()).toEqual([])
      expect(fs.readFileSync(path.join(remoteHermesHome, 'config.yaml'), 'utf8')).toBe(remoteDefault)
      await page.screenshot({ path: test.info().outputPath(`${model}-saved.png`) })
      await page.getByRole('button', { name: 'Close settings', exact: true }).click()
      await selectGateway(page, 'local', 'This device', 'default')
      await openCustomEndpoints(page)
      expect(configModel(python, localEnv, sandbox.hermesHome)).toMatchObject({ default: 'local-sentinel' })
      await page.screenshot({ path: test.info().outputPath(`${model}-back-on-local.png`) })
      await page.getByRole('button', { name: 'Close settings', exact: true }).click()

      if (model === 'remote-first') {
        await selectGateway(page, REMOTE_ID, REMOTE_LABEL, PROFILE)
      }
    }

    expect(discoveryRequests).toContain('/v1/models')
    expect(await collectErrorBanners(page)).toEqual([])
  } finally {
    if (page && !page.isClosed()) {
      await test.info().attach('last-ui', { body: await page.locator('body').innerText(), contentType: 'text/plain' })
      await page.screenshot({ path: test.info().outputPath('last-ui.png') })
      await collectErrorBanners(page)
    }

    await app?.close()

    if (remote) {
      await stopChild(remote.child)
    }

    await new Promise<void>(resolve => endpoint.close(() => resolve()))
    sandbox.cleanup()
  }
})
