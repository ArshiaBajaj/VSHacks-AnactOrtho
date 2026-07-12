import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "streaming" | "error" | "denied";

export type VideoSource = "camera" | "file";

export type CameraOptions = {
  facingMode?: "environment" | "user";
  width?: number;
  height?: number;
};

/** Flip to true when you want Live / Calibrate to request the device camera again. */
const CAMERA_ENABLED = false;

export function useCamera(options: CameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<VideoSource | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">(
    options.facingMode ?? "environment",
  );

  const bindFileToVideo = useCallback(async (url: string) => {
    const el = videoRef.current;
    if (!el) throw new Error("Video element not ready.");
    el.srcObject = null;
    el.src = url;
    el.loop = true;
    el.muted = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    await el.play();
  }, []);

  const clearFile = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    fileRef.current = null;
    if (videoRef.current) {
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    setFileName(null);
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearFile();
    setSource(null);
    setStatus("idle");
    setError(null);
  }, [clearFile]);

  const loadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|avi|mkv)$/i.test(file.name)) {
        setStatus("error");
        setError("Pick a video file (mp4, mov, webm, avi, mkv).");
        return;
      }
      setStatus("requesting");
      setError(null);
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        fileRef.current = file;
        await bindFileToVideo(url);
        setSource("file");
        setFileName(file.name);
        setStatus("streaming");
      } catch (e) {
        const err = e as Error;
        setStatus("error");
        setError(err.message || "Unable to play that video.");
        setSource(null);
        setFileName(null);
      }
    },
    [bindFileToVideo],
  );

  /** Re-bind the loaded clip after React remounts the <video> (setup → session). */
  const reattach = useCallback(async () => {
    if (!objectUrlRef.current || !fileRef.current) return;
    setStatus("requesting");
    try {
      await bindFileToVideo(objectUrlRef.current);
      setSource("file");
      setFileName(fileRef.current.name);
      setStatus("streaming");
      setError(null);
    } catch (e) {
      const err = e as Error;
      setStatus("error");
      setError(err.message || "Could not reattach video.");
    }
  }, [bindFileToVideo]);

  const start = useCallback(
    async (nextFacing?: "environment" | "user") => {
      if (!CAMERA_ENABLED) {
        setStatus("idle");
        setError("Camera is disabled — upload a courtside clip instead.");
        return;
      }
      const useFacing = nextFacing ?? facing;
      setStatus("requesting");
      setError(null);
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        clearFile();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: useFacing },
            width: { ideal: options.width ?? 1280 },
            height: { ideal: options.height ?? 720 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.removeAttribute("src");
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.muted = true;
          await videoRef.current.play().catch(() => undefined);
        }
        setFacing(useFacing);
        setSource("camera");
        setStatus("streaming");
      } catch (e) {
        const err = e as DOMException;
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          setStatus("denied");
        } else {
          setStatus("error");
        }
        setError(err.message || "Unable to access camera.");
        setSource(null);
      }
    },
    [facing, options.width, options.height, clearFile],
  );

  const flip = useCallback(async () => {
    if (source === "file") return;
    await start(facing === "environment" ? "user" : "environment");
  }, [facing, start, source]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  return {
    videoRef,
    status,
    error,
    facing,
    source,
    fileName,
    start,
    stop,
    flip,
    loadFile,
    reattach,
  };
}
