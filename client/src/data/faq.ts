// Shared FAQ entries, consumed by the full FAQ page (/faq) and by the
// homepage FaqSection, which surfaces the first few entries inline.
export interface FaqEntry {
  q: { zh: string; en: string };
  a: { zh: string; en: string };
}

export const FAQS: FaqEntry[] = [
  {
    q: { zh: "这是一个什么网站？", en: "What is this site?" },
    a: {
      zh: "这是【温格私享VIP】社群配套的内部交易实盘网站。",
      en: "It is the live-trading companion site for the Wenge Private VIP community.",
    },
  },
  {
    q: { zh: "仓位每次怎么计算的？", en: "How is position size decided each time?" },
    a: {
      zh: "核心原则是「以损定仓」，详细可回看第【223期】内部课程，或《交易8讲体系课》相关章节。",
      en: "The core principle is sizing by risk (loss-defined position); see internal session 223 or the relevant chapter of the 8-Lesson Trading System course.",
    },
  },
  {
    q: { zh: "止损怎么设置的？", en: "How are stop-losses set?" },
    a: {
      zh: "一般设置在前方 4H 或 1D K 线下方，详细可回看第【219期】内部课程，或《交易8讲体系课》相关章节。",
      en: "Usually placed below the prior 4H or 1D candle; see internal session 219 or the relevant chapter of the 8-Lesson Trading System course.",
    },
  },
  {
    q: { zh: "进场标准是什么？", en: "What is the entry criterion?" },
    a: {
      zh: "大多数时候都是右侧出现信号才进场，极少左侧进场，详细可回看第【219期】内部课程。",
      en: "Most of the time we enter only after a right-side signal appears, with left-side entries rare; see internal session 219.",
    },
  },
  {
    q: { zh: "为何要移动止损？", en: "Why trail the stop?" },
    a: {
      zh: "移动止损也叫「推保护」，目的是及时降低风险、锁住利润，详细可回看第【223期】内部课程。",
      en: "Trailing the stop (\"pushing protection\") reduces risk in time and locks in profit; see internal session 223.",
    },
  },
  {
    q: { zh: "如果没及时看到开仓信息怎么办？", en: "What if I miss the entry alert?" },
    a: {
      zh: "要么等待，要么调整你的仓位，使得你的风险降到与实盘的开仓风险一致（本质还是以损定仓），详情可回看第【223期】内部课程。",
      en: "Either wait, or adjust your position so your risk matches the live account's entry risk (still sizing by risk at its core); see internal session 223.",
    },
  },
  {
    q: { zh: "预设风险有时 2% 有时 0.5%，怎么考量的？", en: "Why is preset risk sometimes 2%, sometimes 0.5%?" },
    a: {
      zh: "该标的波动较大时，预留风险会更小；波动较小时，预留风险会更大。",
      en: "The more volatile the instrument, the smaller the preset risk; the calmer it is, the larger the preset risk.",
    },
  },
];
