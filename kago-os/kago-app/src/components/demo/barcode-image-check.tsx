"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { useEffect, useState } from "react";

type BarcodeImageCheckProps = {
  codes: string[];
};

export function BarcodeImageCheck({ codes }: BarcodeImageCheckProps) {
  const [passed, setPassed] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      const reader = new BrowserMultiFormatReader();
      let validCount = 0;

      for (const code of codes) {
        try {
          const result = await reader.decodeFromImageUrl(
            `/demo/barcodes/${code}.svg`,
          );
          if (result.getText() === code) validCount += 1;
        } catch {
          // 失敗件数は最終結果との差分として表示する。
        }

        if (!cancelled) setPassed(validCount);
      }

      if (!cancelled) setFinished(true);
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [codes]);

  return (
    <div
      className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold print:hidden ${
        finished && passed === codes.length
          ? "bg-emerald-400 text-emerald-950"
          : "bg-white/10 text-white"
      }`}
      aria-live="polite"
    >
      {finished
        ? `画像セルフチェック：${passed} / ${codes.length}件 読み取り成功`
        : `画像を検証中：${passed} / ${codes.length}件`}
    </div>
  );
}
