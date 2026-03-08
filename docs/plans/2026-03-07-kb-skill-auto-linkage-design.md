# KB-Skill 自动联动设计

日期: 2026-03-07
方案: 方案 C — 自动生成 + 手动精调 + 始终检索兜底

## 问题

上传到 Knowledge 的语料（选了 category）存入了 ChromaDB，但查询时 Intake 节点将所有问题分类为 `general_chat`，跳过知识库检索。原因：
1. 没有对应 category 的 Skill（只有 first_principles 和 generic_summary 两个硬编码 Skill）
2. Intake prompt 不知道知识库有什么内容
3. 默认 fallback 是 general_chat，导致知识库形同虚设

## 设计目标

- 上传语料后，系统自动为该 category 创建 Skill（description + system_prompt + trigger_words）
- 用户可在 Settings UI 手动编辑 Skill 配置
- 即使 Skill 匹配失败，也始终做一次全库检索兜底

## 数据模型

存储位置：`kb_storage/config/skills.json`

```json
{
    "skills": [
        {
            "skill_id": "sawi_personality",
            "display_name": "赛维人格分析",
            "description": "基于赛维九型人格理论，分析人的行为模式、核心恐惧与欲望",
            "system_prompt": "你是赛维人格分析专家。请根据参考资料，从以下维度分析...",
            "trigger_words": ["赛维", "九型人格", "几号", "人格类型"],
            "category_filter": "sawi_personality",
            "auto_generated": true,
            "enabled": true
        }
    ]
}
```

- `skill_id` 等于 category 值，一个 category 最多一个 Skill
- `trigger_words` 帮助 Intake 做意图匹配
- `auto_generated` 区分自动生成 vs 手动创建
- `enabled` 支持临时禁用

## 数据流

### 上传时自动生成 Skill

```
上传文件(选 category) → Pipeline 6步处理 → 存入 KB
    → 检查 skills.json 是否已有该 category 的 Skill
       → 无：LLM 根据 structured content 生成 description/system_prompt/trigger_words → 写入 skills.json
       → 有：跳过
```

### 查询时

```
用户提问 → Intake(读取 skills.json 所有 Skill + trigger_words)
    → LLM 分类
    → 匹配到 Skill → Retrieve(按 category_filter 过滤) → Execute(注入 system_prompt)
    → 未匹配 → Retrieve(全库检索) → Execute(默认 prompt)
                    ↑ 始终检索兜底，不再跳过
```

### 关键改动：始终检索

```python
# graph.py 路由改为始终走 retrieve
def _route_after_intake(state):
    return "retrieve"
```

## Settings UI

在现有 Settings 标签的模型配置下方，新增 "Skills 管理" 区块：
- 每个 Skill 展示为卡片（display_name / description / trigger_words / system_prompt）
- 支持编辑、重新生成（调 LLM）、禁用
- 支持手动创建新 Skill
- 标记"自动生成"帮用户区分来源

## 文件清单

### 后端 agent-core（9 个文件）

| 文件 | 操作 | 说明 |
|------|------|------|
| `core/skill_config.py` | 新建 | SkillConfig 数据模型 + SkillConfigManager |
| `skills/dynamic.py` | 新建 | DynamicSkill 类，实现 BaseSkill 接口 |
| `skills/generator.py` | 新建 | LLM 生成 Skill 配置 |
| `skills/registry.py` | 修改 | 从 skills.json 加载动态 Skill |
| `content_pipeline/pipeline.py` | 修改 | Pipeline 末尾加自动生成 Skill |
| `api/routes/settings.py` | 修改 | 加 Skill CRUD 端点 |
| `agent/graph.py` | 修改 | 始终走 retrieve |
| `agent/nodes/intake.py` | 修改 | prompt 加入 trigger_words |
| `agent/nodes/retrieve.py` | 修改 | 从 Skill 对象读 category_filter |

### 前端 Open WebUI（2 个文件）

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/apis/agentcore/index.ts` | 修改 | 加 Skill API 客户端函数 |
| `src/lib/components/admin/Knowledge/AgentSettings.svelte` | 修改 | 加 Skills 管理区块 |

## 验证标准

1. 上传赛维语料后，skills.json 自动出现 sawi_personality Skill
2. 在 Settings UI 能看到并编辑该 Skill
3. 用户问"根据赛维来说他是什么人" → Intake 匹配到 sawi_personality → 检索赛维语料 → 用专属 system_prompt 回答
4. 用户问一个不相关的专业问题 → Intake 未匹配 → 仍然全库检索兜底
5. 99 tests 无回归
