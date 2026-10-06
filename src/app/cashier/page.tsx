import { redirect } from "next/navigation";

/**
 * /cashier → redirect to the client-rendered New Order page.
 * The actual POS terminal lives at /cashier/new-order (fully client, works offline).
 */
export default function CashierIndexPage() {
  redirect("/cashier/new-order");
}
