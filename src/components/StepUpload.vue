<script setup>
import { ref, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { state, loadTimetable, clearTimetable, setFileTerm } from '../store.js'
import { WEEKDAY_NAMES, describePeriods } from '../lib/periods.js'
import helpExportImage from '../assets/help-export-timetable.png'

const loading = ref([false, false])
const SLOT_TITLES = ['第一季度学期（秋）', '第二季度学期（冬）']
const TERM_OPTIONS = [
  { value: '秋', label: '秋学期' },
  { value: '冬', label: '冬学期' },
  { value: '春', label: '春学期' },
  { value: '夏', label: '夏学期' },
]

const statusMeta = {
  ok: { color: 'green', text: '完整' },
  filled: { color: 'blue', text: '已补全' },
  manual: { color: 'orange', text: '手动指定' },
  unresolved: { color: 'red', text: '待补全' },
  pending: { color: 'default', text: '未处理' },
}

const columns = [
  { title: '课程名称', dataIndex: 'name', width: 200 },
  { title: '教师', dataIndex: 'teacher', width: 90 },
  { title: '原始上课时间', dataIndex: 'rawTime', width: 150 },
  { title: '解析结果', key: 'slots', width: 160 },
  { title: '地点', dataIndex: 'location', width: 180 },
  { title: '状态', key: 'status', width: 90 },
]

async function onFile(slotIndex, file) {
  const ok = /\.(xls|xlsx)$/i.test(file.name)
  if (!ok) {
    message.error('请上传 .xls / .xlsx 格式的课表文件')
    return false
  }
  loading.value[slotIndex] = true
  try {
    const f = await loadTimetable(slotIndex, file)
    message.success(`已解析「${file.name}」，识别为${f.termKey || f.termLabel}学期，共 ${f.courses.length} 门课`)
  } catch (e) {
    message.error(`解析失败：${e.message}`)
  } finally {
    loading.value[slotIndex] = false
  }
  return false
}

function beforeUpload(slotIndex) {
  return (file) => {
    onFile(slotIndex, file)
    return false
  }
}

function removeFile(slotIndex) {
  Modal.confirm({
    title: '移除该季度课表？',
    content: '移除后该季度的课程将不再参与合并与导出。',
    okText: '移除',
    cancelText: '取消',
    onOk() {
      clearTimetable(slotIndex)
      message.success('已移除')
    },
  })
}

function slotText(c) {
  if (!c.slots || !c.slots.length) return '—'
  return c.slots
    .map((s) => `${WEEKDAY_NAMES[s.weekday - 1]} ${describePeriods(s.start, s.end)}`)
    .join('；')
}

const counts = computed(() =>
  state.files.map((f) => {
    if (!f) return null
    return {
      total: f.courses.length,
      need: f.courses.filter((c) => c.status === 'unresolved').length,
    }
  }),
)
</script>

<template>
  <div>
    <div class="panel-card">
      <h3 class="section-title">
        上传教务系统导出的个人课表
        <a-popover trigger="hover" placement="rightTop" :overlay-inner-style="{ maxWidth: '520px' }">
          <template #content>
            <div style="line-height: 1.7">
              <div style="font-weight: 600; margin-bottom: 6px">如何导出每个季度的课表</div>
              <div>
                登录<a href="https://yjsy.zju.edu.cn/" target="_blank" rel="noopener">浙大研究生教务系统</a>
                ，进入「<b>查看我的课表</b>」页面，把左上角的「<b>开课学季</b>」分别切换为
                <b>秋</b>和<b>冬</b>，点页面右下角的 <b>导出课表</b>，即可得到两个 <code>.xls</code> 文件。
                复制下方截图作参考：
              </div>
              <img
                :src="helpExportImage"
                alt="导出课表位置示意图"
                style="width: 100%; border-radius: 6px; margin-top: 8px; border: 1px solid #d9dde4"
              />
              <div style="color: #8a97a8; font-size: 12px; margin-top: 6px">
                ▲ 红箭头指向页面右下角的「导出课表」按钮
              </div>
            </div>
          </template>
          <a class="help-dot" aria-label="导出教程">?</a>
        </a-popover>
      </h3>
      <p class="section-desc">
        浙江大学每个长学期分为两个季度学期（如 2026-2027 学年下半年的<b>秋学期</b>与<b>冬学期</b>），两个季度的课表需要分别导出。
        可以只上传其中一个季度，也可以两个都上传；若某个季度没有选修课，不上传也不会影响结果。
        上传后会自动识别「学期」列，你也可以在下方手动切换季度归属。
      </p>
      <div class="slot-grid">
        <a-card v-for="(title, i) in SLOT_TITLES" :key="i" size="small" :title="title">
          <template #extra>
            <a-tag v-if="state.files[i]" :color="i === 0 ? 'blue' : 'geekblue'">
              {{ state.files[i].termKey || state.files[i].termLabel || '未识别' }}学期
            </a-tag>
          </template>

          <a-upload-dragger
            v-if="!state.files[i]"
            :before-upload="beforeUpload(i)"
            :show-upload-list="false"
            accept=".xls,.xlsx"
          >
            <p class="ant-upload-drag-icon"><span style="font-size: 28px">📄</span></p>
            <p class="ant-upload-text">点击或拖拽上传{{ i === 0 ? '第一' : '第二' }}季度课表</p>
            <p class="ant-upload-hint">支持教务系统导出的 .xls / .xlsx</p>
          </a-upload-dragger>

          <div v-else>
            <a-space direction="vertical" style="width: 100%" size="small">
              <a-space wrap>
                <span style="font-weight: 600">{{ state.files[i].fileName }}</span>
                <a-tag>{{ state.files[i].courses.length }} 门课</a-tag>
                <a-tag v-if="counts[i]?.need" color="red">{{ counts[i].need }} 门待补全</a-tag>
                <a-tag v-else color="green">时间完整</a-tag>
              </a-space>
              <a-space wrap>
                <span style="font-size: 12.5px; color: #6b7a90">归属季度：</span>
                <a-select
                  :value="state.files[i].termKey"
                  size="small"
                  style="width: 110px"
                  :options="TERM_OPTIONS"
                  @change="(v) => setFileTerm(i, v)"
                />
                <a-upload :before-upload="beforeUpload(i)" :show-upload-list="false" accept=".xls,.xlsx">
                  <a-button size="small">重新上传</a-button>
                </a-upload>
                <a-button size="small" danger @click="removeFile(i)">移除</a-button>
              </a-space>
            </a-space>

            <a-table
              :columns="columns"
              :data-source="state.files[i].courses"
              :pagination="false"
              size="small"
              row-key="id"
              style="margin-top: 12px"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'slots'">
                  <span :class="record.slots.length ? '' : 'mono'">{{ slotText(record) }}</span>
                </template>
                <template v-else-if="column.key === 'status'">
                  <a-tag :color="statusMeta[record.status]?.color || 'default'">
                    {{ statusMeta[record.status]?.text || record.status }}
                  </a-tag>
                </template>
                <template v-else-if="column.dataIndex === 'location'">
                  <span>{{ record.location || '—' }}</span>
                </template>
              </template>
            </a-table>
          </div>
        </a-card>
      </div>
    </div>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 14px"
      message="下一步"
      description="上传完成后，请到「② 选修课程时间表」确认学院发布的完整课程表已启用，再到「③ 补全与校对」检查自动补全结果。"
    />
  </div>
</template>
