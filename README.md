# 烬林守夜 · Ashwood Vigil

原创 2D 非对称 RTS 生存游戏。四位守夜人在随机生成的烬林里筑墙、造塔、开采琥珀，两头噬林魔在夜色中猎杀他们——撑过 15 分钟到黎明，或者把两头噬林魔各打倒两次。

纯 TypeScript + Canvas 2D + Vite，没有任何图片素材：手绘童话风的地形、建筑、小动物角色和毛球怪兽全部由代码绘制。

## 玩法

| 阵营 | 目标 | 手段 |
| --- | --- | --- |
| **守夜人**（兔子 / 小熊 / 狐狸 / 猫） | 坚守 15 分钟到黎明、10:00 后建成并守住破晓祭坛，或把两头噬林魔各击倒 2 次 | 建庇护所、琥珀泉发展经济，用墙、门、弩塔 / 霜塔 / 焰矛构筑防线，书阁解锁科技 |
| **噬林魔**（赤红 / 紫色毛球怪兽） | 耗尽所有守夜人的生命（每人 3 条命） | 撕咬建筑与守夜人获得魂火，购买角 / 爪 / 甲遗物强化，后期进化 |

- 每局地图按种子随机生成，`?seed=123` 可固定地图。
- 可以单人对 AI，也可以多人联机（锁步同步，见下文）。
- 一局节奏：0:35 噬林魔苏醒 → 3:30 中期 → 7:00 后期（兵营反攻）→ 10:00 破晓祭坛可建 → 12:00 血月（不再复活）→ 15:00 黎明。
- 详细规则、经济与攻防公式见 [docs/DESIGN.md](docs/DESIGN.md)。

## 快速开始

需要 Node.js 18+。

```bash
npm install
npm run dev          # http://localhost:5199
```

## 常用命令

```bash
npm test               # vitest 单元 / 集成测试（含同种子确定性）
npm run typecheck      # TypeScript 类型检查
npm run simulate       # 无渲染 AI 对局，对比各策略胜率，用于调参
npm run build          # 输出静态 dist/

# 以下需要先运行 npm run dev
npm run playtest       # Playwright 用真实鼠标键盘做实机验收
npm run playtest:late  # 后期对局验收
npm run playtest:net   # 两个浏览器页面联机对局验收
node scripts/shots-style.mjs   # 标题 / 大厅 / 对局截图
node scripts/shots-units.mjs   # 全部角色放大总览图
```

截图输出到 `playtest-shots/`（不入库）。

## 联机

游戏本体是纯静态页面，联机靠一个很小的 WebSocket 中继服务器转发指令：

```bash
npm run server         # 中继，默认端口 8787（PORT 环境变量可改）
```

在大厅里填入中继地址即可建房 / 加入。想让外网朋友加入，可以用 Cloudflare 快速隧道把游戏和中继都暴露出去：

```bash
cloudflared tunnel --url http://localhost:5199   # 游戏
cloudflared tunnel --url http://localhost:8787   # 中继
```

然后把链接发给朋友：`https://<游戏隧道>.trycloudflare.com/?server=wss://<中继隧道>.trycloudflare.com`，大厅会自动填好中继地址。快速隧道地址每次重启都会变。

## 部署

`npm run build` 后，`dist/` 可直接部署到任意静态托管，例如 Cloudflare Pages：

```bash
npx wrangler pages deploy dist
```

注意 Pages 只托管游戏页面，联机中继仍需单独运行。

## 项目结构

```
src/
  sim/       纯逻辑：确定性模拟、命令队列、地图生成、寻路、AI（不碰 DOM / 时间 / Math.random）
  render/    程序化美术：地形、建筑、角色、特效、镜头
  ui/        HUD、输入、小地图、大厅、标题背景
  net/       锁步联机客户端、协议、校验
  config/    数值（balance.ts 是唯一数值来源）
server/      WebSocket 中继
scripts/     模拟器、Playwright 验收与截图脚本
tests/       vitest 测试
docs/        设计文档
```

## 设计原则

- **模拟与渲染分离**：`src/sim` 无渲染、可确定性重放，所有玩家操作都是可序列化的 `Command`，天然支持锁步联机。
- **数值集中**：所有数值都在 `src/config/`，不散落在逻辑里。
- **后期靠机制不靠堆数值**：后期体验通过进化、遗物与塔阵机制拉开，而不是单纯放大血量和伤害。
