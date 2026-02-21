import { redirect } from "next/navigation";

export default function IAMIndexPage() {
  redirect("/owner/iam/users");
}
