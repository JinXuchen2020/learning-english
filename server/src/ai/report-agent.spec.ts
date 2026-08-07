import {
  REPORT_AGENT_SYSTEM_PROMPT,
  parseReportAgentOutput,
  DEFAULT_SUMMARY,
  DEFAULT_SUGGESTION,
} from './report-agent';

describe('REPORT_AGENT_SYSTEM_PROMPT (AI-503 精炼)', () => {
  it('包含安全红线与不编造约束（绝不批评 / 弱项来自候选 / mascotExpr 决策）', () => {
    expect(REPORT_AGENT_SYSTEM_PROMPT).toContain('绝不批评');
    expect(REPORT_AGENT_SYSTEM_PROMPT).toContain('weakWordCandidates');
    expect(REPORT_AGENT_SYSTEM_PROMPT).toMatch(/禁止编造/); // 弱项不得超出候选
    expect(REPORT_AGENT_SYSTEM_PROMPT).toMatch(/mascotExpr/);
    // 鼓励但不批评：明确禁止负面标签
    expect(REPORT_AGENT_SYSTEM_PROMPT).toMatch(/笨|差|恐吓|比较/);
  });

  it('输出契约字段齐全（summaryText/weakWords/suggestionText/mascotExpr）', () => {
    for (const f of ['summaryText', 'weakWords', 'suggestionText', 'mascotExpr']) {
      expect(REPORT_AGENT_SYSTEM_PROMPT).toContain(f);
    }
  });

  it('默认文案为鼓励语气', () => {
    expect(DEFAULT_SUMMARY).toMatch(/加油|一起/);
    expect(DEFAULT_SUGGESTION).toMatch(/听|任务/);
  });
});

describe('parseReportAgentOutput (鲁棒性)', () => {
  it('剥离 ```json 围栏', () => {
    const out = parseReportAgentOutput(
      '```json\n{"summaryText":"a","weakWords":["x"],"suggestionText":"b","mascotExpr":"cheer"}\n```',
    );
    expect(out.summaryText).toBe('a');
    expect(out.weakWords).toEqual(['x']);
    expect(out.mascotExpr).toBe('cheer');
  });

  it('截取首个 { 到最后一个 }（忽略前后夹带文本）', () => {
    const out = parseReportAgentOutput(
      '好的，这是小结：{"summaryText":"s","weakWords":[],"suggestionText":"t","mascotExpr":"happy"} 完成',
    );
    expect(out.summaryText).toBe('s');
    expect(out.mascotExpr).toBe('happy');
  });

  it('字段缺失 → 安全兜底（summaryText/suggestionText 空串、weakWords []、mascotExpr encourage）', () => {
    const out = parseReportAgentOutput('{"summaryText":"only"}');
    expect(out.summaryText).toBe('only');
    expect(out.weakWords).toEqual([]);
    expect(out.suggestionText).toBe('');
    expect(out.mascotExpr).toBe('encourage');
  });

  it('weakWords 非数组 → 兜底 []', () => {
    const out = parseReportAgentOutput(
      '{"summaryText":"s","weakWords":"apple","suggestionText":"t","mascotExpr":"thinking"}',
    );
    expect(out.weakWords).toEqual([]);
  });

  it('mascotExpr 非法 → 退 encourage', () => {
    const out = parseReportAgentOutput(
      '{"summaryText":"s","weakWords":[],"suggestionText":"t","mascotExpr":"BOOM"}',
    );
    expect(out.mascotExpr).toBe('encourage');
  });

  it('空输出 / 找不到 JSON → 抛错（由 service 降级为默认报告）', () => {
    expect(() => parseReportAgentOutput('')).toThrow();
    expect(() => parseReportAgentOutput('no json here')).toThrow();
  });
});
