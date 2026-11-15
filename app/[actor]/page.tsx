import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MemberPage from "@/app/components/MemberPage";
import { loadMemberPage } from "@/lib/member-page-data";
import { imageUrl } from "@/lib/photos/urls";

type Props = { params: Promise<{ actor: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { actor } = await params;
  const data = await loadMemberPage(actor);
  if (!data) return { title: "Member not found · foto-log" };
  const { owner, look, photo } = data;
  return {
    title: `${look.title} · foto-log`,
    description: photo?.record.caption,
    openGraph: photo ? { images: [imageUrl(owner.did, photo.record.image.ref.toString())] } : undefined,
  };
}

/** A member's member page: their newest photo, with their recent photos beside it. */
export default async function MemberHomePage({ params }: Props) {
  const { actor } = await params;
  const data = await loadMemberPage(actor);
  if (!data) notFound();
  return <MemberPage {...data} />;
}
