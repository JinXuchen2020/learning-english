import { describe, it, expect } from "vitest";
import {
  mapBackendMascotExpr,
  isSpeechSynthesisSupported,
  speakText,
  type SpeechSynthesisLike,
  type SpeechSynthesisVoiceLike,
} from "./speech";

describe("mapBackendMascotExpr", () => {
  it("maps backend 'cheer' to frontend 'celebrating'", () => {
    expect(mapBackendMascotExpr("cheer")).toBe("celebrating");
  });

  it("maps backend 'encourage' to frontend 'encouraging'", () => {
    expect(mapBackendMascotExpr("encourage")).toBe("encouraging");
  });

  it("passes through 'happy' and 'thinking'", () => {
    expect(mapBackendMascotExpr("happy")).toBe("happy");
    expect(mapBackendMascotExpr("thinking")).toBe("thinking");
  });

  it("falls back to 'happy' for unknown expressions", () => {
    expect(mapBackendMascotExpr("foo")).toBe("happy");
  });

  it("falls back to 'happy' for undefined / null / empty", () => {
    expect(mapBackendMascotExpr(undefined)).toBe("happy");
    expect(mapBackendMascotExpr(null)).toBe("happy");
    expect(mapBackendMascotExpr("")).toBe("happy");
  });
});

describe("isSpeechSynthesisSupported", () => {
  it("returns true when an injected synth is provided", () => {
    const synth: SpeechSynthesisLike = {
      speak: () => {},
      cancel: () => {},
      getVoices: () => [],
    };
    expect(isSpeechSynthesisSupported(synth)).toBe(true);
  });

  it("returns false when no synth and no window", () => {
    expect(isSpeechSynthesisSupported(null)).toBe(false);
    expect(isSpeechSynthesisSupported(undefined)).toBe(false);
  });
});

describe("speakText", () => {
  function makeSynth(voices: SpeechSynthesisVoiceLike[] = []) {
    const captured: { text?: string; lang?: string; voice?: unknown } = {};
    let called = false;
    const synth: SpeechSynthesisLike = {
      speak: (u: SpeechSynthesisUtterance) => {
        called = true;
        captured.text = (u as unknown as { text: string }).text;
        captured.lang = (u as unknown as { lang?: string }).lang;
        captured.voice = (u as unknown as { voice?: unknown }).voice;
      },
      cancel: () => {},
      getVoices: () => voices as unknown as SpeechSynthesisVoice[],
    };
    return { synth, getCalled: () => called, captured };
  }

  it("calls synth.speak with the text and returns true", () => {
    const { synth, getCalled, captured } = makeSynth();
    const ok = speakText("hello", { synth });
    expect(ok).toBe(true);
    expect(getCalled()).toBe(true);
    expect(captured.text).toBe("hello");
  });

  it("sets utterance.lang from opts.lang", () => {
    const { synth, captured } = makeSynth();
    speakText("hello", { synth, lang: "en-US" });
    expect(captured.lang).toBe("en-US");
  });

  it("selects a matching voice by lang", () => {
    const enVoice = { lang: "en-US", name: "A", default: false };
    const zhVoice = { lang: "zh-CN", name: "B", default: false };
    const { synth, captured } = makeSynth([enVoice, zhVoice]);
    speakText("hello", { synth, lang: "en-US" });
    expect(captured.voice).toBe(enVoice);
  });

  it("still speaks when no voice matches the lang", () => {
    const frVoice = { lang: "fr-FR", name: "C", default: false };
    const { synth, getCalled, captured } = makeSynth([frVoice]);
    const ok = speakText("hello", { synth, lang: "en-US" });
    expect(ok).toBe(true);
    expect(getCalled()).toBe(true);
    expect(captured.voice).toBeUndefined();
  });

  it("returns false (safe) when no synth is available", () => {
    const ok = speakText("hello");
    expect(ok).toBe(false);
  });

  it("returns false when synth.speak throws (never throws)", () => {
    const synth: SpeechSynthesisLike = {
      speak: () => {
        throw new Error("boom");
      },
      cancel: () => {},
      getVoices: () => [],
    };
    const ok = speakText("hello", { synth });
    expect(ok).toBe(false);
  });
});
