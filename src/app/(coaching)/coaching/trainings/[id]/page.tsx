import { redirect } from "next/navigation";

export default function TrainingRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/coaching/trainings/${params.id}/edit`);
}
