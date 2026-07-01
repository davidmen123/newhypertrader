# Deribit Dashboard TODO

- [x] 配置 Deribit API Key 和 Secret 到环境变量
- [x] 设计并推送数据库 Schema（trades, pnl_snapshots）
- [x] 后端：Deribit REST API 认证模块
- [x] 后端：账户余额/净值 tRPC 路由
- [x] 后端：当前持仓列表 tRPC 路由（期权+期货）
- [x] 后端：历史交易记录 tRPC 路由（含数据库存储）
- [x] 后端：PnL 统计计算 tRPC 路由
- [x] 后端：WebSocket 连接 Deribit 实时数据流
- [x] 后端：定时同步交易数据到数据库
- [x] 前端：粗野主义暗色主题全局样式
- [x] 前端：Dashboard 布局（Tab 导航）
- [x] 前端：账户余额/净值卡片
- [x] 前端：持仓列表表格
- [x] 前端：历史交易记录表格（含时间范围筛选）
- [x] 前端：PnL 趋势图表
- [x] 前端：WebSocket 实时价格推送展示
- [x] 前端：数据自动刷新
- [x] 前端：响应式布局
- [x] 编写 Vitest 测试（5/5 通过）

## UI 重设计（2026-03-09）
- [x] 全局主题改为深蓝绿渐变背景 + 衬线字体标题 + 极简苹果风
- [x] 只保留 BTC 和 ETH 标的，移除其他货币
- [x] 重建 LiveTicker 组件（极简卡片风格）
- [x] 重建 AccountSummaryCard 组件（极简风格）
- [x] 重建 PositionsTable 组件（极简风格）
- [x] 重建 TradesTable 组件（极简风格）
- [x] 重建 PnlChart 组件（极简风格）
- [x] 重建 Home.tsx 主页布局（极简居中布局）
- [x] 后端限制只查询 BTC 和 ETH 数据（前端过滤）

## 页面重构（2026-03-09 v3）
- [x] 标题改为 Wings' option TRADING DASHBOARD
- [x] 中英双语切换（EN/中文）
- [x] Portfolio 改为账户总览：USDT/BTC/ETH 余额一览
- [x] 持仓全部展示不折叠，放在价格卡片下方
- [x] PnL 损益图全部展示不折叠，放在持仓下方
- [x] 底部汇总：BTC/USDT 持仓、初始净值、当前净值、盈亏、Delta
- [x] 移除 Tab 导航，改为单页滚动全展示

## 自动快照功能（2026-03-09 v4）
- [x] 后端：每小时自动为 BTC 和 ETH 各记录一次 PnL 快照
- [x] 后端：记录最近一次自动快照的执行时间
- [x] 前端：在 PnL 图表区域展示自动快照状态和最近执行时间

## 持仓合计行（2026-03-09 v5）
- [x] 期货表格底部：未实现盈亏合计、总盈亏合计
- [x] 期权表格底部：未实现盈亏合计、Delta 合计、Vega 合计、Theta 合计
- [x] 全部持仓底部：跨期权/期货的 Delta 总合计

## Bug 修复（2026-03-10）
- [x] 修复 PnL 快照写入数据库时 equity/balance 等字段为 undefined 导致的 SQL 错误

## 精度调整 + 日历模块（2026-03-10）
- [x] 持仓 Size 保留 2 位小数
- [x] 持仓 Avg Price / Mark Price 保留 0 位小数（整数）
- [x] 持仓 Delta/Gamma/Vega/Theta 保留 2 位小数
- [x] PnL History 数値保留 2 位小数
- [x] 移除底部 Portfolio 模块
- [x] 新增美国重要经测数据近一周日历组件
- [x] 新增美股近一周前50大公司财报发布时间组件（UTC+8）

## Bug 修复（2026-03-10 v2）
- [x] 修复经测日历显示旧数据（切换到 ForexFactory 免费 API，返回当前周真实数据）

## 语言默认设置（2026-03-10 v3）
- [x] 将页面默认语言改为中文（zh），保留中英切换按鈕

## Bug 修复（2026-03-10 v4）
- [x] 修复经测日历显示“未来7天无重要经测数据”（改为前端直接调用 ForexFactory API，绕过服务器限流）

## Bug 修复（2026-03-10 v5）
- [x] 彻底修复经测日历：修复日期解析和时间范围过滤，CPI/非农/FOMC 等重要事件现已正确显示

## Bug 修复（2026-03-10 v6）
- [x] 修复经济日历 CORS 问题：改为后端代理+内存缓存请求 ForexFactory，前端改回 tRPC 调用

## 行情区域重设计（2026-03-10 v7）
- [x] 后端：添加 VIX 指数数据接口（Yahoo Finance）
- [x] 后端：添加 BTC DVOL 和 ETH DVOL 数据接口（Deribit）
- [x] 前端：BTC/ETH 价格卡片缩小，移除买一卖一/标记/指数
- [x] 前端：下方新增 VIX 和 DVOL 指数卡片，字体大小与 BTC/ETH 一致

## 行情区域重设计 v2（2026-03-10 v8）
- [ ] 后端：添加 MSTR/COIN/CRCL 股票价格接口（Yahoo Finance）
- [ ] 后端：添加 CRCL IV 隐含波动率接口（Yahoo Finance 期权链）
- [ ] 后端：移除 ETH DVOL，保留 BTC DVOL
- [ ] 前端：第一栏 BTC/ETH/MSTR/COIN/CRCL 价格（5卡片）
- [ ] 前端：第二栏 VIX/BTC DVOL/CRCL IV（3卡片），每个下方显示前一日数值对比

## 访问计数器（2026-03-11）
- [x] 数据库新增 page_views 表（id, count, updatedAt）
- [x] 后端：incrementPageViews / getPageViews 函数
- [x] 后端：tRPC pageViews.increment（mutation）和 pageViews.get（query）路由
- [x] 前端：页面加载时调用 increment，footer 右侧以极小字体显示累计访问次数
- [x] 编写 pageViews 功能 Vitest 测试（5/5 通过）

## P&L 归因分析（2026-03-11）
- [x] DB schema 扩展 pnl_snapshots 表：新增 deltaTotal, optionsTheta, optionsVega, optionsGamma, btcSpotPrice 字段
- [x] 推送 schema 迁移
- [x] scheduler.ts 快照时记录 Greeks 字段（deltaTotal/optionsTheta/optionsVega/optionsGamma）
- [x] routers/deribit.ts 新增 pnlAttribution 接口：按相邻快照差值计算 Theta/Delta/Vega 归因
- [x] 前端：新建 PnlAttribution.tsx 组件（堆叠柱状图 + 汇总表格）
- [x] Home.tsx 在损益历史区块下方插入归因分析区块
- [x] 编写归因计算逻辑的 Vitest 测试

## 账户总净值新增总盈亏和盈亏率（2026-03-13）
- [x] 后端 accountOverview 接口新增 totalPnl（USDC）和 totalPnlPct（%）字段
- [x] 前端 AccountOverview 组件在总净值卡片下方展示总盈亏和盈亏率

## 损益历史时间范围修复 + 历史交易记录（2026-03-13）
- [x] 复核并修复后端 pnlHistory 路由的 1d/7d/30d/90d/MAX 时间范围计算
- [x] 损益历史起始日期固定为 2026-03-09
- [x] 修复历史交易记录只显示当日，改为显示全部历史记录
- [x] 前端时间范围选择器逻辑与后端对齐

## 历史数据全量回填 + 交易记录分页（2026-03-13）
- [x] 后端：新增 backfillHistory 接口，从 2026-03-09 起拉取 Deribit 历史交易并存入 DB
- [x] 后端： getTradesFromDb 支持返回总记录数（COUNT），用于前端分页
- [x] 后端： tradeHistory 路由支持服务端分页（page + pageSize）
- [x] 前端：首次加载时触发历史数据回填（一次性）
- [x] 前端： TradeHistory 组件改为服务端分页（显示总页数、当前页、跳转）
## 损益历史图表排序修复（2026-03-13）
- [x] 修复损益历史图表 X 轴顺序：改为从左到右时间升序（最早在左，最新在右）

## 均价/标记价显示修复 + 小数位数（2026-03-16）
- [x] 定位均价（avgPrice）和标记价（markPrice）不显示的原因
- [x] 均价、标记价保留小数点后5位
- [x] Gamma 等 Greeks 保留小数点后5位

## 期权均价换算 + 亏损预警图标（2026-03-16）
- [x] 期权均价旁新增括号注释，显示 BTC 计价换算为 USDC 的估算值
- [x] 当期权未实现亏损超过初始权利金 50% 时，在该行显示橙色预警图标

## 历史成交价/标记价小数位修复（2026-03-17）
- [x] 历史成交记录的成交价和标记价改为保留小数点后4位

## 账户概览新增最大回撤（2026-03-18）
- [x] 后端 accountOverview 接口新增 maxDrawdown（USDC）和 maxDrawdownPct（%）
- [x] 前端账户概览新增最大回撤卡片，显示金额和幅度
