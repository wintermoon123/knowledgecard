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

export async function fetchWebPage(url, timeoutMs = 30000) {
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
