import { eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { repository, runRequest, workflowFamily, workflowRun, workflowVersion } from "@/platform/db/schema";

export async function loadRunContext(runRequestId: string) {
  const [row] = await db
    .select({ rr: runRequest, family: workflowFamily, repo: repository, version: workflowVersion })
    .from(runRequest)
    .innerJoin(workflowFamily, eq(runRequest.familyId, workflowFamily.id))
    .innerJoin(repository, eq(workflowFamily.repositoryId, repository.id))
    .leftJoin(workflowVersion, eq(runRequest.versionId, workflowVersion.id))
    .where(eq(runRequest.id, runRequestId));
  if (!row) return null;
  const [run] = await db.select().from(workflowRun).where(eq(workflowRun.runRequestId, runRequestId));
  return { ...row, run: run ?? null };
}
