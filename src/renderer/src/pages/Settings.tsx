import { useState, useEffect } from 'react'
import { LogIn, LogOut, Loader2 } from 'lucide-react'
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
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [version, setVersion]       = useState('')
  const [auth, setAuth]             = useState({ netease: false, qq: false })
  const [loading, setLoading]       = useState({ netease: false, qq: false })
  const toast = useToastStore()

  async function refresh() {
    const [status, al, ver] = await Promise.all([
      getAuthStatus(),
      window.electron?.app.getAutoLaunch(),
      window.electron?.app.version(),
    ])
    setAuth(status)
    setAutoLaunch(al ?? false)
    setVersion(ver ?? '')
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
