/** 默认导出 BotDefinition；deployment.json 的 bot 字段引用包名，多份部署可共用同一个包。 */
import { resolve } from 'node:path';
import type { BotDefinition, BotParts } from 'cortico/bot.ts';
import type { CoreConfig, World } from 'cortico/core/types.ts';
import type { LoadedConfig } from 'cortico/core/config.ts';
import { CORE_DEFAULTS } from 'cortico/core/config.ts';
import { describeTools, type WorldDeclaration } from 'cortico/world.ts';
import type { WebUiPageContribution } from 'cortico/web/shared/webui-protocol.ts';
import { buildCapabilities } from './capabilities.ts';
import { GATEWAY_TOOL_DECLS, GatewayPersona } from './persona/persona.ts';

const HERE = resolve(import.meta.dirname);

export interface GatewayConfig extends CoreConfig {
  /** 一轮唤醒里模型最多调几次工具:软上限提醒收尾,硬上限强制收尾。归 Persona。 */
  rounds: { soft: number; hard: number };
}

/** 网关声明的 World:控制台与 QQ 是渠道，语音与服务是能力。未安装的显示为不可用。 */
const DECLARES: readonly WorldDeclaration[] = ['console', 'qq', 'voice', 'service'];

/** 能力状态页。worlds 与 config 都是活引用:World 启停、配置改写后下次调用即可见。 */
function gatewayPages(loaded: LoadedConfig<GatewayConfig>, worlds: World[]): WebUiPageContribution[] {
  return [
    {
      id: 'persona:gateway',
      kind: 'persona',
      label: '网关',
      panels: [{ id: 'gateway', title: '能力', getMethods: ['status'] }],
      invoke: async (panel, method) => {
        if (panel !== 'gateway' || method !== 'status') {
          throw new Error(`网关面板没有 ${panel}.${method} 这个方法`);
        }
        return { capabilities: buildCapabilities(loaded.config, worlds) };
      },
    },
  ];
}

function build(loaded: LoadedConfig<GatewayConfig>, worlds: World[]): BotParts<GatewayConfig> {
  const cfg = loaded.config;
  return {
    persona: new GatewayPersona({
      memoryDir: loaded.memoryDir,
      packageDir: HERE,
      worlds,
      rounds: () => cfg.rounds,
    }),
    webUi: {
      webUiPages: () => gatewayPages(loaded, worlds),
    },
  };
}

const definition: BotDefinition<GatewayConfig> = {
  id: 'gateway',
  memoryName: 'MEMORY.md',
  declares: DECLARES,
  defaults: () => ({
    ...structuredClone(CORE_DEFAULTS),
    displayName: 'Kmch AI',
    rounds: { soft: 6, hard: 12 },
  }),
  build,
  // 自描述不进提示词。Persona 只自带 end_turn;其余工具由挂载的 World 提供。
  describe: {
    tools: describeTools(GATEWAY_TOOL_DECLS, {
      end_turn: { zh: '结束这一轮,等新事件再醒。', en: 'Ends the turn until a new event arrives.' },
    }),
    memory: {
      form: {
        zh: '尚未实现。v0.1 只留 memoryDir 与 blobs/ 作为挂载点;唯一的持久状态是 session 日志。',
        en: 'Not implemented yet. v0.1 only reserves memoryDir and blobs/ as mount points; the session log is the only persistence.',
      },
    },
  },
};

export default definition;
