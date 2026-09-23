import { redirect } from "next/navigation";

export default async function EditInterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/interviews/${id}/edit/sessions`);
}
