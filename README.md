# 划词翻译 · 生词本

Chrome Manifest V3 扩展：网页划词英译中、右键收藏生词、弹窗与独立页管理复习。

## 安装（开发者模式）

1. 打开 Chrome → `chrome://extensions`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择本项目文件夹 `AI对话`

## 功能说明

| 功能 | 说明 |
|------|------|
| 划词翻译 | 选中英文后约 0.3s 弹出浮窗；可拖动标题栏、关闭、复制译文、手动存入生词本 |
| 右键菜单 | **翻译并存入生词本**：一次完成翻译 + 保存，并展示浮窗 |
| 翻译引擎 | 默认 MyMemory（免 Key）；设置页可切换有道 / 百度（失败时自动回退 MyMemory） |
| 音标 | 单词会尝试请求 Free Dictionary API 补充音标 |
| 弹窗 | 320×480，最近生词、搜索、添加、删除、清空、打开完整页 |
| 完整页 | `pages/vocab.html`：排序、搜索、JSON 导入导出、随机复习 |

## 目录结构

```
manifest.json
background.js
content/          # 划词浮窗
lib/              # 翻译、存储、MD5
popup/            # 浏览器图标弹窗
options/          # 翻译设置
pages/vocab.html  # 生词本完整页
icons/
```

## 数据存储

生词与设置均保存在 `chrome.storage.local` 的 `vocabulary`、`settings` 键中。
