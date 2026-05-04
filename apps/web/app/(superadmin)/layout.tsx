import SidebarLayout from '@/app/_components/SidebarLayout'

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  return <SidebarLayout>{children}</SidebarLayout>
}
