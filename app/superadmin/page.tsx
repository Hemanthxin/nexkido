import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import SuperClient from "./client";

export default async function Page() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role !== "superadmin") redirect(`/${u.role}`);
  return <SuperClient name={u.name} />;
}
