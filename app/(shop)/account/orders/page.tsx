import { redirect } from "next/navigation";

/**
 * Comenzile au o singura pagina canonica, `/orders`, care functioneaza si in
 * regim guest. Ruta veche rămâne ca redirect, pentru linkurile deja salvate.
 */
export default function AccountOrdersPage() {
  redirect("/orders");
}
