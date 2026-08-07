import { describe, it, expect, vi } from "vitest";
import { normalizeTtsUrl, playTts, type AudioLike } from "./audio";

/** 构造一个可注入的 stub Audio 元素（play 用 vitest mock 以便断言）。 */
function stubAudio() {
  const el = {
    src: "",
    autoplay: false,
    play: vi.fn().mockResolvedValue(undefined),
  };
  return el as AudioLike & { play: ReturnType<typeof vi.fn> };
}

describe("normalizeTtsUrl", () => {
  it("passes through data: URIs", () => {
    expect(normalizeTtsUrl("data:audio/mp3;base64,AAA")).toBe(
      "data:audio/mp3;base64,AAA",
    );
  });

  it("passes through http(s) URLs", () => {
    expect(normalizeTtsUrl("https://cdn/x.mp3")).toBe("https://cdn/x.mp3");
    expect(normalizeTtsUrl("http://cdn/x.mp3")).toBe("http://cdn/x.mp3");
  });

  it("returns null for empty / null / non-http(s) values", () => {
    expect(normalizeTtsUrl(null)).toBeNull();
    expect(normalizeTtsUrl(undefined)).toBeNull();
    expect(normalizeTtsUrl("")).toBeNull();
    expect(normalizeTtsUrl("blob:xyz")).toBeNull();
    expect(normalizeTtsUrl("/audio/x.mp3")).toBeNull();
  });
});

describe("playTts", () => {
  it("returns false when the url is not playable", () => {
    expect(playTts(null, stubAudio)).toBe(false);
  });

  it("creates an Audio with the url, sets autoplay, and calls play", () => {
    const el = stubAudio();
    const factory = vi.fn().mockReturnValue(el);
    const res = playTts("https://cdn/x.mp3", factory);
    expect(res).toBe(true);
    expect(factory).toHaveBeenCalledWith("https://cdn/x.mp3");
    expect(el.src).toBe("https://cdn/x.mp3");
    expect(el.autoplay).toBe(true);
    expect(el.play).toHaveBeenCalledTimes(1);
  });

  it("works for data: URIs too", () => {
    const el = stubAudio();
    const res = playTts("data:audio/mp3;base64,AAA", () => el);
    expect(res).toBe(true);
    expect(el.src).toBe("data:audio/mp3;base64,AAA");
  });

  it("swallows an autoplay rejection (policy-blocked) and still reports started", () => {
    const el = {
      src: "",
      autoplay: false,
      play: vi.fn().mockRejectedValue(new Error("blocked")),
    } as unknown as AudioLike;
    const res = playTts("https://cdn/x.mp3", () => el);
    expect(res).toBe(true);
  });

  it("returns false if the audio factory throws", () => {
    expect(
      playTts("https://cdn/x.mp3", () => {
        throw new Error("no Audio");
      }),
    ).toBe(false);
  });
});
