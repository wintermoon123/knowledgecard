import { createRequire } from 'node:module'

// 业务逻辑与云函数共用同一份实现，避免本地和线上行为不一致。
const require = createRequire(import.meta.url)
const { processGenerateCards, buildConfig } = require('../cloudfunctions/generateCards/index.js')

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 200000) {
        reject(new Error('请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('请求体不是有效 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function hunyuanApiPlugin(env) {
  return {
    name: 'hunyuan-api-middleware',
    configureServer(server) {
      server.middlewares.use('/api/generate-cards', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: '只支持 POST 请求' })
          return
        }

        try {
          const body = await readBody(req)
          const { status, payload } = await processGenerateCards(body, buildConfig(env))
          sendJson(res, status, payload)
        } catch (error) {
          sendJson(res, 400, { error: error.message || '请求格式错误' })
        }
      })
    },
  }
}
