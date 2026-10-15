import { listPayees } from "@/lib/pipeline/payeeRisk";
import CheckForm from "./CheckForm";

// Server component: only payee ids and names reach the browser, never risk data.
export default function Home() {
  return <CheckForm payees={listPayees()} />;
}
