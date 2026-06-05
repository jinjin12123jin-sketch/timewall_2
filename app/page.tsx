"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { ChevronLeft, ChevronRight, Settings, Share } from "lucide-react";

type ViewMode = "day" | "week" | "month" | "year" | "report";
type ReportStyle = "receipt" | "poster" | "quiet";
type ThemeOption = {
  id: string;
  colors: string[];
};
type DayRecord = {
  blocks: number[];
  locked: boolean;
};
type TimewallState = {
  themeId: string;
  labels: string[];
  days: Record<string, DayRecord>;
};

const STORAGE_KEY = "timewall.v2";
const LEGACY_STORAGE_KEY = "timewall.v1";
const BLANK = "#F6F2E8";

const BLOCKS = Array.from({ length: 8 }, (_, index) => ({
  id: index,
  label: `${String(index * 3).padStart(2, "0")}:00`,
  range: `${String(index * 3).padStart(2, "0")}:00-${String((index + 1) * 3).padStart(2, "0")}:00`,
}));

const THEMES = [
  {
    id: "acid-geometry",
    colors: [BLANK, "#F26732", "#52AACE", "#8E6EC2"],
  },
  {
    id: "new-art",
    colors: [BLANK, "#F4F23B", "#F84C8F", "#A7E6A8"],
  },
  {
    id: "field-stripe",
    colors: [BLANK, "#31C65B", "#FF7A70", "#8FD0EA"],
  },
  {
    id: "vertical-poster",
    colors: [BLANK, "#66329A", "#C91D75", "#FF962D"],
  },
] satisfies ThemeOption[];

const REPORT_COPY = {
  receipt: {
    name: "小票",
    hint: "把这一周收好，像一张只属于你的时间凭证。",
  },
  poster: {
    name: "海报",
    hint: "这一周已经留下形状，它不必解释，也足够醒目。",
  },
  quiet: {
    name: "现代",
    hint: "颜色慢慢散开，你只需要看见这一周的重量。",
  },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const REPORT_WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const emptyDay = (): DayRecord => ({ blocks: Array(8).fill(0), locked: false });

const normalizeDate = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const dateKey = (date: Date) => {
  const normalized = normalizeDate(date);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, "0");
  const day = String(normalized.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDotDate = (date: Date) => {
  const normalized = normalizeDate(date);
  return `${normalized.getFullYear()}.${String(normalized.getMonth() + 1).padStart(2, "0")}.${String(normalized.getDate()).padStart(2, "0")}`;
};

const formatDotDateRange = (start: Date, end: Date) => `${formatDotDate(start)}~${formatDotDate(end)}`;

const addDays = (date: Date, amount: number) => {
  const next = normalizeDate(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfWeek = (date: Date) => {
  const normalized = normalizeDate(date);
  const day = normalized.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(normalized, diff);
};

const getIsoWeekInfo = (date: Date) => {
  const target = normalizeDate(date);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const isoYear = target.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstWeekStart = startOfWeek(firstThursday);
  const week = Math.floor((target.getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return { year: isoYear, week };
};

const formatTitle = (date: Date) => {
  const today = dateKey(new Date());
  const yesterday = dateKey(addDays(new Date(), -1));
  const key = dateKey(date);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
};

const formatPrimaryDate = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const formatWeekDateRange = (date: Date) => {
  const firstDay = startOfWeek(date);
  const lastDay = addDays(firstDay, 6);
  const firstMonth = firstDay.toLocaleDateString("en-US", { month: "short" });
  const lastMonth = lastDay.toLocaleDateString("en-US", { month: "short" });

  if (firstDay.getFullYear() !== lastDay.getFullYear()) {
    return `${firstMonth} ${firstDay.getDate()}, ${firstDay.getFullYear()} - ${lastMonth} ${lastDay.getDate()}, ${lastDay.getFullYear()}`;
  }

  if (firstDay.getMonth() !== lastDay.getMonth()) {
    return `${firstMonth} ${firstDay.getDate()} - ${lastMonth} ${lastDay.getDate()}`;
  }

  return `${firstMonth} ${firstDay.getDate()} - ${lastDay.getDate()}`;
};

const formatWeekSubInfo = (date: Date) => {
  const { year, week } = getIsoWeekInfo(date);
  return `${year} · W${week}`;
};

const formatMonthTitle = (date: Date) => date.toLocaleDateString("en-US", { month: "long" });

const formatDateMeta = (date: Date) =>
  `${date.getFullYear()} · ${date.toLocaleDateString("en-US", {
    weekday: "long",
  })}`;

const getInitialState = (): TimewallState => ({
  themeId: "acid-geometry",
  labels: ["", "", "", ""],
  days: {},
});

const isDayRecord = (value: unknown): value is DayRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as DayRecord;
  return Array.isArray(record.blocks) && record.blocks.length === 8 && typeof record.locked === "boolean";
};

const normalizeState = (value: unknown): TimewallState => {
  if (!value || typeof value !== "object") return getInitialState();
  const raw = value as Partial<TimewallState>;
  const legacyThemeMap: Record<string, string> = {
    earth: "acid-geometry",
    electric: "new-art",
    sorbet: "field-stripe",
    ink: "vertical-poster",
  };
  const rawThemeId = String(raw.themeId ?? "");
  const mappedThemeId = legacyThemeMap[rawThemeId] ?? rawThemeId;
  const themeId = THEMES.some((theme) => theme.id === mappedThemeId) ? mappedThemeId : "acid-geometry";
  const labels = Array.from({ length: 4 }, (_, index) => String(raw.labels?.[index] ?? ""));
  const days = Object.entries(raw.days ?? {}).reduce<Record<string, DayRecord>>((result, [key, day]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !isDayRecord(day)) return result;
    result[key] = {
      locked: day.locked,
      blocks: day.blocks.map((block) => (Number.isInteger(block) && block >= 0 && block <= 3 ? block : 0)),
    };
    return result;
  }, {});

  return { themeId, labels, days };
};

const getDay = (state: TimewallState, key: string) => state.days[key] ?? emptyDay();

const dominantColorIndex = (blocks: number[]) => {
  const counts = [0, 0, 0, 0];
  blocks.forEach((block) => {
    counts[block] += 1;
  });
  let winner = 0;
  counts.forEach((count, index) => {
    if (index !== 0 && count > counts[winner]) winner = index;
  });
  return winner;
};

const downloadTextFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
};

const createReportText = (labels: string[], counts: number[], filledBlocks: number) => {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const rows = counts.map((count, index) => {
    const name = labels[index]?.trim() || `颜色 ${index + 1}`;
    return `${name}: ${Math.round((count / total) * 100)}%`;
  });
  return [`Timewall 本周小报`, `已记录 ${filledBlocks} 个有颜色的时间块`, ...rows].join("\n");
};

const openImageLoading = (preview: Window | null) => {
  if (!preview) return;
  preview.document.write(
    [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      '<title>Timewall export</title>',
      '<style>',
      'html, body { min-height: 100%; margin: 0; background: #f3f0e8; }',
      'body { display: grid; place-items: center; padding: 24px; color: #24221e; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
      'p { margin: 0; border: 1px solid rgba(36,34,30,0.12); border-radius: 999px; padding: 13px 18px; background: rgba(255,253,247,0.86); box-shadow: 0 12px 34px rgba(36,34,30,0.12); font-size: 14px; font-weight: 700; }',
      '</style>',
      '</head>',
      '<body><p>&#27491;&#22312;&#29983;&#25104;&#22270;&#29255;...</p></body>',
      '</html>',
    ].join(''),
  );
  preview.document.close();
};

const openImagePreview = (preview: Window | null, dataUrl: string, filename: string) => {
  if (!preview) return;
  const serializedDataUrl = JSON.stringify(dataUrl);
  const serializedFilename = JSON.stringify(filename);
  const shareButtonLabel = "\u4fdd\u5b58/\u5206\u4eab\u56fe\u7247";
  const downloadButtonLabel = "\u4e0b\u8f7d PNG";
  const previewHelp = "\u624b\u673a\u6d4f\u89c8\u5668\u4e0d\u80fd\u81ea\u52a8\u5199\u5165\u76f8\u518c\u3002\u53ef\u70b9\u201c\u4fdd\u5b58/\u5206\u4eab\u56fe\u7247\u201d\u8c03\u8d77\u7cfb\u7edf\u9762\u677f\uff0c\u6216\u70b9\u201c\u4e0b\u8f7d PNG\u201d\uff0c\u4e5f\u53ef\u4ee5\u957f\u6309\u56fe\u7247\u4fdd\u5b58\u3002";
  const shareTitle = "Timewall \u672c\u5468\u5c0f\u62a5";
  const shareText = "\u4fdd\u5b58\u6216\u5206\u4eab\u8fd9\u5f20 Timewall \u5c0f\u62a5";
  const unsupportedShareText = "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u76f4\u63a5\u5206\u4eab\u56fe\u7247\uff0c\u8bf7\u70b9\u51fb\u4e0b\u8f7d PNG\uff0c\u6216\u957f\u6309\u56fe\u7247\u4fdd\u5b58\u3002";
  const failedShareText = "\u5f53\u524d\u6d4f\u89c8\u5668\u6ca1\u6709\u6253\u5f00\u5206\u4eab\u9762\u677f\uff0c\u8bf7\u70b9\u51fb\u4e0b\u8f7d PNG\uff0c\u6216\u957f\u6309\u56fe\u7247\u4fdd\u5b58\u3002";

  const previewHtml = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<title>' + filename + '</title>',
    '<style>',
    'html, body { min-height: 100%; margin: 0; background: #f3f0e8; }',
    'body { display: grid; gap: 14px; justify-items: center; padding: 16px; color: #24221e; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
    '.actions { position: sticky; top: 12px; z-index: 2; display: flex; width: min(100%, 430px); gap: 8px; padding: 8px; border: 1px solid rgba(36,34,30,0.12); border-radius: 999px; background: rgba(255,253,247,0.88); box-shadow: 0 12px 34px rgba(36,34,30,0.14); backdrop-filter: blur(14px); }',
    'button, a { flex: 1; min-height: 42px; border: 1px solid rgba(36,34,30,0.14); border-radius: 999px; background: #24221e; color: #fffdf7; font: inherit; font-size: 14px; font-weight: 700; line-height: 42px; text-align: center; text-decoration: none; }',
    'button { cursor: pointer; }',
    'a { display: inline-flex; align-items: center; justify-content: center; background: #fffdf7; color: #24221e; }',
    'img { width: min(100%, 430px); height: auto; display: block; border-radius: 16px; box-shadow: 0 20px 54px rgba(36,34,30,0.18); }',
    'p { width: min(100%, 430px); margin: 0; color: rgba(36,34,30,0.62); font-size: 13px; line-height: 1.5; text-align: center; }',
    '</style>',
    '</head>',
    '<body>',
    '<div class="actions"><button id="share" type="button">' + shareButtonLabel + '</button><a id="download" download="' + filename + '">' + downloadButtonLabel + '</a></div>',
    '<img src="' + dataUrl + '" alt="Timewall weekly report" />',
    '<p>' + previewHelp + '</p>',
    '<script>',
    'const dataUrl = ' + serializedDataUrl + ';',
    'const filename = ' + serializedFilename + ';',
    'const download = document.getElementById("download");',
    'async function dataUrlToBlob(value) { const response = await fetch(value); return response.blob(); }',
    'async function getObjectUrl() { const blob = await dataUrlToBlob(dataUrl); return URL.createObjectURL(blob); }',
    'getObjectUrl().then((url) => { download.href = url; });',
    'document.getElementById("share").addEventListener("click", async () => {',
    'try {',
    'const blob = await dataUrlToBlob(dataUrl);',
    'const file = new File([blob], filename, { type: "image/png" });',
    'const shareData = { files: [file], title: ' + JSON.stringify(shareTitle) + ', text: ' + JSON.stringify(shareText) + ' };',
    'if (navigator.canShare && navigator.canShare(shareData)) { await navigator.share(shareData); return; }',
    'alert(' + JSON.stringify(unsupportedShareText) + ');',
    '} catch {',
    'alert(' + JSON.stringify(failedShareText) + ');',
    '}',
    '});',
    '</' + 'script>',
    '</body>',
    '</html>',
  ].join('');

  preview.document.write(previewHtml);
  preview.document.close();
};

const waitForExportStyles = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

const colorToRgbChannels = (color: string) => {
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
    return `${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)}`;
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/i)?.[1].split(",").slice(0, 3).map((part) => Math.round(Number(part.trim())));
  return rgb && rgb.every(Number.isFinite) ? rgb.join(", ") : "246, 242, 232";
};

const exportElementAsPng = async (element: HTMLElement) => {
  const tone = getComputedStyle(element).getPropertyValue("--tone");
  element.style.setProperty("--export-tone-rgb", colorToRgbChannels(tone));
  element.classList.add("exporting-report");
  await waitForExportStyles();

  try {
    const canvas = await Promise.race([
      html2canvas(element, {
        backgroundColor: null,
        logging: false,
        scale: Math.min(3, window.devicePixelRatio || 2),
        useCORS: true,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
      }),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("report export timeout")), 12000)),
    ]);
    return canvas.toDataURL("image/png");
  } finally {
    element.classList.remove("exporting-report");
    element.style.removeProperty("--export-tone-rgb");
  }
};

export default function Home() {
  const [state, setState] = useState<TimewallState>(getInitialState);
  const [selectedDate, setSelectedDate] = useState(() => normalizeDate(new Date()));
  const [view, setView] = useState<ViewMode>("day");
  const [reportStyle, setReportStyle] = useState<ReportStyle>("receipt");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const reportCardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored) setState(normalizeState(JSON.parse(stored)));
    } catch {
      setState(getInitialState());
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const theme = useMemo(() => THEMES.find((item) => item.id === state.themeId) ?? THEMES[0], [state.themeId]);
  const selectedKey = dateKey(selectedDate);
  const todayKey = dateKey(new Date());
  const selectedDay = getDay(state, selectedKey);
  const weekStart = startOfWeek(selectedDate);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekBlocks = weekDates.flatMap((date) => getDay(state, dateKey(date)).blocks);
  const reportCounts = [0, 0, 0, 0].map((_, colorIndex) => weekBlocks.filter((block) => block === colorIndex).length);
  const filledBlocks = weekBlocks.length - reportCounts[0];
  const weekTone = reportCounts.indexOf(Math.max(...reportCounts));

  const updateDay = (key: string, updater: (day: DayRecord) => DayRecord) => {
    setState((current) => ({
      ...current,
      days: {
        ...current.days,
        [key]: updater(getDay(current, key)),
      },
    }));
  };

  const cycleBlock = (blockIndex: number) => {
    if (selectedDay.locked) return;
    updateDay(selectedKey, (day) => ({
      ...day,
      blocks: day.blocks.map((block, index) => (index === blockIndex ? (block + 1) % 4 : block)),
    }));
  };

  const moveDate = (amount: number) => setSelectedDate((current) => addDays(current, amount));

  const goToday = () => {
    setSelectedDate(normalizeDate(new Date()));
    setView("day");
  };

  const selectDate = (date: Date, nextView: ViewMode = "day") => {
    setSelectedDate(normalizeDate(date));
    setView(nextView);
  };

  const handleTouchEnd = (clientX: number) => {
    if (touchStart === null || view !== "day") return;
    const delta = clientX - touchStart;
    if (Math.abs(delta) > 48) moveDate(delta > 0 ? -1 : 1);
    setTouchStart(null);
  };

  const exportBackup = () => {
    downloadTextFile(`timewall-backup-${dateKey(new Date())}.json`, JSON.stringify(state, null, 2), "application/json");
    setToast("备份已导出");
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setState(normalizeState(JSON.parse(content)));
      setToast("备份已导入");
    } catch {
      setToast("导入失败，请检查文件");
    } finally {
      event.target.value = "";
    }
  };

  const resetData = () => {
    const confirmed = window.confirm("确定清空 Timewall 的本地记录吗？这个操作无法撤销。");
    if (!confirmed) return;
    setState(getInitialState());
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    setToast("本地记录已清空");
  };

  const copyReport = async () => {
    const text = createReportText(state.labels, reportCounts, filledBlocks);
    try {
      await navigator.clipboard.writeText(text);
      setToast("小报文字已复制");
    } catch {
      setToast("复制失败，可手动截图分享");
    }
  };

  const exportReport = async () => {
    setToast("正在导出图片");
    const preview = window.open("", "_blank");
    openImageLoading(preview);
    try {
      const filename = `timewall-report-${dateKey(weekStart)}.png`;
      if (!reportCardRef.current) throw new Error("report card unavailable");
      const dataUrl = await exportElementAsPng(reportCardRef.current);
      openImagePreview(preview, dataUrl, filename);
      setToast("\u56fe\u7247\u5df2\u751f\u6210\uff0c\u53ef\u5728\u65b0\u9875\u9762\u4fdd\u5b58\u6216\u4e0b\u8f7d PNG");
    } catch {
      preview?.close();
      setToast("\u56fe\u7247\u751f\u6210\u5931\u8d25\uff0c\u53ef\u76f4\u63a5\u622a\u56fe\u4fdd\u5b58\u5f53\u524d\u5c0f\u62a5");
    }
  };

  return (
    <main
      className="app-shell"
      onTouchStart={(event) => setTouchStart(event.changedTouches[0].clientX)}
      onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0].clientX)}
    >
      <section className="phone-frame" style={{ ["--tone" as string]: theme.colors[weekTone] }}>
        <Header
          date={selectedDate}
          view={view}
          onPrev={() => moveDate(view === "year" ? -365 : view === "month" ? -30 : view === "week" ? -7 : -1)}
          onNext={() => moveDate(view === "year" ? 365 : view === "month" ? 30 : view === "week" ? 7 : 1)}
          onReport={() => setView("report")}
          onSettings={() => setSettingsOpen(true)}
        />

        {selectedKey !== todayKey && view !== "report" && (
          <div className="today-return-row">
            <button className="today-return-link" onClick={goToday}>
              回到今天
            </button>
          </div>
        )}

        <nav className="mode-tabs" aria-label="Timewall views">
          {(["day", "week", "month", "year"] as ViewMode[]).map((mode) => (
            <button key={mode} className={view === mode ? "active" : ""} onClick={() => setView(mode)}>
              {mode}
            </button>
          ))}
        </nav>

        <section className="view-stage">
          {view === "day" && <DayView day={selectedDay} theme={theme} onCycle={cycleBlock} />}
          {view === "week" && <WeekView dates={weekDates} state={state} theme={theme} onSelect={selectDate} />}
          {view === "month" && <MonthView date={selectedDate} state={state} theme={theme} onSelect={selectDate} />}
          {view === "year" && <YearView date={selectedDate} state={state} theme={theme} onSelect={selectDate} />}
          {view === "report" && (
            <ReportView
              dates={weekDates}
              state={state}
              theme={theme}
              labels={state.labels}
              setLabels={(labels) => setState((current) => ({ ...current, labels }))}
              reportStyle={reportStyle}
              setReportStyle={setReportStyle}
              counts={reportCounts}
              filledBlocks={filledBlocks}
              onCopy={copyReport}
              onExport={exportReport}
              cardRef={reportCardRef}
            />
          )}
        </section>

        {view === "day" && (
          <button
            className={`lock-button ${selectedDay.locked ? "locked" : ""}`}
            onClick={() => updateDay(selectedKey, (day) => ({ ...day, locked: !day.locked }))}
            aria-label={selectedDay.locked ? "Unlock this day" : "Lock this day"}
          >
            {selectedDay.locked ? <UnlockIcon /> : <LockIcon />}
          </button>
        )}

        <p className="local-note">无账号版本：记录只保存在当前浏览器。可在设置里导出备份。</p>

        {toast && <div className="toast">{toast}</div>}

        <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json" onChange={importBackup} />

        {settingsOpen && (
          <SettingsPanel
            themes={THEMES}
            activeId={state.themeId}
            onChange={(themeId) => setState((current) => ({ ...current, themeId }))}
            onClose={() => setSettingsOpen(false)}
            onExport={exportBackup}
            onImport={() => importInputRef.current?.click()}
            onReset={resetData}
          />
        )}
      </section>
    </main>
  );
}

function Header({
  date,
  view,
  onPrev,
  onNext,
  onReport,
  onSettings,
}: {
  date: Date;
  view: ViewMode;
  onPrev: () => void;
  onNext: () => void;
  onReport: () => void;
  onSettings: () => void;
}) {
  if (view === "week") {
    return (
      <WeeklyHeader
        dateRange={formatWeekDateRange(date)}
        subInfo={formatWeekSubInfo(date)}
        onPrev={onPrev}
        onNext={onNext}
        onShare={onReport}
        onSettings={onSettings}
      />
    );
  }

  const title =
    view === "month"
        ? formatMonthTitle(date)
      : view === "year"
        ? String(date.getFullYear())
        : view === "report"
          ? "本周小报"
          : formatTitle(date);
  const subtitle = view === "day" ? formatDateMeta(date) : "";

  return (
    <header className="topbar">
      <button className="icon-button share-button" onClick={onReport} aria-label="Create weekly report">
        <Share size={18} className="transform -scale-x-100" />
      </button>
      <button className="icon-button" onClick={onPrev} aria-label="Previous">
        {"<"}
      </button>
      <div className="date-title">
        <span>{view === "day" ? formatPrimaryDate(date) : title}</span>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <button className="icon-button" onClick={onNext} aria-label="Next">
        {">"}
      </button>
      <button className="icon-button" onClick={onSettings} aria-label="Settings">
        <SettingsIcon />
      </button>
    </header>
  );
}

type WeeklyHeaderProps = {
  dateRange: string;
  /** ISO year/week label, such as "2026 · W31", rather than week-of-month. */
  subInfo: string;
  onPrev: () => void;
  onNext: () => void;
  onShare: () => void;
  onSettings: () => void;
};

function WeeklyHeader({
  dateRange,
  subInfo,
  onPrev,
  onNext,
  onShare,
  onSettings,
}: WeeklyHeaderProps) {
  return (
    <header className="topbar weekly-topbar">
      <button type="button" onClick={onShare} className="icon-button share-button" aria-label="Create weekly report">
        <Share size={18} className="transform -scale-x-100" />
      </button>
      <button type="button" onClick={onPrev} className="icon-button" aria-label="Previous week">
        <ChevronLeft size={20} />
      </button>

      <div className="weekly-date-title">
        <h1 className="w-full truncate text-center text-[clamp(22px,6.5vw,28px)] font-black text-gray-900 tracking-tight leading-none">{dateRange}</h1>
        <span className="mt-1.5 w-full truncate text-center text-sm font-medium text-gray-500">{subInfo}</span>
      </div>

      <button type="button" onClick={onNext} className="icon-button" aria-label="Next week">
        <ChevronRight size={20} />
      </button>
      <button type="button" onClick={onSettings} className="icon-button" aria-label="Settings">
        <Settings size={18} />
      </button>
    </header>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="6.5" y="10" width="11" height="9" rx="2" />
      <path d="M8.8 10V7.6a3.2 3.2 0 0 1 6.4 0V10" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="6.5" y="10" width="11" height="9" rx="2" />
      <path d="M8.8 10V7.6A3.2 3.2 0 0 1 14.7 6" />
    </svg>
  );
}

function DayView({ day, theme, onCycle }: { day: DayRecord; theme: ThemeOption; onCycle: (index: number) => void }) {
  return (
    <div className={`day-grid ${day.locked ? "is-locked" : ""}`}>
      {BLOCKS.map((block) => (
        <button
          key={block.id}
          className="time-block"
          style={{ background: theme.colors[day.blocks[block.id]] }}
          onClick={() => onCycle(block.id)}
          disabled={day.locked}
          aria-label={`Change ${block.range}`}
        >
          <span>{block.label}</span>
          <small>{block.range}</small>
        </button>
      ))}
    </div>
  );
}

function WeekView({
  dates,
  state,
  theme,
  onSelect,
}: {
  dates: Date[];
  state: TimewallState;
  theme: ThemeOption;
  onSelect: (date: Date) => void;
}) {
  return (
    <div className="week-view">
      <div className="week-head">
        {dates.map((date, index) => (
          <button key={dateKey(date)} onClick={() => onSelect(date)}>
            <span>{WEEKDAYS[index]}</span>
            <small>{date.getDate()}</small>
          </button>
        ))}
      </div>
      <div className="week-grid">
        {BLOCKS.map((block) =>
          dates.map((date) => {
            const day = getDay(state, dateKey(date));
            return (
              <button
                key={`${dateKey(date)}-${block.id}`}
                className="mini-cell"
                onClick={() => onSelect(date)}
                style={{ background: theme.colors[day.blocks[block.id]] }}
                aria-label={`${dateKey(date)} ${block.range}`}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}

function MonthView({
  date,
  state,
  theme,
  onSelect,
}: {
  date: Date;
  state: TimewallState;
  theme: ThemeOption;
  onSelect: (date: Date) => void;
}) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: startOffset + daysInMonth }, (_, index) =>
    index < startOffset ? null : new Date(date.getFullYear(), date.getMonth(), index - startOffset + 1),
  );

  return (
    <div className="month-view">
      <div className="weekday-row">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((cell, index) =>
          cell ? (
            <button key={dateKey(cell)} className="month-day" onClick={() => onSelect(cell)}>
              <span>{cell.getDate()}</span>
              <MicroBlocks blocks={getDay(state, dateKey(cell)).blocks} theme={theme} />
            </button>
          ) : (
            <div className="month-day ghost" key={`ghost-${index}`} />
          ),
        )}
      </div>
    </div>
  );
}

function YearView({
  date,
  state,
  theme,
  onSelect,
}: {
  date: Date;
  state: TimewallState;
  theme: ThemeOption;
  onSelect: (date: Date, nextView?: ViewMode) => void;
}) {
  const year = date.getFullYear();
  return (
    <div className="year-grid">
      {MONTHS.map((month, monthIndex) => {
        const days = new Date(year, monthIndex + 1, 0).getDate();
        return (
          <button key={month} className="year-month" onClick={() => onSelect(new Date(year, monthIndex, 1), "month")}>
            <span>{month}</span>
            <div className="year-dots">
              {Array.from({ length: days }, (_, index) => {
                const day = getDay(state, dateKey(new Date(year, monthIndex, index + 1)));
                return <i key={index} style={{ background: theme.colors[dominantColorIndex(day.blocks)] }} />;
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ReportView({
  dates,
  state,
  theme,
  labels,
  setLabels,
  reportStyle,
  setReportStyle,
  counts,
  filledBlocks,
  onCopy,
  onExport,
  cardRef,
}: {
  dates: Date[];
  state: TimewallState;
  theme: ThemeOption;
  labels: string[];
  setLabels: (labels: string[]) => void;
  reportStyle: ReportStyle;
  setReportStyle: (style: ReportStyle) => void;
  counts: number[];
  filledBlocks: number;
  onCopy: () => void;
  onExport: () => void;
  cardRef: { current: HTMLElement | null };
}) {
  const total = dates.length * 8;
  const named = labels.some((label) => label.trim().length > 0);
  const dominant = counts.indexOf(Math.max(...counts));
  const leadName = labels[dominant]?.trim();
  const weekRange = formatDotDateRange(dates[0], dates[6]);
  const summary = named
    ? `这一周更靠近「${leadName || "未命名颜色"}」，你一共留下了 ${filledBlocks} 个有颜色的时间块。`
    : `这一周你留下了 ${filledBlocks} 个有颜色的时间块。颜色可以先不被解释，它们只需要诚实地待在墙上。`;

  return (
    <div className="report-view">
      <div className="report-controls">
        <div>
          <h2>如果愿意，可以给颜色一个临时名字。</h2>
          <p>也可以全部留空，让小报只保留颜色和节奏。</p>
        </div>
        <div className="style-switcher">
          {(Object.keys(REPORT_COPY) as ReportStyle[]).map((style) => (
            <button key={style} className={reportStyle === style ? "active" : ""} onClick={() => setReportStyle(style)}>
              {REPORT_COPY[style].name}
            </button>
          ))}
        </div>
      </div>

      <div className="label-grid">
        {theme.colors.map((color, index) => (
          <label key={color}>
            <i style={{ background: color }} />
            <input
              value={labels[index]}
              onChange={(event) => setLabels(labels.map((label, labelIndex) => (labelIndex === index ? event.target.value : label)))}
              placeholder={index === 0 ? "空白" : "给这个颜色起名"}
            />
          </label>
        ))}
      </div>

      <article ref={cardRef} className={`receipt-card ${reportStyle}`}>
        <header>
          <span>Timewall</span>
          <strong>{weekRange}</strong>
        </header>
        <p className="receipt-summary">{summary}</p>
        <div className="receipt-wall">
          {dates.map((date) => (
            <div key={dateKey(date)}>
              <span>{REPORT_WEEKDAYS[(date.getDay() + 6) % 7]}</span>
              <MicroBlocks blocks={getDay(state, dateKey(date)).blocks} theme={theme} />
            </div>
          ))}
        </div>
        <div className="ratio-list">
          {theme.colors.map((color, index) => (
            <div key={color}>
              <i style={{ background: color }} />
              <span>{labels[index]?.trim() || (index === 0 ? "空白" : `颜色 ${index}`)}</span>
              <b>{Math.round((counts[index] / total) * 100)}%</b>
            </div>
          ))}
        </div>
        <footer>{REPORT_COPY[reportStyle].hint}</footer>
      </article>

      <div className="report-actions">
        <button type="button" onClick={onCopy}>复制文字</button>
        <button
          type="button"
          onClick={onExport}
        >
          导出图片
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({
  themes,
  activeId,
  onChange,
  onClose,
  onExport,
  onImport,
  onReset,
}: {
  themes: typeof THEMES;
  activeId: string;
  onChange: (themeId: string) => void;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
}) {
  return (
    <div className="settings-backdrop" role="presentation" onClick={onClose}>
      <section className="settings-panel" aria-label="Settings" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>设置</h2>
            <p>选择一组你愿意长期看的颜色。Timewall 不需要账号，记录会留在当前浏览器里。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>
        <div className="theme-list">
          {themes.map((theme, themeIndex) => (
            <button key={theme.id} className={activeId === theme.id ? "active" : ""} onClick={() => onChange(theme.id)} aria-label={`Use color system ${themeIndex + 1}`}>
              <em>
                {theme.colors.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </em>
            </button>
          ))}
        </div>
        <div className="settings-actions">
          <button onClick={onExport}>导出备份</button>
          <button onClick={onImport}>导入备份</button>
          <button className="danger" onClick={onReset}>
            清空记录
          </button>
        </div>
        <p className="privacy-note">隐私说明：当前版本不会上传任何记录。换设备前请先导出备份文件。</p>
      </section>
    </div>
  );
}

function MicroBlocks({ blocks, theme }: { blocks: number[]; theme: ThemeOption }) {
  return (
    <div className="micro-blocks">
      {blocks.map((block, index) => (
        <i key={index} style={{ background: theme.colors[block] }} />
      ))}
    </div>
  );
}
