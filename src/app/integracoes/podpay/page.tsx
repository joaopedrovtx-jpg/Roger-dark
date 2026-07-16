import { redirect } from "next/navigation";

/** PodPay é só do admin (Adquirentes). Seller usa Integrações → API. */
export default function PodPayPage() {
  redirect("/integracoes");
}
