// Regenerates client/src/data/changelog.generated.ts from git history.
//
// Going forward, add a one-line Chinese summary trailer to any commit that
// should appear in the public changelog:
//
//   更新: 新增委托历史模块
//   Changelog-EN: Added order history        (optional; falls back to the zh line)
//
// Then run `node scripts/gen-changelog.mjs` (or `npm run changelog`) to refresh
// the generated file, and amend it into the same commit. Commits without the
// trailer are ignored, so routine refactors/fixes stay out of the changelog.
//
// The changelog is visitor-facing, so work on the private analytics dashboard
// (/analytics) is deliberately kept out of it: don't add a 更新 trailer to those
// commits. EXCLUDED_SHAS below covers the analytics commits that were trailered
// before this rule existed.
//
// Pre-convention history (before this trailer workflow existed) is backfilled
// by the SEED list below — one condensed line per release.

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Oldest → newest. The last entry's version is the base for auto-increment.
const SEED = [
  { version: "1.0.0", date: "2026-07-01", zh: "接入实盘账户，看板上线", en: "Live account dashboard launched" },
  { version: "1.1.0", date: "2026-07-02", zh: "新增昼夜主题与损益周期切换", en: "Added theme toggle and PnL ranges" },
  { version: "1.2.0", date: "2026-07-03", zh: "扩充行情指数与交易绩效指标", en: "More market tickers and trade metrics" },
  { version: "1.3.0", date: "2026-07-05", zh: "首页重设计并支持多币种计价", en: "Hero redesign and multi-currency equity" },
  { version: "1.4.0", date: "2026-07-06", zh: "新增可折叠委托历史模块", en: "Added collapsible order history" },
  { version: "1.5.0", date: "2026-07-07", zh: "修复损益曲线并新增累积资金费", en: "PnL range fixes and net funding stat" },
];

// Analytics-dashboard commits that carry a 更新 trailer from before the
// "keep /analytics out of the changelog" rule. Listed by SHA so the trailers
// can stay in git history untouched.
const EXCLUDED_SHAS = new Set([
  "37f98db", // 新增网站访问统计功能
  "5fe37cc", // 新增网站访问统计可视化页面
  "457aee6", // 添加自动数据库迁移支持
  "dec04c8", // 添加浏览器分布、访问时段、地理分布、实时访客功能
  "d99891e", // IP地址自动转换为省份名称
  "95928d6", // 添加自动刷新机制和手动刷新按钮
  "54fb847", // 修复访问统计与计数的数据库故障
  "479dbdf", // 修复访问统计重复上报
  "9b49c8b", // 精简访问统计相关版本日志
]);

// Entries whose committed trailer overran the 15-character Chinese limit, or
// read too much like an internal commit note. Rewritten here (keyed by SHA) so
// the original commit messages stay untouched. Keep new zh text <= 15 chars.
const OVERRIDES = new Map([
  ["c361f1a", { zh: "行情新增日经与韩国指数", en: "Added Nikkei and KOSPI tickers" }],
  ["2a3b5cf", { zh: "行情卡新增EMA20与RSI", en: "Added EMA20 and RSI to ticker cards" }],
  ["2432f1f", { zh: "实时更新指示移至标题栏", en: "Moved the live indicator to the header" }],
  ["dab2cf2", { zh: "账户概览补充绩效指标", en: "Added performance metrics to the overview" }],
  ["a51ed29", { zh: "成交与持仓展示对齐交易所", en: "Aligned trade and position views with the exchange" }],
  ["0f7945f", { zh: "行情新增ETH与恒生指数", en: "Added ETH and Hang Seng tickers" }],
  ["663bf7a", { zh: "经济日历新增周月切换", en: "Added week/month toggle to the calendar" }],
  ["493e154", { zh: "补充经济事件中文翻译", en: "Added Chinese translations for more events" }],
  ["845ff08", { zh: "经济日历新增状态筛选", en: "Added a status filter to the calendar" }],
  ["87ca55c", { zh: "补全PPI等事件翻译", en: "Completed translations for PPI and more" }],
  ["5ea4ae3", { zh: "经济事件支持智能翻译", en: "Smarter economic-event translation" }],
  ["913116a", { zh: "事件翻译保留人名地名", en: "Translation keeps names and places in English" }],
  ["0ceeff6", { zh: "本月视图补全整月事件", en: "Month view now fetches the full month" }],
  ["6a9b1d9", { zh: "本月范围改为完整月份", en: "Month range spans the whole month" }],
  ["a53efaa", { zh: "本周范围改为周一至周日", en: "Week range runs Monday to Sunday" }],
  ["f48238f", { zh: "公布状态改按事件时间", en: "Publish status now follows event time" }],
  ["74dc6c5", { zh: "页面UI优化", en: "Page UI refinements" }],
  ["6e88fd3", { zh: "常见问题优化", en: "FAQ refinements" }],
]);

function matchTrailer(body, regex) {
  const match = body.match(regex);
  return match ? match[1].trim() : null;
}

function readTrailerCommits() {
  let raw = "";
  try {
    // Record sep = \x1e, field sep = \x1f. Fields: short sha, date, full body.
    raw = execSync("git log --reverse --date=short --format=%h%x1f%ad%x1f%B%x1e", {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return [];
  }

  const commits = [];
  for (const record of raw.split("\x1e")) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const [sha, date, ...rest] = trimmed.split("\x1f");
    if (!date || rest.length === 0) continue;
    const body = rest.join("\x1f");
    const shortSha = sha.trim();
    if (EXCLUDED_SHAS.has(shortSha)) continue;
    const zh = matchTrailer(body, /^更新[:：]\s*(.+)$/m);
    if (!zh) continue;
    const en = matchTrailer(body, /^Changelog-EN[:：]\s*(.+)$/im) || zh;
    const override = OVERRIDES.get(shortSha);
    commits.push({
      date: date.trim(),
      zh: override?.zh ?? zh,
      en: override?.en ?? en,
    });
  }
  return commits;
}

function build() {
  const entries = [...SEED];
  let [major, minor] = SEED[SEED.length - 1].version.split(".").map(Number);

  // Collapse consecutive commits with the same summary (e.g. an amended commit
  // that also lingers in history) so a version isn't logged twice.
  let previousZh = null;
  for (const commit of readTrailerCommits()) {
    if (commit.zh === previousZh) continue;
    previousZh = commit.zh;
    minor += 1;
    entries.push({ version: `${major}.${minor}.0`, date: commit.date, zh: commit.zh, en: commit.en });
  }

  // Newest first for display.
  return entries.reverse();
}

const displayEntries = build();

const header = `// AUTO-GENERATED by scripts/gen-changelog.mjs — do not edit by hand.
// Add a "更新: <中文一句话>" trailer (optionally "Changelog-EN: <English>") to a
// commit, then run \`npm run changelog\` to refresh this file.

export interface ChangelogEntry {
  version: string;
  date: string;
  zh: string;
  en: string;
}

export const CHANGELOG: ChangelogEntry[] = ${JSON.stringify(displayEntries, null, 2)};
`;

const outPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "client/src/data/changelog.generated.ts"
);
writeFileSync(outPath, header);
console.log(`Wrote ${displayEntries.length} changelog entries → ${outPath}`);
