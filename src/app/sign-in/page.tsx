import { redirect } from "next/navigation";
import { config } from "@/platform/config";
import { getActor } from "@/platform/session";
import { SignInView } from "@/features/access/ui/sign-in-view";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await getActor();
  if (actor?.hasAccess) redirect("/");
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  return <SignInView entra={!!config.entra} devLogin={config.devLogin} next={safeNext} />;
}
