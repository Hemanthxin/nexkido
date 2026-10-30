import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import DriverClient from "./client";

export default async function Page() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role !== "driver") redirect(`/${u.role}`);
  return <DriverClient name={u.name} busNo={u.busNo} />;
}
