import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import './styles/global.css'
import { loadLocal, saveLocal, ensureBuiltin } from './store.js'

ensureBuiltin()
loadLocal()

const app = createApp(App)
app.use(Antd)
app.mount('#app')

// 状态变化后延迟落盘，避免频繁写入
let timer = null
window.addEventListener('beforeunload', saveLocal)
app.config.globalProperties.$persist = () => {
  clearTimeout(timer)
  timer = setTimeout(saveLocal, 600)
}
