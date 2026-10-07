import { redirect } from "next/navigation";

/** The password change moved into the profile. */
export default function ChangePasswordPage() {
  redirect("/admin/profil");
}
