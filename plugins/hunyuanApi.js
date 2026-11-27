import { fetchWebPage } from './webFetch.js'

const VALID_DOMAINS = ['产品设计', '商业', '写作', '自助成长', '理财', '科技', '其他']

const SYSTEM_PROMPT = `你是一个知识卡片整理助手。请把用户提供的资料整理成一张结构化知识卡片。
只返回 JSON，不要 Markdown 代码块，不要任何解释文字。
JSON 格式：
{"title": "string", "domain": "string", "core": "string", "points": ["string"], "tags": ["string"]}
要求：
- title 不超过 20 个字，能概括资料主题；
- domain 从这些值里选一个最贴近的：产品设计、商业、写作、自助成长、理财、科技、其他；
- core 用一句话说清核心内容；
- points 给 3 到 5 条关键要点，每条不超过 40 个字；
- tags 给 2 到 4 个简短标签；
- 不要编造资料里没有的事实；资料不足时如实写"资料中未提及"。`

function extractJson(text) {
  if (!text) return null
  const cleaned = String(text)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

async function callHunyuan(source, template, config) {
  const { apiKey, baseUrl, model } = config
  let content = String(source.raw || '').slice(0, 6000)
  let fetchedTitle = ''
  let fetchNote = ''

  if (source.type === 'url') {
    try {
      const page = await fetchWebPage(source.raw)
      fetchedTitle = page.title
      content = `${page.title ? `文章标题：${page.title}\n` : ''}正文：\n${page.text}`.slice(0, 12000)
    } catch (error) {
      fetchNote = `网页抓取失败（${error.message}），仅根据链接地址整理。`
    }
  }

  const userPrompt = `请将下面的资料整理成知识卡片。

资料类型：${source.type === 'url' ? '网址' : source.type === 'file' ? '文件' : '粘贴文本'}
${source.name ? `来源名称：${source.name}\n` : ''}
卡片结构要求：${template.name || '通用卡片'}，要点 ${template.pointCount || 3} 条左右，默认标签 ${(template.defaultTags || []).join('、') || '无'}。

资料内容：
${content}${fetchNote ? `\n注意：${fetchNote}` : ''}`

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      stream: false,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    const error = new Error(`混元 API 返回 ${response.status}`)
    error.status = response.status
    error.detail = detail.slice(0, 300)
    throw error
  }

  const data = await response.json()
  const parsed = extractJson(data?.choices?.[0]?.message?.content)
  if (!parsed) {
    throw new Error('模型返回内容不是有效 JSON')
  }

  return {
    title: fetchedTitle || String(parsed.title || '未命名卡片').slice(0, 60),
    domain: VALID_DOMAINS.includes(parsed.domain) ? parsed.domain : '其他',
    core: String(parsed.core || '').slice(0, 200),
    points: Array.isArray(parsed.points)
      ? parsed.points.filter(Boolean).slice(0, 6).map((p) => String(p).slice(0, 120))
      : [],
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter(Boolean).slice(0, 6).map((t) => String(t).slice(0, 20))
      : [],
    fetched: !fetchNote,
    fetchNote,
  }
}

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

        const apiKey = env.HUNYUAN_API_KEY
        if (!apiKey || apiKey.includes('REPLACE_WITH') || apiKey.includes('在这里填入')) {
          sendJson(res, 503, {
            code: 'NO_API_KEY',
            error: '未配置混元 API Key，请在 .env.local 中填写 HUNYUAN_API_KEY',
          })
          return
        }

        try {
          const body = await readBody(req)
          const sources = Array.isArray(body.sources) ? body.sources.slice(0, 10) : []
          if (sources.length === 0) {
            sendJson(res, 400, { error: '没有可处理的资料' })
            return
          }

          const config = {
            apiKey,
            baseUrl: env.HUNYUAN_BASE_URL || 'https://tokenhub.tencentmaas.com/v1',
            model: env.HUNYUAN_MODEL || 'hy4-flash',
          }
          const template = body.template || {}

          const cards = []
          for (const source of sources) {
            const result = await callHunyuan(source, template, config)
            const { fetched, fetchNote, ...cardFields } = result
            cards.push({
              ...cardFields,
              source: source.type === 'url' ? source.raw : source.name || '粘贴文本',
              note: fetchNote || '',
              relations: [],
            })
          }

          sendJson(res, 200, { cards })
        } catch (error) {
          const status = error.status || 500
          sendJson(res, status >= 400 && status < 600 ? status : 500, {
            error: error.message || '调用混元 API 失败',
            detail: error.detail || '',
          })
        }
      })
    },
  }
}
