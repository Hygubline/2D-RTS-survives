# 烬林守夜 · Ashwood Vigil

原创 2D 非对称 RTS 生存游戏（玩法规律参考《巨魔与精灵》）。HTML5 Canvas 2D + TypeScript + Vite，全部美术由代码绘制。

```bash
npm install
npm run dev        # http://localhost:5199  (?seed=123 固定地图)
npm test           # vitest
npm run simulate   # 无渲染 AI 对局，比较经济/防御/炮塔/均衡流
npm run playtest   # Playwright 实机验收（需 dev 服务器运行）
npm run build      # 输出 dist/，可直接 wrangler pages deploy dist
```

- 设计文档：`docs/DESIGN.md`
- 项目规范 Skill：`.claude/skills/rts-game-design/SKILL.md`
- 数值：`src/config/balance.ts`（唯一数值来源）
- 架构：`src/sim`（纯逻辑、确定性、命令队列，可锁步联机）· `src/render`（程序化美术）· `src/ui`（HUD/输入）
