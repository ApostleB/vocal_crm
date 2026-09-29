import { Button, Center, Loader, MantineProvider, Stack, Text } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Route, Routes } from 'react-router'
import { useSettings } from './api/hooks'
import { AppLayout } from './layout/AppLayout'
import { notifyError } from './lib/notify'
import { AppModalsProvider } from './modals/AppModals'
import { CustomerDetailPage } from './pages/CustomerDetailPage'
import { HomePage } from './pages/HomePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { SchedulePage } from './pages/SchedulePage'
import { SettingsPage } from './pages/SettingsPage'
import { TransferPage } from './pages/TransferPage'
import { theme } from './theme'

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: notifyError }),
  mutationCache: new MutationCache({ onError: notifyError }),
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } }
})

function Root(): React.JSX.Element {
  const settings = useSettings()
  // 저장할 때마다 모든 조회를 다시 불러온다 (useApiMutation). 이미 화면이 떠 있는데 그 재조회 한 번이
  // 실패했다고 전체 화면을 오류로 바꾸면 안 된다 - 데이터가 있으면 그 화면을 그대로 보여준다
  if (settings.isError && !settings.data) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="sm">
          <Text>데이터를 불러오지 못했습니다.</Text>
          <Button variant="light" onClick={() => void settings.refetch()} loading={settings.isFetching}>
            다시 시도
          </Button>
        </Stack>
      </Center>
    )
  }
  if (!settings.data) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }
  if (!settings.data.branchName) return <OnboardingPage />
  return (
    <AppModalsProvider>
      <Routes>
        <Route element={<AppLayout branchName={settings.data.branchName} />}>
          <Route index element={<HomePage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AppModalsProvider>
  )
}

export function App(): React.JSX.Element {
  return (
    <MantineProvider theme={theme}>
      <DatesProvider settings={{ locale: 'ko', firstDayOfWeek: 1 }}>
        <QueryClientProvider client={queryClient}>
          <ModalsProvider labels={{ confirm: '확인', cancel: '취소' }}>
            <Notifications position="bottom-right" limit={3} />
            <HashRouter>
              <Root />
            </HashRouter>
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  )
}
