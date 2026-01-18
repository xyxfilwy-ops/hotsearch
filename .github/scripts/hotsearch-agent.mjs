/**
 * Hotsearch Analysis Agent
 *
 * 使用 Claude Agent SDK 执行全网热搜产品创意分析
 *
 * 环境变量：
 * - ANTHROPIC_API_KEY: Claude API 密钥
 * - ANTHROPIC_BASE_URL: API 基础地址（第三方代理时必需）
 * - ANTHROPIC_MODEL: 使用的模型（默认 claude-opus-4-5-20251101）
 * - TIANAPI_KEY: 天行数据 API 密钥
 * - MAX_TOPICS: 分析的热搜数量上限（默认 15）
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import * as fs from "fs";

// 从环境变量读取配置
const TIANAPI_KEY = process.env.TIANAPI_KEY;
const MAX_TOPICS = process.env.MAX_TOPICS || "15";
const OUTPUT_PATH = "omni-hotsearch-report.html";

// 第三方 API 配置
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-5-20251101";

if (!TIANAPI_KEY) {
  console.error("Error: TIANAPI_KEY environment variable is required");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}

// 显示 API 配置信息
console.log("API Configuration:");
console.log(`  Base URL: ${ANTHROPIC_BASE_URL || "(default)"}`);
console.log(`  Model: ${ANTHROPIC_MODEL}`);
console.log("");

// 构建热搜 API URL
const hotSearchApiUrl = `https://apis.tianapi.com/networkhot/index?key=${TIANAPI_KEY}`;

// 构建 Agent 的 Prompt（基于原 SKILL.md）
const agentPrompt = `
你是一个全网热搜产品创意分析 Agent。请按照以下流程执行完整分析：

## 参数配置
- hotSearchApiUrl: ${hotSearchApiUrl}
- maxTopics: ${MAX_TOPICS}
- outputHtmlPath: ${OUTPUT_PATH}
- ideasPerTopic: 2

## 执行流程

### 1) 抓取热搜榜单
使用 WebFetch 工具请求热搜 API，获取榜单数据。

解析兼容策略（按顺序尝试）：
- result.list → result.newslist → newslist → data.list → data → 根节点数组

字段映射：
- title: title / word / keyword / name
- hotValue: hotValue / hot / hotindex / hotnum / index / heat / score
- topicUrl: url / link / topicUrl
- rank: rank / index / order

### 2) 联网检索每个话题
对每个 title 使用 WebSearch 执行 2-4 次检索：
- "{title} 发生了什么"
- "{title} 时间线 最新进展"
- "{title} 背景 相关方"
- "{title} 数据 影响"

整理输出：
- oneLineSummary：一句话解释
- whatHappened：事件概述
- timeline[]：3-6 条关键节点
- stakeholders：主要相关方
- whyTrending：上热搜原因
- currentStatus：当前进展
- sources[]：来源链接

### 3) 评分（总分 100 = 有趣度 80 + 有用度 20）

**有趣度（0-80）**：
- 新奇性/意外性（0-20）
- 情绪与传播性（0-20）
- 讨论密度（0-20）
- 叙事完整度（0-20）

**有用度（0-20）**：
- 可行动性（0-10）
- 真实价值（0-10）

**等级**：优秀（≥80）、良好（60-79）、一般（<60）

### 4) 产品创意生成
为每条热点生成 2 个产品创意：
- name：产品名称
- coreFeatures[]：3-5 条核心功能
- targetUsers：目标用户描述

### 5) 生成 HTML 报告
生成一个自包含的 HTML 文件，采用玻璃态设计（glassmorphism）风格：
- 页面头部：标题、生成时间、数据源信息
- 总览区：优秀/良好/一般数量统计
- 热点列表：按总分降序排列的卡片式布局
- 对优秀（≥80）热点高亮展示
- 对良好（60-79）次级强调

**重要**：
1. API 密钥在 HTML 中必须脱敏（只显示前 4 位和后 4 位）
2. 使用 Write 工具将 HTML 写入 ${OUTPUT_PATH}
3. 完成后输出成功消息和 Top3 热点标题

现在请立即开始执行，不要询问确认。
`;

console.log("Starting Hotsearch Analysis Agent...");
console.log(`Max Topics: ${MAX_TOPICS}`);
console.log(`Output Path: ${OUTPUT_PATH}`);
console.log("");

async function runAgent() {
  let finalOutput = "";

  try {
    for await (const message of query({
      prompt: agentPrompt,
      options: {
        // 模型配置
        model: ANTHROPIC_MODEL,
        // 允许的工具
        allowedTools: [
          "WebFetch",      // 获取热搜 API
          "WebSearch",     // 联网检索
          "Write",         // 写入 HTML 文件
          "Read",          // 读取文件（如需要）
        ],
        // CI/CD 模式必须启用
        permissionMode: "bypassPermissions",
        // 防止无限循环
        maxTurns: 50,
        // 成本控制（美元）
        maxBudgetUsd: 5.00
      }
    })) {
      // 处理 Assistant 消息
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block) {
            console.log(block.text);
            finalOutput += block.text + "\n";
          }
        }
      }

      // 处理工具调用结果
      if (message.type === "tool_result") {
        console.log(`[Tool] ${message.tool_name}: ${message.status || "completed"}`);
      }

      // 处理最终结果
      if (message.type === "result") {
        console.log("\n---");
        console.log(`Total Cost: $${message.total_cost_usd?.toFixed(4) || "N/A"}`);
        console.log(`Total Turns: ${message.total_turns || "N/A"}`);
      }
    }

    // 验证 HTML 文件是否生成
    if (fs.existsSync(OUTPUT_PATH)) {
      const stats = fs.statSync(OUTPUT_PATH);
      console.log(`\nSuccess! Report generated: ${OUTPUT_PATH} (${Math.round(stats.size / 1024)} KB)`);
    } else {
      console.error("\nWarning: HTML report was not generated");
      process.exit(1);
    }

  } catch (error) {
    console.error("Agent execution failed:", error);
    process.exit(1);
  }
}

runAgent();
