import { Center, Loader, MantineProvider } from '@mantine/core'
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
import { theme } from './theme'

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: notifyError }),
  mutationCache: new MutationCache({ onError: notifyError }),
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } }
})

function Root(): React.JSX.Element {
  const settings = useSettings()
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
            <Notifications position="bottom-right" />
            <HashRouter>
              <Root />
            </HashRouter>
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  )
}
