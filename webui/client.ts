/**
 * 网关的 Persona 页面板:能力状态。
 *
 * 数据面走 `ctx.invoke('status')`;判定在服务端的 capabilities.ts,这里只画灯与徽标。
 * 依赖只有 `client-panel.ts` 的类型、本地类型的 `../capabilities.ts` 与本包样式。
 */

import type { WebUiClientBundle, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import type { CapabilitiesPayload, CapabilityStatus } from '../capabilities.ts';
import './style.css';

type Tone = 'ready' | 'off' | 'warn';

function toneOf(capability: CapabilityStatus): Tone {
  if (!capability.mounted || !capability.enabled) return 'off';
  return capability.configured ? 'ready' : 'warn';
}

function stateText(capability: CapabilityStatus): string {
  if (!capability.mounted) return '未安装';
  if (!capability.enabled) return '已停用';
  return capability.configured ? '就绪' : '待配置';
}

function mountGateway(ctx: WebUiPanelContext): void {
  const { ui, root } = ctx;
  const card = ui.sheet({ title: '能力' });
  root.append(card.el);

  const paint = (payload: CapabilitiesPayload): void => {
    const list = ui.h('div', 'gw-caps');
    for (const capability of payload.capabilities) {
      const tone = toneOf(capability);
      const row = ui.h('div', 'gw-cap');
      row.dataset.state = tone;

      const lamp = ui.h('span', 'gw-lamp');
      lamp.setAttribute('aria-hidden', 'true');
      const name = capability.href
        ? ui.h('a', 'gw-name', capability.label)
        : ui.h('span', 'gw-name', capability.label);
      if (capability.href) (name as HTMLAnchorElement).href = capability.href;

      const line = ui.h('div', 'gw-line');
      line.append(lamp, name, ui.pill(stateText(capability), tone === 'ready' ? 'on' : tone === 'off' ? 'off' : 'plain'));
      row.append(line);
      if (capability.hint) row.append(ui.h('div', 'gw-hint', capability.hint));
      list.append(row);
    }
    card.body.replaceChildren(list);
  };

  card.body.append(ui.placeholder('读取中…'));
  void ctx.invoke<CapabilitiesPayload>('status', []).then(
    (payload) => {
      if (!ctx.signal.aborted) paint(payload);
    },
    (error: unknown) => {
      if (ctx.signal.aborted) return;
      card.body.replaceChildren(ui.msgline(error instanceof Error ? error.message : String(error), true));
    },
  );
}

const bundle: WebUiClientBundle = {
  panels: {
    gateway: { mount: mountGateway },
  },
};

export default bundle;
