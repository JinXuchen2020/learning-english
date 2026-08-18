import { describe, expect, it } from "vitest";
import {
  applySpeechResult,
  getSpeechRecognitionCtor,
  isSpeechDictationSupported,
  type SpeechRecognitionWindowLike,
} from "./speech-dictation";

// 构造一个 SpeechRecognitionEvent 的轻量替身（结构与全局声明一致，足以驱动纯逻辑）。
// 仅用于单测：把 entries 展开为带数字索引的对象，并附 length，applySpeechResult
// 只读 results[i] / result[0] / result.isFinal，不依赖 item()。
function makeEvent(
  entries: Array<{ transcript: string; isFinal: boolean }>,
  resultIndex = 0,
): SpeechRecognitionEvent {
  const indexed: Record<
    number,
    { isFinal: boolean; length: number; 0: { transcript: string; confidence: number } }
  > = {};
  entries.forEach((e, i) => {
    indexed[i] = {
      isFinal: e.isFinal,
      length: 1,
      "0": { transcript: e.transcript, confidence: 1 },
    };
  });
  return {
    resultIndex,
    results: { ...indexed, length: entries.length },
  } as unknown as SpeechRecognitionEvent;
}

describe("getSpeechRecognitionCtor", () => {
  it("returns the ctor when SpeechRecognition is present", () => {
    const fake = { SpeechRecognition: function () {} };
    expect(getSpeechRecognitionCtor(fake as SpeechRecognitionWindowLike)).toBe(
      fake.SpeechRecognition,
    );
  });

  it("falls back to webkitSpeechRecognition", () => {
    const fake = { webkitSpeechRecognition: function () {} };
    expect(getSpeechRecognitionCtor(fake as SpeechRecognitionWindowLike)).toBe(
      fake.webkitSpeechRecognition,
    );
  });

  it("returns null when neither ctor exists", () => {
    expect(
      getSpeechRecognitionCtor({} as SpeechRecognitionWindowLike),
    ).toBeNull();
    expect(getSpeechRecognitionCtor(null)).toBeNull();
  });
});

describe("isSpeechDictationSupported", () => {
  it("is false with no ctor (Firefox-style unsupported)", () => {
    expect(
      isSpeechDictationSupported({ isSecureContext: true } as SpeechRecognitionWindowLike),
    ).toBe(false);
  });

  it("is false on an insecure context even with a ctor", () => {
    expect(
      isSpeechDictationSupported({
        SpeechRecognition: function () {},
        isSecureContext: false,
      } as SpeechRecognitionWindowLike),
    ).toBe(false);
  });

  it("is true only when ctor + secure context both hold (HTTPS / localhost)", () => {
    expect(
      isSpeechDictationSupported({
        SpeechRecognition: function () {},
        isSecureContext: true,
      } as SpeechRecognitionWindowLike),
    ).toBe(true);
  });

  it("is false with no window (SSR / node)", () => {
    expect(isSpeechDictationSupported(null)).toBe(false);
  });
});

describe("applySpeechResult", () => {
  it("appends a single final transcript and reports the delta", () => {
    const r = applySpeechResult({ final: "", interim: "" }, makeEvent([
      { transcript: "Hello", isFinal: true },
    ]), 0);
    expect(r.final).toBe("Hello");
    expect(r.interim).toBe("");
    expect(r.finalDelta).toBe("Hello");
  });

  it("keeps interim separate from final and emits no delta", () => {
    const r = applySpeechResult({ final: "", interim: "" }, makeEvent([
      { transcript: "Hel", isFinal: false },
    ]), 0);
    expect(r.final).toBe("");
    expect(r.interim).toBe("Hel");
    expect(r.finalDelta).toBe("");
  });

  it("accumulates multiple new finals (from resultIndex) with a space and concatenates the delta", () => {
    // index 0 已在前次事件确认为 "Hello"（在 prev.final 中）；
    // 本次事件 resultIndex=1，新增 index1/index2 两个 final。
    const prev = { final: "Hello", interim: "" };
    const r = applySpeechResult(prev, makeEvent([
      { transcript: "Hello", isFinal: true },
      { transcript: "Foxy", isFinal: true },
      { transcript: "today", isFinal: true },
    ]), 1);
    expect(r.final).toBe("Hello Foxy today");
    expect(r.finalDelta).toBe("Foxy today");
  });

  it("only processes results from resultIndex onward (cumulative list)", () => {
    // 模拟第二次事件：resultIndex=1，索引 0 已是 final（已在 prev.final），
    // 本次只新增索引 1 的 final。
    const prev = { final: "Hello", interim: "" };
    const r = applySpeechResult(prev, makeEvent([
      { transcript: "Hello", isFinal: true },
      { transcript: "there", isFinal: true },
    ]), 1);
    expect(r.final).toBe("Hello there");
    expect(r.finalDelta).toBe("there");
  });

  it("mixes a finalized head with an interim tail (typing preview)", () => {
    const prev = { final: "", interim: "" };
    const r = applySpeechResult(prev, makeEvent([
      { transcript: "Good", isFinal: true },
      { transcript: "mor", isFinal: false },
    ]), 0);
    expect(r.final).toBe("Good");
    expect(r.interim).toBe("mor");
    expect(r.finalDelta).toBe("Good");
  });

  it("replaces the interim on a later event (not additive)", () => {
    const prev = { final: "Good", interim: "mor" };
    const r = applySpeechResult(prev, makeEvent([
      { transcript: "Good", isFinal: true },
      { transcript: "morn", isFinal: false },
    ]), 1);
    expect(r.final).toBe("Good");
    expect(r.interim).toBe("morn");
    expect(r.finalDelta).toBe("");
  });

  it("ignores empty / whitespace-only transcripts", () => {
    const r = applySpeechResult({ final: "", interim: "" }, makeEvent([
      { transcript: "   ", isFinal: true },
      { transcript: "", isFinal: false },
    ]), 0);
    expect(r.final).toBe("");
    expect(r.interim).toBe("");
    expect(r.finalDelta).toBe("");
  });

  it("returns empty state when results are missing", () => {
    const r = applySpeechResult(
      { final: "x", interim: "y" },
      { resultIndex: 0, results: undefined } as unknown as SpeechRecognitionEvent,
      0,
    );
    expect(r.final).toBe("x");
    expect(r.interim).toBe("");
    expect(r.finalDelta).toBe("");
  });
});
