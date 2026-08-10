"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Volume2, Send, Mic, RotateCcw, Star, ArrowRight, MessageCircle, Sparkles } from "lucide-react";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import SpeechRecorder from "@/components/SpeechRecorder";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { playTts } from "@/lib/audio";
import { logger } from "@/lib/logger";
import type {
  ChatScene,
  ChatMessage,
  ChatSessionSummary,
  ChatHistoryMessage,
  SpeechFeedback,
} from "@/lib/types";
import type { RecordingResult } from "@/lib/speech-recorder";

export default function ChatPage() {
  return (
    <AuthGate>
      <ChatInner />
    </AuthGate>
  );
}

/** 单条助手消息的「跟读」面板：复用 SpeechRecorder 录音 + evaluateSpeech 评测。 */
function ReadAlongPanel({
  referenceText,
  userId,
  onClose,
}: {
  referenceText: string;
  userId: string | undefined;
  onClose: () => void;
}) {
  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [feedback, setFeedback] = useState<SpeechFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("Chat");

  const clear = useCallback(() => {
    setRecording(null);
    setFeedback(null);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!recording || evaluating) return;
    setEvaluating(true);
    setError(null);
    try {
      const fb = await api.evaluateSpeech(recording.blob, {
        referenceText,
        durationMs: recording.durationMs,
        userId,
      });
      setFeedback(fb);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || t("evalError")
          : t("networkError"),
      );
      logger.error("read-along evaluateSpeech failed", err);
    } finally {
      setEvaluating(false);
    }
  }, [recording, evaluating, referenceText, userId]);

  return (
    <div
      className="mt-3 card-kids space-y-3"
      data-component="ReadAlongPanel"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-kids-muted">
          🎤 {t("readAfterFoxy")}
        </span>
        <button
          onClick={onClose}
          className="text-kids-muted text-xs font-bold hover:text-kids-title"
          aria-label={t("closeReadAlong")}
          data-action="close-readalong"
        >
          {t("close")}
        </button>
      </div>

      {!feedback ? (
        <div className="space-y-3" data-component="ReadAlongRecord">
          <SpeechRecorder
            disabled={evaluating}
            onRecordingComplete={(r) => {
              setRecording(r);
              setError(null);
            }}
            onReset={clear}
            onError={() => clear()}
          />
          <div className="flex justify-center">
            <Button
              variant="success"
              size="lg"
              disabled={!recording || evaluating}
              onClick={handleSubmit}
              data-action="submit-readalong"
            >
              <Mic size={20} className="mr-2" />
              {evaluating ? "Checking…" : "Submit"}
            </Button>
          </div>
          {evaluating && (
            <div
              className="flex flex-col items-center gap-2 text-kids-muted font-semibold"
              data-component="ReadAlongEvaluating"
            >
              <Mascot expression="thinking" size="small" />
              Foxy is listening…
            </div>
          )}
          {error && (
            <p
              className="text-sm font-bold text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-control px-4 py-2.5 text-center"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      ) : (
        <div
          className="flex flex-col items-center gap-2 text-center"
          data-component="ReadAlongFeedback"
        >
          <Mascot
            expression={feedback.passed ? "celebrating" : "encouraging"}
            size="medium"
          />
          <p className="text-2xl font-extrabold text-kids-title">
            {feedback.score}
            <span className="text-base text-kids-muted"> / 100</span>
          </p>
          <p className="text-kids-text font-semibold max-w-sm">
            {feedback.feedback}
          </p>
          {feedback.passed && (
            <div className="flex items-center gap-1 text-[var(--color-success)] font-extrabold">
              <Star size={24} className="text-kids-sun fill-kids-sun" />
              You earned a star! ⭐
            </div>
          )}
          <Button variant="soft" onClick={clear} data-action="readalong-again">
            <RotateCcw size={18} className="mr-2" />
            {t("tryAgain")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ChatInner() {
  const { user } = useAuth();
  const t = useTranslations("Chat");

  const [scenes, setScenes] = useState<ChatScene[]>([]);
  const [loadingScenes, setLoadingScenes] = useState(true);
  const [sceneError, setSceneError] = useState<string | null>(null);

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [readAlongForId, setReadAlongForId] = useState<string | null>(null);
  // AI-408：当前会话累计星星数 + 刚得星时的庆祝态（存星星总数，null=不庆祝）。
  const [sessionStars, setSessionStars] = useState(0);
  const [celebration, setCelebration] = useState<number | null>(null);
  // AI-409：我的会话列表 + 续聊。sesions 为摘要列表；active 会话 = sessionId（复用既有 state）。
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);

  // 庆祝态自动消失（4 秒后），避免遮挡后续对话。
  useEffect(() => {
    if (celebration == null) return;
    const t = setTimeout(() => setCelebration(null), 4000);
    return () => clearTimeout(t);
  }, [celebration]);

  // 加载场景包（AI-405）：失败降级为「自由对话」入口（不阻塞聊天）。
  useEffect(() => {
    let active = true;
    setLoadingScenes(true);
    api
      .getChatScenes()
      .then((list) => {
        if (active) setScenes(list);
      })
      .catch((err) => {
        if (active) {
          setSceneError(
            err instanceof ApiError
              ? err.message || t("sceneLoadError")
              : t("networkError"),
          );
          logger.error("Failed to load chat scenes", err);
        }
      })
      .finally(() => {
        if (active) setLoadingScenes(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // AI-409：加载「我的会话」列表（续聊入口）。失败不阻断聊天，保留空列表。
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const list = await api.getChatSessions(user?.id);
      setSessions(list);
    } catch (err) {
      logger.error("Failed to load chat sessions", err);
      // 不阻断对话：保留空列表，用户仍可正常发起新对话
    } finally {
      setLoadingSessions(false);
    }
  }, [user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // 新消息 → 滚动到底部。
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const handleSelectScene = useCallback(
    (scene: ChatScene) => {
      setSelectedSceneId(scene.id);
      setSceneError(null);
      // 对话尚未开始 → 以狐狸开场白作为首条助手气泡（本地种子，未走后端）。
      setMessages((prev) => {
        if (prev.length > 0) return prev;
        return [
          {
            id: `opening-${scene.id}`,
            role: "assistant",
            text: scene.openingLine,
            ttsUrl: null,
            isOpening: true,
          },
        ];
      });
    },
    [],
  );

  // AI-409：恢复历史会话 → 拉取历史消息回显到 thread，并定位到该会话（sessionId/
  // sceneId/stars 同步），续聊时 handleSend 携带 sessionId，后端自动续上上下文。
  const handleResumeSession = useCallback(
    async (session: ChatSessionSummary) => {
      setSelectedSceneId(session.sceneId);
      setSessionStars(session.stars);
      setSendError(null);
      setInput("");
      try {
        const history: ChatHistoryMessage[] = await api.getChatSessionMessages(
          session.id,
          user?.id,
        );
        const mapped: ChatMessage[] = history.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          ttsUrl: m.ttsUrl ?? null,
        }));
        setSessionId(session.id);
        setMessages(mapped);
      } catch (err) {
        logger.error("Failed to resume chat session", err);
        setSendError(
          err instanceof ApiError
            ? err.message || t("openChatError")
            : t("openChatNetworkError"),
        );
      }
    },
    [user],
  );

  // AI-409：开新对话 → 清掉当前会话（sessionId/消息/场景/星星），回到初始态。
  const handleNewChat = useCallback(() => {
    setSessionId(null);
    setSelectedSceneId(null);
    setSessionStars(0);
    setMessages([]);
    setCelebration(null);
    setSendError(null);
    setInput("");
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    // 首条发言携带选定场景（之后续聊忽略 sceneId，以会话本身为准）。
    const sceneId = messages.length === 0 ? selectedSceneId : null;
    const optimisticUser: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    setSending(true);
    setSendError(null);
    try {
      const res = await api.sendChatMessage({
        text,
        sceneId,
        sessionId,
        userId: user?.id,
      });
      setSessionId(res.sessionId);
      setMessages((prev) => [
        ...prev,
        {
          id: res.messageId,
          role: "assistant",
          text: res.replyText,
          ttsUrl: res.ttsUrl,
        },
      ]);
      // AI-408：累计星星 + 刚得星触发庆祝（后端决定本轮是否跨里程碑）。
      setSessionStars(res.stars);
      if (res.starAwarded) setCelebration(res.stars);
      // 狐狸语音自动播放（无 audioUrl 时静默降级，仅文本）。
      if (res.ttsUrl) playTts(res.ttsUrl);
    } catch (err) {
          setSendError(
        err instanceof ApiError
          ? err.message || t("sendError")
          : t("networkError"),
      );
      logger.error("sendChatMessage failed", err);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages.length, selectedSceneId, sessionId, user]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;

  // AI-409：把场景 id 映射成展示标题（用于会话列表项）；未知/自由对话回落。
  const sceneTitle = useCallback(
    (id: string | null): string => {
      if (!id) return "Free chat";
      return scenes.find((s) => s.id === id)?.title ?? id;
    },
    [scenes],
  );

  return (
    <div className="space-y-5" data-component="ChatPage">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Mascot expression="happy" size="medium" />
        <div>
          <h1
            className="text-2xl font-extrabold text-kids-title"
            data-component="ChatTitle"
          >
            Chat with Foxy!
          </h1>
          <p className="text-sm text-kids-muted">
            Pick a scene and talk with your fox friend 🦊
          </p>
        </div>
        {/* AI-408：本会话累计星星徽标 */}
        {sessionStars > 0 && (
          <div
            className="ml-auto flex items-center gap-1 rounded-control bg-kids-sun/20 px-3 py-1.5"
            data-component="ChatStarCount"
          >
            <Star size={18} className="text-kids-sun fill-kids-sun" />
            <span className="font-extrabold text-kids-title">{sessionStars}</span>
          </div>
        )}
      </div>

      {/* AI-408：刚得星庆祝横幅 */}
      {celebration != null && (
        <div
          className="card-kids flex flex-col items-center gap-2 bg-[var(--color-primary-wash)] py-4 text-center animate-star-pop"
          data-component="ChatStarCelebration"
          data-stars={celebration}
        >
          <Mascot expression="celebrating" size="large" />
          <p className="text-xl font-extrabold text-kids-title">
            🎉 You earned a star!
          </p>
          <p className="text-sm font-bold text-kids-sun">
            {celebration} ⭐ so far — keep chatting!
          </p>
          <button
            onClick={() => setCelebration(null)}
            className="rounded-full bg-white px-4 py-1 text-xs font-bold text-kids-title hover:bg-kids-secondary"
            data-action="dismiss-celebration"
          >
            Keep chatting!
          </button>
        </div>
      )}

      {/* AI-409：我的会话列表 + 续聊入口 */}
      <section className="space-y-2" data-component="ChatSessionList">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-kids-title">
            My conversations
          </h2>
          <button
            type="button"
            onClick={handleNewChat}
            className="rounded-full bg-kids-secondary px-3 py-1 text-xs font-bold text-kids-title hover:bg-kids-sun/30"
            data-action="new-chat"
          >
            + New chat
          </button>
        </div>
        {loadingSessions ? (
          <p className="text-xs text-kids-muted">Loading conversations…</p>
        ) : sessions.length === 0 ? (
          <p
            className="text-xs text-kids-muted"
            data-component="ChatSessionEmpty"
          >
            No past chats yet 🐾
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  data-component="ChatSessionItem"
                  data-session-id={s.id}
                  data-active={sessionId === s.id ? "true" : "false"}
                  onClick={() => handleResumeSession(s)}
                  className={`w-full rounded-control border-2 px-3 py-2 text-left transition-colors ${
                    sessionId === s.id
                      ? "border-[var(--seed-primary)] bg-[var(--color-primary-wash)]"
                      : "border-transparent bg-kids-card hover:bg-kids-secondary"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold text-kids-title">
                      {sceneTitle(s.sceneId)}
                    </span>
                    {s.stars > 0 && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-kids-sun">
                        <Star size={14} className="fill-kids-sun" />
                        {s.stars}
                      </span>
                    )}
                  </div>
                  {s.lastMessagePreview && (
                    <p className="mt-0.5 truncate text-xs text-kids-muted">
                      {s.lastMessagePreview}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-kids-muted">
                    {s.messageCount} message{s.messageCount === 1 ? "" : "s"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Scene selection cards (AI-405) */}
      {loadingScenes ? (
        <div
          className="flex items-center gap-2 text-kids-muted font-semibold"
          data-component="SceneLoading"
        >
          <Mascot expression="thinking" size="small" />
          Loading scenes…
        </div>
      ) : sceneError ? (
        <p
          className="text-sm font-bold text-[var(--color-warning)] bg-[var(--color-warning)]/10 rounded-control px-4 py-2.5 text-center"
          role="alert"
        >
          {sceneError}{t("freeChatStillAvailable")}
        </p>
      ) : (
        <section className="space-y-3" data-component="SceneCards">
          <div className="flex flex-wrap gap-3">
            {scenes.map((scene) => {
              const active = scene.id === selectedSceneId;
              return (
                <button
                  key={scene.id}
                  type="button"
                  data-component="SceneCard"
                  data-scene-id={scene.id}
                  onClick={() => handleSelectScene(scene)}
                  className={`flex-1 min-w-[140px] rounded-card border-2 p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--seed-primary)] bg-[var(--color-primary-wash)]"
                      : "border-transparent bg-kids-card hover:bg-kids-secondary"
                  }`}
                  aria-pressed={active}
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle size={18} className="text-[var(--seed-primary)]" />
                    <span className="font-extrabold text-kids-title">
                      {scene.title}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-kids-muted line-clamp-2">
                    {scene.openingLine}
                  </p>
                </button>
              );
            })}
          </div>
          {selectedScene && (
            <div
              className="rounded-control bg-[var(--color-primary-wash)]/60 px-3 py-2"
              data-component="SceneVocab"
            >
              <span className="text-xs font-bold text-kids-muted">
                Goal words:{" "}
              </span>
              {selectedScene.targetVocabulary.map((w) => (
                <span
                  key={w}
                  className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[var(--seed-primary)]"
                >
                  {w}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Chat thread */}
      <div
        ref={threadRef}
        className="space-y-3 max-h-[55vh] overflow-y-auto pr-1"
        data-component="ChatThread"
      >
        {messages.length === 0 && !loadingScenes && (
          <div
            className="flex flex-col items-center gap-2 py-8 text-center text-kids-muted"
            data-component="ChatEmpty"
          >
            <Mascot expression="encouraging" size="large" />
            <p className="font-semibold">
              Choose a scene above, then say hi to Foxy! 👋
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            data-component="ChatBubble"
            data-role={msg.role}
            data-opening={msg.isOpening ? "true" : "false"}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-card px-4 py-2.5 ${
                msg.role === "user"
                  ? "bg-[var(--seed-primary)] text-white"
                  : "bg-kids-card text-kids-text"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

              {/* 助手消息：TTS 语音条 + 跟读按钮 */}
              {msg.role === "assistant" && (
                <div className="mt-2 flex flex-col gap-2">
                  {msg.ttsUrl ? (
                    <div className="flex items-center gap-2">
                      <audio
                        src={msg.ttsUrl}
                        autoPlay
                        controls
                        className="h-9 w-full max-w-[220px]"
                        data-component="ChatTtsAudio"
                      />
                      <button
                        onClick={() => playTts(msg.ttsUrl)}
                        className="shrink-0 rounded-full bg-kids-secondary p-2 text-[var(--seed-primary)]"
                        aria-label={t("playVoice")}
                        data-action="play-tts"
                      >
                        <Volume2 size={18} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-kids-muted">
                      {t("noVoice")}
                    </span>
                  )}

                  {!msg.isOpening && (
                    <button
                      onClick={() =>
                        setReadAlongForId((cur) => (cur === msg.id ? null : msg.id))
                      }
                      className="self-start rounded-full bg-kids-sun/20 px-3 py-1 text-xs font-bold text-kids-sun hover:bg-kids-sun/30"
                      aria-label={t("readAfterFoxy")}
                      data-action="read-along"
                    >
                      🔁 {t("readAlong")}
                    </button>
                  )}
                </div>
              )}

              {msg.role === "assistant" && readAlongForId === msg.id && (
                <ReadAlongPanel
                  referenceText={msg.text}
                  userId={user?.id}
                  onClose={() => setReadAlongForId(null)}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {sendError && (
        <p
          className="text-sm font-bold text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-control px-4 py-2.5 text-center"
          role="alert"
          data-component="ChatSendError"
        >
          {sendError}
        </p>
      )}

      {/* Input */}
      <div className="flex items-end gap-2" data-component="ChatComposer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type something to Foxy…"
          className="flex-1 resize-none rounded-control border-2 border-kids-secondary bg-white px-3 py-2 text-kids-text focus:border-[var(--seed-primary)] focus:outline-none"
          data-component="ChatInput"
        />
        <Button
          variant="default"
          size="lg"
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending}
          data-action="send"
        >
          <Send size={18} className="mr-1" />
          {sending ? "…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
