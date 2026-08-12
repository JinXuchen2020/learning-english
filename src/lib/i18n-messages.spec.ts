import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const messagesDir = path.resolve(__dirname, "..", "messages");
const zh = JSON.parse(fs.readFileSync(path.join(messagesDir, "zh.json"), "utf-8"));
const en = JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf-8"));

function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...collectKeys(v as Record<string, unknown>, p));
    } else {
      out.push(p);
    }
  }
  return out;
}

describe("i18n message catalogs", () => {
  it("zh and en expose identical key structure", () => {
    const zhKeys = collectKeys(zh).sort();
    const enKeys = collectKeys(en).sort();
    expect(enKeys, `missing/extra keys:\n${enKeys.filter((k) => !zhKeys.includes(k)).map((k) => "+en " + k).concat(zhKeys.filter((k) => !enKeys.includes(k)).map((k) => "-zh " + k)).join("\n")}`).toEqual(zhKeys);
  });
});

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "messages", "__i18n_tmp", "e2e", ".next", ".next"].includes(entry.name)) continue;
      walk(full, acc);
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("i18n key usage resolves to a declared namespace", () => {
  const srcDir = path.resolve(__dirname, "..");
  const files = walk(srcDir);
  const missing: string[] = [];

  for (const file of files) {
    const src = fs.readFileSync(file, "utf-8");
    const nsMatches = Array.from(src.matchAll(/useTranslations\(\s*["']([^"']+)["']\s*\)/g));
    if (nsMatches.length === 0) continue;
    const namespaces = nsMatches.map((m) => m[1]);
    const tMatches = Array.from(src.matchAll(/\bt\(\s*["']([^"']+)["']/g));
    for (const m of tMatches) {
      const key = m[1];
      const found = namespaces.some(
        (ns) => zh[ns] && Object.prototype.hasOwnProperty.call(zh[ns], key),
      );
      if (!found) {
        missing.push(`${path.relative(srcDir, file)} :: t("${key}") in [${namespaces.join(", ")}]`);
      }
    }
  }

  it(`every literal t() key exists in its declared namespace (scanned ${files.length} files, ${missing.length} issues)`, () => {
    expect(missing, missing.join("\n")).toEqual([]);
  });
});
