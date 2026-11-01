import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { LoadedConfig } from 'cortico/core/config.ts';
import type { World } from 'cortico/core/types.ts';
import { validateContributions, type WebUiPageContribution } from 'cortico/web/shared/webui-protocol.ts';
import type { CapabilitiesPayload } from '../capabilities.ts';
import definition, { type GatewayConfig } from '../index.ts';

const packageDir = resolve(import.meta.dirname, '..');
let scratchDir: string;
beforeEach(() => { scratchDir = mkdtempSync(join(tmpdir(), 'gateway-webui-')); });
afterEach(() => rmSync(scratchDir, { recursive: true, force: true }));

function world(id: string): World {
  return {
    id,
    envPromptVars: () => ({}),
    tools: () => [],
    start: async () => {},
    stop: async () => {},
  };
}

function loaded(worldsConfig: Record<string, unknown> = {}): LoadedConfig<GatewayConfig> {
  const config = { ...definition.defaults(), worlds: worldsConfig } as unknown as GatewayConfig;
  return {
    config,
    secret: () => '',
    rootDir: scratchDir,
    packageDir,
    memoryDir: join(scratchDir, 'memory'),
    dataDir: join(scratchDir, 'data'),
  };
}

function pageOf(worlds: World[], worldsConfig: Record<string, unknown> = {}): WebUiPageContribution {
  const parts = definition.build(loaded(worldsConfig), worlds);
  const pages = parts.webUi?.webUiPages?.({ storage: [], language: 'zh' }) ?? [];
  const page = pages.find((candidate) => candidate.id === 'persona:gateway');
  if (!page?.invoke) throw new Error('能力页没有声明 invoke');
  return page;
}

async function statusOf(page: WebUiPageContribution): Promise<CapabilitiesPayload> {
  return await page.invoke!('gateway', 'status', []) as CapabilitiesPayload;
}

describe('能力状态页', () => {
  it('声明 persona:gateway,面板 gateway 只开放 status,贡献本身合规', () => {
    const page = pageOf([]);
    expect(page).toMatchObject({ id: 'persona:gateway', kind: 'persona', label: 'Kmch AI · 网关' });
    expect(page.panels).toEqual([{ id: 'gateway', title: '能力', getMethods: ['status'] }]);
    expect(validateContributions([page])).toEqual([]);
  });

  it('五个能力按固定顺序返回;装好、启用且配置齐时没有提示', async () => {
    const worlds = [world('voice'), world('service'), world('qq')];
    const page = pageOf(worlds, {
      voice: { enabled: true, serviceUrl: 'http://127.0.0.1:9883' },
      service: {
        enabled: true,
        host: '127.0.0.1',
        port: 9883,
        services: [{ id: 'sing', protocol: 'sing', enabled: true }],
      },
      qq: { enabled: true, wsUrl: 'ws://127.0.0.1:3001' },
    });
    const payload = await statusOf(page);
    expect(payload.capabilities.map((capability) => capability.id))
      .toEqual(['voice', 'service', 'qq', 'sing', 'live2d']);

    const byId = Object.fromEntries(payload.capabilities.map((capability) => [capability.id, capability]));
    expect(byId.voice).toMatchObject({
      label: '语音', mounted: true, enabled: true, configured: true,
      href: '#/provider/world:voice',
    });
    expect(byId.voice.hint).toBeUndefined();
    expect(byId.service).toMatchObject({ mounted: true, enabled: true, configured: true });
    expect(byId.service.hint).toBeUndefined();
    expect(byId.qq).toMatchObject({ mounted: true, enabled: true, configured: true });
    expect(byId.qq.hint).toBeUndefined();
    expect(byId.sing).toMatchObject({ mounted: false, enabled: false, configured: true });
    expect(byId.sing.hint).toBeTruthy();
    expect(byId.sing.href).toBe('#/provider/world:service');
    expect(byId.live2d).toMatchObject({ mounted: false, enabled: false, configured: false });
    expect(byId.live2d.hint).toBeTruthy();
    expect(byId.live2d.href).toBe('#/world?view=market');
  });

  it('一个 World 都没装时全部报未安装,链接指向扩展页', async () => {
    const payload = await statusOf(pageOf([]));
    for (const capability of payload.capabilities) {
      expect(capability).toMatchObject({ mounted: false, enabled: false, configured: false });
      expect(capability.hint).toBeTruthy();
    }
    expect(payload.capabilities.map((capability) => capability.href))
      .toEqual(Array(5).fill('#/world?view=market'));
  });

  it('装着但停用的 World 报已停用,配置仍按配置段报告', async () => {
    const page = pageOf([world('voice')], {
      voice: { enabled: false, serviceUrl: 'http://127.0.0.1:9883' },
    });
    const voice = (await statusOf(page)).capabilities.find((capability) => capability.id === 'voice')!;
    expect(voice).toMatchObject({ mounted: true, enabled: false, configured: true });
    expect(voice.hint).toContain('已停用');
    expect(voice.href).toBe('#/provider/world:voice');
  });

  it('缺关键配置的能力报待配置', async () => {
    const page = pageOf([world('qq'), world('service')], {
      qq: { enabled: true },
      service: { enabled: true, host: '' },
    });
    const payload = await statusOf(page);
    const qq = payload.capabilities.find((capability) => capability.id === 'qq')!;
    expect(qq).toMatchObject({ mounted: true, enabled: true, configured: false });
    expect(qq.hint).toContain('wsUrl');
    const service = payload.capabilities.find((capability) => capability.id === 'service')!;
    expect(service).toMatchObject({ mounted: true, enabled: true, configured: false });
    expect(service.hint).toBeTruthy();
  });

  it('每次调用现读挂载表:后挂上的 World 立刻出现', async () => {
    const worlds: World[] = [];
    const page = pageOf(worlds, {
      voice: { enabled: true, serviceUrl: 'http://127.0.0.1:9883' },
    });
    const before = (await statusOf(page)).capabilities.find((capability) => capability.id === 'voice')!;
    expect(before).toMatchObject({ mounted: false, enabled: true, configured: true });
    worlds.push(world('voice'));
    const after = (await statusOf(page)).capabilities.find((capability) => capability.id === 'voice')!;
    expect(after).toMatchObject({ mounted: true, enabled: true, configured: true });
    expect(after.hint).toBeUndefined();
  });

  it('拒绝未声明的面板与方法', async () => {
    const page = pageOf([]);
    await expect(page.invoke!('gateway', 'start', [])).rejects.toThrow('gateway.start');
    await expect(page.invoke!('other', 'status', [])).rejects.toThrow('other.status');
  });
});
