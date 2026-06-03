"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
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
    hint: "像一张皱起的时间收据，适合保存这一周的清单感。",
  },
  poster: {
    name: "海报",
    hint: "黑金展览海报风格，把一周变成一张视觉公告。",
  },
  quiet: {
    name: "现代",
    hint: "弥散光感的现代版，只保留颜色、比例和轻量文字。",
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

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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

const openImagePreview = (preview: Window | null, dataUrl: string, filename: string) => {
  if (!preview) return;
  preview.document.write(`<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${filename}</title>
        <style>
          html,
          body {
            min-height: 100%;
            margin: 0;
            background: #f3f0e8;
          }

          body {
            display: grid;
            place-items: center;
            padding: 16px;
          }

          img {
            width: min(100%, 430px);
            height: auto;
            display: block;
            border-radius: 16px;
            box-shadow: 0 20px 54px rgba(36, 34, 30, 0.18);
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="Timewall weekly report" />
      </body>
    </html>`);
  preview.document.close();
};

const svgToPngDownload = async (filename: string, svg: string, width: number, height: number) => {
  const image = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("report image load timeout")), 5000);
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("report image load failed"));
    };
    image.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.scale(2, 2);
  context.drawImage(image, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
  }, 1000);

  return dataUrl;
};

const reportRows = (theme: ThemeOption, labels: string[], counts: number[], total: number) =>
  theme.colors.map((color, index) => ({
    color,
    label: labels[index]?.trim() || (index === 0 ? "空白" : `颜色 ${index}`),
    percent: Math.round((counts[index] / total) * 100),
  }));

const weeklyCells = (dates: Date[], state: TimewallState, theme: ThemeOption, cell: (args: { x: number; y: number; color: string; dateIndex: number; blockIndex: number }) => string) =>
  dates
    .map((date, dateIndex) => {
      const blocks = getDay(state, dateKey(date)).blocks;
      return blocks
        .map((block, blockIndex) =>
          cell({
            x: 64 + dateIndex * 74,
            y: 214 + blockIndex * 30,
            color: theme.colors[block],
            dateIndex,
            blockIndex,
          }),
        )
        .join("");
    })
    .join("");

const createReportSvg = ({
  dates,
  state,
  theme,
  labels,
  counts,
  filledBlocks,
  reportStyle,
}: {
  dates: Date[];
  state: TimewallState;
  theme: ThemeOption;
  labels: string[];
  counts: number[];
  filledBlocks: number;
  reportStyle: ReportStyle;
}) => {
  const total = dates.length * 8;
  const rows = reportRows(theme, labels, counts, total);
  const weekRange = `${String(dates[0].getMonth() + 1).padStart(2, "0")}/${String(dates[0].getDate()).padStart(2, "0")}-${String(dates[6].getMonth() + 1).padStart(2, "0")}/${String(dates[6].getDate()).padStart(2, "0")}`;

  if (reportStyle === "receipt") {
    const itemRows = rows
      .map(
        (row, index) =>
          `<text x="58" y="${414 + index * 34}">${escapeXml(row.label).toUpperCase()}</text><text x="556" y="${414 + index * 34}" text-anchor="end">${row.percent}%</text>`,
      )
      .join("");
    const dayRows = dates
      .map((date, index) => {
        const day = getDay(state, dateKey(date));
        const marked = day.blocks.filter((block) => block !== 0).length;
        return `<text x="58" y="${196 + index * 25}">${REPORT_WEEKDAYS[(date.getDay() + 6) % 7]}</text><text x="556" y="${196 + index * 25}" text-anchor="end">${marked}:00</text>`;
      })
      .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="860" viewBox="0 0 640 860">
      <defs>
        <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="4" seed="8"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.14"/></feComponentTransfer></filter>
        <filter id="ink"><feDropShadow dx="0" dy="2" stdDeviation="0.6" flood-color="#111" flood-opacity="0.18"/></filter>
      </defs>
      <rect width="640" height="860" fill="#ecebe6"/>
      <rect width="640" height="860" filter="url(#paper)" opacity="0.8"/>
      <g font-family="'Courier New', monospace" fill="#202020">
        <text x="320" y="82" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="48" font-weight="900" filter="url(#ink)">TIMEWALL</text>
        <text x="320" y="120" text-anchor="middle" font-size="28" font-weight="800" letter-spacing="3">WEEKLY RECEIPT</text>
        <text x="58" y="174" font-size="22">ORDER #</text><text x="556" y="174" text-anchor="end" font-size="22">0007</text>
        ${dayRows}
        <text x="58" y="376" font-size="20">==============================</text>
        ${itemRows}
        <text x="58" y="558" font-size="20">==============================</text>
        <text x="58" y="596" font-size="22">NO. OF BLOCKS SOLD:</text><text x="556" y="596" text-anchor="end" font-size="22">${filledBlocks}</text>
        <text x="58" y="630" font-size="22">TOTAL:</text><text x="556" y="630" text-anchor="end" font-size="22">${filledBlocks * 3}:00</text>
        <text x="58" y="674" font-size="20">==============================</text>
        <g transform="translate(145 720)">
          ${Array.from({ length: 28 }, (_, index) => `<rect x="${index * 11}" y="${index % 2 === 0 ? 0 : 6}" width="${index % 3 === 0 ? 6 : 4}" height="${index % 4 === 0 ? 48 : 34}" rx="2" fill="#111"/>`).join("")}
        </g>
        <text x="320" y="824" text-anchor="middle" font-size="20">LOCAL ONLY | SAVE THIS IMAGE</text>
      </g>
    </svg>`;
  }

  if (reportStyle === "poster") {
    const cells = weeklyCells(
      dates,
      state,
      theme,
      ({ x, y, color }) => `<rect x="${x}" y="${y}" width="48" height="22" rx="2" fill="${color}" opacity="0.95"/>`,
    );
    const rowText = rows
      .map(
        (row, index) =>
          `<text x="72" y="${662 + index * 36}" font-size="20">${escapeXml(row.label)}</text><line x1="230" x2="472" y1="${654 + index * 36}" y2="${654 + index * 36}" stroke="#caa66b" stroke-width="3"/><text x="522" y="${662 + index * 36}" text-anchor="end" font-size="20">${row.percent}%</text>`,
      )
      .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="860" viewBox="0 0 640 860">
      <defs>
        <radialGradient id="ring" cx="34%" cy="34%" r="78%"><stop offset="0" stop-color="#f4f2ec"/><stop offset="0.18" stop-color="#141414"/><stop offset="0.32" stop-color="#74716b"/><stop offset="0.54" stop-color="#1b1b1b"/><stop offset="1" stop-color="#090909"/></radialGradient>
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="12"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.16"/></feComponentTransfer></filter>
      </defs>
      <rect width="640" height="860" fill="#151515"/>
      <rect width="640" height="860" filter="url(#grain)"/>
      <circle cx="260" cy="300" r="270" fill="url(#ring)" opacity="0.88"/>
      <text x="50" y="164" fill="#caa66b" font-size="116" font-family="Georgia, serif" font-weight="800">边</text>
      <text x="368" y="164" fill="#caa66b" font-size="116" font-family="Georgia, serif" font-weight="800">界</text>
      <text x="50" y="310" fill="#caa66b" font-size="116" font-family="Georgia, serif" font-weight="800">时</text>
      <text x="368" y="310" fill="#caa66b" font-size="116" font-family="Georgia, serif" font-weight="800">间</text>
      <text x="214" y="204" fill="#f2e6d0" font-size="26" font-family="Georgia, serif" font-weight="700">TIME BOUNDARY</text>
      <text x="214" y="238" fill="#f2e6d0" font-size="26" font-family="Georgia, serif" font-weight="700">DISSOCIATION</text>
      <text x="260" y="320" fill="#f2e6d0" font-size="28" font-family="Arial, sans-serif" font-weight="800">${dates[0].getFullYear()}</text>
      <g>${cells}</g>
      <g fill="#caa66b" font-family="Georgia, serif">${rowText}</g>
      <text x="72" y="806" fill="#caa66b" font-size="22" font-family="Georgia, serif">WEEK START ${dateKey(dates[0])}</text>
    </svg>`;
  }

  const rowText = rows
    .map(
      (row, index) =>
        `<text x="472" y="${196 + index * 72}" text-anchor="end" font-size="20">${escapeXml(row.label)}</text><text x="472" y="${224 + index * 72}" text-anchor="end" font-size="18">#${row.color.replace("#", "")}</text><text x="472" y="${252 + index * 72}" text-anchor="end" font-size="18">${row.percent}%</text>`,
    )
    .join("");
  const cells = weeklyCells(
    dates,
    state,
    theme,
    ({ x, y, color }) => `<circle cx="${x + 24}" cy="${y + 12}" r="11" fill="${color}" opacity="0.86"/>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="860" viewBox="0 0 640 860">
    <defs>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="21"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.12"/></feComponentTransfer></filter>
      <filter id="blur"><feGaussianBlur stdDeviation="22"/></filter>
    </defs>
    <rect width="640" height="860" fill="#f3f3df"/>
    <rect width="640" height="860" filter="url(#grain)"/>
    <path d="M-30 230 C150 36 330 132 368 256 C410 394 270 474 130 420 C20 378 -100 340 -30 230Z" fill="${theme.colors[1]}" opacity="0.82" filter="url(#blur)"/>
    <path d="M240 430 C430 324 620 438 690 590 C742 706 558 832 392 738 C248 656 110 558 240 430Z" fill="${theme.colors[2]}" opacity="0.78" filter="url(#blur)"/>
    <text x="48" y="116" font-family="Georgia, serif" font-size="60" fill="#18211e">弥</text>
    <text x="500" y="116" font-family="Georgia, serif" font-size="60" fill="#18211e">散</text>
    <g font-family="Arial, sans-serif" fill="#18211e">${rowText}</g>
    <text x="48" y="564" font-family="Arial, sans-serif" font-size="22">${weekRange}</text>
    <text x="48" y="592" font-family="Arial, sans-serif" font-size="22">Time</text>
    <text x="48" y="688" font-family="Georgia, serif" font-size="42" fill="#18211e">ART POSTER</text>
    <text x="48" y="740" font-family="Georgia, serif" font-size="42" fill="#18211e">DESIGN</text>
    <g>${cells}</g>
    <text x="48" y="812" font-family="Arial, sans-serif" font-size="16" fill="#18211e">Through the gradual blur, the week becomes a color memory.</text>
  </svg>`;
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
    const svg = createReportSvg({
      dates: weekDates,
      state,
      theme,
      labels: state.labels,
      counts: reportCounts,
      filledBlocks,
      reportStyle,
    });
    try {
      const filename = `timewall-report-${dateKey(weekStart)}.png`;
      const dataUrl = await svgToPngDownload(filename, svg, 640, 860);
      openImagePreview(preview, dataUrl, filename);
      setToast("小报图片已导出");
    } catch {
      preview?.close();
      downloadTextFile(`timewall-report-${dateKey(weekStart)}.svg`, svg, "image/svg+xml");
      setToast("图片导出失败，已导出 SVG 备用");
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
}) {
  const total = dates.length * 8;
  const named = labels.some((label) => label.trim().length > 0);
  const dominant = counts.indexOf(Math.max(...counts));
  const leadName = labels[dominant]?.trim();
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

      <article className={`receipt-card ${reportStyle}`}>
        <header>
          <span>Timewall</span>
          <strong>{REPORT_COPY[reportStyle].name}</strong>
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
