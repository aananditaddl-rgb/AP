import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/profile-form";
import { requireViewer } from "@/lib/data";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const viewer = await requireViewer();
  return (
    <>
      <PageHeader title="Edit profile" back="/profile" subtitle="Only the basics — nothing more." />
      <ProfileForm profile={viewer.profile} />
    </>
  );
}
