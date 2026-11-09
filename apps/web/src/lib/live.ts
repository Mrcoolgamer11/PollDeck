import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type {
  AudienceBroadcast,
  AudienceState,
  HostState,
  LeaderboardEntry,
  LobbyParticipant,
  MyResponse,
  QaQuestion,
  Reaction,
  SessionLiveState,
  SlideResults,
} from "@polldeck/shared";
import { connect, request, type AckResult } from "./socket";
import { getDeviceId } from "./device";

export type ConnStatus = "connecting" | "connected" | "reconnecting" | "error";

// ---------------------------------------------------------------------------
// Präsentator / Beamer
// ---------------------------------------------------------------------------
export function useHostSession(sessionId: string | undefined, preferredRole: "host" | "screen", onReaction?: (r: { reaction: Reaction; id: string }) => void) {
  const [state, setState] = useState<HostState | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"host" | "screen">(preferredRole);
  const socketRef = useRef<Socket | null>(null);
  const reactionRef = useRef(onReaction);
  reactionRef.current = onReaction;

  useEffect(() => {
    if (!sessionId) return;
    const socket = connect({ role, sessionId });
    socketRef.current = socket;
    socket.on("connect", () => {
      setStatus("connected");
      setError(null);
    });
    socket.on("disconnect", () => setStatus("reconnecting"));
    socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.on("connect_error", (err) => {
      if (err.message === "forbidden" && role === "host") {
        // Nur Leserechte: als Beamer verbinden.
        socket.disconnect();
        setRole("screen");
        return;
      }
      if (["unauthorized", "forbidden", "session_not_found", "invalid_auth"].includes(err.message)) {
        setError(err.message);
        setStatus("error");
        socket.disconnect();
      } else setStatus("reconnecting");
    });
    socket.on("host:state", (s: HostState) => setState(s));
    socket.on("host:live", (p: { live: SessionLiveState; ended: boolean; serverTime: number }) =>
      setState((s) => (s ? { ...s, live: p.live, ended: p.ended, serverTime: p.serverTime } : s)),
    );
    socket.on("host:results", (p: { slideId: string; results: SlideResults; count: number }) =>
      setState((s) =>
        s
          ? {
              ...s,
              results: { ...s.results, [p.slideId]: p.results },
              responseCounts: { ...s.responseCounts, [p.slideId]: p.count },
            }
          : s,
      ),
    );
    socket.on("qa:update", (p: { slideId: string; questions: QaQuestion[] }) =>
      setState((s) =>
        s
          ? { ...s, questions: { ...s.questions, [p.slideId]: p.questions }, responseCounts: { ...s.responseCounts, [p.slideId]: p.questions.length } }
          : s,
      ),
    );
    socket.on("host:leaderboard", (lb: LeaderboardEntry[]) => setState((s) => (s ? { ...s, leaderboard: lb } : s)));
    socket.on("host:count", (n: number) => setState((s) => (s ? { ...s, participantCount: n } : s)));
    socket.on("host:lobby", (list: LobbyParticipant[]) => setState((s) => (s ? { ...s, lobbyParticipants: list } : s)));
    socket.on("reaction", (r: { reaction: Reaction; id: string }) => reactionRef.current?.(r));
    socket.on("session:ended", () => setState((s) => (s ? { ...s, ended: true } : s)));
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, role]);

  const emit = useCallback(<T = unknown>(event: string, payload?: unknown): Promise<AckResult<T>> => {
    const s = socketRef.current;
    if (!s) return Promise.resolve({ ok: false, error: "not_connected" });
    return request<T>(s, event, payload);
  }, []);

  return { state, status, error, emit, role };
}

// ---------------------------------------------------------------------------
// Teilnehmer
// ---------------------------------------------------------------------------
interface InitPayload extends AudienceState {
  myQuestions: string[];
  myUpvotes: string[];
}

interface QueuedAnswer {
  slideId: string;
  value: unknown;
  generation: number;
}

const queueKey = (code: string) => `pd_queue_${code}`;
function loadQueue(code: string): QueuedAnswer[] {
  try {
    return JSON.parse(localStorage.getItem(queueKey(code)) ?? "[]");
  } catch {
    return [];
  }
}
function saveQueue(code: string, q: QueuedAnswer[]) {
  try {
    if (q.length) localStorage.setItem(queueKey(code), JSON.stringify(q));
    else localStorage.removeItem(queueKey(code));
  } catch {
    /* noop */
  }
}

export type AudienceError = "session_not_found" | "kicked" | "name_required" | "name_filtered" | "invalid_auth" | null;

export function useAudienceSession(code: string | undefined, name: string | null, avatar: string | null = null) {
  const [state, setState] = useState<AudienceBroadcast | null>(null);
  const [participant, setParticipant] = useState<{ id: string; name: string | null; avatar?: string | null } | null>(null);
  const [myResponses, setMyResponses] = useState<MyResponse[]>([]);
  const [myScore, setMyScore] = useState<{ score: number; rank: number | null } | null>(null);
  const [myQuestions, setMyQuestions] = useState<Set<string>>(new Set());
  const [myUpvotes, setMyUpvotes] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [error, setError] = useState<AudienceError>(null);
  const [queued, setQueued] = useState<QueuedAnswer[]>(() => (code ? loadQueue(code) : []));
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef<AudienceBroadcast | null>(null);
  stateRef.current = state;

  const refreshMe = useCallback(async () => {
    const s = socketRef.current;
    if (!s) return;
    const r = await request<{ myResponses: MyResponse[]; myScore: { score: number; rank: number | null } }>(s, "audience:me");
    if (r.ok) {
      setMyResponses(r.data.myResponses);
      setMyScore(r.data.myScore);
    }
  }, []);

  const flushQueue = useCallback(async () => {
    if (!code) return;
    const s = socketRef.current;
    const q = loadQueue(code);
    if (!s?.connected || !q.length) return;
    const rest: QueuedAnswer[] = [];
    for (const item of q) {
      const r = await request<{ id: string; status: MyResponse["status"] }>(s, "participant:respond", { slideId: item.slideId, value: item.value });
      if (r.ok) setMyResponses((m) => [...m, { id: r.data.id, slideId: item.slideId, value: item.value, status: r.data.status }]);
      else if (r.error === "timeout") rest.push(item);
    }
    saveQueue(code, rest);
    setQueued(rest);
  }, [code]);

  useEffect(() => {
    if (!code || name === null) return;
    const socket = connect({ role: "participant", code, deviceId: getDeviceId(), name: name || undefined, avatar: avatar || undefined });
    socketRef.current = socket;
    setError(null);
    socket.on("connect", () => setStatus("connected"));
    socket.on("disconnect", () => setStatus("reconnecting"));
    socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.on("connect_error", (err) => {
      const m = err.message as AudienceError;
      if (m === "session_not_found" || m === "kicked" || m === "name_required" || m === "name_filtered" || m === "invalid_auth") {
        setError(m);
        setStatus("error");
        socket.disconnect();
      } else setStatus("reconnecting");
    });
    socket.on("audience:init", (p: InitPayload) => {
      const { myResponses: mine, participant: part, myScore: score, myQuestions: mq, myUpvotes: mu, ...rest } = p;
      setState(rest);
      setParticipant(part);
      setMyResponses(mine);
      setMyScore(score ?? null);
      setMyQuestions(new Set(mq));
      setMyUpvotes(new Set(mu));
      void flushQueue();
    });
    socket.on("audience:state", (s: AudienceBroadcast) => {
      const prev = stateRef.current;
      setState(s);
      // Folie zurückgesetzt → eigene Antworten neu laden.
      const prevGen = prev?.slideState?.generation;
      if (prev && s.slide && prev.slide?.id === s.slide.id && prevGen !== undefined && s.slideState && s.slideState.generation !== prevGen) {
        void refreshMe();
      }
      // Quiz aufgelöst → Bewertung abholen.
      if (s.slideState?.revealed || (s.slideState?.timerEndsAt && s.slideState.quizStartedAt)) void refreshMe();
    });
    socket.on("audience:results", (p: { slideId: string; results: SlideResults | null }) =>
      setState((s) => (s && (s.slide?.id === p.slideId || s.mode === "SURVEY") ? { ...s, results: s.mode === "SURVEY" ? s.results : p.results } : s)),
    );
    socket.on("qa:update", (p: { slideId: string; questions: QaQuestion[] }) =>
      setState((s) => (s && (s.slide?.id === p.slideId || s.mode === "SURVEY") ? { ...s, questions: p.questions } : s)),
    );
    socket.on("audience:leaderboard", (lb: LeaderboardEntry[]) => {
      setState((s) => (s ? { ...s, leaderboard: lb } : s));
      void refreshMe();
    });
    socket.on("kicked", () => {
      setError("kicked");
      setStatus("error");
    });
    socket.on("session:ended", () => setState((s) => (s ? { ...s, ended: true } : s)));
    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, name, avatar, flushQueue, refreshMe]);

  const respond = useCallback(
    async (slideId: string, value: unknown): Promise<AckResult<{ id: string; status: MyResponse["status"]; isCorrect?: boolean; points?: number }>> => {
      const s = socketRef.current;
      if (!s || !s.connected) {
        // Offline: Antwort zwischenspeichern und nach dem Reconnect senden.
        if (code) {
          const q = [...loadQueue(code), { slideId, value, generation: stateRef.current?.slideState?.generation ?? 0 }];
          saveQueue(code, q);
          setQueued(q);
        }
        return { ok: false, error: "queued" };
      }
      const r = await request<{ id: string; status: MyResponse["status"]; isCorrect?: boolean; points?: number }>(s, "participant:respond", { slideId, value });
      if (r.ok) {
        setMyResponses((m) => [...m, { id: r.data.id, slideId, value, status: r.data.status, isCorrect: r.data.isCorrect, points: r.data.points }]);
      } else if (r.error === "timeout" && code) {
        const q = [...loadQueue(code), { slideId, value, generation: stateRef.current?.slideState?.generation ?? 0 }];
        saveQueue(code, q);
        setQueued(q);
        return { ok: false, error: "queued" };
      }
      return r;
    },
    [code],
  );

  const emit = useCallback(<T = unknown>(event: string, payload?: unknown) => {
    const s = socketRef.current;
    if (!s) return Promise.resolve({ ok: false, error: "not_connected" } as AckResult<T>);
    return request<T>(s, event, payload);
  }, []);

  return {
    state,
    setState,
    participant,
    setParticipant,
    myResponses,
    myScore,
    myQuestions,
    setMyQuestions,
    myUpvotes,
    setMyUpvotes,
    status,
    error,
    queued,
    respond,
    emit,
    refreshMe,
  };
}
