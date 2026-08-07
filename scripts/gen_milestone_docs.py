#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 features/ai-*.md (已 done) 合并为按里程碑组织的文档，输出到 docs/milestones/。"""
import re, os
from pathlib import Path

ROOT = Path(r"E:\Freelancer\AI_Projects\learning-english")
FEATURES = ROOT / "features"
BACKLOG = FEATURES / "backlog.md"
OUT = ROOT / "docs" / "milestones"
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1. 解析 backlog: 里程碑 -> [(id, title, priority, deps, status)] ----------
text = BACKLOG.read_text(encoding="utf-8")
lines = text.splitlines()

milestones = []  # list of (label, [(id,title,priority,deps,status), ...])
cur_label = None
cur_items = []

def parse_row(ln: str):
    """解析 6 列表格行：ID | Feature | 优先级 | 依赖 | 状态 | 验收标准。
    Feature 单元格内可能含字面量 '|'（如 'bigmodel | nvidia | mock'），
    此时按 '|' 切分后多出的部分应并回 Feature 单元格。"""
    s = ln.strip()
    if not s.startswith("|"):
        return None
    parts = [p.strip() for p in s.strip("|").split("|")]  # 去首尾 '|' 再切
    if len(parts) < 6:
        return None
    fid = parts[0]
    if not re.match(r"^(TEST-\d+|LOG-\d+|AI-\d+)$", fid):
        return None
    # 末尾 4 列固定：优先级 / 依赖 / 状态 / 验收标准
    criteria = parts[-1]
    status = parts[-2]
    deps = parts[-3]
    priority = parts[-4]
    feature = "|".join(parts[1:-4]).strip()  # 中间剩余（可能含内部 '|'）
    return (fid, feature, priority, deps, status)

for ln in lines:
    m = re.match(r"^##\s+(.*)$", ln)
    if m:
        if cur_label is not None:
            milestones.append((cur_label, cur_items))
        cur_label = m.group(1).strip()
        cur_items = []
        continue
    pr = parse_row(ln)
    if pr and cur_label is not None:
        cur_items.append(pr)
if cur_label is not None:
    milestones.append((cur_label, cur_items))

# 只保留含 done feature 的里程碑，且只取 done
def short_title(ftitle: str) -> str:
    # 取 **bold** 部分，否则取 " — " 前
    b = re.search(r"\*\*(.+?)\*\*", ftitle)
    if b:
        return b.group(1).strip()
    return ftitle.split(" — ")[0].strip()

done_ms = []
for label, items in milestones:
    done = [(i, t, p, d, s) for (i, t, p, d, s) in items if s == "done"]
    if done:
        done_ms.append((label, done))

# ---------- 2. 抽取 feature 文档段落 ----------
def split_sections(md: str):
    """返回 [(level, title, body), ...]"""
    secs = []
    cur = None
    for ln in md.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*)$", ln)
        if m:
            if cur:
                secs.append(cur)
            cur = (len(m.group(1)), m.group(2).strip(), [])
        else:
            if cur:
                cur[2].append(ln)
    if cur:
        secs.append(cur)
    return secs

def find_section(secs, *keywords):
    for kw in keywords:
        for (lvl, title, body) in secs:
            if kw in title:
                return title, "\n".join(body).strip()
    return None, ""

def first_h1(md: str):
    for ln in md.splitlines():
        if ln.startswith("# "):
            return ln[2:].strip()
    return ""

def extract_doc(fid: str):
    fn_map = {"TEST-101": "test-101", "TEST-102": "test-102", "LOG-101": "log-101"}
    base = fn_map.get(fid, fid.lower())
    p = FEATURES / f"{base}.md"
    if not p.exists():
        return None
    md = p.read_text(encoding="utf-8")
    secs = split_sections(md)
    h1 = first_h1(md)
    _, goal = find_section(secs, "目标")
    _, accept = find_section(secs, "验收标准", "验收")
    _, files = find_section(secs, "文件清单")
    # 测试 + 质量门 合并
    test_parts = []
    for (lvl, title, body) in secs:
        if ("测试" in title) or ("质量门" in title):
            b = "\n".join(body).strip()
            if b:
                test_parts.append(f"**{title}**\n\n{b}")
    test_block = "\n\n".join(test_parts)
    if not files:
        files = "（本文档未单列文件清单；详见 git 提交记录与该 feature 的验收标准）"
    return {
        "h1": h1 or fid,
        "goal": goal or "（无）",
        "accept": accept or "（无）",
        "files": files,
        "test": test_block or "（无）",
    }

# ---------- 3. 生成里程碑文件 ----------
def ms_filename(label: str) -> str:
    if label.startswith("置顶"):
        return "00-顶-测试与日志基建.md"
    m = re.match(r"^M(\d+)\s*—\s*(.*)$", label)
    if m:
        slug = {"AI 基建": "ai-infra", "AI 学习计划生成": "plan",
                "AI 每日口语训练": "speech", "AI 对话陪练": "chat",
                "AI 错题与进度报告": "report", "增强与拓展": "enhance",
                "成长激励与家长模式": "growth"}.get(m.group(2).strip(), m.group(2).strip())
        return f"M{m.group(1)}-{slug}.md"
    return label + ".md"

total_features = 0
for label, items in done_ms:
    total_features += len(items)
    fname = ms_filename(label)
    out = [f"# {label}\n"]
    out.append(f"> 本里程碑共 **{len(items)}** 个 feature，均已 `done`。\n")
    # 索引表
    out.append("\n| ID | Feature | 优先级 | 依赖 |")
    out.append("|---|---|---|---|")
    for (fid, ftitle, fpriority, fdeps, fstatus) in items:
        out.append(f"| {fid} | {short_title(ftitle)} | {fpriority} | {fdeps} |")
    out.append("\n---\n")
    # 详细段
    for (fid, ftitle, fpriority, fdeps, fstatus) in items:
        d = extract_doc(fid)
        out.append(f"## {fid} — {short_title(ftitle)}\n")
        out.append(f"> 优先级 **{fpriority}** · 依赖 {fdeps} · 状态 {fstatus}\n")
        if d:
            if d["goal"] and d["goal"] != "（无）":
                out.append(f"**目标**\n\n{d['goal']}\n")
            if d["accept"] and d["accept"] != "（无）":
                out.append(f"**验收标准**\n\n{d['accept']}\n")
            out.append(f"**关键文件**\n\n{d['files']}\n")
            if d["test"] and d["test"] != "（无）":
                out.append(f"**测试与质量门**\n\n{d['test']}\n")
        out.append("\n---\n")
    (OUT / fname).write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    print(f"written: {fname}  ({len(items)} features)")

print(f"\nTOTAL milestones={len(done_ms)} features={total_features}")
print("output dir:", OUT)
