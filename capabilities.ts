/**
 * 能力状态页的数据:网关声明的 World 里,哪些装着、开着、配好了。
 *
 * 只读:这里不启停 World,也不写配置;状态取自活的 worlds 数组与部署配置。
 * 客户端只做展示,判定全部在这一份里,两边的形状由 `CapabilityStatus` 固定。
 */

export type CapabilityId = 'voice' | 'service' | 'qq' | 'sing' | 'live2d';

export interface CapabilityStatus {
  id: CapabilityId;
  label: string;
  /** worlds 数组里有没有这个 id。 */
  mounted: boolean;
  /** worlds.<id>.enabled 是否为 true。 */
  enabled: boolean;
  /** 关键配置是否就绪。 */
  configured: boolean;
  /** 仅在未安装、未启用或待配置时给出。 */
  hint?: string;
  /** World 页或扩展页。 */
  href?: string;
}

export interface CapabilitiesPayload {
  capabilities: CapabilityStatus[];
}

const LABELS: Record<CapabilityId, string> = {
  voice: '语音',
  service: '服务',
  qq: 'QQ',
  sing: '唱歌',
  live2d: 'Live2D',
};

export const CAPABILITY_ORDER: readonly CapabilityId[] = ['voice', 'service', 'qq', 'sing', 'live2d'];

const EXTENSIONS_HREF = '#/world?view=market';

type Section = Record<string, unknown>;

function isSection(value: unknown): value is Section {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 读 `config.worlds`;缺了、不是对象都当空,绝不补写。 */
function worldSections(config: unknown): Record<string, unknown> {
  if (!isSection(config)) return {};
  const worlds = config.worlds;
  return isSection(worlds) ? worlds : {};
}

function sectionOf(sections: Record<string, unknown>, id: string): Section | undefined {
  const section = sections[id];
  return isSection(section) ? section : undefined;
}

function hasString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function isPort(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** 服务 World 里至少有一个启用的 sing 后端。 */
function hasSingBackend(section: Section | undefined): boolean {
  const services = section?.services;
  if (!Array.isArray(services)) return false;
  return services.some((entry) => isSection(entry) && entry.enabled !== false && entry.protocol === 'sing');
}

const CONFIGURED: Record<CapabilityId, (sections: Record<string, unknown>) => boolean> = {
  // 0.2 起语音统一走 serviceUrl;旧的 baseUrl 仍认,避免升级途中误报未配置。
  voice: (sections) => {
    const section = sectionOf(sections, 'voice');
    return hasString(section?.serviceUrl) || hasString(section?.baseUrl);
  },
  service: (sections) => {
    const section = sectionOf(sections, 'service');
    return hasString(section?.host) && isPort(section?.port);
  },
  qq: (sections) => hasString(sectionOf(sections, 'qq')?.wsUrl),
  // 唱歌是服务 World 的一种后端;旧语音的 singUrl 也认。
  sing: (sections) =>
    hasSingBackend(sectionOf(sections, 'service')) || hasString(sectionOf(sections, 'voice')?.singUrl),
  live2d: (sections) => {
    const section = sectionOf(sections, 'live2d');
    return hasString(section?.wsUrl) || hasString(section?.apiUrl) || hasString(section?.vtsUrl);
  },
};

const MISSING_HINT: Record<CapabilityId, string> = {
  voice: '未安装语音 World;在扩展页安装,再在 World 页启用。',
  service: '未安装服务 World;在扩展页安装,再在 World 页启用。',
  qq: '未安装 QQ World;在扩展页安装,再在 World 页启用。',
  sing: '唱歌由服务 World 的 sing 后端提供。',
  live2d: '未安装 Live2D World;在扩展页安装,再在 World 页启用。',
};

const UNCONFIGURED_HINT: Record<CapabilityId, string> = {
  voice: '语音缺少 serviceUrl;在 World 页填写服务地址。',
  service: '服务缺少监听地址或端口;在 World 页填写。',
  qq: 'QQ 缺少 wsUrl;在 World 页填写 OneBot 地址。',
  sing: '服务里没有启用的 sing 后端;在服务 World 页配置。',
  live2d: 'Live2D 缺少连接地址;在 World 页填写。',
};

function hrefFor(id: CapabilityId, mounted: ReadonlySet<string>): string {
  if (id === 'sing' && !mounted.has('sing')) {
    return mounted.has('service') ? '#/provider/world:service' : EXTENSIONS_HREF;
  }
  return mounted.has(id) ? `#/provider/world:${id}` : EXTENSIONS_HREF;
}

function hintFor(id: CapabilityId, mounted: boolean, enabled: boolean, configured: boolean): string | undefined {
  if (!mounted) return id === 'sing' && !configured ? UNCONFIGURED_HINT.sing : MISSING_HINT[id];
  if (!enabled) return `${LABELS[id]} World 已停用;在 World 页启用。`;
  if (!configured) return UNCONFIGURED_HINT[id];
  return undefined;
}

/**
 * 五个能力的当前状态。`liveWorlds` 是装配层交来的挂载表本身,每次调用现读,
 * 激活或停用后不用重建这一页。
 */
export function buildCapabilities(
  config: unknown,
  liveWorlds: readonly { id: string }[],
): CapabilityStatus[] {
  const sections = worldSections(config);
  const mounted = new Set(liveWorlds.map((world) => world.id));
  return CAPABILITY_ORDER.map((id) => {
    const status: CapabilityStatus = {
      id,
      label: LABELS[id],
      mounted: mounted.has(id),
      enabled: sectionOf(sections, id)?.enabled === true,
      configured: CONFIGURED[id](sections),
    };
    const hint = hintFor(id, status.mounted, status.enabled, status.configured);
    if (hint) status.hint = hint;
    status.href = hrefFor(id, mounted);
    return status;
  });
}
