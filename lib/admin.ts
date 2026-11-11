import { findUserById, listUsers, log, ownerOf, saveUser, type User } from "./db";
import { parentMoved } from "./live";

/** The driver, if (and only if) they belong to this school admin. */
export async function ownDriver(admin: User, id: unknown): Promise<User | null> {
  if (typeof id !== "string") return null;
  const d = await findUserById(id);
  return d && d.role === "driver" && ownerOf(d) === admin.id ? d : null;
}

/** Move parents onto another driver, telling the parent and both drivers. Returns how many moved. */
export async function moveParents(admin: User, parents: User[], to: User): Promise<number> {
  let n = 0;
  await Promise.all(parents.map(async (p) => {
    if (p.driverId === to.id) return;
    const from = p.driverId ? await findUserById(p.driverId) : null;
    const next: User = { ...p, driverId: to.id };
    if ((await saveUser(next)) !== "ok") return;
    n++;
    await parentMoved(next, from, to);
  }));
  if (n) log(admin, "Reassigned stops", `${n} to bus ${to.busNo ?? "-"} (${to.name})`);
  return n;
}

export const parentsOf = (driverId: string) => listUsers({ roles: ["parent"], driverId });
