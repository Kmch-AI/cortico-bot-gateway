/**
 * 网关 Persona:PREFIX.md 渲染前缀，各 World 的环境段拼进去；一个常驻 session 收事件，
 * 工具是活挂载 World 的工具加 end_turn。v0.1 不提供记忆工具，也不建 Memory 页。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BlobStore,
  CoreApi,
  Persona,
  PrefixSegment,
  RoundCaps,
  SessionDecl,
  SessionOpeningReason,
  SystemPrefixContext,
  ToolDef,
  World,
} from 'cortico/core/types.ts';
import { renderTemplate } from 'cortico/core/template.ts';
import { readTextFile } from 'cortico/core/util.ts';
import { FileBlobStore } from './blobs.ts';

export const MEMORY_FILE = 'MEMORY.md';
const MAIN = 'main';

export interface GatewayPersonaOptions {
  memoryDir: string;
  /** 包目录:`persona/PREFIX.md` 与 `persona/MEMORY.seed.md` 在它下面。 */
  packageDir: string;
  /** 活的挂载表,用时再读:激活 / 停用一个 World 就地增删。 */
  worlds: readonly World[];
  rounds: () => RoundCaps;
}

const END_TURN_DECL: Omit<ToolDef, 'handler'> = {
  name: 'end_turn',
  description:
    'End this turn: nothing more you want to say or do right now. '
    + 'New events will wake you again. This is the normal way to finish a turn.',
  tags: ['flow'],
  barrierAfter: true,
  endsTurn: true,
  parameters: { type: 'object', properties: {}, required: [] },
};

/** 自有工具的声明;`index.ts` 的 describe 与 `ownToolNames()` 都取它。 */
export const GATEWAY_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [END_TURN_DECL];

export class GatewayPersona implements Persona {
  readonly memoryDir: string;
  readonly blobs: BlobStore;
  private core: CoreApi | null = null;

  constructor(private readonly opts: GatewayPersonaOptions) {
    this.memoryDir = opts.memoryDir;
    mkdirSync(this.memoryDir, { recursive: true });
    const memory = join(this.memoryDir, MEMORY_FILE);
    // v0.1 没有记忆实现:这份占位文件只是以后挂记忆的落点。
    if (!existsSync(memory)) {
      writeFileSync(memory, readTextFile(join(opts.packageDir, 'persona', 'MEMORY.seed.md')), 'utf8');
    }
    this.blobs = new FileBlobStore(this.memoryDir);
  }

  attach(core: CoreApi): void {
    this.core = core;
  }

  /** 前缀 = PREFIX.md 一段;记忆占位与各 World 的环境提示词各占一节。 */
  async systemSegments(ctx: SystemPrefixContext): Promise<PrefixSegment[]> {
    const template = readTextFile(join(this.opts.packageDir, 'persona', 'PREFIX.md'));
    const envPrompts = ctx.worlds
      .filter((w) => w.envPrompt.trim())
      .map((w) => `## ${w.id}\n${w.envPrompt.trim()}`)
      .join('\n\n');
    return [
      {
        title: 'PREFIX',
        text: renderTemplate(template, {
          'persona.memory': readTextFile(join(this.memoryDir, MEMORY_FILE)).trim(),
          'worlds.envPrompts': envPrompts,
        }),
      },
    ];
  }

  onOpening({ reason }: { reason: SessionOpeningReason }): void {
    this.core?.injectInternal(`[session ${reason}] 上面是人设与已挂载 World 的环境。按你的判断行动,或直接结束本轮。`);
  }

  declareSessions(): SessionDecl[] {
    return [
      {
        id: MAIN,
        label: MAIN,
        rounds: this.opts.rounds,
        persistent: true,
        receivesEvents: true,
        // World 的工具在前、自有工具在后:工具表顺序影响请求前缀的缓存命中。
        tools: () => [...this.opts.worlds.flatMap((w) => w.tools()), endTurnTool()],
      },
    ];
  }

  /** 自有工具名;装配层据此拒绝与之撞名的 World。 */
  ownToolNames(): string[] {
    return GATEWAY_TOOL_DECLS.map((decl) => decl.name);
  }
}

/** 结束本轮的工具。Core 只认 `endsTurn`;名字与措辞归 Persona。 */
export function endTurnTool(): ToolDef {
  return {
    ...END_TURN_DECL,
    handler: async () => '[turn ended]',
  };
}
