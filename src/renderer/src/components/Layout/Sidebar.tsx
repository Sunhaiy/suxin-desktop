import { NavLink } from 'react-router-dom'
import { Music2, ListMusic, Terminal, Activity, Monitor, Settings } from 'lucide-react'

const topNav = [
  { to: '/music',      Icon: Music2,    label: '音乐' },
  { to: '/playlists',  Icon: ListMusic, label: '歌单' },
  { to: '/automation', Icon: Terminal,  label: '自动化' },
  { to: '/activity',   Icon: Activity,  label: '活动日志' },
  { to: '/wallpaper',  Icon: Monitor,   label: '壁纸' },
]

const bottomNav = [
  { to: '/settings', Icon: Settings, label: '设置' },
]

function NavItem({ to, Icon, label }: { to: string; Icon: React.ElementType; label: string }) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        [
          'group relative flex h-12 w-12 items-center justify-center rounded transition-colors duration-150',
          isActive ? 'text-accent' : 'text-secondaryLight hover:bg-primaryDark hover:text-secondary',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-accent" />}
          <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  return (
    <aside className="flex w-12 flex-col items-center justify-between border-r border-dividerLight bg-primary py-2 flex-shrink-0">
      <nav className="flex flex-col items-center gap-1">
        {topNav.map((item) => <NavItem key={item.to} {...item} />)}
      </nav>
      <nav className="flex flex-col items-center gap-1">
        {bottomNav.map((item) => <NavItem key={item.to} {...item} />)}
      </nav>
    </aside>
  )
}
