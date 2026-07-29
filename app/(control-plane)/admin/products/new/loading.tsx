import { Skeleton } from "@/components/ui/skeleton";
import { ProductFormSkeleton } from "@/components/control-plane/product-form-skeleton";

export default function NewProductLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-6">
        <ProductFormSkeleton />
      </div>
    </div>
  );
}
