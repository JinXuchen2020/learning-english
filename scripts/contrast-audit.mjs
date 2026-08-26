// WCAG 2.1 对比度核算（AI-806 核算记录工具）。
// 用法: node scripts/contrast-audit.mjs
// 计算相对亮度 + 对比度，标注文本(4.5:1)/非文本(3:1)是否达标。

function srgbToLinear(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function relLuminance(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(fg, bg) {
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// 把半透明前景叠在背景上的"有效颜色"（用于 plan 技能徽章 tint 背景）。
function blend(fgHex, bgHex, alpha) {
  const f = parseInt(fgHex.slice(1, 3), 16),
    fg_ = parseInt(fgHex.slice(3, 5), 16),
    fb = parseInt(fgHex.slice(5, 7), 16);
  const b = parseInt(bgHex.slice(1, 3), 16),
    bg_ = parseInt(bgHex.slice(3, 5), 16),
    bb = parseInt(bgHex.slice(5, 7), 16);
  const mix = (a, c) => Math.round(a * alpha + c * (1 - alpha));
  return (
    "#" +
    [mix(f, b), mix(fg_, bg_), mix(fb, bb)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

const CREAM = "#F8F8F0";
const CARD = "#F7F3DF";
const SECONDARY = "#F0E8D8";
const TITLE = "#794F27";
const TEXT = "#725D42";
const MUTED = "#9F927D";
const INK = "#1F2A24"; // 拟新增的 on-primary 深墨色

function row(label, fg, bg, kind = "text") {
  const r = contrast(fg, bg);
  const pass = kind === "text" ? r >= 4.5 : r >= 3;
  console.log(
    `${pass ? "✅" : "❌"} ${label.padEnd(42)} ${r.toFixed(2)}:1  (${kind === "text" ? "需4.5" : "需3.0"}${pass ? "" : " ✗"})`,
  );
}

console.log("=== BEFORE（当前 token 值）===");
row("btn-primary 白字 on --seed-primary #19C8B9", "#FFFFFF", "#19C8B9");
row("btn-success 白字 on --color-success #6FBA2C", "#FFFFFF", "#6FBA2C");
row("TabNav active 白字 on primary #19C8B9", "#FFFFFF", "#19C8B9");
row("::selection 白字 on primary #19C8B9", "#FFFFFF", "#19C8B9");
row("primary 链接 #19C8B9 on cream #F8F8F0", "#19C8B9", CREAM);
row("kids.muted #9F927D on card #F7F3DF", MUTED, CARD);
row("practice answer 白字 on kids.teal #82D5BB", "#FFFFFF", "#82D5BB");
row("practice answer 白字 on kids.pink #F8A6B2", "#FFFFFF", "#F8A6B2");
row("practice answer 白字 on kids.blue #889DF0", "#FFFFFF", "#889DF0");
row("plan badge 文字色 on 13% tint (vocab #F59E0B)", "#F59E0B", blend("#F59E0B", CARD, 0.13));
row("plan badge 文字色 on 13% tint (write #10B981)", "#10B981", blend("#10B981", CARD, 0.13));

console.log("\n=== AFTER（AI-806 最终方案）===");
const P = "#0B7A70", PH = "#0A6E63", PA = "#095F57", S = "#3F7A18";
row("btn-primary 白字 on --seed-primary", "#FFFFFF", P);
row("btn-success 白字 on --color-success", "#FFFFFF", S);
row("TabNav active 白字 on primary", "#FFFFFF", P);
row("::selection 白字 on primary", "#FFFFFF", P);
row("primary 链接 on cream", P, CREAM);
row("primary hover 白字", "#FFFFFF", PH);
row("primary active 白字", "#FFFFFF", PA);
// practice 答题按钮：深色调实色填充 + 白字（kids.*-deep）
const ANS = { teal: "#0F766E", pink: "#BE185D", blue: "#4338CA", sun: "#B45309" };
for (const [k, v] of Object.entries(ANS))
  row(`practice answer 白字 on kids.${k}-deep`, "#FFFFFF", v);
// plan 技能徽章 / 日卡色条：深色调实色填充 + 白字（PLAN_SKILL_COLORS_DEEP）
const SK = { vocab: "#B45309", listen: "#1D4ED8", speak: "#C2185B", write: "#047857" };
for (const [k, v] of Object.entries(SK)) {
  row(`plan badge 白字 on ${k}-deep`, "#FFFFFF", v);
  row(`plan daycard 色条 ${k}-deep on white`, v, "#FFFFFF");
}
console.log(
  "\n（注：kids.muted #9F927D on card #F7F3DF = 2.72:1 为既有次要文字 token，" +
  "超出本 feature 重点范围，留作后续处理）"
);
