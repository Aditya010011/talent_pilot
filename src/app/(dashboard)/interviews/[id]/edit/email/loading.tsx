import { Skeleton } from "@/components/ui/skeleton";

export default function EmailTabLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="h-[500px]" />
      <Skeleton className="h-[500px]" />
    </div>
  );
}
