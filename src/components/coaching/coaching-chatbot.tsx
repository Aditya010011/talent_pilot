"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, User, BookOpen } from "lucide-react";
import { stripThinking } from "@/lib/ai/strip-thinking";

const CHATBOT_ICON = "/coaching-chatbot-icon.png";

interface Slide {
  slide?: number;
  title?: string;
  summary?: string;
  script?: string;
  imageUrl?: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface CoachingChatbotProps {
  slides: Slide[];
  trainingTitle: string;
  language?: string;
  navyDark?: string;
  /** Controlled open state lifted from parent */
  isOpen: boolean;
  onToggle: () => void;
}

export function CoachingChatbot({
  slides,
  trainingTitle,
  language,
  navyDark = "hsl(214 80% 18%)",
  isOpen,
  onToggle,
}: CoachingChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `👋 Hi! I'm your AI learning assistant for **${trainingTitle}**.\n\nAsk me anything about the training material — I can explain concepts, clarify slides, or help you review what you've learned!`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, scrollToBottom]);

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, scrollToBottom]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ai/coaching-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, slides, trainingTitle, language }),
      });

      const data = await res.json();
      const fullText = stripThinking(
        data.content || "Sorry, I couldn't generate a response. Please try again.",
      );

      // Initialize the assistant message with empty content
      const assistantMsgId = crypto.randomUUID();
      const assistantMsgPlaceholder: ChatMessage = {
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsgPlaceholder]);
      setIsLoading(false);

      // Progressive character-by-character typewriter streaming simulation
      let currentLength = 0;
      const streamSpeed = 15; // ms per character
      const timer = setInterval(() => {
        currentLength += 2; // Stream 2 characters at a time for smoother, faster UI updates
        const nextText = fullText.slice(0, currentLength);
        setMessages((prev) =>
          prev.map((m, idx) =>
            idx === prev.length - 1 ? { ...m, content: nextText } : m
          )
        );
        if (currentLength >= fullText.length) {
          clearInterval(timer);
          if (!isOpen) setHasUnread(true);
        }
      }, streamSpeed);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date(),
        },
      ]);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickQuestions = [
    "Summarize the key points",
    "What should I remember most?",
    "Explain the main concept",
  ];

  // Render markdown-lite: bold, newlines, slide refs
  const renderContent = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*|Slide \d+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (/^Slide \d+$/.test(part)) {
        return (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-semibold"
            style={{ background: "rgba(37,99,235,0.12)", color: navyDark }}
          >
            <BookOpen className="h-3 w-3" />
            {part}
          </span>
        );
      }
      return part.split("\n").map((line, j, arr) => (
        <span key={`${i}-${j}`}>
          {line}
          {j < arr.length - 1 && <br />}
        </span>
      ));
    });
  };

  return (
    <>

      {/* ── Inline side panel — part of flex row, not a fixed overlay ── */}
      <div
        className="flex-shrink-0 flex flex-col border-l bg-white overflow-hidden"
        style={{
          width: isOpen ? "420px" : "0px",
          minWidth: isOpen ? "420px" : "0px",
          borderColor: isOpen ? "hsl(214 30% 88%)" : "transparent",
          transition: "width 350ms cubic-bezier(0.4, 0, 0.2, 1), min-width 350ms cubic-bezier(0.4, 0, 0.2, 1), border-color 350ms ease",
        }}
      >
        {/* Render always but control visibility/opacity to animate content smoothly */}
        <div 
          className="flex flex-col h-full w-[420px] transition-opacity duration-300"
          style={{ opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? "auto" : "none" }}
        >
          {/* Header */}
            <div
              className="flex-shrink-0 flex items-center gap-3 px-5 py-4 text-white"
              style={{ background: `linear-gradient(135deg, ${navyDark}, hsl(214 65% 28%))` }}
            >
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/10">
                <img
                  src={CHATBOT_ICON}
                  alt=""
                  className="h-9 w-9 rounded-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-tight">AI Learning Assistant</p>
                <p className="text-xs text-white/70 truncate">{trainingTitle}</p>
              </div>
              <button
                onClick={onToggle}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Context pill */}
            <div
              className="flex-shrink-0 flex items-center gap-2 border-b px-5 py-2.5 text-xs"
              style={{ background: "hsl(214 55% 97%)", borderColor: "hsl(214 40% 88%)", color: navyDark }}
            >
              <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-medium">Based on {slides.length} training slides · Training continues in background</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto code-scrollbar px-4 py-4 space-y-4 bg-slate-50">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div
                    className="flex-shrink-0 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-white"
                    style={msg.role === "assistant" ? undefined : { background: "#64748b" }}
                  >
                    {msg.role === "user" ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <img
                        src={CHATBOT_ICON}
                        alt=""
                        className="h-7 w-7 rounded-full object-contain"
                      />
                    )}
                  </div>
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      msg.role === "user"
                        ? "text-white rounded-tr-sm"
                        : "bg-white text-slate-800 border border-slate-200 rounded-tl-sm"
                    }`}
                    style={msg.role === "user" ? { background: navyDark } : {}}
                  >
                    {msg.role === "assistant" ? renderContent(msg.content) : msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full">
                    <img
                      src={CHATBOT_ICON}
                      alt=""
                      className="h-7 w-7 rounded-full object-contain"
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white border border-slate-200 px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="h-2 w-2 rounded-full bg-slate-400 animate-bounce"
                          style={{ animationDelay: `${d * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick questions (only at start) */}
            {messages.length === 1 && (
              <div className="flex-shrink-0 border-t bg-white px-4 py-3 flex flex-wrap gap-2">
                {quickQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="flex-shrink-0 border-t bg-white px-4 py-3">
              <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about the training material..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                  style={{ maxHeight: "120px" }}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white transition-all disabled:opacity-40"
                  style={{ background: navyDark }}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-slate-400">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
        </div>
      </div>
    </>
  );
}
