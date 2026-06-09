import { Loader } from "@/components/ui/loader";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center">
      <div className="rounded-full border border-slate-200 bg-white/95 px-5 py-3 shadow-sm">
          <Loader label="Loading page..." size="lg" center />
      </div>
    </div>
  );
}
