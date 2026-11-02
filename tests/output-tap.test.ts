/** 网关主 session 的输出旁路:World 的接收器要扇进来,语音的自动朗读才拿得到正文。 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { OutputTap, World } from 'cortico/core/types.ts';
import type { StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { GatewayPersona } from '../persona/persona.ts';

const packageDir = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'gateway-output-tap-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const delta = (text: string): StreamEvent => ({
  type: 'response.output_text.delta', sequence_number: 0, output_index: 0, item_id: 'item', content_index: 0, delta: text,
});

function world(id: string, tap: () => OutputTap | undefined): World {
  return {
    id,
    envPromptVars: () => null,
    tools: () => [],
    outputTap: tap,
    start: async () => {},
    stop: async () => {},
  };
}

function persona(worlds: readonly World[]): GatewayPersona {
  return new GatewayPersona({
    memoryDir: join(dir, 'memory'),
    packageDir,
    worlds,
    rounds: () => ({ soft: 6, hard: 12 }),
  });
}

describe('outputTap 扇入', () => {
  it('挂载 World 的接收器能收到主 session 的正文', () => {
    const seen: string[] = [];
    const p = persona([world('voice', () => ({
      onEvent: (event) => { if (event.type === 'response.output_text.delta') seen.push(event.delta); },
    }))]);
    p.declareSessions()[0].outputTap?.onEvent(delta('甲'));
    expect(seen).toEqual(['甲']);
  });

  it('一个 World 不给接收器时,另一个 World 照常收到', () => {
    const seen: string[] = [];
    const p = persona([
      world('a', () => undefined),
      world('b', () => ({
        onEvent: (event) => { if (event.type === 'response.output_text.delta') seen.push(event.delta); },
      })),
    ]);
    p.declareSessions()[0].outputTap?.onEvent(delta('乙'));
    expect(seen).toEqual(['乙']);
  });

  it('多个接收器都收到同一段增量', () => {
    const seen: string[] = [];
    const tap = (id: string): OutputTap => ({
      onEvent: (event) => { if (event.type === 'response.output_text.delta') seen.push(`${id}:${event.delta}`); },
    });
    const p = persona([world('a', () => tap('a')), world('b', () => tap('b'))]);
    p.declareSessions()[0].outputTap?.onEvent(delta('丙'));
    expect(seen).toEqual(['a:丙', 'b:丙']);
  });

  it('没有 World 给接收器时不声明 tap', () => {
    const p = persona([world('a', () => undefined)]);
    expect(p.declareSessions()[0].outputTap).toBeUndefined();
  });

  it('未声明 externalizes 的接收器按默认规则判定', () => {
    const p = persona([world('a', () => ({ onEvent: () => {} })), world('b', () => ({ onEvent: () => {} }))]);
    expect(p.declareSessions()[0].outputTap?.externalizes?.(delta('丁'))).toBe(true);
  });
});
