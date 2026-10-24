"use client";

import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

type ScannerStatus = "idle" | "starting" | "scanning" | "error";

type BarcodeScannerProps = {
  onDetected: (code: string) => void;
};

export function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastCodeRef = useRef("");
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const stopScanner = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setStatus("idle");
  };

  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  const startScanner = async () => {
    if (!videoRef.current || status === "starting" || status === "scanning") {
      return;
    }

    setStatus("starting");
    setErrorMessage("");
    lastCodeRef.current = "";

    try {
      if (!window.isSecureContext) {
        throw new Error(
          "カメラはHTTPSまたはlocalhostでのみ利用できます。",
        );
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("このブラウザはカメラ読み取りに対応していません。");
      }

      const reader = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 800,
      });

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result, _error, controls) => {
          if (!result) return;

          const code = result.getText();
          if (!code || code === lastCodeRef.current) return;

          lastCodeRef.current = code;
          controls.stop();
          controlsRef.current = null;
          setStatus("idle");
          onDetected(code);
        },
      );

      controlsRef.current = controls;
      setStatus("scanning");
    } catch (error) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setStatus("error");

      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          setErrorMessage(
            "カメラの利用が許可されていません。ブラウザの設定から許可してください。",
          );
        } else if (error.name === "NotFoundError") {
          setErrorMessage("利用できるカメラが見つかりませんでした。");
        } else if (error.name === "NotReadableError") {
          setErrorMessage("カメラを使用できません。他のアプリで使用していないか確認してください。");
        } else {
          setErrorMessage(error.message || "カメラを開始できませんでした。");
        }
      } else {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "カメラを開始できませんでした。",
        );
      }
    }
  };

  const isActive = status === "starting" || status === "scanning";

  return (
    <div className="min-w-0 overflow-hidden rounded-3xl bg-slate-950 shadow-lg">
      <div className={isActive ? "relative aspect-[4/3] w-full bg-slate-950" : "hidden"}>
        <video
          ref={videoRef}
          muted
          playsInline
          className="size-full object-cover"
        />
        {isActive && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative h-32 w-[82%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(2,6,23,0.38)]">
                <span className="scan-line absolute left-3 right-3 top-1/2 h-0.5 bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)]" />
              </div>
              <p className="absolute bottom-5 rounded-full bg-slate-950/75 px-4 py-2 text-xs font-bold text-white backdrop-blur">
                {status === "starting"
                  ? "カメラを起動中…"
                  : "バーコードを枠内に合わせてください"}
              </p>
            </div>
        )}
      </div>

      {isActive ? (
        <div className="p-4">
          <button
            type="button"
            onClick={stopScanner}
            className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 font-bold text-white"
          >
            読み取りを停止
          </button>
        </div>
      ) : (
        <div className="p-4 text-white">
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 sm:gap-4 sm:p-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-400 text-slate-950 sm:size-14">
              <svg viewBox="0 0 32 32" fill="none" className="size-7 sm:size-8" aria-hidden="true">
                <path d="M5 10V6a1 1 0 0 1 1-1h4M22 5h4a1 1 0 0 1 1 1v4M27 22v4a1 1 0 0 1-1 1h-4M10 27H6a1 1 0 0 1-1-1v-4M10 11v10M14 11v10M18 11v10M22 11v10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black sm:text-base">バーコードをカメラで読み取る</p>
              <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">読み取り後、商品を自動でかごへ追加します</p>
            </div>
          </div>
          {status === "error" && (
            <p className="mt-3 rounded-xl bg-red-950/60 px-3 py-2 text-sm text-red-100">
              {errorMessage}
            </p>
          )}
          <button
            type="button"
            onClick={startScanner}
            className="mt-3 w-full rounded-2xl bg-emerald-400 px-4 py-3.5 font-black text-slate-950 transition hover:bg-emerald-300 active:scale-[0.99]"
          >
            カメラで読み取る
          </button>
        </div>
      )}
    </div>
  );
}
