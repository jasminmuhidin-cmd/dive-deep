"use client";

import { useEffect, useRef, useState } from "react";

export type WebcamStatus = "requesting" | "ready" | "denied" | "unavailable";

export interface WebcamFeed {
  video: HTMLVideoElement | null;
  status: WebcamStatus;
  width: number;
  height: number;
}

/**
 * Phase 2 — capture webcam via getUserMedia into a hidden <video>.
 * The video element is later wrapped as a THREE.VideoTexture in the water shader.
 */
export function useWebcamFeed(): WebcamFeed {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<WebcamStatus>("requesting");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;
    const el = document.createElement("video");
    el.setAttribute("playsinline", "true");
    el.setAttribute("muted", "true");
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    el.style.position = "fixed";
    el.style.left = "0";
    el.style.top = "0";
    el.style.width = "160px";
    el.style.height = "120px";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    el.style.zIndex = "-1";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    videoRef.current = el;

    const onMeta = () => {
      if (cancelled) return;
      setSize({
        width: el.videoWidth || 640,
        height: el.videoHeight || 480,
      });
    };
    el.addEventListener("loadedmetadata", onMeta);

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        el.srcObject = stream;
        await el.play();
        onMeta();
        // Wait until we actually have a decoded frame
        if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise<void>((resolve) => {
            const done = () => {
              el.removeEventListener("loadeddata", done);
              resolve();
            };
            el.addEventListener("loadeddata", done);
          });
        }
        if (cancelled) return;
        onMeta();
        setVideo(el);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("denied");
      }
    })();

    return () => {
      cancelled = true;
      el.removeEventListener("loadedmetadata", onMeta);
      stream?.getTracks().forEach((t) => t.stop());
      el.srcObject = null;
      el.remove();
      videoRef.current = null;
      setVideo(null);
    };
  }, []);

  return { video, status, width: size.width, height: size.height };
}
