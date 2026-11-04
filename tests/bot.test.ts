import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BotDefinition } from 'cortico/bot.ts';
import type { CoreConfig, World } from 'cortico/core/types.ts';
import { dryMountBot } from 'cortico/extensions/dry-mount.ts';
import definition from '../index.ts';
import { GatewayPersona } from '../persona/persona.ts';

const packageDir = resolve(import.meta.dirname, '..');
let scratchDir: string;
beforeEach(() => { scratchDir = mkdtempSync(join(tmpdir(), 'gateway-bot-')); });
afterEach(() => rmSync(scratchDir, { recursive: true, force: true }));

const worldWith = (id: string, toolNames: string[]): World => ({
  id,
  envPromptVars: () => ({}),
  tools: () => toolNames.map((name) => ({
    name,
    description: name,
    tags: ['read'],
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async () => 'ok',
  })),
  start: async () => {},
  stop: async () => {},
});

const persona = (worlds: readonly World[] = []) =>
  new GatewayPersona({
    memoryDir: join(scratchDir, 'memory'),
    packageDir,
    worlds,
    rounds: () => ({ soft: 6, hard: 12 }),
  });

describe('Gateway bot', () => {
  it('零 World 下 build() 通过干装载', () => {
    const report = dryMountBot(definition as unknown as BotDefinition<CoreConfig>, { scratchDir, packageDir });
    expect(report.failures).toEqual([]);
  });

  it('声明四个 World,默认配置带上显示名与轮数', () => {
    expect(definition.id).toBe('gateway');
    expect(definition.memoryName).toBe('MEMORY.md');
    expect(definition.declares).toEqual(['console', 'qq', 'voice', 'service']);
    const defaults = definition.defaults();
    expect(defaults.displayName).toBe('Kmch AI · 网关');
    expect(defaults.rounds).toEqual({ soft: 6, hard: 12 });
  });

  it('前缀是 PREFIX.md,并拼进 World 环境提示词', async () => {
    const p = persona();
    const [segment] = await p.systemSegments({
      now: new Date(),
      timezone: 'Asia/Shanghai',
      worlds: [
        { id: 'voice', envPrompt: '语音环境提示词。' },
        { id: 'service', envPrompt: '   ' },
      ],
    });
    expect(segment.title).toBe('PREFIX');
    expect(segment.text).toContain('Kmch AI');
    expect(segment.text).toContain('## voice');
    expect(segment.text).toContain('语音环境提示词。');
    expect(segment.text).not.toContain('## service');
    expect(segment.text).toContain('记忆尚未实现');
  });

  it('一个常驻 session 收事件,end_turn 在工具表末尾', () => {
    const voice = worldWith('voice', ['voice_speak', 'voice_hush']);
    const p = persona([voice]);
    const sessions = p.declareSessions();
    expect(sessions).toHaveLength(1);
    const main = sessions[0];
    expect(main.persistent).toBe(true);
    expect(main.receivesEvents).toBe(true);
    expect(main.tools().map((tool) => tool.name)).toEqual(['voice_speak', 'voice_hush', 'end_turn']);
    expect(main.tools().at(-1)?.endsTurn).toBe(true);
  });

  it('没有记忆工具,也没有 Memory 对象', () => {
    const p = persona();
    const names = p.declareSessions()[0].tools().map((tool) => tool.name);
    expect(names).toEqual(['end_turn']);
    expect(names).not.toContain('memory_write');
    expect(p.ownToolNames()).toEqual(['end_turn']);
    expect((p as { memory?: unknown }).memory).toBeUndefined();
  });

  it('World 挂载表在用的时候才读:后挂的 World 工具立刻出现', () => {
    const worlds: World[] = [];
    const p = persona(worlds);
    expect(p.declareSessions()[0].tools().map((tool) => tool.name)).toEqual(['end_turn']);
    worlds.push(worldWith('voice', ['voice_speak']));
    expect(p.declareSessions()[0].tools().map((tool) => tool.name)).toEqual(['voice_speak', 'end_turn']);
  });
});
