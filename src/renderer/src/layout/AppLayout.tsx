import { useEffect } from 'react'
import { AppShell, NavLink, Stack, Text, Title } from '@mantine/core'
import { IconArrowsExchange, IconCalendarWeek, IconHome, IconSettings } from '@tabler/icons-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useDayRollover } from '../lib/useDayRollover'

interface Props {
  branchName: string
}

export function AppLayout({ branchName }: Props): React.JSX.Element {
  const { pathname } = useLocation()
  // 앱을 밤새 켜 둬도 자정이 지나면 홈 화면이 자동으로 갱신되게 한다
  useDayRollover()
  // 화면을 옮기면 맨 위부터 보이게 한다
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  const isHome = pathname === '/' || pathname.startsWith('/customers')
  return (
    <AppShell navbar={{ width: 200, breakpoint: 'xs' }} padding="lg">
      <AppShell.Navbar p="sm" bg="gray.0">
        <Stack gap={2} mb="md" px="xs" pt="xs">
          <Title order={4}>🎤 VOCAL CRM</Title>
          <Text size="xs" c="dimmed">
            {branchName}
          </Text>
        </Stack>
        <NavLink component={Link} to="/" label="홈" leftSection={<IconHome size={18} />} active={isHome} />
        <NavLink
          component={Link}
          to="/schedule"
          label="일정"
          leftSection={<IconCalendarWeek size={18} />}
          active={pathname === '/schedule'}
        />
        <NavLink
          component={Link}
          to="/transfer"
          label="가져오기·내보내기"
          leftSection={<IconArrowsExchange size={18} />}
          active={pathname === '/transfer'}
        />
        <NavLink
          component={Link}
          to="/settings"
          label="설정·백업"
          leftSection={<IconSettings size={18} />}
          active={pathname === '/settings'}
        />
      </AppShell.Navbar>
      <AppShell.Main bg="white">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
