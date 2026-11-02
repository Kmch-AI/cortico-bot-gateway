## 0.1.1

- 主 session 重新声明 `outputTap`,把挂载 World 的接收器扇进来。语音 World 的概率自动朗读此前在网关 bot 里完全拿不到主 session 正文,只有显式 `voice_speak` 工具能出声;现在纯文本回复能按语音 World 的概率触发。

## 0.1.0

- 初版网关 bot:人设、情绪基调、能力路由与 `end_turn`。
- 显示名统一为 `Kmch AI · 网关`(bot 默认名与 Persona 页标签)。
- 声明 `console`、`qq`、`voice`、`service` 四个 World。
- 前缀写入 QQ 语音交付链:`voice_speak({ silent: true })` → `[blob log:…]` → `qq_draft` → `qq_confirm`;失败退回文字。
- 记忆未实现:只留 `memoryDir`、`FileBlobStore` 与 `MEMORY.seed.md`,不提供记忆工具或页面。
- Persona 页「能力」面板:voice、service、qq、sing、live2d 的安装、启用与配置状态,附 World 页或扩展页链接;只读,不启停 World。
- 浏览器产物由 `pnpm build:webui`(esbuild)生成到 `dist/webui.js`、`dist/webui.css`。
