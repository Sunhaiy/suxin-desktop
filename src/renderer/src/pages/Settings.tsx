import { useState, useEffect } from 'react'
import { LogIn, LogOut, Loader2, FolderOpen, Copy, Check } from 'lucide-react'
import { getAuthStatus, loginNetease, logoutNetease, loginQQ, logoutQQ } from '../api/music'
import { useToastStore } from '../store/toast'

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between border-b border-dividerLight py-3">
      <div>
        <p className="text-body font-medium text-secondaryDark">{label}</p>
        {description && <p className="text-tiny text-secondary opacity-70 mt-0.5">{description}</p>}
      </div>
      <div className="ml-4 flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={['relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
        value ? 'bg-accent' : 'bg-dividerDark'].join(' ')}
    >
      <span className={['inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200',
        value ? 'translate-x-[18px]' : 'translate-x-0.5'].join(' ')} />
    </button>
  )
}

function PlatformRow({
  label, description, loggedIn, loading,
  onLogin, onLogout,
}: {
  label: string; description: string; loggedIn: boolean; loading: boolean
  onLogin: () => void; onLogout: () => void
}) {
  return (
    <SettingRow
      label={label}
      description={loggedIn ? `已登录 · ${description}` : description}
    >
      {loggedIn ? (
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded px-2.5 py-1 text-tiny text-secondary hover:bg-primaryDark transition-colors"
        >
          <LogOut size={12} /> 退出
        </button>
      ) : (
        <button
          onClick={onLogin}
          disabled={loading}
          className="flex items-center gap-1.5 rounded px-2.5 py-1 text-tiny text-accent hover:bg-primaryDark disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
          网页登录
        </button>
      )}
    </SettingRow>
  )
}

export default function Settings() {
  const [autoLaunch,    setAutoLaunch]    = useState(false)
  const [version,       setVersion]       = useState('')
  const [auth,          setAuth]          = useState({ netease: false, qq: false })
  const [loading,       setLoading]       = useState({ netease: false, qq: false })
  const [navPort,       setNavPort]       = useState(9900)
  const [navPortInput,  setNavPortInput]  = useState('9900')
  const [navUrl,        setNavUrl]        = useState('http://localhost:9900')
  const [navPortBusy,   setNavPortBusy]   = useState(false)
  const [copied,        setCopied]        = useState(false)
  const [activityDir,   setActivityDir]   = useState('')
  const toast = useToastStore()

  async function refresh() {
    const [status, al, ver, port, url, trackingDir] = await Promise.all([
      getAuthStatus(),
      window.electron?.app.getAutoLaunch(),
      window.electron?.app.version(),
      window.electron.invoke<number>('nav:getPort'),
      window.electron.invoke<string>('nav:getUrl'),
      window.electron.invoke<string>('activity:getDataDir'),
    ])
    setAuth(status)
    setAutoLaunch(al ?? false)
    setVersion(ver ?? '')
    if (port)  { setNavPort(port);  setNavPortInput(String(port)) }
    if (url)   setNavUrl(url)
    if (trackingDir) setActivityDir(trackingDir)
  }

  useEffect(() => { refresh() }, [])

  async function handleAutoLaunch(v: boolean) {
    await window.electron?.app.setAutoLaunch(v)
    setAutoLaunch(v)
  }

  async function handleLogin(platform: 'netease' | 'qq') {
    setLoading((l) => ({ ...l, [platform]: true }))
    const fn = platform === 'netease' ? loginNetease : loginQQ
    const ok = await fn()
    setLoading((l) => ({ ...l, [platform]: false }))
    if (ok) {
      setAuth((a) => ({ ...a, [platform]: true }))
      toast.show(`${platform === 'netease' ? '网易云音乐' : 'QQ 音乐'}登录成功！`, 'success')
    } else {
      toast.show('登录取消或失败', 'info')
    }
  }

  async function handleApplyPort() {
    const p = parseInt(navPortInput, 10)
    if (isNaN(p) || p < 1024 || p > 65535) {
      toast.show('端口需在 1024 – 65535 之间', 'error'); return
    }
    if (p === navPort) return
    setNavPortBusy(true)
    try {
      const newUrl = await window.electron.invoke<string>('nav:setPort', p)
      setNavPort(p)
      setNavUrl(newUrl)
      toast.show(`导航页已切换至 ${newUrl}`, 'success')
    } catch {
      toast.show('端口切换失败，可能已被占用', 'error')
      setNavPortInput(String(navPort))
    }
    setNavPortBusy(false)
  }

  function copyNavUrl() {
    navigator.clipboard.writeText(navUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleLogout(platform: 'netease' | 'qq') {
    const fn = platform === 'netease' ? logoutNetease : logoutQQ
    await fn()
    setAuth((a) => ({ ...a, [platform]: false }))
    toast.show('已退出登录')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-dividerLight px-4 py-2.5">
        <span className="text-body font-medium text-secondaryDark">设置</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 通用 */}
        <section className="px-4 pt-4">
          <p className="mb-2 text-tiny font-semibold uppercase tracking-wider text-secondaryLight">通用</p>
          <SettingRow label="开机自启" description="系统启动时自动在后台运行">
            <Toggle value={autoLaunch} onChange={handleAutoLaunch} />
          </SettingRow>
          <SettingRow label="活动记录目录" description={activityDir || '软件目录下的 activity 文件夹'}>
            <button
              onClick={() => window.electron.invoke('activity:openDataDir')}
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-tiny text-secondary transition-colors hover:bg-primaryDark hover:text-secondaryDark"
            >
              <FolderOpen size={12} /> 打开
            </button>
          </SettingRow>
        </section>

        {/* 导航页 */}
        <section className="px-4 pt-4">
          <p className="mb-1 text-tiny font-semibold uppercase tracking-wider text-secondaryLight">导航页</p>
          <p className="mb-3 text-tiny text-secondary opacity-60">
            本地 HTTP 服务，可将浏览器主页设置为此地址。修改 userData/nav/index.html 自定义内容。
          </p>

          <SettingRow label="端口">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={navPortInput}
                min={1024}
                max={65535}
                onChange={e => setNavPortInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleApplyPort()}
                className="w-20 rounded border border-dividerLight bg-primaryDark px-2 py-1 text-center font-mono text-tiny text-secondaryDark outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={handleApplyPort}
                disabled={navPortBusy || navPortInput === String(navPort)}
                className="rounded px-2.5 py-1 text-tiny text-accent transition-colors hover:bg-primaryDark disabled:opacity-40"
              >
                {navPortBusy ? '切换中…' : '应用'}
              </button>
            </div>
          </SettingRow>

          <SettingRow label="访问地址">
            <div className="flex items-center gap-2">
              <span className="font-mono text-tiny text-secondary">{navUrl}</span>
              <button
                onClick={copyNavUrl}
                title="复制地址"
                className="flex items-center gap-1 rounded px-2 py-1 text-tiny transition-colors hover:bg-primaryDark"
              >
                {copied
                  ? <><Check size={12} className="text-accent" /><span className="text-accent">已复制</span></>
                  : <><Copy size={12} className="text-secondary" /><span className="text-secondary">复制</span></>}
              </button>
            </div>
          </SettingRow>

          <SettingRow label="文件目录" description="打开存放页面文件的文件夹">
            <button
              onClick={() => window.electron.invoke('nav:openDir')}
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-tiny text-secondary transition-colors hover:bg-primaryDark hover:text-secondaryDark"
            >
              <FolderOpen size={12} /> 打开
            </button>
          </SettingRow>
        </section>

        {/* 账号 */}
        <section className="px-4 pt-4">
          <p className="mb-1 text-tiny font-semibold uppercase tracking-wider text-secondaryLight">账号</p>
          <p className="mb-3 text-tiny text-secondary opacity-60">
            登录后可播放更多付费音乐。点击"网页登录"会打开独立浏览器窗口，在里面完成登录即可自动识别。
          </p>

          <PlatformRow
            label="网易云音乐"
            description="可播放 VIP 歌曲"
            loggedIn={auth.netease}
            loading={loading.netease}
            onLogin={() => handleLogin('netease')}
            onLogout={() => handleLogout('netease')}
          />

          <PlatformRow
            label="QQ 音乐"
            description="可播放绿钻歌曲"
            loggedIn={auth.qq}
            loading={loading.qq}
            onLogin={() => handleLogin('qq')}
            onLogout={() => handleLogout('qq')}
          />
        </section>

        {/* 关于 */}
        <section className="px-4 pt-4 pb-4">
          <p className="mb-2 text-tiny font-semibold uppercase tracking-wider text-secondaryLight">关于</p>
          <SettingRow label="版本">
            <span className="font-mono text-tiny text-secondary">{version || '—'}</span>
          </SettingRow>
        </section>
      </div>
    </div>
  )
}
