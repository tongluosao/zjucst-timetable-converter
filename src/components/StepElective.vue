<script setup>
import { ref, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  state,
  loadElectiveTable,
  removeElectiveTable,
  toggleElectiveTable,
  restoreBuiltin,
  autoFill,
} from '../store.js'

const previewOpen = ref(false)
const previewTable = ref(null)
const keyword = ref('')
const uploading = ref(false)

const columns = [
  { title: '文件名称', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '来源', key: 'builtin', width: 90 },
  { title: '条目数', key: 'count', width: 90 },
  { title: '教室前缀', dataIndex: 'roomPrefix', width: 110 },
  { title: '状态', key: 'enabled', width: 100 },
  { title: '操作', key: 'action', width: 210 },
]

const entryColumns = [
  { title: '学季', dataIndex: 'season', width: 70 },
  { title: '课程编号', dataIndex: 'code', width: 100 },
  { title: '课程名称', dataIndex: 'name', width: 200 },
  { title: '教师', dataIndex: 'teacher', width: 90 },
  { title: '上课时间', dataIndex: 'timeText', width: 170 },
  { title: '教室', dataIndex: 'room', width: 110 },
  { title: '校区', dataIndex: 'campus', width: 70 },
  { title: '性质', dataIndex: 'nature', width: 110 },
  { title: '备注', dataIndex: 'remark', ellipsis: true },
]

const previewRows = computed(() => {
  const t = previewTable.value
  if (!t) return []
  const kw = keyword.value.trim()
  const list = t.entries || []
  if (!kw) return list
  return list.filter((e) => JSON.stringify(e).includes(kw))
})

async function beforeUpload(file) {
  if (!/\.(xls|xlsx)$/i.test(file.name)) {
    message.error('请上传 .xls / .xlsx 文件')
    return false
  }
  uploading.value = true
  try {
    const t = await loadElectiveTable(file)
    message.success(`已添加「${file.name}」，共 ${t.entries.length} 条课程安排`)
  } catch (e) {
    message.error(`解析失败：${e.message}`)
  } finally {
    uploading.value = false
  }
  return false
}

function openPreview(t) {
  previewTable.value = t
  keyword.value = ''
  previewOpen.value = true
}

function del(t) {
  Modal.confirm({
    title: `删除「${t.name}」？`,
    content: t.builtin ? '这是项目内置的文件，删除后可通过「恢复内置时间表」重新载入。' : '删除后该时间表不再参与补全。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk() {
      removeElectiveTable(t.id)
      message.success('已删除')
    },
  })
}
</script>

<template>
  <div>
    <div class="panel-card">
      <h3 class="section-title">选修课程时间表管理</h3>
      <p class="section-desc">
        软件学院（学院）的选修课往往不排进教务系统，课表里只写「具体上课时间、地点由学院通知」。
        这里维护学院官网发布的<b>完整课程安排表</b>，用来把课表中缺失的上课时间与教室补齐。
        项目已内置 <code>选修课程时间表/</code> 目录下的官方文件，你也可以上传自己的 xls / xlsx 进行补充或替换。
      </p>

      <a-space wrap style="margin-bottom: 12px">
        <a-upload :before-upload="beforeUpload" :show-upload-list="false" accept=".xls,.xlsx">
          <a-button type="primary" :loading="uploading">上传选修课程时间表</a-button>
        </a-upload>
        <a-button @click="restoreBuiltin">恢复内置时间表</a-button>
        <a-button @click="autoFill(); message.success('已重新匹配')">重新匹配补全</a-button>
        <a-checkbox v-model:checked="state.useRoomPrefix">地点拼接教室前缀</a-checkbox>
        <a-input
          v-model:value="state.roomSeparator"
          addon-before="前缀分隔符"
          style="width: 150px"
          :disabled="!state.useRoomPrefix"
        />
      </a-space>

      <a-table :columns="columns" :data-source="state.electiveTables" :pagination="false" size="small" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'builtin'">
            <a-tag :color="record.builtin ? 'gold' : 'blue'">{{ record.builtin ? '内置' : '上传' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'count'">
            {{ (record.entries || []).length }} 条
          </template>
          <template v-else-if="column.key === 'enabled'">
            <a-switch
              :checked="record.enabled !== false"
              size="small"
              checked-children="启用"
              un-checked-children="停用"
              @change="(v) => toggleElectiveTable(record.id, v)"
            />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space size="small">
              <a-button size="small" type="link" @click="openPreview(record)">预览</a-button>
              <a-button
                size="small"
                type="link"
                @click="toggleElectiveTable(record.id, record.enabled === false)"
              >
                {{ record.enabled === false ? '启用' : '停用' }}
              </a-button>
              <a-button size="small" type="link" danger @click="del(record)">删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>

      <a-alert
        v-if="!state.electiveTables.some((t) => t.enabled !== false)"
        type="warning"
        show-icon
        style="margin-top: 12px"
        message="当前没有启用任何选修课程时间表，课表中时间空缺的课程将无法自动补全。"
      />
    </div>

    <a-modal v-model:open="previewOpen" :title="`预览：${previewTable?.name || ''}`" width="1100px" :footer="null">
      <a-space style="margin-bottom: 10px" wrap>
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索课程 / 教师 / 时间 / 教室"
          style="width: 320px"
          allow-clear
        />
        <span style="color: #6b7a90; font-size: 12.5px">
          共 {{ previewRows.length }} / {{ (previewTable?.entries || []).length }} 条
        </span>
        <a-tag v-if="previewTable?.roomPrefix" color="blue">教室前缀：{{ previewTable.roomPrefix }}</a-tag>
      </a-space>
      <a-table
        :columns="entryColumns"
        :data-source="previewRows"
        size="small"
        row-key="id"
        :scroll="{ x: 1100, y: 480 }"
        :pagination="{ pageSize: 20, size: 'small' }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'room'">
            <span>{{ record.room || '—' }}</span>
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>
