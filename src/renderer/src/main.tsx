import './styles/index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ScreenshotEditor from './pages/ScreenshotEditor'

// 截图标注覆盖层通过 ?sxeditor=1 打开
const isEditorMode = new URLSearchParams(window.location.search).get('sxeditor') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isEditorMode ? (
      <ScreenshotEditor />
    ) : (
      <HashRouter>
        <App />
      </HashRouter>
    )}
  </React.StrictMode>,
)
