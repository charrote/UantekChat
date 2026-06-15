# RAG 切换按钮优化设计

## 目标

优化聊天区"知识库"按钮的文案、交互和状态反馈，将 RAG 服务连接状态集成到按钮本身。

## 改动清单

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/components/MultiModalInput.tsx` | 按钮文案、结构、标题、删除独立状态指示器 |
| `src/App.tsx` | 点击切换前检查 RAG 服务可用性 |
| `src/index.css` | 删除旧状态样式，新增按钮内圆点样式和禁用态 |

### MultiModalInput.tsx

**按钮结构调整：**

```
[ ● 🔍 增强检索 ]
```

- 文字 "知识库" → "增强检索"
- 内嵌 6px 圆点 `.rag-status-dot`，颜色随 `kbStatus.available` 变化
- 删除独立的 `<span className="kb-status">` 整块（即 "未连接" / "X 文档" 文本）
- `title` 改为 `"切换RAG基于知识库增强检索"`

### App.tsx

**新增 `handleToggleRag` 函数替代内联 `setRagEnabled(prev => !prev)`：**

```
handleToggleRag():
  if ragEnabled == true → setRagEnabled(false)  // 关闭无需检查
  if ragEnabled == false:
    if kbStatus.available == false → alert("...") + return  // 不通则不切换
    if kbStatus.available == true  → setRagEnabled(true)
```

依赖：`[ragEnabled, kbStatus.available]`

### index.css

- 删除 `.kb-status` / `.kb-status-dot` / `.kb-status.available` / `.kb-status.unavailable`
- 新增 `.rag-status-dot`：`width: 6px; height: 6px; border-radius: 50%;`
  - `.rag-toggle-btn .rag-status-dot.online`  → `background: var(--success)`
  - `.rag-toggle-btn .rag-status-dot.offline` → `background: var(--error)`
- 新增 `.rag-toggle-btn.disconnected`：`opacity: 0.5; cursor: not-allowed;`

## 交互逻辑

1. 页面加载 → 自动请求 `GET /api/rag/status` → 更新 `kbStatus`
2. 按钮圆点显示绿色/红色反映服务状态
3. 鼠标悬停 → title 提示 `"切换RAG基于知识库增强检索"`
4. 点击关闭 → 直接关闭，不做服务检查
5. 点击开启 → 先检查 `kbStatus.available`
   - 不可用 → `alert()` 提示原因，不切换
   - 可用 → 切换为 `ragEnabled = true`
6. 切换成功后按钮变为 `.active` 高亮态（与现有行为一致）

## 未改动的部分

- `sendMessage()` 中的 RAG 流式请求逻辑不变
- `fetchKbStatus()` 的定期/触发调用逻辑不变
- localStorage 持久化 `rag-enabled` 的逻辑不变
- BookStack 面板的相关逻辑不变
