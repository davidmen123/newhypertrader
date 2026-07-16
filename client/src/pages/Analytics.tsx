import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BarChart3, Users, Globe, Smartphone, Laptop, Clock, Calendar, MapPin, ArrowLeft, Eye, Monitor, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

const today = new Date().toISOString().split("T")[0];
const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
  return `${Math.round(seconds / 3600)}小时${Math.round((seconds % 3600) / 60)}分钟`;
}

function AnalyticsDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<"today" | "week" | "custom">("week");
  const [customStartDate, setCustomStartDate] = useState(oneWeekAgo);
  const [customEndDate, setCustomEndDate] = useState(today);

  const getDateRange = () => {
    if (selectedPeriod === "today") {
      return { startDate: today, endDate: today };
    }
    if (selectedPeriod === "week") {
      return { startDate: oneWeekAgo, endDate: today };
    }
    return { startDate: customStartDate, endDate: customEndDate };
  };

  const dateRange = getDateRange();

  const { data: dailyStatsResult, isLoading: dailyLoading, refetch: refetchDaily } = trpc.analytics.dailyStats.useQuery(dateRange, { refetchInterval: 30000 });
  const { data: deviceStatsResult, isLoading: deviceLoading, refetch: refetchDevice } = trpc.analytics.deviceStats.useQuery(dateRange, { refetchInterval: 30000 });
  const { data: osStatsResult, isLoading: osLoading, refetch: refetchOs } = trpc.analytics.osStats.useQuery(dateRange, { refetchInterval: 30000 });
  const { data: ipListResult, isLoading: ipLoading, refetch: refetchIp } = trpc.analytics.ipList.useQuery({ ...dateRange, limit: 20 }, { refetchInterval: 30000 });
  const { data: browserStatsResult, isLoading: browserLoading, refetch: refetchBrowser } = trpc.analytics.browserStats.useQuery(dateRange, { refetchInterval: 30000 });
  const { data: hourlyStatsResult, isLoading: hourlyLoading, refetch: refetchHourly } = trpc.analytics.hourlyStats.useQuery(dateRange, { refetchInterval: 30000 });
  const { data: geoStatsResult, isLoading: geoLoading, refetch: refetchGeo } = trpc.analytics.geoStats.useQuery(dateRange, { refetchInterval: 30000 });
  const { data: recentVisitorsResult, isLoading: recentLoading, refetch: refetchRecent } = trpc.analytics.recentVisitors.useQuery({ limit: 15 }, { refetchInterval: 10000 });
  const { data: healthResult } = trpc.analytics.health.useQuery();

  const refreshAll = useCallback(() => {
    refetchDaily();
    refetchDevice();
    refetchOs();
    refetchIp();
    refetchBrowser();
    refetchHourly();
    refetchGeo();
    refetchRecent();
  }, [refetchDaily, refetchDevice, refetchOs, refetchIp, refetchBrowser, refetchHourly, refetchGeo, refetchRecent]);

  const dailyStats = dailyStatsResult?.stats ?? [];
  const deviceStats = deviceStatsResult?.stats ?? [];
  const osStats = osStatsResult?.stats ?? [];
  const ipList = ipListResult?.ips ?? [];
  const browserStats = browserStatsResult?.stats ?? [];
  const hourlyStats = hourlyStatsResult?.stats ?? [];
  const geoStats = geoStatsResult?.stats ?? [];
  const recentVisitors = recentVisitorsResult?.visitors ?? [];

  const totalVisits = dailyStats.reduce((sum: number, day: { visits: number }) => sum + day.visits, 0);
  const totalUniqueIps = dailyStats.reduce((sum: number, day: { uniqueIps: number }) => sum + day.uniqueIps, 0);
  const avgDuration = dailyStats.length
    ? Math.round(dailyStats.reduce((sum: number, day: { avgDuration: number }) => sum + (day.avgDuration ?? 0), 0) / dailyStats.length)
    : 0;

  const totalDesktop = deviceStats.find((d: { deviceType: string | null }) => d.deviceType === "desktop")?.count ?? 0;
  const totalMobile = deviceStats.find((d: { deviceType: string | null }) => d.deviceType === "mobile")?.count ?? 0;
  const totalTablet = deviceStats.find((d: { deviceType: string | null }) => d.deviceType === "tablet")?.count ?? 0;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, "0")}:00`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 lg:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">网站访问统计</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAll}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = "/"}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                返回主页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const trackMutation = trpc.analytics.track.useMutation({
                    onSuccess: () => alert("✅ 测试上报成功！"),
                    onError: () => alert("❌ 测试上报失败！"),
                  });
                  trackMutation.mutate({
                    page: "/analytics",
                    userAgent: navigator.userAgent,
                  });
                }}
                className="flex items-center gap-2"
              >
                测试上报
              </Button>
            </div>
          </div>
          <p className="text-slate-500">实时追踪您的网站访问数据</p>
          {healthResult && (
            <div className={`mt-2 px-4 py-2 rounded-lg text-sm ${healthResult.status === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {healthResult.status === "ok" ? (
                <>✅ 系统正常运行 | 数据库记录数: {healthResult.visitorCount}</>
              ) : (
                <>❌ 系统异常: {healthResult.message}</>
              )}
            </div>
          )}
        </header>

        <div className="flex flex-wrap gap-2 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedPeriod("today")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === "today"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              今日
            </button>
            <button
              onClick={() => setSelectedPeriod("week")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === "week"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              本周
            </button>
            <button
              onClick={() => setSelectedPeriod("custom")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === "custom"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              自定义
            </button>
          </div>
          {selectedPeriod === "custom" && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <Users className="w-5 h-5 text-blue-500" />
                <Badge variant="secondary" className="text-xs">总访问量</Badge>
              </div>
              <div className="text-2xl font-bold text-slate-900">{totalVisits.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">页面访问次数</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <Globe className="w-5 h-5 text-green-500" />
                <Badge variant="secondary" className="text-xs">独立IP</Badge>
              </div>
              <div className="text-2xl font-bold text-slate-900">{totalUniqueIps.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">不同访客来源</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <Laptop className="w-5 h-5 text-purple-500" />
                <Badge variant="secondary" className="text-xs">桌面端</Badge>
              </div>
              <div className="text-2xl font-bold text-slate-900">{totalDesktop.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">电脑访问</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <Smartphone className="w-5 h-5 text-orange-500" />
                <Badge variant="secondary" className="text-xs">移动端</Badge>
              </div>
              <div className="text-2xl font-bold text-slate-900">{totalMobile.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">手机访问</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="daily" className="mb-6">
          <TabsList>
            <TabsTrigger value="daily">每日趋势</TabsTrigger>
            <TabsTrigger value="device">设备分布</TabsTrigger>
            <TabsTrigger value="browser">浏览器</TabsTrigger>
            <TabsTrigger value="hourly">访问时段</TabsTrigger>
            <TabsTrigger value="geo">地理分布</TabsTrigger>
            <TabsTrigger value="recent">实时访客</TabsTrigger>
            <TabsTrigger value="ips">访问地区</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="mt-0">
            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">每日访问趋势</CardTitle>
                <CardDescription>按日期统计访问量和独立IP数</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : dailyStats.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">暂无数据</div>
                ) : (
                  <div className="space-y-4">
                    {dailyStats.sort((a: { date: string }, b: { date: string }) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((day: { date: string; visits: number; uniqueIps: number; avgDuration: number }) => (
                      <div key={day.date} className="flex items-center gap-4">
                        <div className="w-16 text-sm font-medium text-slate-600">{formatDate(day.date)}</div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-500">访问量</span>
                            <span className="text-sm font-medium text-slate-900">{day.visits}</span>
                          </div>
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min((day.visits / (dailyStats.reduce((m: number, d: { visits: number }) => Math.max(m, d.visits), 0) || 1)) * 100, 100)}%` }}></div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-500">独立IP</span>
                            <span className="text-sm font-medium text-slate-900">{day.uniqueIps}</span>
                          </div>
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min((day.uniqueIps / (dailyStats.reduce((m: number, d: { uniqueIps: number }) => Math.max(m, d.uniqueIps), 0) || 1)) * 100, 100)}%` }}></div>
                          </div>
                        </div>
                        <div className="w-24 text-right">
                          <div className="flex items-center gap-1 text-sm text-slate-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatDuration(day.avgDuration ?? 0)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="device" className="mt-0">
            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">设备类型分布</CardTitle>
                <CardDescription>访问者使用的设备类型</CardDescription>
              </CardHeader>
              <CardContent>
                {deviceLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : deviceStats.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">暂无数据</div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    {deviceStats.map((item: { deviceType: string | null; count: number; percentage: number }) => (
                      <div key={item.deviceType ?? "unknown"} className={`p-4 rounded-xl ${item.deviceType === "desktop" ? "bg-purple-50" : item.deviceType === "mobile" ? "bg-orange-50" : item.deviceType === "tablet" ? "bg-cyan-50" : "bg-slate-50"}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {item.deviceType === "desktop" && <Laptop className="w-5 h-5 text-purple-600" />}
                          {item.deviceType === "mobile" && <Smartphone className="w-5 h-5 text-orange-600" />}
                          {item.deviceType === "tablet" && <Smartphone className="w-5 h-5 text-cyan-600" />}
                          {!item.deviceType && <Globe className="w-5 h-5 text-slate-600" />}
                          <span className="font-medium text-slate-900">{item.deviceType === "desktop" ? "桌面端" : item.deviceType === "mobile" ? "移动端" : item.deviceType === "tablet" ? "平板" : "未知"}</span>
                        </div>
                        <div className="text-3xl font-bold text-slate-900">{item.count.toLocaleString()}</div>
                        <div className="text-sm text-slate-500">{item.percentage}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="browser" className="mt-0">
            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">浏览器分布</CardTitle>
                <CardDescription>访问者使用的浏览器</CardDescription>
              </CardHeader>
              <CardContent>
                {browserLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : browserStats.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">暂无数据</div>
                ) : (
                  <div className="space-y-3">
                    {browserStats.map((item: { browser: string | null; count: number; percentage: number }) => (
                      <div key={item.browser ?? "unknown"} className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4 text-slate-500" />
                          <span className="w-24 text-sm font-medium text-slate-600 truncate">{item.browser ?? "未知"}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-500">{item.count} 次访问</span>
                            <span className="text-sm font-medium text-slate-900">{item.percentage}%</span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${item.browser === "Chrome" ? "bg-blue-500" : item.browser === "Safari" ? "bg-gray-500" : item.browser === "Firefox" ? "bg-orange-500" : item.browser === "Edge" ? "bg-teal-500" : item.browser === "Opera" ? "bg-red-500" : "bg-slate-400"}`} style={{ width: `${item.percentage}%` }}></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hourly" className="mt-0">
            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">访问时段分布</CardTitle>
                <CardDescription>按小时统计访问量</CardDescription>
              </CardHeader>
              <CardContent>
                {hourlyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : hourlyStats.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">暂无数据</div>
                ) : (
                  <div className="flex flex-wrap justify-between items-end gap-1 h-48">
                    {hourlyStats.map((item: { hour: number; visits: number; percentage: number }) => (
                      <div key={item.hour} className="flex flex-col items-center flex-1 min-w-[40px]">
                        <div className="text-xs text-slate-500 mb-1">{formatHour(item.hour)}</div>
                        <div className="w-full max-w-[32px] bg-blue-100 rounded-t-sm overflow-hidden">
                          <div className="w-full bg-blue-500 transition-all" style={{ height: `${Math.max(item.percentage * 3, 4)}px` }}></div>
                        </div>
                        <div className="text-xs font-medium text-slate-700 mt-1">{item.visits}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geo" className="mt-0">
            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">地理分布</CardTitle>
                <CardDescription>访问者所在地区</CardDescription>
              </CardHeader>
              <CardContent>
                {geoLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : geoStats.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">暂无数据</div>
                ) : (
                  <div className="space-y-3">
                    {geoStats.map((item: { region: string | null; city: string | null; count: number; percentage: number }) => (
                      <div key={`${item.region}-${item.city}`} className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-slate-500" />
                          <span className="w-32 text-sm font-medium text-slate-600 truncate">{item.region || item.city || "未知地区"}</span>
                        </div>
                        {item.city && item.region && <span className="text-xs text-slate-400">({item.city})</span>}
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-500">{item.count} 次访问</span>
                            <span className="text-sm font-medium text-slate-900">{item.percentage}%</span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${item.percentage}%` }}></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recent" className="mt-0">
            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">实时访客</CardTitle>
                <CardDescription>最近访问记录</CardDescription>
              </CardHeader>
              <CardContent>
                {recentLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : recentVisitors.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">暂无数据</div>
                ) : (
                  <div className="space-y-2">
                    {recentVisitors.map((item: { region: string | null; city: string | null; page: string | null; deviceType: string | null; os: string | null; browser: string | null; createdAt: string }) => (
                      <div key={item.createdAt + (item.region || "")} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                        <div className="w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full">
                          <Eye className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700">{item.region || item.city || "未知地区"}</span>
                            {item.city && item.region && <span className="text-xs text-slate-400">({item.city})</span>}
                            <Badge variant="outline" className="text-xs">{item.deviceType === "desktop" ? "桌面" : item.deviceType === "mobile" ? "手机" : item.deviceType === "tablet" ? "平板" : "未知"}</Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-500">{item.page || "/"}</span>
                            <span className="text-xs text-slate-400">|</span>
                            <span className="text-xs text-slate-500">{item.os || "未知系统"}</span>
                            <span className="text-xs text-slate-400">|</span>
                            <span className="text-xs text-slate-500">{item.browser || "未知浏览器"}</span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(item.createdAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ips" className="mt-0">
            <Card className="shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">访问地区列表</CardTitle>
                <CardDescription>最近访问地区及访问次数</CardDescription>
              </CardHeader>
              <CardContent>
                {ipLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : ipList.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">暂无数据</div>
                ) : (
                  <div className="space-y-2">
                    {ipList.map((item: { region: string | null; city: string | null; visits: number; lastVisit: string }, index: number) => (
                      <div key={(item.region || "") + (item.city || "")} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                        <div className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full text-xs font-medium">{index + 1}</div>
                        <div className="flex-1 text-sm text-slate-700">
                          {item.region || item.city || "未知地区"}
                          {item.city && item.region && <span className="text-xs text-slate-400">({item.city})</span>}
                        </div>
                        <div className="text-sm font-medium text-slate-900">{item.visits} 次</div>
                        <div className="text-xs text-slate-500">
                          {new Date(item.lastVisit).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="shadow-sm border-slate-200 mt-6">
          <CardContent className="p-4 text-center text-sm text-slate-500">
            平均停留时间: <span className="font-medium text-slate-900">{formatDuration(avgDuration)}</span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AnalyticsDashboard;