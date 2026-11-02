"use client";

import { useEffect, useRef, useState } from "react";
import { FX } from "./fx/fxConfig";

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

    // Test mode: ?fakecam=/path/to/person.jpg (or .mp4) feeds an image/video
    // instead of the webcam, gently swaying, so tracking can be checked
    // without a camera (e.g. in a browser that blocks it).
    const qs = new URLSearchParams(window.location.search);
    const fake = qs.get("fakecam");
    const sway = Number(qs.get("sway") ?? 260);
    const fscale = Number(qs.get("size") ?? 0.95); // figure height / frame
    const fakeStream = async (): Promise<MediaStream> => {
      const cv = document.createElement("canvas");
      cv.width = 1280;
      cv.height = 720;
      const cx = cv.getContext("2d")!;
      let media: HTMLImageElement | HTMLVideoElement;
      if (/\.(mp4|webm|mov)$/i.test(fake!)) {
        const v = document.createElement("video");
        v.src = fake!;
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        await v.play();
        media = v;
      } else {
        const img = new Image();
        img.src = fake!;
        await img.decode();
        media = img;
      }
      const t0 = performance.now();
      const draw = () => {
        if (cancelled) return;
        const t = (performance.now() - t0) / 1000;
        const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
        const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
        const s = (cv.height * fscale) / mh;
        const w = mw * s;
        const h = mh * s;
        cx.fillStyle = "#777";
        cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(media, cv.width / 2 - w / 2 + Math.sin(t * 0.7) * sway, cv.height - h, w, h);
        requestAnimationFrame(draw);
      };
      draw();
      return cv.captureStream(30);
    };

    (async () => {
      try {
        const constraints = (deviceId?: string): MediaStreamConstraints => ({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
            // Higher resolution → people further away still have enough
            // pixels for a clean silhouette and steady wrists.
            width: { ideal: FX.vision.cameraWidth },
            height: { ideal: FX.vision.cameraHeight },
            frameRate: { ideal: 30 },
          },
        });
        stream = fake
          ? await fakeStream()
          : await navigator.mediaDevices.getUserMedia(constraints());
        // ?camera=<part of the camera's name> picks a specific camera, e.g. a
        // USB webcam on a Surface Hub that also has a built-in one. Names are
        // only readable after permission, hence the second request.
        const want = qs.get("camera")?.toLowerCase();
        if (!fake && want) {
          const cams = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === "videoinput",
          );
          console.info("[webcam] cameras:", cams.map((c) => c.label).join(" | "));
          const pick = cams.find((c) => c.label.toLowerCase().includes(want));
          const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
          if (pick && pick.deviceId !== current) {
            stream.getTracks().forEach((t) => t.stop());
            stream = await navigator.mediaDevices.getUserMedia(constraints(pick.deviceId));
          }
        }
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
