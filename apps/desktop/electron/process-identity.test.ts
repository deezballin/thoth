import assert from 'node:assert/strict'

import { test } from 'vitest'

import { isHermesProcess } from './process-identity'

test('Windows process identity queries Win32_Process instead of invoking POSIX ps', () => {
  const calls: number[] = []

  const found = isHermesProcess(4242, {
    platform: 'win32',
    isAlive: pid => pid === 4242,
    readWindowsCommandLine: pid => {
      calls.push(pid)

      return String.raw`"C:\Python\python.exe" "C:\Hermes\hermes.exe" dashboard`
    },
    readPosixCommandLine: () => {
      throw new Error('Windows must not invoke ps')
    }
  })

  assert.equal(found, true)
  assert.deepEqual(calls, [4242])
})

test('Windows process identity rejects unrelated command lines', () => {
  assert.equal(
    isHermesProcess(7, {
      platform: 'win32',
      isAlive: () => true,
      readWindowsCommandLine: () => String.raw`C:\Python\python.exe unrelated.py`
    }),
    false
  )
})

test('process identity does not query a PID that is not alive', () => {
  assert.equal(
    isHermesProcess(99, {
      platform: 'win32',
      isAlive: () => false,
      readWindowsCommandLine: () => {
        throw new Error('must not query a dead PID')
      }
    }),
    false
  )
})

test('POSIX process identity reads proc first and falls back to ps when unavailable', () => {
  assert.equal(
    isHermesProcess(123, {
      platform: 'darwin',
      isAlive: () => true,
      readProcCommandLine: () => {
        throw new Error('proc unavailable')
      },
      readPosixCommandLine: pid => `python3 hermes dashboard --pid=${pid}`
    }),
    true
  )
})
