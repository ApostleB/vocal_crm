import { useEffect } from 'react'
import { AppShell, NavLink, Stack, Text, Title } from '@mantine/core'
import { IconCalendarWeek, IconHome, IconSettings } from '@tabler/icons-react'
import { Link, Outlet, useLocation } from 'react-router'

interface Props {
  branchName: string
}

export function AppLayout({ branchName }: Props): React.JSX.Element {
  const { pathname } = useLocation()
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
          to="/settings"
          label="설정"
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
