import { PageTransition } from "@/components/ui/page-transition";

export default function ShopTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageTransition>{children}</PageTransition>;
}
