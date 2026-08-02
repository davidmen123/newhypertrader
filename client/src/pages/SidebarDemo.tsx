import { useState } from "react";
import { BarChart3, BookOpen, Calculator, ChevronDown, ClipboardList, FileClock, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, WalletCards, X } from "lucide-react";
import LiveTicker from "@/components/LiveTicker";
import PositionsTable from "@/components/PositionsTable";
import OpenOrdersTable from "@/components/OpenOrdersTable";
import PnlChart from "@/components/PnlChart";
import AccountOverview from "@/components/AccountOverview";
import TradeHistory from "@/components/TradeHistory";
import PositionCalculator from "@/components/PositionCalculator";
import { useLang } from "@/contexts/LangContext";

function Section({ id, label, defaultOpen = true, children }: { id: string; label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="scroll-mt-20">
      <button type="button" onClick={() => setOpen((value) => !value)} className="mb-5 flex w-full items-center gap-4 text-left" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} aria-expanded={open}>
        <span className="text-xs tracking-[0.25em]" style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <ChevronDown size={14} style={{ color: "var(--muted-foreground)", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s ease" }} />
      </button>
      <div style={{ display: open ? "block" : "none" }}>{children}</div>
    </section>
  );
}

export default function SidebarDemo() {
  const { lang } = useLang();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navItems = [
    ["overview", lang === "zh" ? "账户概览" : "Overview", LayoutDashboard],
    ["positions", lang === "zh" ? "持仓明细" : "Positions", WalletCards],
    ["orders", lang === "zh" ? "当前委托" : "Open Orders", ClipboardList],
    ["pnl", lang === "zh" ? "损益历史" : "PnL History", BarChart3],
    ["review", lang === "zh" ? "复盘模式" : "Review Mode", BookOpen],
    ["trades", lang === "zh" ? "历史成交" : "Trade History", FileClock],
    ["tools", lang === "zh" ? "辅助工具" : "Tools", Calculator],
  ] as const;
  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {mobileOpen && <button type="button" aria-label="关闭菜单" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/20 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r transition-all duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`} style={{ width: collapsed ? 76 : 236, background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between border-b px-5 py-7" style={{ borderColor: "var(--border)" }}>
          {!collapsed && <div><div className="font-serif text-2xl tracking-wide">PnLNote</div><div className="mt-1 text-[10px] tracking-[0.2em]" style={{ color: "var(--primary)" }}>TRADING FOR A LIVING</div></div>}
          <button type="button" aria-label="切换侧栏宽度" onClick={() => setCollapsed((value) => !value)} className="hidden rounded-md p-2 lg:block" style={{ color: "var(--muted-foreground)" }}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
          <button type="button" aria-label="关闭侧栏" onClick={() => setMobileOpen(false)} className="rounded-md p-2 lg:hidden"><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {!collapsed && <div className="px-3 pb-2 text-[11px] tracking-[0.18em]" style={{ color: "var(--muted-foreground)" }}>实盘账户</div>}
          {navItems.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => jumpTo(id)} title={collapsed ? label : undefined} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted" style={{ color: "var(--muted-foreground)" }}><Icon size={17} strokeWidth={1.7} />{!collapsed && <span>{label}</span>}</button>)}
          {!collapsed && <div className="mt-7 px-3 pb-2 text-[11px] tracking-[0.18em]" style={{ color: "var(--muted-foreground)" }}>其他</div>}
          <button type="button" onClick={() => jumpTo("tools")} title={collapsed ? "工具与设置" : undefined} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted" style={{ color: "var(--muted-foreground)" }}><SlidersHorizontal size={17} strokeWidth={1.7} />{!collapsed && <span>工具与设置</span>}</button>
        </nav>
        {!collapsed && <div className="border-t px-5 py-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>侧栏预览 · 不影响主页</div>}
      </aside>

      <main className={`min-w-0 transition-[margin] duration-200 ${collapsed ? "lg:ml-[76px]" : "lg:ml-[236px]"}`}>
        <header className="sticky top-0 z-20 border-b px-4 py-4 backdrop-blur sm:px-8" style={{ background: "color-mix(in srgb, var(--background) 92%, transparent)", borderColor: "var(--border)" }}>
          <div className="mx-auto flex max-w-6xl items-center gap-3"><button type="button" aria-label="打开菜单" onClick={() => setMobileOpen(true)} className="rounded-md p-2 lg:hidden"><Menu size={20} /></button><div><h1 className="font-serif text-2xl font-normal sm:text-3xl">账户概览</h1><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>侧栏导航版 · Hyperliquid 实盘账户 · USDC</p></div></div>
        </header>
        <div className="mx-auto space-y-9 px-4 py-8 sm:px-8 lg:px-12">
          <Section id="overview" label="账户概览"><AccountOverview /></Section>
          <Section id="positions" label="持仓明细"><PositionsTable /></Section>
          <Section id="orders" label="当前委托"><OpenOrdersTable /></Section>
          <Section id="pnl" label="损益历史"><PnlChart /></Section>
          <Section id="review" label="复盘模式" defaultOpen={false}><div className="rounded-xl border p-6 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>复盘模式入口预览：点击净值曲线交易节点查看详情。</div></Section>
          <Section id="trades" label="历史成交" defaultOpen={false}><TradeHistory /></Section>
          <Section id="tools" label="辅助工具" defaultOpen={false}><PositionCalculator /></Section>
          <Section id="market" label="实时行情" defaultOpen={false}><LiveTicker /></Section>
        </div>
      </main>
    </div>
  );
}
