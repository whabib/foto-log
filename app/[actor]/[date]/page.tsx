import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MemberPage, { formatDay } from "@/app/components/MemberPage";
import { loadMemberPage } from "@/lib/member-page-data";
import { imageUrl } from "@/lib/photos/urls";

type Props = { params: Promise<{ actor: string; date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { actor, date } = await params;
  const data = await loadMemberPage(actor, date);
  if (!data?.photo) return { title: "Photo not found · foto-log" };
  const { owner, look, photo } = data;
  return {
    title: `${look.title} · ${formatDay(photo.record.displayDate)} · foto-log`,
    description: photo.record.caption,
    openGraph: { images: [imageUrl(owner.did, photo.record.image.ref.toString())] },
  };
}

/** One day's photo, in the member page layout. */
export default async function PhotoPage({ params }: Props) {
  const { actor, date } = await params;
  const data = await loadMemberPage(actor, date);
  if (!data?.photo) notFound();
  return <MemberPage {...data} />;
}
