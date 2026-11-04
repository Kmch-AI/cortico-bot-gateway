# @kmchai/cortico-bot-gateway

入口:`index.ts`

Kmch AI 的 bot 层:persona 在前缀里写人设、情绪与能力路由，声明并协调 `console`、`qq`、`voice`、
`service` 四个 World。网关自己不合声、不播放、不排队，也不重复实现 QQ 发送；这些归各 World。

| 文件 | 内容 |
|---|---|
| `index.ts` | `BotDefinition`:id `gateway`、声明的 World、默认配置、`build()`、`describe` |
| `capabilities.ts` | 能力状态:voice/service/qq/sing/live2d 的安装、启用与配置判定 |
| `persona/persona.ts` | `Persona` 实现:前缀、一个常驻 session、`end_turn`、开场注入 |
| `persona/PREFIX.md` | 前缀模板:人设、情绪、能力路由、QQ 语音交付步骤；`{{persona.memory}}` 与 `{{worlds.envPrompts}}` |
| `persona/blobs.ts` | `mem:` 句柄的后端，字节住在 `memory/blobs/` |
| `persona/MEMORY.seed.md` | 部署第一次起来时 `MEMORY.md` 的占位内容 |
| `webui/client.ts`、`webui/style.css` | Persona 页的能力面板;产物是 `dist/webui.js` 与 `dist/webui.css` |
| `tests/` | 干装载、前缀渲染、session、工具表与能力状态页 |

## 构建

`pnpm build:webui` 用 esbuild 生成 `dist/webui.js` 与 `dist/webui.css`;改了 `webui/` 下的文件后重跑。
`pnpm typecheck` 同时检查 Node 侧与浏览器侧(`tsconfig.web.json`)。

## 部署

在 `deployment.json` 写 `{ "bot": "@kmchai/cortico-bot-gateway" }`。四个 World 都通过 `declares`
默认启用；没装时显示为不可用，装上后生效。Persona 页的「能力」面板列出 voice、service、qq、sing、
Live2D 的安装、启用与配置状态，并链接到对应的 World 页或扩展页。

## v0.1 范围

- 工具只有各 World 的加 `end_turn`；不提供记忆工具，也没有 Memory 页。
- `MEMORY.md` 只是以后挂记忆的落点，v0.1 不读写它。
- 语音 World 不做自动朗读；需要出声时显式调用 `voice_speak`。主 session 仍把挂载 World 的 `outputTap` 扇进来，供其他 World 使用，但不依赖它触发语音。
- QQ 语音走显式工具链:`voice_speak({ silent: true })` → `[blob log:…]` →
  `qq_draft({ voice, to })` → `qq_confirm`；失败时退回文字。
