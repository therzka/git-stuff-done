import { NextRequest, NextResponse } from "next/server";
import { assignCopilotToIssue } from "@/lib/github";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { owner, repo, issueNumber, targetRepo, model, instructions } = body;

    if (!owner || !repo || !issueNumber || !targetRepo) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: owner, repo, issueNumber, targetRepo" },
        { status: 400 },
      );
    }

    console.log(
      `[copilot-assign] Assigning Copilot to ${owner}/${repo}#${issueNumber} → ${targetRepo}`,
    );

    const result = await assignCopilotToIssue({
      owner,
      repo,
      issueNumber,
      targetRepo,
      model: model || "",
      instructions: instructions || "",
    });

    console.log(`[copilot-assign] Success for ${owner}/${repo}#${issueNumber}`);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[copilot-assign] Failed:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
