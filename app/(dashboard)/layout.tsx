'use client';

import { SidebarProvider, useSidebar } from '@/components/SidebarContext';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div style={{ minHeight: '100vh' }}>
      <Sidebar />
      <div
        style={{
          marginLeft: collapsed ? 0 : 'calc(var(--sidebar-w) + var(--rail-gap) * 2)',
          padding: '0 var(--main-padding) var(--main-padding)',
          transition: 'margin-left 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
          minWidth: 0,
        }}
      >
        <Header />
        <main style={{ minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}
