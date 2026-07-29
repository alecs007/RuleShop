import { Skeleton } from "@/components/ui/skeleton";
import { ProductFormSkeleton } from "@/components/control-plane/product-form-skeleton";

export default function EditProductLoading() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="mt-6">
        <ProductFormSkeleton />
      </div>
    </div>
  );
}
