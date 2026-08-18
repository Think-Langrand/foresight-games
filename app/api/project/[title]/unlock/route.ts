import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getProjectBySlug } from "@/lib/projects";
import {
  cookieNameFor,
  signUnlock,
  verifyPassphrase,
  UNLOCK_MAX_AGE,
} from "@/lib/project-gate";

export const dynamic = "force-dynamic";

// Verify a project passphrase and, on success, set the httpOnly unlock cookie.
// The plaintext never touches the client bundle or the DB — only this handler
// sees it, and only to compare against the stored scrypt hash.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ title: string }> }
) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project || !project.passphraseHash) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: { passphrase?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const passphrase = typeof body.passphrase === "string" ? body.passphrase : "";

  if (!verifyPassphrase(passphrase, project.passphraseHash)) {
    return NextResponse.json({ error: "Incorrect passphrase." }, { status: 401 });
  }

  const store = await cookies();
  store.set(cookieNameFor(project.id), signUnlock(project.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // dev is http://localhost
    sameSite: "lax",
    path: `/project/${title}`, // per-project path scope, defense in depth
    maxAge: UNLOCK_MAX_AGE,
  });
  return NextResponse.json({ ok: true });
}
