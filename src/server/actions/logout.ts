"use server";

import { redirect } from "next/navigation";
import { clearSession } from "@/server/session";

export async function logout() {
  await clearSession();
  redirect("/");
}
