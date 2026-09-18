# AGENTS.md

面向在本仓库中工作的 AI Agent / 开发者的工程约定与上手指南。修改代码前请先读本文件。

## 项目定位

浙江大学两季度学期课表转换工具的**纯前端**实现：合并教务系统课表 + 学院选修课程时间表，按节假日调休重算每一节课，导出 Wakeup 课程表 CSV。
没有后端、没有网络请求（除了加载本地静态资源），所有解析与计算都在浏览器中完成。

## 技术栈与硬约束

- Vue 3（`<script setup>`，Options API 一律不用）+ Vite 6 + **Ant Design Vue 4**
- 表格解析用 **SheetJS `xlsx`**（0.18.5），它同时支持老版 BIFF `.xls` 与 OOXML `.xlsx`
- **不要引入后端服务、数据库或云函数**；状态持久化只用 `localStorage`
- **不要引入 UI 库之外的组件库**（不要 Element Plus、Naive UI 等）
- 中文界面，注释与文档用简体中文

## 常用命令

```bash
npm install                 # 安装依赖
npm run dev                 # 开发服务器 http://127.0.0.1:5173
npm run build               # 生产构建到 dist/（base 为 './'，可直接静态托管）
npm run gen:elective        # 选修课程时间表/*.xls → src/data/builtinElective.json
npm run verify              # Node 端流水线自检（解析→补全→调休→CSV）
```

Windows 下若 `npm install` 报 esbuild 安装脚本被拦截：
`npm install-scripts approve esbuild core-js && npm rebuild esbuild`

Node 24 / npm 12，`G:\nodejs` 的全局 npm 缓存目录可能无写权限，需要
`npm install --cache "C:/Users/tongluosao/.npm-cache-zju"`。

## 源码地图

| 文件 | 职责 |
| --- | --- |
| `src/store.js` | 唯一的状态源（`reactive`）。课表、选修表、学期配置、调休规则、补全动作、派生 `computed`、localStorage 读写 |
| `src/lib/xls.js` | SheetJS 封装：`readWorkbook` / `sheetToRows` / `findHeaderRow` / `buildColumnMap` |
| `src/lib/parseTimetable.js` | 教务系统个人课表 → 课程数组（含 `slots`、`needsFill`） |
| `src/lib/parseElective.js` | 学院选修课程时间表 → 条目数组（含 `slot`、`room`、`remark`） |
| `src/lib/periods.js` | 作息节次表、时间区间→节次换算、日期工具 |
| `src/lib/weeks.js` | 周数解析与格式化（`1-5、7-11单、12-16双`） |
| `src/lib/holiday.js` | 调休规则模型、`buildCalendar`、`resolveDate`、默认规则 |
| `src/lib/schedule.js` | 选修表匹配补全、会话展开（含调休）、CSV 行聚合、冲突检测 |
| `src/lib/csv.js` | CSV 文本生成与下载 |
| `src/components/Step*.vue` | 五个步骤的界面，一一对应 App.vue 的五个标签页 |

## 核心数据结构

```js
// 课程（来自教务课表，经补全后）
{
  id, term: '秋学期', termKey: '秋', name, teacher, location,
  parityText: '自定义', parity: 'all'|'odd'|'even',
  weeksText: '',                     // 用户覆盖的周数，空则用学期默认范围
  slots: [{ weekday: 6, start: 11, end: 12 }],
  status: 'ok'|'filled'|'manual'|'unresolved'|'pending',
  fillOptions: [{ tableId, tableName, entry, score }],
  entryId: '',                       // 时间取自哪一条选修表记录（空=未采用）
  locationEntryId: '',               // 地点取自哪一条
  edited: false, excluded: false,
}

// 会话（一节课的实际发生）
{
  name, teacher, location, start, end,
  nominalWeek: 4, nominalWeekday: 2, nominalDate: '2026-10-06',
  week: 1, weekday: 7, date: '2026-09-20', moved: true,
}
```

## 关键不变量（改动时务必保持）

1. **`resolveDate` 只走一跳**。`redirect` 对「对调」是双向的，走两跳会绕回原点，导致调休失效。
2. **CSV 的星期与周数必须取「实际日期」的**，不是名义日期的。Wakeup 按周数排课，只有这样调休才能落到正确的日期上。
3. **`entryId` 只表示「时间取自哪条选修表记录」**。教务系统已有时间的课程只借用地点，不算采用，否则界面上会显示与实际不符的候选。
4. **列名匹配必须防子串误命中**。`buildColumnMap` 用三轮（精确 → 多字子串 → 单字）匹配，避免 `课程编号` 被子串 `课程` 抢走。改别名时不要绕过这个机制。
5. **同一列只能被一个字段占用**（`buildColumnMap` 的 `usedCols`）。
6. `needsFill` 的判定是「没有节次 **或** 地点是占位文本（含空）」，不是只看节次。
7. 学期第 1 周的周一是 `semester.startDate`；`秋=1-8 周 / 冬=9-16 周` 只是默认值，可在界面修改。
8. **`allCourses` 是展开快照，不要直接 mutate 表格行**。`StepFill.vue` 通过 `liveCourse(row)` 找回源对象后再修改。改界面交互时一定走这条路径，否则编辑不会写回。

## 修改内置选修课程时间表

1. 把新的 `.xls/.xlsx` 放进 `选修课程时间表/`（可以放多个）
2. `npm run gen:elective`
   - 重新生成 `src/data/builtinElective.json`（前端内置数据，运行时不依赖文件系统）
   - 同时复制原件到 `public/选修课程时间表/` 供页面下载
3. 若新学期的节次时间有变化，同步改 `src/lib/periods.js`

## 修改默认节假日规则

- 规则数据：`src/lib/holiday.js` 的 `defaultRules()`
- 学期默认配置：`src/lib/schedule.js` 的 `defaultSemester()`
- 用户在界面里修改后会写进 localStorage；改了默认值需要清缓存或点「载入默认规则」才能看到

## 测试与验证

- **算法层**：`npm run verify`（Node 端，不依赖浏览器）会打印补全结果、CSV、改期清单、停课清单、冲突。默认读取 `E:/download/我的课表 (2).xls / (3).xls`，也可在命令后传入自己的文件路径。
- **界面层**：`npm run dev` 后用浏览器打开，或 `npm run build` 确认编译通过。
  本机已有 Chromium：`C:/Users/tongluosao/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe`，
  可配合 `playwright-core`（装在 `C:/Users/tongluosao/.workbuddy-ai/binaries/node/workspace`）做冒烟测试。
- 新增解析规则时，**务必同时更新 `scripts/verify.mjs` 的断言式输出**，保证 Node 端能验证。

## 已知取舍

- 教务系统课表里的「单双周」列常为 `自定义` 且不含具体周次，此时默认按该季度的完整周次范围处理，用户可在 ③ 手动改周数。
- 「对调」按交换语义实现，可能让目标日原本的课消失；如希望保留，请改用「补课」并勾选「目标日保留原课程」。
- 内置的 `src/data/builtinElective.json` 是生成产物，不要手工编辑。
- 打包体积偏大（主要是 antd + xlsx），未做代码分割，属于可接受范围。
