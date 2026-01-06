# 🪖 AI 坦克指挥官 (Tactical Arena System)

一个基于 React + Vite + Gemini AI 构建的战术坦克对战游戏。

## 🌟 核心特性
- **动态战场**：支持 2K 到 10K 的手动规模调节。
- **AI 战术顾问**：集成 Google Gemini 1.5 Flash，提供实时战场分析和战术建议。
- **丰富地形**：包含水域、泥地、反弹墙、玻璃、铁墙等多种物理反馈。
- **战术系统**：支持我方 AI 队友的战术指挥（如：进攻据点、护卫、侧翼包抄）。
- **自适应显示**：拥有自动缩放的小地图系统，适配各种地图规模。

## 🚀 快速开始

### 环境要求
- Node.js (v18+)
- Gemini API Key

### 本地运行
1. **安装依赖**:
   ```bash
   npm install
   ```
2. **配置环境变量**:
   在根目录创建 `.env.local` 文件并填入：
   ```env
   VITE_GEMINI_API_KEY=你的_API_KEY
   ```
3. **启动游戏**:
   ```bash
   npm run dev
   ```
   访问 `http://localhost:3000` 即可。

## 🌐 部署说明

### 部署到 Vercel (推荐)
1. 将项目推送到 GitHub。
2. 在 Vercel 后台关联此仓库。
3. 在 Vercel 的 **Environment Variables** 设置中添加 `VITE_GEMINI_API_KEY`。
4. 点击部署，大功告成！

## 🛠️ 技术栈
- **Frontend**: React, TypeScript, Tailwind CSS
- **Engine**: Canvas API (自定义物理与碰撞检测)
- **AI**: Google Generative AI (Gemini)
- **Bundler**: Vite
