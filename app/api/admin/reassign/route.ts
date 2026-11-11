import { requireRole } from "@/lib/auth";
import { moveParents, ownDriver, parentsOf } from "@/lib/admin";

// Move every stop from one driver to another, for example when a driver is absent today.
export async function POST(req: Request) {
  const a = await requireRole("admin");
  if (!a) return Response.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const [from, to] = await Promise.all([ownDriver(a, b.from), ownDriver(a, b.to)]);
  if (!from || !to || from.id === to.id) return Response.json({ error: "Choose two different drivers from your school" }, { status: 400 });
  const moved = await moveParents(a, await parentsOf(from.id), to);
  return Response.json({ moved });
}
