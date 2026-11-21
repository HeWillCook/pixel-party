import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const HOST = '127.0.0.1'
const PORT = Number(process.env.LOCAL_JUDGE_PORT || process.env.PORT || 8789)
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const MAX_BODY_BYTES = 2 * 1024 * 1024

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function runClaude(system, user, pngPath) {
  return new Promise((resolve, reject) => {
    const prompt = `Read the image at ${pngPath}\n\n${user}`
    const args = [
      '-p',
      prompt,
      '--system-prompt',
      system,
      '--allowedTools',
      `Read(${pngPath})`,
      '--output-format',
      'json',
    ]
    execFile(CLAUDE_BIN, args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message))
        return
      }
      let text = stdout.trim()
      try {
        const parsed = JSON.parse(stdout)
        if (typeof parsed?.result === 'string') {
          text = parsed.result
        } else if (Array.isArray(parsed)) {
          const resultEntry = parsed.findLast((item) => item?.type === 'result' && typeof item?.result === 'string')
          if (resultEntry) text = resultEntry.result
        }
      } catch {
        // Keep raw stdout if not valid JSON
      }
      resolve(text)
    })
  })
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now()
  if (req.method !== 'POST' || req.url !== '/judge') {
    sendJson(res, 404, { error: 'not_found' })
    console.log(`[local-judge] ${req.method} ${req.url} -> 404 (${Date.now() - startedAt}ms)`)
    return
  }

  let tmpPath = null
  try {
    const raw = await readBody(req)
    const body = JSON.parse(raw)
    if (!body || typeof body.system !== 'string' || typeof body.user !== 'string' || typeof body.png !== 'string') {
      sendJson(res, 400, { error: 'invalid_body' })
      console.log(`[local-judge] POST /judge -> 400 (${Date.now() - startedAt}ms)`)
      return
    }
    tmpPath = path.join(os.tmpdir(), `pixle-judge-${randomUUID()}.png`)
    await fs.writeFile(tmpPath, Buffer.from(body.png, 'base64'))
    const text = await runClaude(body.system, body.user, tmpPath)
    sendJson(res, 200, { text })
    console.log(`[local-judge] POST /judge -> 200 (${Date.now() - startedAt}ms)`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendJson(res, 500, { error: message })
    console.log(`[local-judge] POST /judge -> 500 (${Date.now() - startedAt}ms): ${message}`)
  } finally {
    if (tmpPath) await fs.unlink(tmpPath).catch(() => {})
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[local-judge] listening on http://${HOST}:${PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
