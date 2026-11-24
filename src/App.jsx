import { useMemo, useState } from 'react'

const INITIAL_TEMPLATES = [
  {
    id: 'tpl-concept',
    name: '概念卡',
    pointCount: 4,
    defaultTags: ['概念'],
    description: '解释一个核心概念：定义 + 特点 + 例子',
    builtin: true,
  },
  {
    id: 'tpl-method',
    name: '方法卡',
    pointCount: 5,
    defaultTags: ['方法'],
    description: '记录一个方法：步骤 + 适用场景 + 注意事项',
    builtin: true,
  },
  {
    id: 'tpl-case',
    name: '案例卡',
    pointCount: 3,
    defaultTags: ['案例'],
    description: '沉淀一个案例：背景 + 做法 + 结果',
    builtin: true,
  },
]

const EXAMPLE_CARDS = [
  {
    title: '用户旅程地图',
    core: '把用户与产品交互的全过程可视化，找出体验断点与机会点。',
    points: [
      '按阶段拆分：认知、考虑、使用、留存',
      '标注每阶段的用户行为、想法与情绪',
      '找出痛点时刻，优先解决影响最大的环节',
    ],
    tags: ['产品设计', '方法'],
    source: '示例资料',
    note: '适合在改版前梳理全流程体验。',
  },
  {
    title: '设计思维双钻模型',
    core: '用「发散—收敛」两次循环，先做对的事，再把事做对。',
    points: [
      '第一个钻石：探索问题空间，发散调研后收敛到正确问题',
      '第二个钻石：探索方案空间，发散创意后收敛到可行方案',
      '关键是不要在问题没定义清楚前就跳到解法',
    ],
    tags: ['产品设计', '概念'],
    source: '示例资料',
    note: '常和 JTBD 搭配使用，先定义任务再找方案。',
  },
  {
    title: 'JTBD 用户任务理论',
    core: '用户不是购买产品，而是「雇佣」产品来完成某项任务。',
    points: [
      '用「当我……时，我想要……，以便于……」描述需求',
      '关注用户想取得的进展，而不是功能列表',
      '适合用来收敛需求，避免被表面功能带偏',
    ],
    tags: ['产品设计', '概念'],
    source: '示例资料',
    note: '教程里写需求说明用的就是这个句式。',
  },
]

const makeId = () => `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const STOP_WORDS = new Set([
  '我们', '这个', '那个', '可以', '就是', '一个', '什么', '自己', '没有',
  '这样', '因为', '所以', '但是', '然后', '进行', '使用', '需要', '通过',
])

function bigrams(text) {
  const clean = String(text || '').replace(/[^\u4e00-\u9fa5]/g, '')
  const result = new Set()
  for (let i = 0; i < clean.length - 1; i += 1) {
    const word = clean.slice(i, i + 2)
    if (!STOP_WORDS.has(word)) result.add(word)
  }
  return result
}

function recommendRelated(card, allCards, limit = 3) {
  const words = bigrams(`${card.title} ${card.core} ${card.points.join(' ')}`)
  return allCards
    .filter((other) => other.id !== card.id)
    .map((other) => {
      const tagOverlap = other.tags.filter((tag) => card.tags.includes(tag)).length
      const otherWords = bigrams(`${other.title} ${other.core} ${other.points.join(' ')}`)
      let keywordOverlap = 0
      words.forEach((word) => {
        if (otherWords.has(word)) keywordOverlap += 1
      })
      return {
        card: other,
        score: tagOverlap * 2 + keywordOverlap,
        tagOverlap,
        keywordOverlap,
      }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function mockParse(item, template, index) {
  const base = {
    id: makeId(),
    note: '',
    relations: [],
  }

  if (item.type === 'url') {
    let host = item.raw
    try {
      host = new URL(item.raw.startsWith('http') ? item.raw : `https://${item.raw}`).hostname
    } catch {
      host = item.raw.slice(0, 40)
    }
    return {
      ...base,
      title: `${host} 资料要点`,
      core: `来自 ${host} 的资料，围绕新领域学习整理出的核心内容（模拟解析，可编辑）。`,
      points: Array.from(
        { length: template.pointCount },
        (_, i) => `${host} 资料的第 ${i + 1} 个关键要点（模拟解析结果，可编辑）`,
      ),
      tags: [...template.defaultTags, '网址导入'],
      source: host,
    }
  }

  const lines = (item.raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const title = (lines[0] || `未命名资料 ${index + 1}`).slice(0, 40)
  const sentences = lines
    .slice(1)
    .join(' ')
    .split(/[。！？.!?]/)
    .map((s) => s.trim())
    .filter(Boolean)

  return {
    ...base,
    title,
    core: sentences[0]
      ? sentences[0].slice(0, 60)
      : `关于「${title}」的核心内容（模拟解析，可编辑）`,
    points: Array.from({ length: template.pointCount }, (_, i) => {
      const text = sentences[i]
      if (!text) return `要点 ${i + 1}：请在编辑中补充内容`
      return text.length > 80 ? `${text.slice(0, 80)}…` : text
    }),
    tags: [...template.defaultTags, item.type === 'file' ? '文件导入' : '文本导入'],
    source: item.type === 'file' ? item.name : '粘贴文本',
  }
}

function FieldLabel({ children, hint }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <label className="text-sm font-medium text-slate-700">{children}</label>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  )
}

function RelatedList({ card, allCards, onLink, onOpen }) {
  const related = recommendRelated(card, allCards)
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">相关卡片</span>
        <span className="text-xs text-slate-400">系统推荐 · 不区分关联类型</span>
      </div>
      {card.relations.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {card.relations.map((id) => {
            const target = allCards.find((c) => c.id === id)
            if (!target) return null
            return (
              <div key={id} className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5">
                <button onClick={() => onOpen(target.id)} className="truncate text-xs text-slate-700 hover:text-indigo-600">
                  {target.title}
                </button>
                <button onClick={() => onLink(card.id, id)} className="ml-2 text-xs text-rose-400 hover:text-rose-600">
                  取消
                </button>
              </div>
            )
          })}
        </div>
      )}
      {related.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {related
            .filter((item) => !card.relations.includes(item.card.id))
            .slice(0, 3)
            .map((item) => (
              <div key={item.card.id} className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5">
                <button onClick={() => onOpen(item.card.id)} className="truncate text-xs text-slate-700 hover:text-indigo-600">
                  {item.card.title}
                </button>
                <div className="ml-2 flex shrink-0 items-center gap-2">
                  <span className="text-xs text-slate-400">相似 {item.score}</span>
                  <button onClick={() => onLink(card.id, item.card.id)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    关联
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
      {related.length === 0 && card.relations.length === 0 && (
        <p className="mt-2 text-xs text-slate-400">暂无推荐，试着给卡片打上相同标签</p>
      )}
    </div>
  )
}

function CardView({ card, allCards, expanded, onToggle, onChange, onDelete, onSaveTemplate, onLink, onOpen }) {
  const update = (patch) => onChange({ ...card, ...patch })

  const updatePoint = (idx, value) => {
    const points = [...card.points]
    points[idx] = value
    update({ points })
  }

  const addPoint = () => update({ points: [...card.points, '新要点'] })
  const removePoint = (idx) => update({ points: card.points.filter((_, i) => i !== idx) })

  const updateTags = (value) =>
    update({ tags: value.split(/[,，]/).map((t) => t.trim()).filter(Boolean) })

  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-900">{card.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{card.core}</p>
        </div>
        <button
          onClick={onToggle}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {expanded ? '收起' : '编辑'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {card.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600">
            {tag}
          </span>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {card.points.slice(0, expanded ? undefined : 3).map((point, idx) => (
          <li key={idx} className="flex gap-2 text-sm leading-6 text-slate-600">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      {!expanded && card.points.length > 3 && (
        <p className="mt-2 text-xs text-slate-400">还有 {card.points.length - 3} 个要点，点击编辑查看</p>
      )}

      {expanded && (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <div>
            <FieldLabel>标题</FieldLabel>
            <input
              value={card.title}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <FieldLabel>一句话核心</FieldLabel>
            <textarea
              value={card.core}
              onChange={(e) => update({ core: e.target.value })}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <FieldLabel hint={`${card.points.length} 条`}>关键要点</FieldLabel>
            <div className="space-y-2">
              {card.points.map((point, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={point}
                    onChange={(e) => updatePoint(idx, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  />
                  <button
                    onClick={() => removePoint(idx)}
                    className="shrink-0 rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                    title="删除要点"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addPoint} className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">
              + 添加要点
            </button>
          </div>
          <div>
            <FieldLabel hint="用逗号分隔">标签</FieldLabel>
            <input
              value={card.tags.join(', ')}
              onChange={(e) => updateTags(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <FieldLabel>来源</FieldLabel>
            <input
              value={card.source}
              onChange={(e) => update({ source: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <FieldLabel>我的备注</FieldLabel>
            <textarea
              value={card.note}
              onChange={(e) => update({ note: e.target.value })}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <RelatedList card={card} allCards={allCards} onLink={onLink} onOpen={onOpen} />
          <div className="flex gap-2">
            <button
              onClick={() => onSaveTemplate(card)}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              存为模板
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              删除卡片
            </button>
          </div>
        </div>
      )}

      {!expanded && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span className="truncate">来源：{card.source}</span>
          {card.note && <span className="ml-2 shrink-0">有备注</span>}
        </div>
      )}
    </article>
  )
}

function DetailView({ card, allCards, onBack, onChange, onDelete, onSaveTemplate, onLink, onOpen }) {
  const update = (patch) => onChange({ ...card, ...patch })

  const updatePoint = (idx, value) => {
    const points = [...card.points]
    points[idx] = value
    update({ points })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-indigo-600">
          ← 返回卡片库
        </button>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          卡片详情
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div>
            <FieldLabel>标题</FieldLabel>
            <input
              value={card.title}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <FieldLabel>一句话核心</FieldLabel>
            <textarea
              value={card.core}
              onChange={(e) => update({ core: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <FieldLabel hint={`${card.points.length} 条`}>关键要点</FieldLabel>
            <div className="space-y-2">
              {card.points.map((point, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={point}
                    onChange={(e) => updatePoint(idx, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  />
                  <button
                    onClick={() => update({ points: card.points.filter((_, i) => i !== idx) })}
                    className="shrink-0 rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => update({ points: [...card.points, '新要点'] })}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                + 添加要点
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel hint="用逗号分隔">标签</FieldLabel>
              <input
                value={card.tags.join(', ')}
                onChange={(e) => update({ tags: e.target.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <FieldLabel>来源</FieldLabel>
              <input
                value={card.source}
                onChange={(e) => update({ source: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
          </div>
          <div>
            <FieldLabel>我的备注</FieldLabel>
            <textarea
              value={card.note}
              onChange={(e) => update({ note: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => onSaveTemplate(card)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              存为模板
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              删除卡片
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <RelatedList card={card} allCards={allCards} onLink={onLink} onOpen={onOpen} />
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            <p className="font-semibold text-slate-700">推荐规则</p>
            <p className="mt-1">标签重合计 2 分，中文关键词重合计 1 分，按总分排序取前 3 张。</p>
            <p className="mt-1">不区分关联类型，不做关系图可视化。</p>
          </div>
        </aside>
      </div>
    </section>
  )
}

export default function App() {
  const [page, setPage] = useState('workbench')
  const [urlsText, setUrlsText] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [files, setFiles] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('tpl-concept')
  const [cards, setCards] = useState([])
  const [templates, setTemplates] = useState(INITIAL_TEMPLATES)
  const [activeTag, setActiveTag] = useState('全部')
  const [expandedCardId, setExpandedCardId] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [saveTarget, setSaveTarget] = useState(null)
  const [newTemplateName, setNewTemplateName] = useState('')

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0]

  const allTags = useMemo(() => {
    const set = new Set()
    cards.forEach((card) => card.tags.forEach((tag) => set.add(tag)))
    return ['全部', ...Array.from(set)]
  }, [cards])

  const visibleCards = useMemo(
    () => (activeTag === '全部' ? cards : cards.filter((card) => card.tags.includes(activeTag))),
    [cards, activeTag],
  )

  const showNotice = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const handleFiles = (e) => {
    setFiles(Array.from(e.target.files || []))
  }

  const handleGenerate = async () => {
    const urlItems = urlsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((raw) => ({ type: 'url', raw }))

    const textItems = pastedText.trim() ? [{ type: 'text', raw: pastedText.trim() }] : []

    const fileItems = await Promise.all(
      files.map(async (file) => ({ type: 'file', raw: await file.text(), name: file.name })),
    )

    const sources = [...urlItems, ...textItems, ...fileItems]
    if (sources.length === 0) {
      showNotice('请先添加网址、文件或粘贴文本')
      return
    }

    setLoading(true)
    window.setTimeout(() => {
      const generated = sources.map((item, idx) => mockParse(item, selectedTemplate, idx))
      setCards((prev) => [...prev, ...generated])
      setLoading(false)
      setUrlsText('')
      setPastedText('')
      setFiles([])
      showNotice(`已生成 ${generated.length} 张卡片`)
    }, 500)
  }

  const handleLoadExample = () => {
    const examples = EXAMPLE_CARDS.map((card) => ({ ...card, id: makeId(), relations: [] }))
    setCards((prev) => [...prev, ...examples])
    showNotice('已载入 3 张示例卡片（产品设计方法）')
  }

  const handleLink = (cardId, targetId) => {
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card
        const linked = card.relations.includes(targetId)
        return {
          ...card,
          relations: linked
            ? card.relations.filter((id) => id !== targetId)
            : [...card.relations, targetId],
        }
      }),
    )
  }

  const handleOpenDetail = (id) => {
    setDetailId(id)
    setPage('detail')
  }

  const handleDeleteCard = (id) => {
    setCards((prev) =>
      prev
        .filter((card) => card.id !== id)
        .map((card) => ({ ...card, relations: card.relations.filter((rid) => rid !== id) })),
    )
    if (detailId === id) setDetailId(null)
    showNotice('卡片已删除')
  }

  const handleSaveTemplate = () => {
    const name = newTemplateName.trim()
    if (!name) {
      showNotice('请输入模板名称')
      return
    }
    setTemplates((prev) => [
      ...prev,
      {
        id: `tpl-${Date.now()}`,
        name,
        pointCount: saveTarget.points.length,
        defaultTags: saveTarget.tags.slice(0, 2),
        description: `由卡片「${saveTarget.title}」保存`,
        builtin: false,
      },
    ])
    setSaveTarget(null)
    setNewTemplateName('')
    showNotice(`模板「${name}」已保存`)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">知识卡片工作台</h1>
            <p className="mt-1 text-sm text-slate-500">批量导入资料，生成结构化卡片，筛选编辑后沉淀为模板</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:inline">
              第二版原型 · 多页面
            </span>
            <button
              onClick={handleLoadExample}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              载入示例
            </button>
          </div>
        </div>
        <nav className="border-t border-slate-100">
          <div className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-6">
            {[
              { id: 'workbench', label: '工作台' },
              { id: 'library', label: '卡片库' },
              { id: 'relations', label: '关联视图' },
              { id: 'templates', label: '模板库' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  page === item.id || (page === 'detail' && item.id === 'library')
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
       {page === 'workbench' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">1. 导入资料</h2>
            <p className="mt-1 text-xs text-slate-400">支持一次导入多个来源</p>

            <div className="mt-5 space-y-5">
              <div>
                <FieldLabel hint="每行一个">网址</FieldLabel>
                <textarea
                  value={urlsText}
                  onChange={(e) => setUrlsText(e.target.value)}
                  rows={3}
                  placeholder={'https://example.com/article\nhttps://example.com/note'}
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-300 focus:border-indigo-400"
                />
              </div>

              <div>
                <FieldLabel hint=".txt / .md">文件</FieldLabel>
                <label className="flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40">
                  <span className="text-sm text-slate-600">点击选择多个文件</span>
                  <span className="mt-1 text-xs text-slate-400">支持 TXT、Markdown</span>
                  <input type="file" multiple accept=".txt,.md" onChange={handleFiles} className="hidden" />
                </label>
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {files.map((file, idx) => (
                      <li key={idx} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                        <span className="truncate">{file.name}</span>
                        <button
                          onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                          className="ml-2 text-slate-400 hover:text-rose-500"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <FieldLabel>粘贴文本</FieldLabel>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={3}
                  placeholder="直接粘贴一段资料，首行作为标题"
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-300 focus:border-indigo-400"
                />
              </div>

              <div>
                <FieldLabel>套用卡片结构</FieldLabel>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? '生成中…' : '生成知识卡片'}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">2. 卡片结构模板</h2>
            <p className="mt-1 text-xs text-slate-400">存过的模板下次可直接套用</p>
            <ul className="mt-4 space-y-2">
              {templates.map((t) => (
                <li key={t.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{t.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{t.pointCount} 条要点</span>
                      {!t.builtin && (
                        <button
                          onClick={() => setTemplates((prev) => prev.filter((x) => x.id !== t.id))}
                          className="text-xs text-slate-400 hover:text-rose-500"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">3. 知识卡片</h2>
              <p className="mt-1 text-xs text-slate-400">共 {cards.length} 张 · 点击编辑可修改内容</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    activeTag === tag
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-slate-200 p-5">
                  <div className="h-4 w-1/2 rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-full rounded bg-slate-100" />
                  <div className="mt-2 h-3 w-4/5 rounded bg-slate-100" />
                  <div className="mt-5 h-3 w-full rounded bg-slate-100" />
                  <div className="mt-2 h-3 w-3/4 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          )}

          {!loading && visibleCards.length === 0 && (
            <div className="mt-5 flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-center">
              <div className="text-3xl">🗂️</div>
              <p className="mt-3 text-sm font-medium text-slate-600">还没有知识卡片</p>
              <p className="mt-1 text-xs text-slate-400">从左侧导入资料，或点击右上角「载入示例」</p>
            </div>
          )}

          {!loading && visibleCards.length > 0 && (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleCards.map((card) => (
                <CardView
                  key={card.id}
                  card={card}
                  allCards={cards}
                  expanded={expandedCardId === card.id}
                  onToggle={() => setExpandedCardId(expandedCardId === card.id ? null : card.id)}
                  onChange={(updated) => setCards((prev) => prev.map((c) => (c.id === card.id ? updated : c)))}
                  onDelete={() => handleDeleteCard(card.id)}
                  onSaveTemplate={(target) => {
                    setSaveTarget(target)
                    setNewTemplateName('')
                  }}
                  onLink={handleLink}
                  onOpen={handleOpenDetail}
                />
              ))}
            </div>
          )}
        </section>
        </div>
       )}

       {page === 'library' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">卡片库</h2>
              <p className="mt-1 text-xs text-slate-400">共 {cards.length} 张卡片 · 点击卡片查看详情与关联</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    activeTag === tag
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          {visibleCards.length === 0 ? (
            <div className="mt-5 flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-center">
              <p className="text-sm text-slate-600">还没有卡片</p>
              <button onClick={() => setPage('workbench')} className="mt-2 text-xs text-indigo-600 hover:text-indigo-700">
                去工作台导入资料
              </button>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleCards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => handleOpenDetail(card.id)}
                  className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-slate-900">{card.title}</h3>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">
                      {card.relations.length} 关联
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{card.core}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {card.tags.map((tag) => (
                      <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
       )}

       {page === 'relations' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">关联视图</h2>
          <p className="mt-1 text-xs text-slate-400">
            系统按标签重合与关键词相似度推荐候选卡片，不区分关联类型，不做关系图
          </p>
          {cards.length === 0 ? (
            <div className="mt-5 flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
              还没有卡片，先去工作台载入示例
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {cards.map((card) => (
                <div key={card.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <button onClick={() => handleOpenDetail(card.id)} className="text-sm font-semibold text-slate-900 hover:text-indigo-600">
                      {card.title}
                    </button>
                    <span className="text-xs text-slate-400">已关联 {card.relations.length} 张</span>
                  </div>
                  <div className="mt-3">
                    <RelatedList card={card} allCards={cards} onLink={handleLink} onOpen={handleOpenDetail} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
       )}

       {page === 'templates' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">模板库</h2>
          <p className="mt-1 text-xs text-slate-400">内置模板与自定义模板统一管理，导入资料时可直接套用</p>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">{t.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${t.builtin ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>
                    {t.builtin ? '内置' : '自定义'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{t.description}</p>
                <p className="mt-3 text-xs text-slate-400">要点 {t.pointCount} 条 · 标签 {t.defaultTags.join('、')}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedTemplateId(t.id)
                      setPage('workbench')
                      showNotice(`已选择模板「${t.name}」`)
                    }}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    套用
                  </button>
                  {!t.builtin && (
                    <button
                      onClick={() => {
                        setTemplates((prev) => prev.filter((x) => x.id !== t.id))
                        if (selectedTemplateId === t.id) setSelectedTemplateId('tpl-concept')
                        showNotice('模板已删除')
                      }}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
       )}

       {page === 'detail' && cards.find((c) => c.id === detailId) && (
        <DetailView
          card={cards.find((c) => c.id === detailId)}
          allCards={cards}
          onBack={() => setPage('library')}
          onChange={(updated) => setCards((prev) => prev.map((c) => (c.id === detailId ? updated : c)))}
          onDelete={() => {
            handleDeleteCard(detailId)
            setPage('library')
          }}
          onSaveTemplate={(target) => {
            setSaveTarget(target)
            setNewTemplateName('')
          }}
          onLink={handleLink}
          onOpen={handleOpenDetail}
        />
       )}
      </main>

      {notice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {notice}
        </div>
      )}

      {saveTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">存为卡片结构模板</h3>
            <p className="mt-1 text-xs text-slate-500">
              将「{saveTarget.title}」的要点数量和标签保存为模板
            </p>
            <input
              autoFocus
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
              placeholder="输入模板名称"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setSaveTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveTemplate}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
