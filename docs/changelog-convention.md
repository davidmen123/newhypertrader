# 更新日志（Changelog）维护约定

网站对外的更新日志页面由 `client/src/data/changelog.generated.ts` 驱动，该文件**不要手改**——它由 `scripts/gen-changelog.mjs` 从 git 提交记录自动生成。

## 提交流程

1. 提交时在**正文**（标题之后）加一条尾注，说明这条改动是否进日志：

   ```
   修复: 手机端指标注释（Tooltip）无法显示

   修复: 修复手机端注释不显示
   Changelog-EN: Fixed tooltips not showing on mobile
   ```

2. 运行 `npm run changelog`（即 `node scripts/gen-changelog.mjs`）重新生成日志文件。

3. 把生成文件 amend 进同一个提交：`git add client/src/data/changelog.generated.ts && git commit --amend --no-edit`。

## 尾注与版本号（SemVer）

| 尾注 | 含义 | 版本效果 |
|---|---|---|
| `更新: <一句话>` | 新功能 | minor +1（如 1.45.0 → 1.46.0） |
| `修复: <一句话>` | 问题修复 | patch +1（如 1.45.0 → 1.45.1） |
| `Changelog-EN: <英文>` | 可选英文文案，缺省回退中文 | — |
| 无尾注 | 不进日志 | — |

规则细节：

- 中文一句话**控制在 15 字以内**，面向访客写，不要写成内部提交笔记；过长或过于内部的文案可在脚本的 `OVERRIDES` 表里按 SHA 改写（不改动历史提交）。
- `更新:` 兼容匹配整段提交信息（早期有单行 "更新: ..." 当标题的历史提交）；`修复:` **只匹配正文**，防止 "修复: ..." 标题的日常提交误入日志。
- 一条提交同时带两个尾注时按 `更新:` 处理（minor）。
- 连续相同文案的提交只记一条（兼容 amend 后残留的历史）。
- **`/analytics` 私有看板相关提交一律不带尾注**，不进对外日志；历史上误带的已列入脚本的 `EXCLUDED_SHAS`。
- 版本号从 `SEED` 列表（1.0.0 ~ 1.5.0）之后开始自动累加；SEED 是流水线建立前的历史回填。

## 验证

重新生成后建议 `git diff client/src/data/changelog.generated.ts` 检查：预期之外的版本号漂移（大批量条目版本变化）通常意味着尾注匹配出了问题，先排查脚本再提交。
