"use client";

import {
  APP_LOCALE_CODES,
  resolveAppLocale,
  SUPPORTED_LANGUAGES,
  type AppLocale,
} from "@/lib/languages";
import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type AppLocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLoading: boolean;
};

const STORAGE_KEY = "inluwa.app.locale";

const enMessages: Record<string, string> = {
  ...en,
  "settings.apiKeys.placeholder.productionCI": "e.g. Production CI",
  "settings.apiKeys.table.key": "Key",
  "settings.apiKeys.table.lastUsed": "Last used",
  "settings.apiKeys.table.created": "Created",
  "settings.members.table.actions": "Actions",
  "usage.period.thisMonth": "This month",
  "usage.period.last7Days": "Last 7 days",
  "usage.period.last30Days": "Last 30 days",
  "usage.period.last90Days": "Last 90 days",
  "usage.unlimited": "Unlimited",
  "usage.hoursAbbr": "hrs",
  "usage.noLimit": "No limit",
  "usage.percentUsed": "{pct}% used",
  "usage.limitReached": "Limit reached",
  "usage.approachingLimit": "Approaching limit",
  "usage.moreInformation": "More Information",
  "usage.title": "Usage",
  "usage.description": "View your organization's resource usage statistics",
  "usage.allProjects": "All projects",
  "usage.overviewTitle": "Usage Overview",
  "usage.interviewTemplates": "Interview Templates",
  "usage.sessionTime": "Session Time",
  "usage.seats": "Seats",
  "usage.sessionTimeDescription": "Session time tracks the total duration of interview sessions conducted across your organization, including both live and asynchronous sessions.",
  "usage.sessionDurationPerDay": "Session duration per day (minutes)",
  "usage.minuteAbbr": "min",
  "usage.sessionHistoryTitle": "Session History",
  "usage.sessionHistorySubtitle": "Interview sessions in this period",
  "usage.sessionHistoryEmpty": "No sessions recorded yet. Sessions will appear here as interviews are conducted.",
  "usage.interviewTemplatesDescription": "Interview templates define the structure, questions, and settings for your interviews. Each template can be reused across multiple sessions.",
  "usage.templatesCreatedPerDay": "Templates created per day",
  "usage.templateCount": "{count} templates",
  "usage.templateHistoryTitle": "Template History",
  "usage.templateHistorySubtitle": "Interview templates created in this period",
  "usage.templateHistoryEmpty": "No templates created yet. Templates will appear here as you create new interviews.",
  "usage.table.interview": "Interview",
  "usage.table.participant": "Participant",
  "usage.table.duration": "Duration",
  "usage.table.status": "Status",
  "usage.table.date": "Date",
  "usage.table.template": "Template",
  "usage.table.project": "Project",
  "usage.table.sessions": "Sessions",
  "usage.table.channels": "Channels",
  "usage.table.created": "Created",
  "usage.pagination.showing": "Showing {start}–{end} of {total}",
};
const zhMessages: Record<string, string> = {
  ...zh,
  "settings.apiKeys.placeholder.productionCI": "例如：生产环境 CI",
  "usage.period.thisMonth": "本月",
  "usage.period.last7Days": "过去 7 天",
  "usage.period.last30Days": "过去 30 天",
  "usage.period.last90Days": "过去 90 天",
  "usage.unlimited": "无限制",
  "usage.hoursAbbr": "小时",
  "usage.noLimit": "无限制",
  "usage.percentUsed": "已使用 {pct}%",
  "usage.limitReached": "已达上限",
  "usage.approachingLimit": "接近上限",
  "usage.moreInformation": "更多信息",
  "usage.title": "使用情况",
  "usage.description": "查看组织的资源使用统计",
  "usage.allProjects": "全部项目",
  "usage.overviewTitle": "使用概览",
  "usage.interviewTemplates": "面试模板",
  "usage.sessionTime": "会话时长",
  "usage.seats": "席位",
  "usage.sessionTimeDescription": "会话时长会统计组织内所有面试会话的总持续时间，包括实时和异步会话。",
  "usage.sessionDurationPerDay": "每日会话时长（分钟）",
  "usage.minuteAbbr": "分钟",
  "usage.sessionHistoryTitle": "会话记录",
  "usage.sessionHistorySubtitle": "所选时段内的面试会话",
  "usage.sessionHistoryEmpty": "暂无会话记录。面试开始后，这里会显示会话数据。",
  "usage.interviewTemplatesDescription": "面试模板用于定义面试结构、题目和配置。每个模板都可以在多场会话中复用。",
  "usage.templatesCreatedPerDay": "每日创建模板数",
  "usage.templateCount": "{count} 个模板",
  "usage.templateHistoryTitle": "模板记录",
  "usage.templateHistorySubtitle": "所选时段内创建的面试模板",
  "usage.templateHistoryEmpty": "暂无模板。创建新面试后，这里会显示模板记录。",
  "usage.table.interview": "面试",
  "usage.table.participant": "参与者",
  "usage.table.duration": "时长",
  "usage.table.status": "状态",
  "usage.table.date": "日期",
  "usage.table.template": "模板",
  "usage.table.project": "项目",
  "usage.table.sessions": "会话数",
  "usage.table.channels": "渠道",
  "usage.table.created": "创建时间",
  "usage.pagination.showing": "显示 {start}–{end} / 共 {total}",
  "candidates.table.interview": "面试",
  "candidates.table.name": "姓名",
  "candidates.table.email": "邮箱",
  "candidates.table.phone": "电话",
  "candidates.table.gender": "性别",
  "candidates.table.birthday": "生日",
  "candidates.table.education": "学历",
  "candidates.table.school": "学校",
  "candidates.table.major": "专业",
  "candidates.table.gradYear": "毕业年份",
  "candidates.table.experience": "经验",
  "candidates.table.notes": "备注",
  "candidates.table.status": "状态",
  "candidates.table.score": "分数",
  "candidates.table.duration": "时长",
  "candidates.table.started": "开始时间",
  "candidates.table.finished": "结束时间",
  "candidates.table.source": "来源",
  "candidates.table.created": "创建时间",
  "candidates.timeRange.allTime": "全部时间",
  "candidates.timeRange.past1Day": "过去 1 天",
  "candidates.timeRange.past3Days": "过去 3 天",
  "candidates.timeRange.past7Days": "过去 7 天",
  "candidates.timeRange.past14Days": "过去 14 天",
  "candidates.timeRange.past30Days": "过去 30 天",
  "candidates.timeRange.past90Days": "过去 90 天",
  "candidates.status.notStarted": "未开始",
  "candidates.status.completed": "已完成",
  "candidates.status.inProgress": "进行中",
  "candidates.status.abandoned": "已放弃",
  "candidates.source.walkin": "现场",
  "candidates.source.invited": "邀请",
  "candidates.delete.failed": "删除失败",
  "candidates.delete.success": "已移除 {count} 条记录",
  "candidates.page.title": "会话",
  "candidates.page.description": "查看所有面试中的会话",
  "candidates.search.placeholder": "按面试、姓名或邮箱搜索...",
  "candidates.statusFilter.allStatus": "全部状态",
  "candidates.statusFilter.completed": "已完成",
  "candidates.statusFilter.inProgress": "进行中",
  "candidates.statusFilter.notStarted": "未开始",
  "candidates.exportButton": "导出",
  "candidates.deleteButton": "删除（{count}）",
  "candidates.cancelButton": "取消",
  "candidates.empty.filter": "没有符合筛选条件的会话。",
  "candidates.empty.noSessions": "还没有会话。",
  "candidates.viewSessionDetails": "查看会话详情",
  "candidates.rowsPerPage": "每页行数",
  "candidates.of": " / 共 ",
  "candidates.dialog.deleteTitle": "删除会话",
  "candidates.dialog.deleteDescription": "确认要删除 {count} 个会话吗？这会永久移除所选记录及其关联数据，此操作无法撤销。",
  "candidates.dialog.deleteButton": "删除",
  "common.cancel": "取消",
  "common.delete": "删除",
  "interviews.create.failed": "创建面试失败",
  "interviews.actions.details": "详情",
  "interviews.actions.linkCopied": "链接已复制!",
  "interviews.actions.copyLink": "复制链接",
  "interviews.actions.duplicate": "复制",
  "interviews.actions.select": "选择",
  "interviews.actions.delete": "删除",
  "interviews.empty.pickTemplate": "选择一个模板立即开始，或者从零开始创建。",
  "interviews.empty.questions": "{count} 个问题",
  "interviews.empty.minutes": "{count} 分钟",
  "interviews.empty.createFromScratch": "从零开始创建",
  "interviews.export.title": "标题",
  "interviews.export.description": "描述",
  "interviews.export.channels": "渠道",
  "interviews.export.chat": "聊天",
  "interviews.export.voice": "仅语音",
  "interviews.export.video": "实时",
  "interviews.export.access": "访问权限",
  "interviews.export.public": "公开",
  "interviews.export.inviteOnly": "仅限邀请",
  "interviews.export.questions": "问题",
  "interviews.export.sessions": "会话",
  "interviews.export.created": "创建时间",
  "interviews.batchDelete.dialogTitle": "删除 {count} 个{interviewsTitle}？",
  "interviews.batchDelete.dialogDescription": "此操作无法撤销。所有选定的面试及其会话将被永久删除。",
  "interviews.singleDelete.dialogTitle": "删除此面试？",
  "interviews.singleDelete.dialogDescription": "此操作无法撤销。面试及其所有会话将被永久删除。",
  "interviews.table.created": "创建时间",
};

const messageCache: Record<string, Record<string, string>> = {
  en: enMessages,
  zh: zhMessages,
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

function resolveInitialLocale(): AppLocale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && APP_LOCALE_CODES.includes(stored as AppLocale)) {
    return stored as AppLocale;
  }
  return resolveAppLocale(window.navigator.language);
}

function interpolate(
  template: string,
  params: Record<string, string | number> = {},
): string {
  return Object.entries(params).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

const localeMessages: Record<string, () => Promise<any>> = {
  ar: () => import("@/messages/ar.json"),
  bg: () => import("@/messages/bg.json"),
  cs: () => import("@/messages/cs.json"),
  da: () => import("@/messages/da.json"),
  de: () => import("@/messages/de.json"),
  el: () => import("@/messages/el.json"),
  en: () => import("@/messages/en.json"),
  es: () => import("@/messages/es.json"),
  fi: () => import("@/messages/fi.json"),
  fil: () => import("@/messages/fil.json"),
  fr: () => import("@/messages/fr.json"),
  hi: () => import("@/messages/hi.json"),
  hr: () => import("@/messages/hr.json"),
  hu: () => import("@/messages/hu.json"),
  id: () => import("@/messages/id.json"),
  it: () => import("@/messages/it.json"),
  ja: () => import("@/messages/ja.json"),
  ko: () => import("@/messages/ko.json"),
  ms: () => import("@/messages/ms.json"),
  nb: () => import("@/messages/nb.json"),
  nl: () => import("@/messages/nl.json"),
  pl: () => import("@/messages/pl.json"),
  pt: () => import("@/messages/pt.json"),
  "pt-BR": () => import("@/messages/pt-BR.json"),
  ro: () => import("@/messages/ro.json"),
  ru: () => import("@/messages/ru.json"),
  sk: () => import("@/messages/sk.json"),
  sv: () => import("@/messages/sv.json"),
  ta: () => import("@/messages/ta.json"),
  th: () => import("@/messages/th.json"),
  tr: () => import("@/messages/tr.json"),
  uk: () => import("@/messages/uk.json"),
  vi: () => import("@/messages/vi.json"),
  yue: () => import("@/messages/yue.json"),
  zh: () => import("@/messages/zh.json"),
};

async function ensureLocaleMessages(locale: AppLocale): Promise<Record<string, string>> {
  if (messageCache[locale]) return messageCache[locale];
  if (locale === "en") return enMessages;
  if (locale === "zh") return zhMessages;
  const loadMessages = localeMessages[locale];
  if (!loadMessages) {
    messageCache[locale] = enMessages;
    return enMessages;
  }
  try {
    const mod = await loadMessages();
    const messages = mod.default as Record<string, string>;
    messageCache[locale] = messages;
    return messages;
  } catch (e) {
    console.error("Failed to load locale messages for", locale, e);
    messageCache[locale] = enMessages;
    return enMessages;
  }
}

export function AppLocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");
  const [messages, setMessages] = useState<Record<string, string>>(enMessages);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const initial = resolveInitialLocale();
    setLocaleState(initial);
    void (async () => {
      setIsLoading(true);
      setMessages(await ensureLocaleMessages(initial));
      setIsLoading(false);
    })();
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next;
    }
    void (async () => {
      setIsLoading(true);
      setMessages(await ensureLocaleMessages(next));
      setIsLoading(false);
    })();
  }, []);

  const value = useMemo<AppLocaleContextValue>(
    () => ({
      locale,
      setLocale,
      isLoading,
      t: (key, params) =>
        interpolate(messages[key] ?? enMessages[key] ?? key, params),
    }),
    [locale, messages, setLocale],
  );

  return (
    <AppLocaleContext.Provider value={value}>
      {children}
    </AppLocaleContext.Provider>
  );
}

export function useAppLocale() {
  const context = useContext(AppLocaleContext);
  if (!context) {
    throw new Error("useAppLocale must be used within AppLocaleProvider");
  }
  return context;
}

export function getAppLocaleLabel(locale: AppLocale): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === locale);
  if (!lang) return locale;
  return lang.nativeLabel !== lang.label
    ? `${lang.label} (${lang.nativeLabel})`
    : lang.label;
}
