import { Skeleton } from "@/components/ui/skeleton";
import { RuleFormSkeleton } from "@/components/control-plane/rule-form-skeleton";

export default function EditRuleLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-56" />
      <div className="mt-6">
        <RuleFormSkeleton />
      </div>
    </div>
  );
}
