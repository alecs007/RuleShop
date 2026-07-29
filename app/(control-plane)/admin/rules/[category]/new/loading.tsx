import { Skeleton } from "@/components/ui/skeleton";
import { RuleFormSkeleton } from "@/components/control-plane/rule-form-skeleton";

export default function NewRuleLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-2 h-4 w-40" />
      <div className="mt-6">
        <RuleFormSkeleton />
      </div>
    </div>
  );
}
