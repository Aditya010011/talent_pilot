"use client";

/**
 * useViduS1 — Premium realtime digital human via Vidu Live + AliRTC.
 *
 * Interview dialogue is driven by Vidu's built-in agent, prompted with a
 * Gemini-style persona (questions, tone, follow-ups, language). The control
 * WebSocket only does init/hangup — there is no text-inject API.
 *
 * Auth note: Vidu WS requires `Authorization: Token …` header (query-string
 * auth returns 401). Browsers cannot set that header, so we connect through
 * `/_vidu/live/ws` which the gateway proxies upstream with the server key.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import type { AvatarStatus } from "@/hooks/use-simli-avatar";

const log = createLogger("vidu-s1");

export interface UseViduS1Options {
  enabled: boolean;
  aiName: string;
  title: string;
  objective?: string | null;
  questions: Array<{
    text: string;
    type?: string;
    description?: string | null;
    options?: { options?: string[]; allowMultiple?: boolean } | null;
  }>;
  language?: string;
  aiTone?: string;
  followUpDepth?: string;
  participantName?: string | null;
  avatarImageUrl?: string;
  onStatusChange?: (status: AvatarStatus) => void;
}

export interface UseViduS1Return {
  status: AvatarStatus;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  /** Kept for call-site compatibility; Vidu speaks from persona + mic, not text inject. */
  speakText: (text: string) => void;
  /** Re-bind AliRTC remote video to the current <video> element (heals remounts). */
  reattachRemoteView: () => void;
  /**
   * Push-to-send: play recorded candidate audio into AliRTC so Vidu only
   * "hears" a turn after Submit (mic stays muted otherwise).
   */
  deliverPcmUtterance: (pcm: Int16Array, sampleRate?: number) => Promise<void>;
  /** Push-to-send controls Vidu's published RTC microphone directly. */
  setLocalMicMuted: (muted: boolean) => boolean;
  interrupt: () => void;
  disconnect: () => void;
  error: string | null;
}

type AliRtcAuthInfo = {
  appId: string;
  channelId: string;
  userId: string;
  token: string;
  timestamp: number;
  nonce?: string;
};

type AliRtcEngineLike = {
  setChannelProfile?: (profile: string | number) => void;
  setClientRole?: (role: string | number) => Promise<void> | void;
  setAudioOnlyMode?: (v: boolean) => void;
  setDefaultSubscribeAllRemoteAudioStreams?: (v: boolean) => Promise<void> | void;
  setDefaultSubscribeAllRemoteVideoStreams?: (v: boolean) => Promise<void> | void;
  enableAudioVolumeIndication?: (interval: number) => void;
  joinChannel: (
    authInfoOrToken: AliRtcAuthInfo | string,
    userNameOrParam?: string,
  ) => Promise<void>;
  publishLocalAudioStream?: (v: boolean) => Promise<void>;
  publishLocalVideoStream?: (v: boolean) => Promise<void>;
  startAudioCapture?: () => Promise<void>;
  startPreview?: () => Promise<void>;
  leaveChannel?: () => Promise<void>;
  destroy?: () => Promise<void>;
  isInCall?: () => boolean;
  isUserOnline?: (uid: string) => boolean;
  subscribeRemoteMediaStream?: (
    uid: string,
    videoTrack: number,
    subVideo: boolean,
    subAudio: boolean,
  ) => void | Promise<void>;
  resumeRemoteMediaStream?: (uid: string, videoTrack: number) => void;
  muteLocalMic?: (mute?: boolean) => void;
  muteAllRemoteAudioPlaying?: (mute?: boolean) => void;
  muteRemoteAudioPlaying?: (uid: string, mute?: boolean) => void;
  publishAudioStream?: {
    updateAudioTrack?: (audioTrack?: MediaStreamTrack, force?: boolean) => Promise<void>;
  };
  setRemoteViewConfig?: (
    el: HTMLVideoElement | string,
    userId: string,
    streamType: number,
  ) => void;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  off?: (event: string, cb: (...args: unknown[]) => void) => void;
};

type SessionRtc = {
  token: string;
  userId: string;
  appId: string;
  channelId: string;
  tokenExpireAt?: string;
};

function toBrowserWsUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("ws://") || pathOrUrl.startsWith("wss://")) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (pathOrUrl.startsWith("/")) {
    return `${proto}//${window.location.host}${pathOrUrl}`;
  }
  return pathOrUrl;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDigitalHumanUid(uid: string, botUserId: string | null): boolean {
  if (!uid) return false;
  if (botUserId && uid === botUserId) return true;
  return uid.startsWith("live-bot-") || uid.startsWith("live-video-push-");
}

/** Derive live-bot-* id from live-user-{creator}-{liveId}. */
function botUserIdFromRtc(userId: string, liveId: string): string {
  const match = userId.match(/^live-user-(.+)-([^-]+)$/);
  if (match) return `live-bot-${match[1]}-${match[2]}`;
  const creatorId = userId.replace(/^live-user-/, "").replace(new RegExp(`-${liveId}$`), "");
  return creatorId && liveId ? `live-bot-${creatorId}-${liveId}` : "";
}

function buildAuthInfo(rtc: SessionRtc): AliRtcAuthInfo {
  // Prefer decoding the base64 wrapper if present (inner token + fields).
  try {
    const raw = atob(rtc.token);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.token || parsed.appid || parsed.appId) {
      return {
        appId: String(parsed.appid || parsed.appId || rtc.appId),
        channelId: String(parsed.channelid || parsed.channelId || rtc.channelId),
        userId: String(parsed.userid || parsed.userId || rtc.userId),
        nonce: String(parsed.nonce ?? ""),
        timestamp: Number(
          parsed.timestamp || rtc.tokenExpireAt || Math.floor(Date.now() / 1000) + 600,
        ),
        token: String(parsed.token || rtc.token),
      };
    }
  } catch {
    /* single-token form */
  }
  return {
    appId: rtc.appId,
    channelId: rtc.channelId,
    userId: rtc.userId,
    token: rtc.token,
    timestamp: Number(rtc.tokenExpireAt || Math.floor(Date.now() / 1000) + 600),
  };
}

async function joinRtcChannel(engine: AliRtcEngineLike, rtc: SessionRtc): Promise<void> {
  const userName = rtc.userId || "Vidu user";
  try {
    await engine.joinChannel(rtc.token, userName);
    return;
  } catch (err) {
    log.warn("Single-token join failed — retrying with auth info", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  await engine.joinChannel(buildAuthInfo(rtc), userName);
}

export function useViduS1({
  enabled,
  aiName,
  title,
  objective,
  questions,
  language,
  aiTone,
  followUpDepth,
  participantName,
  avatarImageUrl,
  onStatusChange,
}: UseViduS1Options): UseViduS1Return {
  const [status, setStatus] = useState<AvatarStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const rtcRef = useRef<AliRtcEngineLike | null>(null);
  const liveIdRef = useRef<string | null>(null);
  const botUserIdRef = useRef<string | null>(null);
  const mediaUserIdRef = useRef<string | null>(null);
  const attachedViewUidRef = useRef<string | null>(null);
  const boundVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteMediaReadyRef = useRef(false);
  const videoPlaybackReadyRef = useRef(false);
  const videoReadyWaitersRef = useRef<Array<() => void>>([]);
  const subscribingUidRef = useRef<string | null>(null);
  const seqRef = useRef(1);
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);
  const sessionGenRef = useRef(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<AvatarStatus>("idle");
  const speakingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStatus = useCallback(
    (next: AvatarStatus) => {
      if (statusRef.current === next) return;
      log.info("Vidu status", { from: statusRef.current, to: next });
      statusRef.current = next;
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  const sendWs = useCallback((type: number, payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    const liveId = liveIdRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !liveId) return;
    ws.send(
      JSON.stringify({
        type,
        live_id: liveId,
        seq_id: seqRef.current++,
        payload,
      }),
    );
  }, []);

  const markVideoPlaybackReady = useCallback((engine: AliRtcEngineLike, uid: string) => {
    videoPlaybackReadyRef.current = true;
    // Unmute remote audio only after video is bound — avoids "audio before lips".
    engine.muteRemoteAudioPlaying?.(uid, false);
    engine.muteAllRemoteAudioPlaying?.(false);
    const waiters = videoReadyWaitersRef.current;
    videoReadyWaitersRef.current = [];
    for (const resolve of waiters) resolve();
  }, []);

  const waitForVideoPlayback = useCallback((timeoutMs = 20000) => {
    if (videoPlaybackReadyRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        videoReadyWaitersRef.current = videoReadyWaitersRef.current.filter((w) => w !== resolve);
        resolve();
      }, timeoutMs);
      videoReadyWaitersRef.current.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }, []);

  const attachBotView = useCallback(
    (engine: AliRtcEngineLike, uid: string, force = false) => {
      const el = remoteVideoRef.current;
      if (!el || !uid) return;

      if (
        !force &&
        attachedViewUidRef.current === uid &&
        boundVideoElRef.current === el
      ) {
        void el.play().catch(() => {});
        return;
      }

      try {
        engine.resumeRemoteMediaStream?.(uid, 1);
      } catch {
        /* noop */
      }
      engine.setRemoteViewConfig?.(el, uid, 1);
      attachedViewUidRef.current = uid;
      boundVideoElRef.current = el;
      void el.play().catch(() => {});
      log.info("Bound video view attached", { uid, force });
      markVideoPlaybackReady(engine, uid);
    },
    [markVideoPlaybackReady],
  );

  const reattachRemoteView = useCallback(() => {
    const engine = rtcRef.current;
    const uid = mediaUserIdRef.current || botUserIdRef.current;
    if (!engine || !uid) return;
    attachBotView(engine, uid, true);
  }, [attachBotView]);

  const subscribeBotMedia = useCallback(
    async (engine: AliRtcEngineLike, opts?: { skipOnlineCheck?: boolean }) => {
      const uid = mediaUserIdRef.current || botUserIdRef.current;
      if (!uid) return;
      if (subscribingUidRef.current === uid) return;
      if (!opts?.skipOnlineCheck && engine.isUserOnline && !engine.isUserOnline(uid)) {
        log.info("Waiting for bot media user", { uid });
        return;
      }

      if (remoteMediaReadyRef.current && mediaUserIdRef.current === uid) {
        attachBotView(engine, uid, true);
        return;
      }

      subscribingUidRef.current = uid;
      try {
        // Subscribe audio+video; keep remote audio muted until video is attached.
        if (typeof engine.subscribeRemoteMediaStream === "function") {
          await engine.subscribeRemoteMediaStream(uid, 1, true, true);
        } else {
          await engine.setDefaultSubscribeAllRemoteAudioStreams?.(true);
          await engine.setDefaultSubscribeAllRemoteVideoStreams?.(true);
        }
        remoteMediaReadyRef.current = true;
        if (!videoPlaybackReadyRef.current) {
          engine.muteAllRemoteAudioPlaying?.(true);
          engine.muteRemoteAudioPlaying?.(uid, true);
        }
        attachBotView(engine, uid, true);
      } catch (err) {
        log.warn("subscribeBotMedia failed", {
          uid,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (subscribingUidRef.current === uid) subscribingUidRef.current = null;
      }
    },
    [attachBotView],
  );

  /**
   * No-op for speech: Vidu has no text inject. Kept so VoiceInterface can still
   * call it when Google emits AI text (transcript only updates there).
   */
  const speakText = useCallback((_text: string) => {
    /* intentional no-op — speech comes from persona + RTC */
  }, []);

  const interrupt = useCallback(() => {
    // No documented interrupt type; hangup mid-sentence isn't appropriate.
  }, []);

  const setLocalMicMuted = useCallback((muted: boolean) => {
    const engine = rtcRef.current;
    if (!engine?.muteLocalMic) {
      log.warn("Vidu local mic control unavailable", { muted, hasEngine: !!engine });
      return false;
    }
    try {
      engine.muteLocalMic(muted);
      log.info("Vidu local mic updated", { muted });
      return true;
    } catch (err) {
      log.warn("Vidu local mic update failed", {
        muted,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, []);

  /** Inject a finished user utterance so Vidu responds only after Submit. */
  const deliverPcmUtterance = useCallback(async (pcm: Int16Array, sampleRate = 16000) => {
    const engine = rtcRef.current;
    const durationSec = pcm.length / sampleRate;
    log.info("deliverPcmUtterance start", {
      samples: pcm.length,
      sampleRate,
      durationSec: Number(durationSec.toFixed(2)),
      hasEngine: !!engine,
      status: statusRef.current,
      hasUpdateAudioTrack: !!engine?.publishAudioStream?.updateAudioTrack,
    });
    if (!engine || !pcm.length) {
      log.warn("deliverPcmUtterance skipped", { hasEngine: !!engine, samples: pcm.length });
      return;
    }

    const ctx = new AudioContext({ sampleRate });
    try {
      const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) {
        channel[i] = pcm[i] / 32768;
      }

      const dest = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(dest);

      const track = dest.stream.getAudioTracks()[0];
      const pub = engine.publishAudioStream;
      if (pub?.updateAudioTrack && track) {
        await pub.updateAudioTrack(track, true);
        log.info("deliverPcmUtterance: swapped publish audio track");
      } else {
        log.warn("deliverPcmUtterance: no updateAudioTrack — falling back to unmute only");
      }

      // Unmute so Vidu receives this one recorded turn.
      engine.muteLocalMic?.(false);
      log.info("deliverPcmUtterance: local mic unmuted for playback");

      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start(0);
      });
      // Trailing silence so Vidu's VAD treats the utterance as finished.
      await sleep(500);
      log.info("deliverPcmUtterance: playback finished");
    } catch (err) {
      log.warn("deliverPcmUtterance failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // Stay muted until the next Submit — no live relay.
      try {
        engine.muteLocalMic?.(true);
        log.info("deliverPcmUtterance: local mic muted again");
      } catch {
        /* noop */
      }
      try {
        await ctx.close();
      } catch {
        /* noop */
      }
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    cancelledRef.current = true;
    sessionGenRef.current += 1;
    clearHeartbeat();
    if (speakingIdleTimerRef.current) {
      clearTimeout(speakingIdleTimerRef.current);
      speakingIdleTimerRef.current = null;
    }
    try {
      sendWs(5, { hangup: { hangup_reason: "user_end" } });
    } catch {
      /* noop */
    }
    try {
      wsRef.current?.close();
    } catch {
      /* noop */
    }
    wsRef.current = null;

    const engine = rtcRef.current;
    rtcRef.current = null;
    void (async () => {
      try {
        if (engine?.isInCall?.() !== false) {
          await engine?.leaveChannel?.();
        }
        await engine?.destroy?.();
      } catch {
        /* noop */
      }
    })();

    liveIdRef.current = null;
    botUserIdRef.current = null;
    mediaUserIdRef.current = null;
    attachedViewUidRef.current = null;
    boundVideoElRef.current = null;
    remoteMediaReadyRef.current = false;
    videoPlaybackReadyRef.current = false;
    videoReadyWaitersRef.current = [];
    startedRef.current = false;
    updateStatus("disconnected");
  }, [clearHeartbeat, sendWs, updateStatus]);

  /** Connect control WS; retries on NOT_READY (expected in video mode). */
  const connectControlWs = useCallback(
    async (wsPath: string, liveId: string): Promise<void> => {
      const delays = [0, 2000, 4000, 8000, 8000];
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelledRef.current) throw new Error("cancelled");
        if (delays[attempt] > 0) await sleep(delays[attempt]);

        const url = toBrowserWsUrl(wsPath);
        log.info("Opening Vidu control WS", { attempt: attempt + 1, url: url.replace(/\?.*/, "?…") });

        try {
          await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(url);
            wsRef.current = ws;
            let settled = false;

            const fail = (err: Error) => {
              if (settled) return;
              settled = true;
              try {
                ws.close();
              } catch {
                /* noop */
              }
              if (wsRef.current === ws) wsRef.current = null;
              reject(err);
            };

            const ok = () => {
              if (settled) return;
              settled = true;
              resolve();
            };

            const timer = setTimeout(() => fail(new Error("Vidu WS timeout")), 20000);

            ws.onopen = () => {
              ws.send(
                JSON.stringify({
                  type: 1,
                  live_id: liveId,
                  seq_id: seqRef.current++,
                  payload: { conn_init: { version: 1 } },
                }),
              );
            };

            ws.onmessage = (ev) => {
              try {
                const msg = JSON.parse(String(ev.data));
                if (msg.type === 2) {
                  const ack = msg.payload?.conn_init_ack;
                  if (ack?.success === true) {
                    clearTimeout(timer);
                    ok();
                    return;
                  }
                  if (ack && ack.success === false) {
                    clearTimeout(timer);
                    const code = String(ack.error_code || "");
                    fail(
                      new Error(
                        code === "NOT_READY"
                          ? "NOT_READY"
                          : ack.error_msg || code || "conn_init failed",
                      ),
                    );
                  }
                }
                if (msg.type === 6) {
                  updateStatus("disconnected");
                }
              } catch {
                /* ignore non-JSON */
              }
            };

            ws.onerror = () => fail(new Error("Vidu WebSocket error"));
            ws.onclose = (ev) => {
              if (!settled) {
                fail(new Error(`Vidu WS closed (${ev.code})`));
              }
            };
          });
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const msg = lastError.message;
          if (msg === "NOT_READY" || msg.includes("NOT_READY")) {
            log.info("Vidu NOT_READY — retrying", { attempt: attempt + 1 });
            continue;
          }
          if (msg === "LIVE_CONN_INIT_FAILED") {
            throw lastError;
          }
          log.warn("Vidu WS attempt failed", { attempt: attempt + 1, error: msg });
        }
      }

      throw lastError ?? new Error("Vidu WebSocket failed after retries");
    },
    [updateStatus],
  );

  useEffect(() => {
    if (!enabled) {
      if (startedRef.current) disconnect();
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    cancelledRef.current = false;
    const sessionGen = ++sessionGenRef.current;

    async function start() {
      updateStatus("connecting");
      setError(null);
      try {
        const res = await fetch("/api/vidu/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            aiName,
            title,
            objective,
            questions,
            language,
            aiTone,
            followUpDepth,
            participantName,
            avatarImageUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.session) {
          throw new Error(data.error || `Failed to create Vidu live (${res.status})`);
        }
        if (cancelledRef.current || sessionGen !== sessionGenRef.current) return;

        const session = data.session as {
          liveId: string;
          wsUrl: string;
          rtc: SessionRtc;
        };
        liveIdRef.current = session.liveId;
        botUserIdRef.current = botUserIdFromRtc(session.rtc.userId, session.liveId);
        mediaUserIdRef.current = botUserIdRef.current;
        log.info("Vidu session created", {
          liveId: session.liveId,
          botUserId: botUserIdRef.current,
        });

        const mod = await import("aliyun-rtc-sdk");
        // UMD attaches to default / AliRtcEngine with static createInstance/getInstance.
        const AliRtcEngine = ((mod as { default?: unknown }).default ||
          (mod as { AliRtcEngine?: unknown }).AliRtcEngine ||
          (typeof window !== "undefined"
            ? (window as unknown as { AliRtcEngine?: unknown }).AliRtcEngine
            : null)) as {
          createInstance?: () => AliRtcEngineLike;
          getInstance?: () => AliRtcEngineLike;
          AliRtcSdkChannelProfile?: { AliRtcSdkInteractiveLive?: string };
          AliRtcSdkClientRole?: { AliRtcSdkInteractive?: string };
        } | null;

        if (!AliRtcEngine?.createInstance && !AliRtcEngine?.getInstance) {
          throw new Error("Aliyun RTC SDK failed to load");
        }

        const engine: AliRtcEngineLike =
          typeof AliRtcEngine.createInstance === "function"
            ? AliRtcEngine.createInstance()
            : AliRtcEngine.getInstance!();

        rtcRef.current = engine;

        const channelProfile =
          AliRtcEngine.AliRtcSdkChannelProfile?.AliRtcSdkInteractiveLive || "interactive_live";
        const clientRole =
          AliRtcEngine.AliRtcSdkClientRole?.AliRtcSdkInteractive || "interactive";

        engine.setChannelProfile?.(channelProfile);
        await engine.setClientRole?.(clientRole);
        engine.setAudioOnlyMode?.(false);
        // Match official quickstart: disable auto-subscribe, pick live-bot / live-video-push.
        engine.setDefaultSubscribeAllRemoteAudioStreams?.(false);
        engine.setDefaultSubscribeAllRemoteVideoStreams?.(false);
        engine.enableAudioVolumeIndication?.(1000);

        engine.on?.("remoteUserOnLineNotify", (userId) => {
          if (cancelledRef.current || rtcRef.current !== engine) return;
          const uid = String(userId);
          log.info("Remote user online", { uid });
          if (isDigitalHumanUid(uid, botUserIdRef.current)) {
            if (mediaUserIdRef.current !== uid) {
              remoteMediaReadyRef.current = false;
              attachedViewUidRef.current = null;
              boundVideoElRef.current = null;
            }
            mediaUserIdRef.current = uid;
            void subscribeBotMedia(engine, { skipOnlineCheck: true });
          }
        });

        engine.on?.("remoteTrackAvailableNotify", (userId, _audioTrack, videoTrack) => {
          if (cancelledRef.current || rtcRef.current !== engine) return;
          const uid = String(userId);
          if (isDigitalHumanUid(uid, botUserIdRef.current)) {
            if (mediaUserIdRef.current !== uid) {
              remoteMediaReadyRef.current = false;
              attachedViewUidRef.current = null;
              boundVideoElRef.current = null;
            }
            mediaUserIdRef.current = uid;
            void subscribeBotMedia(engine, { skipOnlineCheck: true });
            // Video track became available — force view bind (audio may already be fine).
            if (videoTrack) attachBotView(engine, uid, true);
          }
        });

        engine.on?.("videoSubscribeStateChanged", (userId, _old, newState) => {
          if (cancelledRef.current || rtcRef.current !== engine) return;
          const uid = String(userId);
          if (!isDigitalHumanUid(uid, botUserIdRef.current)) return;
          if (newState === 3 || String(newState) === "subscribed") {
            mediaUserIdRef.current = uid;
            remoteMediaReadyRef.current = true;
            attachBotView(engine, uid, true);
          } else if (newState === 1 || String(newState) === "no_subscribe") {
            remoteMediaReadyRef.current = false;
            videoPlaybackReadyRef.current = false;
            void subscribeBotMedia(engine, { skipOnlineCheck: true });
          }
        });

        engine.on?.("remoteVideoAutoPlayFail", (userId) => {
          if (cancelledRef.current || rtcRef.current !== engine) return;
          const uid = String(userId);
          if (isDigitalHumanUid(uid, botUserIdRef.current)) {
            attachBotView(engine, uid, true);
          }
        });

        engine.on?.("audioVolume", (speakers) => {
          if (cancelledRef.current || rtcRef.current !== engine) return;
          if (!Array.isArray(speakers)) return;
          const remote = speakers.find(
            (s: { userId?: string; volume?: number }) =>
              s?.userId &&
              isDigitalHumanUid(String(s.userId), botUserIdRef.current) &&
              (s.volume ?? 0) > 5,
          );
          if (remote) {
            if (speakingIdleTimerRef.current) {
              clearTimeout(speakingIdleTimerRef.current);
              speakingIdleTimerRef.current = null;
            }
            updateStatus("speaking");
            const el = remoteVideoRef.current;
            // Heal if React remounted <video> during question / UI transitions.
            if (el && el !== boundVideoElRef.current) {
              attachBotView(engine, String(remote.userId), true);
            }
          } else if (statusRef.current === "speaking") {
            // Volume dips briefly between words — wait before leaving speaking.
            if (!speakingIdleTimerRef.current) {
              speakingIdleTimerRef.current = setTimeout(() => {
                speakingIdleTimerRef.current = null;
                if (statusRef.current === "speaking") {
                  updateStatus("ready");
                }
              }, 800);
            }
          }
        });

        await joinRtcChannel(engine, session.rtc);

        // Publish mic channel but KEEP MUTED until Submit injects a recorded turn.
        // Otherwise Vidu's agent hears continuous audio like a realtime relay.
        try {
          await engine.publishLocalAudioStream?.(true);
          await engine.startAudioCapture?.();
          engine.muteLocalMic?.(true);
        } catch (err) {
          log.warn("Local audio publish failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Video mode: try camera for multimodal; OK if already in use by PIP.
        try {
          await engine.publishLocalVideoStream?.(true);
        } catch {
          /* camera may be denied — bot → user video still works */
        }

        if (cancelledRef.current || sessionGen !== sessionGenRef.current) {
          disconnect();
          return;
        }

        await subscribeBotMedia(engine);

        // Control WS brings bot on_live (billing + greeting). Keep remote audio
        // muted until video attaches so lipsync starts with the picture.
        await connectControlWs(session.wsUrl, session.liveId);

        if (cancelledRef.current || sessionGen !== sessionGenRef.current) {
          disconnect();
          return;
        }

        await waitForVideoPlayback(15000);
        if (cancelledRef.current || sessionGen !== sessionGenRef.current) {
          disconnect();
          return;
        }

        updateStatus("ready");

        // Bot may join a moment after conn_init_ack — re-subscribe briefly.
        for (const delay of [800, 2000, 4000]) {
          void sleep(delay).then(() => {
            if (!cancelledRef.current && rtcRef.current === engine) {
              void subscribeBotMedia(engine, { skipOnlineCheck: true });
            }
          });
        }

        log.info("Vidu S1 ready", { liveId: session.liveId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error("Vidu S1 start failed", { error: message });
        if (!cancelledRef.current && sessionGen === sessionGenRef.current) {
          setError(message);
          updateStatus("error");
          startedRef.current = false;
        }
      }
    }

    void start();

    return () => {
      cancelledRef.current = true;
      disconnect();
    };
    // Intentionally mount-once when enabled flips on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    status,
    remoteVideoRef,
    speakText,
    reattachRemoteView,
    deliverPcmUtterance,
    setLocalMicMuted,
    interrupt,
    disconnect,
    error,
  };
}
