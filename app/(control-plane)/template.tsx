import { PageTransition } from "@/components/ui/page-transition";

export default function ControlPlaneTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageTransition>{children}</PageTransition>;
}
