import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AdminClient from "./client";

export default async function Page() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role !== "admin") redirect(`/${u.role}`);
  return <AdminClient name={u.name} />;
}
