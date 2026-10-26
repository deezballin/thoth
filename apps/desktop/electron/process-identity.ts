import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'

type ProcessIdentityDeps = {
  platform?: NodeJS.Platform
  isAlive?: (pid: number) => boolean
  readProcCommandLine?: (pid: number) => string
  readWindowsCommandLine?: (pid: number) => string
  readPosixCommandLine?: (pid: number) => string
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

function readProcCommandLine(pid: number): string {
  return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
}

function readWindowsCommandLine(pid: number): string {
  return String(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`
      ],
      { encoding: 'utf8', timeout: 2_000, windowsHide: true }
    )
  )
}

function readPosixCommandLine(pid: number): string {
  return execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8', timeout: 2_000 })
}

/**
 * True only when a live PID's command line identifies Hermes. Windows has no
 * POSIX `ps -o`; query the exact Win32_Process record instead of mistaking a
 * shell compatibility error for a non-Hermes process.
 */
export function isHermesProcess(pid: number, deps: ProcessIdentityDeps = {}): boolean {
  const platform = deps.platform ?? process.platform
  const alive = deps.isAlive ?? isAlive

  if (!alive(pid)) {
    return false
  }

  const containsHermes = (commandLine: string) => commandLine.toLowerCase().includes('hermes')

  if (platform === 'win32') {
    try {
      return containsHermes((deps.readWindowsCommandLine ?? readWindowsCommandLine)(pid))
    } catch {
      return false
    }
  }

  try {
    return containsHermes((deps.readProcCommandLine ?? readProcCommandLine)(pid))
  } catch {
    try {
      return containsHermes((deps.readPosixCommandLine ?? readPosixCommandLine)(pid))
    } catch {
      return false
    }
  }
}
