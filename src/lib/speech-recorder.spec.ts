import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_DURATION_MS,
  IOS_FALLBACK_MIME_TYPE,
  PREFERRED_MIME_TYPES,
  buildRecordingResult,
  classifyRecordingError,
  clampDuration,
  isSecureContextForMedia,
  pickMimeType,
} from "./speech-recorder";

function makeBlob(size: number, type = "audio/webm"): Blob {
  // Vitest node 环境有 Blob；用一个带 size 的空 blob 即可。
  const blob = new Blob([new Uint8Array(size)], { type });
  return blob;
}

describe("classifyRecordingError (AI-302)", () => {
  it("maps NotAllowedError / SecurityError to permission-denied", () => {
    expect(classifyRecordingError({ name: "NotAllowedError" })).toBe(
      "permission-denied"
    );
    expect(classifyRecordingError({ name: "SecurityError" })).toBe(
      "permission-denied"
    );
  });

  it("maps NotFoundError to no-microphone", () => {
    expect(classifyRecordingError({ name: "NotFoundError" })).toBe(
      "no-microphone"
    );
    expect(classifyRecordingError({ name: "DevicesNotFoundError" })).toBe(
      "no-microphone"
    );
  });

  it("maps NotSupportedError to not-supported", () => {
    expect(classifyRecordingError({ name: "NotSupportedError" })).toBe(
      "not-supported"
    );
  });

  it("falls back to message text when name is missing", () => {
    expect(
      classifyRecordingError({ message: "Permission denied by user" })
    ).toBe("permission-denied");
    expect(
      classifyRecordingError({ message: "No microphone device found" })
    ).toBe("no-microphone");
  });

  it("treats numeric code 0 as permission-denied", () => {
    expect(classifyRecordingError({ code: 0 })).toBe("permission-denied");
    expect(classifyRecordingError({ code: "0" })).toBe("permission-denied");
  });

  it("returns unknown for a plain Error or non-error object", () => {
    expect(classifyRecordingError(new Error("boom"))).toBe("unknown");
    expect(classifyRecordingError("string error")).toBe("unknown");
    expect(classifyRecordingError(null)).toBe("unknown");
    expect(classifyRecordingError(undefined)).toBe("unknown");
  });
});

describe("pickMimeType (AI-302)", () => {
  it("prefers webm/opus when supported", () => {
    const detector = (t: string) => t.startsWith("audio/webm");
    const sel = pickMimeType(detector);
    expect(sel.mimeType).toBe(PREFERRED_MIME_TYPES[0]);
    expect(sel.isIosFallback).toBe(false);
  });

  it("falls back to audio/mp4 (iOS Safari) when webm unsupported", () => {
    const detector = (t: string) => t === IOS_FALLBACK_MIME_TYPE;
    const sel = pickMimeType(detector);
    expect(sel.mimeType).toBe(IOS_FALLBACK_MIME_TYPE);
    expect(sel.isIosFallback).toBe(true);
  });

  it("returns empty mimeType when nothing is supported (browser default)", () => {
    const sel = pickMimeType(() => false);
    expect(sel.mimeType).toBe("");
    expect(sel.isIosFallback).toBe(false);
  });
});

describe("clampDuration (AI-302)", () => {
  it("clamps negative / NaN to 0", () => {
    expect(clampDuration(-5, DEFAULT_MAX_DURATION_MS)).toBe(0);
    expect(clampDuration(NaN, DEFAULT_MAX_DURATION_MS)).toBe(0);
    expect(clampDuration(Infinity, DEFAULT_MAX_DURATION_MS)).toBe(0);
  });

  it("clamps values over the cap down to the cap", () => {
    expect(clampDuration(15_000, DEFAULT_MAX_DURATION_MS)).toBe(
      DEFAULT_MAX_DURATION_MS
    );
    expect(clampDuration(DEFAULT_MAX_DURATION_MS, DEFAULT_MAX_DURATION_MS)).toBe(
      DEFAULT_MAX_DURATION_MS
    );
  });

  it("keeps in-range values unchanged", () => {
    expect(clampDuration(3_200, DEFAULT_MAX_DURATION_MS)).toBe(3_200);
  });
});

describe("isSecureContextForMedia (AI-302)", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it("returns false when there is no window (node/SSR)", () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(isSecureContextForMedia()).toBe(false);
  });

  it("reflects window.isSecureContext", () => {
    (globalThis as { window?: unknown }).window = { isSecureContext: true };
    expect(isSecureContextForMedia()).toBe(true);
    (globalThis as { window?: unknown }).window = { isSecureContext: false };
    expect(isSecureContextForMedia()).toBe(false);
  });
});

describe("buildRecordingResult (AI-302)", () => {
  it("assembles url/size/durationMs via injected createObjectURL", () => {
    const blob = makeBlob(1234, "audio/webm");
    const result = buildRecordingResult({
      blob,
      mimeType: "audio/webm;codecs=opus",
      durationMs: 4_500,
      createObjectURL: () => "blob:recording-1",
    });
    expect(result.url).toBe("blob:recording-1");
    expect(result.size).toBe(1234);
    expect(result.mimeType).toBe("audio/webm;codecs=opus");
    expect(result.durationMs).toBe(4_500);
  });

  it("does not throw and yields empty url when createObjectURL fails", () => {
    const blob = makeBlob(10);
    const result = buildRecordingResult({
      blob,
      mimeType: "",
      durationMs: 2_000,
      createObjectURL: () => {
        throw new Error("no url");
      },
    });
    expect(result.url).toBe("");
    expect(result.size).toBe(10);
  });

  it("clamps negative durationMs to 0", () => {
    const result = buildRecordingResult({
      blob: makeBlob(5),
      mimeType: "audio/mp4",
      durationMs: -100,
      createObjectURL: () => "blob:x",
    });
    expect(result.durationMs).toBe(0);
  });
});
