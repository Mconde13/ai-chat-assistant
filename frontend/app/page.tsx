"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationEvent, FormEvent, ReactNode } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!;

type Message = {
  role: "user" | "bot";
  text: string;
};

const WELCOME: Message = {
  role: "bot",
  text: "Hi, welcome to Example Lash Studio! 🤍 I can help with services, pricing, booking and policies. What would you like to know?",
};

// The bot's answers contain **bold**, "- " bullets and plain URLs; show them nicely.
function formatText(text: string): ReactNode[] {
  const withBullets = text.replace(/^[-*] /gm, "• ");
  return withBullets.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^https?:\/\//.test(part)) {
      const url = part.replace(/[.,;:!?)]+$/, "");
      const trailing = part.slice(url.length);
      return (
        <span key={i}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
          {trailing}
        </span>
      );
    }
    return part;
  });
}

// Each blink is its own one-shot animation: a short fixed-length blink (or, about one time
// in four, a double blink) that starts after a random 3 to 5 second wait, so the timing
// never feels mechanical. When one ends, the next starts under a different keyframes name
// (the pairs are identical) because swapping the name is what restarts an animation
// cleanly; changing the duration of a running one would shift its phase.
function nextBlink(e: AnimationEvent<SVGGElement>) {
  const el = e.currentTarget;
  const double = Math.random() < 0.25;
  const names = double ? ["bba-dblink-a", "bba-dblink-b"] : ["bba-blink-a", "bba-blink-b"];
  const current = getComputedStyle(el).animationName;
  el.style.animationName = names.find((n) => n !== current) ?? names[0];
  el.style.animationDuration = double ? "760ms" : "320ms";
  el.style.animationDelay = `${3000 + Math.random() * 2000}ms`;
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function askQuestion() {
    const asked = question.trim();
    if (!asked || loading) return;

    const userMessage: Message = { role: "user", text: asked };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setQuestion("");

    try {
      const response = await fetch(
        `${BACKEND_URL}/ask?question=${encodeURIComponent(asked)}`
      );
      const data = await response.json();
      const text = response.ok
        ? data.answer
        : response.status === 429
          ? "You're asking too fast. Please wait a minute and try again."
          : data.detail || "Something went wrong. Please try again.";
      setMessages((prev) => [...prev, { role: "bot", text }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Something went wrong. Is the backend running?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    askQuestion();
  }

  return (
    <div className="bba-page">
      <style>{styles}</style>
      <div className="bba-card">
        <header className="bba-header">
          <div className="bba-avatar" aria-hidden="true">
            B
          </div>
          <div className="bba-titles">
            <h1>Example Lash Studio</h1>
            <p>Lash extensions · Ask about services &amp; booking</p>
          </div>
          <div className="bba-lash" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <g className="bba-blink" onAnimationEnd={nextBlink}>
                <path
                  d="M3 12C6.5 6.5 17.5 6.5 21 12C17.5 17.5 6.5 17.5 3 12Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="2.9" fill="currentColor" />
                <path
                  d="M12 7.6V4.8M6.9 8.9 5.6 6.4M17.1 8.9l1.3-2.5M4.3 10.5 2.6 8.7M19.7 10.5l1.7-1.8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </g>
            </svg>
          </div>
        </header>

        <div className="bba-messages" role="log" aria-live="polite" aria-label="Chat messages">
          {messages.map((msg, i) => (
            <div key={i} className={`bba-row ${msg.role}`}>
              <div className={`bba-bubble ${msg.role}`}>{formatText(msg.text)}</div>
            </div>
          ))}
          {loading && (
            <div className="bba-row bot">
              <div className="bba-bubble bot bba-typing" role="status" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="bba-composer" onSubmit={handleSubmit}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question..."
            aria-label="Your question"
            maxLength={500}
            enterKeyHint="send"
            autoComplete="off"
          />
          <button type="submit" disabled={loading || !question.trim()} aria-label="Send">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = `
.bba-page {
  --bg-from: #fdeef1;
  --bg-to: #fbe4e9;
  --blob-1: rgba(244, 143, 177, 0.55);
  --blob-2: rgba(255, 183, 197, 0.6);
  --blob-3: rgba(216, 120, 160, 0.4);
  --card: rgba(255, 245, 248, 0.58);
  --card-solid: #fff5f8;
  --glass-border: rgba(255, 255, 255, 0.75);
  --glass-edge: rgba(255, 255, 255, 0.9);
  --header-from: rgba(199, 96, 127, 0.92);
  --header-to: rgba(222, 138, 160, 0.88);
  --header-text: #ffffff;
  --bot-bubble: rgba(255, 255, 255, 0.78);
  --bot-text: #3d2a31;
  --bot-border: rgba(240, 190, 204, 0.7);
  --user-from: #c2527a;
  --user-to: #d4698c;
  --user-text: #ffffff;
  --muted: #8a6b75;
  --input-bg: rgba(255, 255, 255, 0.8);
  --input-border: rgba(236, 190, 204, 0.9);
  --accent: #c2527a;
  --link: #a83a62;
  --shadow: 0 12px 48px rgba(194, 82, 122, 0.25);
  --bubble-shadow: 0 1px 3px rgba(120, 50, 72, 0.12);

  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background:
    radial-gradient(520px circle at 12% 14%, var(--blob-1), transparent 70%),
    radial-gradient(560px circle at 88% 22%, var(--blob-2), transparent 70%),
    radial-gradient(620px circle at 50% 100%, var(--blob-3), transparent 70%),
    linear-gradient(160deg, var(--bg-from), var(--bg-to));
  background-attachment: fixed;
  font-family: var(--font-sans), system-ui, -apple-system, "Segoe UI", sans-serif;
}

@media (prefers-color-scheme: dark) {
  .bba-page {
    --bg-from: #1b1115;
    --bg-to: #130c0f;
    --card: rgba(48, 28, 38, 0.55);
    --card-solid: #2a1a23;
    --glass-border: rgba(255, 190, 215, 0.22);
    --glass-edge: rgba(255, 210, 228, 0.35);
    --blob-1: rgba(190, 70, 120, 0.5);
    --blob-2: rgba(140, 50, 100, 0.5);
    --blob-3: rgba(100, 40, 80, 0.55);
    --header-from: rgba(110, 44, 74, 0.92);
    --header-to: rgba(150, 62, 98, 0.88);
    --header-text: #fdeef2;
    --bot-bubble: rgba(72, 44, 58, 0.72);
    --bot-text: #f8ecf0;
    --bot-border: rgba(255, 190, 215, 0.2);
    --user-from: #b4466e;
    --user-to: #c75c82;
    --user-text: #ffffff;
    --muted: #b99aa6;
    --input-bg: rgba(60, 36, 48, 0.75);
    --input-border: rgba(255, 190, 215, 0.25);
    --accent: #e0709a;
    --link: #f3a3c0;
    --shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
    --bubble-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }
}

.bba-card {
  width: 100%;
  max-width: 540px;
  height: min(780px, calc(100dvh - 48px));
  display: flex;
  flex-direction: column;
  background: var(--card);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
  backdrop-filter: blur(22px) saturate(170%);
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  box-shadow: var(--shadow), inset 0 1px 0 var(--glass-edge);
  overflow: hidden;
}

/* Browsers without backdrop-filter get a solid card so text stays readable */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .bba-card { background: var(--card-solid); }
}

.bba-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  color: var(--header-text);
  background: linear-gradient(135deg, var(--header-from), var(--header-to));
}

.bba-avatar {
  flex: none;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.bba-titles { min-width: 0; flex: 1; }
.bba-lash {
  flex: none;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  color: var(--header-text);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.45);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}
.bba-titles h1 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  overflow-wrap: anywhere;
}
.bba-titles p {
  margin: 2px 0 0;
  font-size: 0.8rem;
  opacity: 0.9;
}

.bba-messages {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px;
}

.bba-row { display: flex; animation: bba-in 0.22s ease-out; }
.bba-row.user { justify-content: flex-end; }
.bba-row.bot { justify-content: flex-start; }

.bba-bubble {
  max-width: 82%;
  padding: 10px 14px;
  font-size: 0.95rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: var(--bubble-shadow);
}
.bba-bubble.bot {
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  background: var(--bot-bubble);
  color: var(--bot-text);
  border: 1px solid var(--bot-border);
  border-radius: 18px 18px 18px 6px;
}
.bba-bubble.user {
  background: linear-gradient(135deg, var(--user-from), var(--user-to));
  color: var(--user-text);
  border-radius: 18px 18px 6px 18px;
}
.bba-bubble a { color: var(--link); text-decoration: underline; text-underline-offset: 2px; }

.bba-typing {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 14px 16px;
}
.bba-typing span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.4;
  animation: bba-dot 1.2s infinite ease-in-out;
}
.bba-typing span:nth-child(2) { animation-delay: 0.15s; }
.bba-typing span:nth-child(3) { animation-delay: 0.3s; }

.bba-composer {
  display: flex;
  gap: 10px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--bot-border);
  background: transparent;
}
.bba-composer input {
  flex: 1;
  min-width: 0;
  padding: 12px 16px;
  font: inherit;
  font-size: 16px; /* 16px stops iOS from zooming the page on focus */
  color: var(--bot-text);
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 999px;
  outline: none;
}
.bba-composer input::placeholder { color: var(--muted); }
.bba-composer input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
.bba-composer button {
  flex: none;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, var(--user-from), var(--user-to));
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: var(--bubble-shadow);
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.bba-composer button:hover:not(:disabled) { transform: scale(1.06); }
.bba-composer button:disabled { opacity: 0.45; cursor: default; }

/* Blink: the eye squashes shut, holds for a moment, then reopens a bit slower, about a third
   of a second in all. Occasionally it double blinks. The wait between blinks is the
   animation delay, set by nextBlink(). Transform only, so nothing reflows. */
.bba-blink {
  transform-box: fill-box;
  transform-origin: 50% 55%;
  animation: bba-blink-a 320ms ease-in-out 2.5s 1;
  will-change: transform;
}
@keyframes bba-blink-a {
  0%, 100% { transform: scaleY(1); }
  30%, 50% { transform: scaleY(0.08); }
}
@keyframes bba-blink-b {
  0%, 100% { transform: scaleY(1); }
  30%, 50% { transform: scaleY(0.08); }
}
@keyframes bba-dblink-a {
  0%, 38%, 50%, 100% { transform: scaleY(1); }
  12%, 22%, 62%, 72% { transform: scaleY(0.08); }
}
@keyframes bba-dblink-b {
  0%, 38%, 50%, 100% { transform: scaleY(1); }
  12%, 22%, 62%, 72% { transform: scaleY(0.08); }
}

@keyframes bba-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes bba-dot { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-5px); opacity: 1; } }

/* Phones: use the whole screen, no floating card */
@media (max-width: 560px) {
  .bba-page { padding: 0; align-items: stretch; }
  .bba-card { max-width: none; height: 100dvh; border-radius: 0; border: none; box-shadow: none; }
  .bba-bubble { max-width: 88%; }
}

/* Very narrow phones: shrink the header so the name stays on one line */
@media (max-width: 360px) {
  .bba-header { gap: 10px; padding: 14px; }
  .bba-avatar { width: 36px; height: 36px; font-size: 1rem; }
  .bba-lash { width: 34px; height: 34px; }
  .bba-lash svg { width: 22px; height: 22px; }
  .bba-titles h1 { font-size: 0.9rem; letter-spacing: 0.03em; }
  .bba-titles p { font-size: 0.75rem; }
}

@media (prefers-reduced-motion: reduce) {
  .bba-row, .bba-typing span, .bba-blink { animation: none; }
  .bba-typing span { opacity: 0.8; }
}
`;
