# 浙江大学软件学院课表转换器（ZJU Timetable Converter）

[![Deploy to Cloudflare Pages](https://github.com/tongluosao/zjucst-timetable-converter/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/tongluosao/zjucst-timetable-converter/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Vue 3](https://img.shields.io/badge/Vue-3-42b883)
![Ant Design Vue](https://img.shields.io/badge/Ant%20Design%20Vue-4-0170fe)

**在线使用：<https://zjucst-timetable-converter.pages.dev/>**（纯前端，课表文件只在你的浏览器里解析，不会上传）

把浙江大学**两季度学期**（秋 + 冬 / 春 + 夏）的教务系统课表，与学院发布的**完整选修课程时间表**合并，
自动补全课表中缺失的上课时间与教室，按学校的节假日与调休安排重算每一节课的实际日期，
最终导出 **Wakeup 课程表**可导入的 CSV 文件。

纯前端应用（Vue 3 + Vite + Ant Design Vue），所有解析与计算都在浏览器本地完成，文件不会上传到任何服务器。

---

## 一、为什么需要它

1. 浙江大学一个长学期拆成两个季度学期（例如 2026-2027 学年下半年为**秋学期** + **冬学期**），教务系统按季度分别导出课表。
2. 软件学院的部分课程**不排进教务系统**，课表里的上课时间/地点只写「具体上课时间、地点由学院通知」，实际安排发布在学院官网的完整课程安排表上。
3. 学院发布的课程表**不考虑节假日和调休**，直接按「每周X 第a-b节」循环。
4. Wakeup 课程表用「周数」而不是具体日期排课，需要把调休折算进周数里。

本工具把这些步骤串成一条流水线。

---

## 二、快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 http://127.0.0.1:5173）
npm run dev

# 3. 打包
npm run build
```

> 若 `npm install` 提示 esbuild 安装脚本被拦截（npm 12+ 的 `allowScripts` 策略），执行：
> `npm install-scripts approve esbuild core-js && npm rebuild esbuild`

### 使用流程

| 步骤 | 界面 | 说明 |
| --- | --- | --- |
| ① | 上传季度课表 | 分别上传第一、第二季度从教务系统导出的 `.xls/.xlsx`。可只传一个，也可两个都不传（只用选修表） |
| ② | 选修课程时间表 | 内置了 `选修课程时间表/` 下的官方文件，可预览 / 停用 / 删除 / 恢复，也可上传自己的文件 |
| ③ | 补全与校对 | 自动按「课程名 + 教师 + 学季」匹配；可切换到其它平行班，或手动指定星期、节次、地点、周数 |
| ④ | 节假日与调休 | 设置学期起始日、各季度周次范围，编辑放假 / 对调 / 补课规则，查看调休结果日历 |
| ⑤ | 预览与导出 | 周课表预览（含调休标记）、停课/改期明细、CSV 预览，一键导出 |

底部的「导出 Wakeup CSV」按钮在任意标签页都可用。

---

## 三、输入文件格式

### 3.1 教务系统个人课表

表头行需包含（列名可略有差异，程序按别名匹配）：

```
学期 | 单双周 | 上课时间 | 课程名称 | 主讲教师 | 上课地点
```

- `上课时间` 形如 `星期六 第11-12节`、`星期一 第11-14节`，也支持 `第1-8周` 之类的周次描述。
- `上课地点` 为 `具体上课时间、地点由学院通知` 或为空时，判定为「需要补全」。
- 完全相同的行会自动去重（教务系统导出常见重复行）。

### 3.2 学院选修课程时间表

表头行需包含：

```
上课学季 | 课程编号 | 课程名称 | 主讲教师姓名 | 上课校区 | 上课时间 | 上课教室 | 备注
```

- `上课时间` 支持两种写法：
  - `每周一5-8节`（直接写节次）
  - `每周三18:50~20:25`（写时间区间，按作息节次表换算成节次）
- `具体上课时间由任课教师通知` 视为「无时间信息」，需要在界面里手动补。
- 同一门课有多个平行班（不同班级编号 / 教师）时，界面上会全部列出供选择。
- 表尾的 `注：上课教室均在5号楼` 会被识别为**教室前缀**，用于拼出 `5号楼-106` 这样的地点。

### 3.3 作息节次表

内置浙江大学默认节次（`src/lib/periods.js`）：

| 节次 | 时间 | 节次 | 时间 |
| --- | --- | --- | --- |
| 1 | 08:00–08:45 | 8 | 14:55–15:40 |
| 2 | 08:50–09:35 | 9 | 15:55–16:40 |
| 3 | 09:50–10:35 | 10 | 16:45–17:30 |
| 4 | 10:40–11:25 | 11 | 18:50–19:35 |
| 5 | 11:30–12:15 | 12 | 19:40–20:25 |
| 6 | 13:15–14:00 | 13 | 20:30–21:15 |
| 7 | 14:05–14:50 | 14 | 21:20–22:05 |

若学校调整作息，直接改这个文件即可。

---

## 四、节假日与调休算法

### 4.1 规则模型

三条原子规则，全部可在界面里增删：

| 类型 | 语义 |
| --- | --- |
| **放假停课** | 指定日期区间内，原本安排的所有课取消 |
| **对调** | 两个日期互换课表。A 日的课挪到 B 日上，B 日原本的课挪到 A 日（若 A 在假期内则实际停课） |
| **补课** | 把某天的课挪到另一天上。勾选「目标日保留原课程」= 追加；不勾选 = 替换掉目标日原本的课 |

### 4.2 计算过程

1. 由规则编译出三张表：`cancelled`（停课日）、`redirect`（名义日期 → 实际上课日期）、`replaceTargets`（不再上自己原课的日期）。
2. 每一节课（课程 × 周次 × 星期 × 节次）先算出**名义日期** `起始日 + 7×(周次-1) + (星期-1)`。
3. 用 `redirect`（只走一跳）得到**实际日期**；若落在 `cancelled` 中，该节课取消。
4. 导出的 CSV 里，**星期与周数都取实际日期的**，这样 Wakeup 按周数排课时才能落在正确的那一天。

> 注意：对调是双向映射，解析时只能走一跳；走两跳会绕回原点。

### 4.3 2026-2027 学年秋冬学期默认规则

| 事项 | 放假 | 调休 / 补课 |
| --- | --- | --- |
| 中秋节 | 9/25–9/27 | — |
| 国庆节 | 10/1–10/7 | 10/6 ↔ 9/20 对调；10/7 ↔ 10/10 对调；10/17 补 10/2 的课 |
| 浙江大学学生节 | 12/31 | 2027/1/4 补 12/31 的课 |
| 元旦 | 1/1 | 另行通知（默认不补） |
| 寒假 | 1/16 起 | — |

默认学期配置：起始日 **2026-09-14**（第 1 周周一），秋学期第 1–8 周，冬学期第 9–16 周，总周数 17。

这些默认值集中在 `src/lib/holiday.js` 的 `defaultRules()` 与 `src/lib/schedule.js` 的 `defaultSemester()`，界面上点「载入默认规则」即可恢复。

---

## 五、导出格式

```csv
课程名称,星期,开始节数,结束节数,老师,地点,周数
高等数学,1,1,2,小明,逸夫楼201,1-5、7-11单、12-16双
线性代数,2,3,4,小红,理工楼110,1-16
大学英语,2,3,4,小红,文成楼125,2、5、8
```

- 星期：`1`=周一 …… `7`=周日
- 周数：连续段写成 `1-5`；隔周写成 `7-11单` / `12-16双`；多个段用 `、` 连接
- 默认带 UTF-8 BOM（Wakeup / Excel 在 Windows 下更稳），可在界面取消

导出后按「课程 / 星期 / 节次 / 教师 / 地点」合并，调休产生的额外节次会自动并入对应的周。

---

## 六、目录结构

```
.
├── index.html
├── vite.config.js
├── package.json
├── public/选修课程时间表/           # 内置选修课程时间表原件（供下载）
├── 选修课程时间表/                   # 原始 xls 存放处，运行 gen:elective 会读取这里
├── scripts/
│   ├── convert-elective.mjs         # xls → src/data/builtinElective.json
│   └── verify.mjs                   # Node 端流水线自检（不依赖浏览器）
└── src/
    ├── main.js
    ├── App.vue                      # 五个步骤的标签页 + 底部导出栏
    ├── store.js                     # 全局响应式状态与动作
    ├── data/builtinElective.json    # 内置选修课程时间表（自动生成）
    ├── lib/
    │   ├── xls.js                   # SheetJS 封装：读表、找表头、列名映射
    │   ├── parseTimetable.js        # 教务系统课表解析
    │   ├── parseElective.js         # 学院选修课程时间表解析
    │   ├── periods.js               # 节次表与日期工具
    │   ├── weeks.js                 # 周数解析 / 格式化
    │   ├── holiday.js               # 调休规则编译与日期重算
    │   ├── schedule.js              # 补全匹配、会话展开、CSV 行聚合、冲突检测
    │   └── csv.js                   # CSV 生成与下载
    ├── components/
    │   ├── StepUpload.vue           # ① 上传季度课表
    │   ├── StepElective.vue         # ② 选修课程时间表管理
    │   ├── StepFill.vue             # ③ 补全与校对
    │   ├── StepHoliday.vue          # ④ 节假日与调休
    │   └── StepPreview.vue          # ⑤ 周视图 + CSV 预览
    └── styles/global.css
```

---

## 七、自动部署（GitHub Actions → Cloudflare Pages）

仓库已内置 `.github/workflows/deploy-pages.yml`：push 到 `main` 即自动 `npm ci && npm run build`，
再用 `cloudflare/wrangler-action` 把 `dist/` 发布到 Cloudflare Pages；PR 会额外生成预览环境。

> 未配置 Cloudflare Secrets 时，工作流会正常构建并**跳过发布步骤**并给出提示，不会报红。
> 配好 Secrets 后无需改动工作流，下次 push 即自动上线。

### 一次性配置

1. **Cloudflare 侧**
   - 在 [Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
     创建一个带 **Cloudflare Pages: Edit** 权限的 API Token
   - 记下 **Account ID**（Dashboard 右侧栏或 `Workers & Pages` 页面可见）

2. **GitHub 侧**：仓库 → *Settings → Secrets and variables → Actions*
   - `CLOUDFLARE_API_TOKEN` = 上一步的 Token（**Secret**）
   - `CLOUDFLARE_ACCOUNT_ID` = Account ID（**Secret**）
   - 可选：`CLOUDFLARE_PAGES_PROJECT`（**Variable**，默认 `zjucst-timetable-converter`）

3. 首次运行后 Pages 项目会自动创建，之后每次 push 到 `main` 都会触发线上部署。

> 工作流不需要手动创建 Pages 项目，`wrangler pages deploy` 在指定 `--project-name` 时会自动建项目。
> 若你想改项目名，只需要在仓库 Variables 里改 `CLOUDFLARE_PAGES_PROJECT`。

### 本地验证构建

```bash
npm run build && npm run preview
```

## 八、其它命令

```bash
npm run gen:elective   # 重新从 选修课程时间表/*.xls 生成内置 JSON（换了新学期的表就跑这个）
npm run verify         # Node 端跑一遍「解析 → 补全 → 调休 → CSV」，用于快速验证算法
npm run verify "E:/download/我的课表 (2).xls" "E:/download/我的课表 (3).xls"
```

## 九、常见问题

**Q：某门课在选修表里也没有上课时间怎么办？**
A：例如「职业能力发展与创业教育」，学院表里写的是「具体上课时间由任课教师通知」。在 ③ 补全与校对 中手动填星期和节次即可；只要状态不是「待补全」，就不会影响导出（留空的课程会被跳过，不会生成错误的 CSV 行）。

**Q：教务系统时间和选修表时间不一致？**
A：默认以教务系统为准，同时在 ③ 中给出橙色提示「选修表为 周X 第a-b节」，可一键「采用」切换。

**Q：调休后某节课消失了？**
A：去 ⑤ 的「停课 / 改期明细」查看。若是「对调」规则把该日课程换走了，可把规则改成「补课」并勾选「目标日保留原课程」。

**Q：导出的周数超过总周数？**
A：补课后可能落在第 17 周。请在 ④ 把「总周数」调大，并在 Wakeup 里设置相同的总周数。

**Q：数据会保存在哪？**
A：浏览器 `localStorage`（键 `zju-timetable-converter:v1`）。换浏览器或清缓存会丢失，请导出 CSV 备份。
