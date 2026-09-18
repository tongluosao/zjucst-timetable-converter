/**
 * 把「选修课程时间表」xls 预置成前端内置的 JSON，避免运行时依赖文件系统。
 * 用法：npm run gen:elective
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseElectiveFile } from '../src/lib/parseElective.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const srcDir = path.join(root, '选修课程时间表')

function shim(filePath) {
  const buf = fs.readFileSync(filePath)
  return {
    name: path.basename(filePath),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  }
}

async function main() {
  if (!fs.existsSync(srcDir)) throw new Error(`未找到目录：${srcDir}`)
  const files = fs.readdirSync(srcDir).filter((f) => /\.(xls|xlsx)$/i.test(f))
  if (!files.length) throw new Error('选修课程时间表目录下没有 xls/xlsx 文件')

  const tables = []
  for (const f of files) {
    const full = path.join(srcDir, f)
    const parsed = await parseElectiveFile(shim(full), f)
    tables.push({
      id: `builtin-${path.basename(f, path.extname(f)).slice(0, 24)}`,
      name: f,
      builtin: true,
      enabled: true,
      roomPrefix: parsed.roomPrefix,
      sheetName: parsed.sheetName,
      entries: parsed.entries,
    })
    console.log(`✔ ${f}  条目 ${parsed.entries.length}  教室前缀「${parsed.roomPrefix}」`)
  }

  const outDir = path.join(root, 'src', 'data')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'builtinElective.json'), JSON.stringify(tables, null, 2), 'utf8')

  // 同时复制一份到 public，方便用户从页面下载原始文件
  const pubDir = path.join(root, 'public', '选修课程时间表')
  fs.mkdirSync(pubDir, { recursive: true })
  for (const f of files) {
    fs.copyFileSync(path.join(srcDir, f), path.join(pubDir, f))
  }
  console.log('✔ 已生成 src/data/builtinElective.json 与 public/选修课程时间表/')
}

main().catch((e) => {
  console.error('✖ 生成失败：', e.message)
  process.exit(1)
})
