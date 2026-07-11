import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { DailyFlowProvider } from "@/components/daily-flow/DailyFlowProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <DailyFlowProvider>
        <div className="flex min-h-screen bg-gray-50">
          <Sidebar />
          <main className="flex-1 ml-56 p-8 overflow-auto">{children}</main>
        </div>
      </DailyFlowProvider>
    </AuthGuard>
  );
}
