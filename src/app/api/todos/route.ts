import { NextResponse } from "next/server";
import { readTodos, writeTodos, type TodoItem } from "@/lib/files";

export async function GET() {
  const todos = await readTodos();
  return NextResponse.json(todos);
}

export async function POST(req: Request) {
  const { title } = (await req.json()) as { title: string };
  if (!title || typeof title !== "string" || title.trim().length === 0 || title.length > 500) {
    return NextResponse.json({ error: "Invalid title" }, { status: 400 });
  }
  const todos = await readTodos();
  const item: TodoItem = {
    id: crypto.randomUUID(),
    title,
    done: false,
    source: "manual",
    createdAt: new Date().toISOString(),
  };
  todos.push(item);
  await writeTodos(todos);
  return NextResponse.json(todos);
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    reorder?: boolean;
    ids?: string[];
    id?: string;
    done?: boolean;
    title?: string;
    source?: "manual" | "suggested";
  };

  const todos = await readTodos();

  if (body.reorder && Array.isArray(body.ids)) {
    const idOrder = body.ids;
    const reordered = idOrder
      .map((id) => todos.find((t) => t.id === id))
      .filter((t): t is TodoItem => t !== undefined);
    // Append any todos not included in the reorder payload (safety net)
    const included = new Set(idOrder);
    const rest = todos.filter((t) => !included.has(t.id));
    await writeTodos([...reordered, ...rest]);
    return NextResponse.json([...reordered, ...rest]);
  }

  const { id, done, title, source } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const todo = todos.find((t) => t.id === id);
  if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (done !== undefined) todo.done = done;
  if (title !== undefined) todo.title = title;
  if (source !== undefined) todo.source = source;
  await writeTodos(todos);
  return NextResponse.json(todos);
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id: string };
  let todos = await readTodos();
  todos = todos.filter((t) => t.id !== id);
  await writeTodos(todos);
  return NextResponse.json(todos);
}
