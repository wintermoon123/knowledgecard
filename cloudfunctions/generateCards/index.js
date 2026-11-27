// 知识卡片 AI 生成：本地 Vite 中间件与腾讯云 CloudBase 云函数共用的核心逻辑。
// 仅使用 Node 18+ 内置 fetch，不依赖第三方包。API Key 只从服务端环境变量读取。

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

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line.length > 1)
    .join('\n')
}

function decodeEscapes(text) {
  return text
    .replace(/\.html\(false\)/g, '')
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

async function fetchWebPage(url, timeoutMs = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()

    let title = ''
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
    if (titleMatch) title = stripTags(titleMatch[1]).trim()
    const msgTitleMatch = html.match(/var msg_title = ['"]([^'"]+)['"]/)
    if (msgTitleMatch) title = decodeEscapes(msgTitleMatch[1]).trim()

    let body = ''
    const wxStart = html.search(/id="js_content"/i)
    if (wxStart !== -1) {
      const tagEnd = html.indexOf('>', wxStart)
      body = html.slice(tagEnd + 1)
    } else {
      const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
      if (articleMatch) body = articleMatch[1]
      else if (mainMatch) body = mainMatch[1]
      else if (bodyMatch) body = bodyMatch[1]
    }

    const text = stripTags(body).slice(0, 12000)
    if (text.length < 30) throw new Error('未能提取到正文')

    return { title, text }
  } finally {
    clearTimeout(timer)
  }
}

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

function buildConfig(env) {
  return {
    apiKey: env.HUNYUAN_API_KEY || '',
    baseUrl: env.HUNYUAN_BASE_URL || 'https://tokenhub.tencentmaas.com/v1',
    model: env.HUNYUAN_MODEL || 'hy4-flash',
  }
}

// 脱敏日志：只记录时间、模型、来源数量、状态码、耗时和 requestId，不记录 Key 或用户原文。
function logEvent(fields) {
  console.log('[generate-cards] ' + JSON.stringify({ time: new Date().toISOString(), ...fields }))
}

async function processGenerateCards(body, config, meta = {}) {
  const started = Date.now()
  const requestId = meta.requestId || ''
  const sourceCount = Array.isArray(body && body.sources) ? body.sources.length : 0
  const baseLog = { model: config.model, sourceCount, requestId }

  if (!config.apiKey || config.apiKey.includes('REPLACE_WITH') || config.apiKey.includes('在这里填入')) {
    logEvent({ ...baseLog, status: 503, error: 'NO_API_KEY' })
    return {
      status: 503,
      payload: {
        code: 'NO_API_KEY',
        error: '未配置混元 API Key，请在服务端环境变量中填写 HUNYUAN_API_KEY',
      },
    }
  }

  const sources = Array.isArray(body && body.sources) ? body.sources.slice(0, 10) : []
  if (sources.length === 0) {
    logEvent({ ...baseLog, status: 400, error: 'EMPTY_SOURCES' })
    return { status: 400, payload: { error: '没有可处理的资料' } }
  }

  try {
    const template = (body && body.template) || {}
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
    logEvent({ ...baseLog, status: 200, durationMs: Date.now() - started })
    return { status: 200, payload: { cards } }
  } catch (error) {
    const status = error.status >= 400 && error.status < 600 ? error.status : 500
    logEvent({ ...baseLog, status, durationMs: Date.now() - started, error: error.message })
    return {
      status,
      payload: { error: error.message || '调用混元 API 失败', detail: error.detail || '' },
    }
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// CloudBase 云函数 HTTP 触发入口。event 兼容 HTTP 触发和直接调用两种形态。
exports.main = async (event, context) => {
  const method = String((event && (event.httpMethod || event.method)) || 'POST').toUpperCase()
  const headers = { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  let body = event && event.body
  if (typeof body === 'string' && event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf8')
  }
  if (typeof body === 'string') {
    try {
      body = body ? JSON.parse(body) : {}
    } catch {
      body = {}
    }
  }
  if (!body || typeof body !== 'object') body = {}

  const requestId =
    (context && (context.requestId || context.request_id)) ||
    (event && event.requestContext && event.requestContext.requestId) ||
    ''
  const { status, payload } = await processGenerateCards(body, buildConfig(process.env), { requestId })

  return { statusCode: status, headers, body: JSON.stringify(payload) }
}

exports.processGenerateCards = processGenerateCards
exports.buildConfig = buildConfig
