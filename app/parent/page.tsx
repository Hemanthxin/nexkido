import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ParentClient from "./client";

export default async function Page() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role !== "parent") redirect(`/${u.role}`);
  return <ParentClient name={u.name} />;
}
