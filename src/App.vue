<script setup>
import { ref, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { state, stats, scheduleResult, saveLocal, csvText } from './store.js'
import { buildCsv, downloadCsv } from './lib/csv.js'
import StepUpload from './components/StepUpload.vue'
import StepElective from './components/StepElective.vue'
import StepFill from './components/StepFill.vue'
import StepHoliday from './components/StepHoliday.vue'
import StepPreview from './components/StepPreview.vue'

const tab = computed({
  get: () => state.activeTab,
  set: (v) => (state.activeTab = v),
})

let timer = null
watch(
  () => JSON.stringify({ f: state.files, s: state.semester, r: state.rules, e: state.electiveTables.map((t) => t.enabled) }),
  () => {
    clearTimeout(timer)
    timer = setTimeout(saveLocal, 800)
  },
)

function doExport() {
  if (!scheduleResult.value.rows.length) {
    message.warning('还没有可导出的课程，请先上传课表')
    return
  }
  const text = buildCsv(scheduleResult.value.rows, { bom: state.csvBom })
  const termText = state.files
    .filter(Boolean)
    .map((f) => f.termKey || f.termLabel)
    .join('')
  downloadCsv(text, `Wakeup课程表_${termText || '浙大'}.csv`)
  message.success('已导出 CSV，可在 Wakeup 课程表中导入')
}

async function copyCsv() {
  try {
    await navigator.clipboard.writeText(csvText.value)
    message.success('CSV 已复制到剪贴板')
  } catch (e) {
    message.warning('复制失败，请手动选择预览文本复制')
  }
}
</script>

<template>
  <div>
    <header class="app-header">
      <div>
        <h1>浙江大学软件学院课表转换器</h1>
        <div class="sub">
          两季度学期课表 + 学院选修课程时间表 → 自动补全 · 节假日调休计算 → Wakeup 课程表 CSV
        </div>
      </div>
      <a-space style="margin-left: auto" wrap>
        <a-tag color="blue">学期起始 {{ state.semester.startDate }}</a-tag>
        <a-tag color="cyan">课程 {{ stats.total }}</a-tag>
        <a-tag :color="stats.unresolved ? 'red' : 'green'">
          待补全 {{ stats.unresolved }}
        </a-tag>
        <a-tag color="purple">节次 {{ scheduleResult.sessions.length }}</a-tag>
      </a-space>
    </header>

    <div class="app-body">
      <a-tabs v-model:activeKey="tab" type="card" size="middle">
        <a-tab-pane key="1" tab="① 上传季度课表">
          <StepUpload />
        </a-tab-pane>
        <a-tab-pane key="2" tab="② 选修课程时间表">
          <StepElective />
        </a-tab-pane>
        <a-tab-pane key="3" tab="③ 补全与校对">
          <StepFill />
        </a-tab-pane>
        <a-tab-pane key="4" tab="④ 节假日与调休">
          <StepHoliday />
        </a-tab-pane>
        <a-tab-pane key="5" tab="⑤ 预览与导出">
          <StepPreview />
        </a-tab-pane>
      </a-tabs>

      <div
        style="
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: #fff;
          border-top: 1px solid #e6ebf2;
          padding: 10px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 20;
          box-shadow: 0 -2px 10px rgba(20, 40, 80, 0.06);
        "
      >
        <a-space wrap size="small">
          <a-tag v-if="stats.unresolved" color="red">有 {{ stats.unresolved }} 门课缺上课时间</a-tag>
          <a-tag v-else color="green">全部课程时间完整</a-tag>
          <span style="color: #6b7a90; font-size: 12.5px">
            可导出 {{ scheduleResult.rows.length }} 条 · 停课 {{ scheduleResult.cancelled.length }} 节 · 冲突
            {{ scheduleResult.conflicts.length }} 处
          </span>
        </a-space>
        <a-space style="margin-left: auto" wrap>
          <a-checkbox v-model:checked="state.csvBom">带 BOM（推荐 Windows / Wakeup）</a-checkbox>
          <a-button size="small" @click="copyCsv">复制 CSV</a-button>
          <a-button type="primary" @click="doExport">导出 Wakeup CSV</a-button>
        </a-space>
      </div>
    </div>
  </div>
</template>
