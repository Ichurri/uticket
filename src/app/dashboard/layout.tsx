import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 lg:flex-row">
      <aside className="shrink-0 lg:w-52">
        <DashboardNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
