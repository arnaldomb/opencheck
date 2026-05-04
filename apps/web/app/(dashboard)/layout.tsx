import SidebarLayout from '@/app/_components/SidebarLayout'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <SidebarLayout>{children}</SidebarLayout>
}
