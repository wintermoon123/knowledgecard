import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { hunyuanApiPlugin } from './plugins/hunyuanApi.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['HUNYUAN_'])

  return {
    base: '/knowledgecard/',
    plugins: [react(), hunyuanApiPlugin(env)],
    server: {
      host: '0.0.0.0',
      port: 5180,
    },
  }
})
