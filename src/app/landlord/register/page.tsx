import { FlaskConicalIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { testWalletsAvailable } from "@/lib/lightning";
import { reviewerLogins } from "@/lib/reviewer";
import { RegisterForm } from "../forms";

export const metadata = { title: "Register as a landlord" };

export default function RegisterPage() {
  return (
    <div className="container-page max-w-3xl py-10 md:py-14">
      <p className="eyebrow">For landlords and agents</p>
      <h1 className="mt-3 text-[2.4rem] sm:text-[3rem]">List your property on Kodi</h1>
      <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-2">
        Kodi checks every landlord before their homes appear, so tenants can trust the badge. It usually takes a day.
        Already registered? <Link href="/landlord" className="font-semibold underline underline-offset-4">Sign in</Link>.
      </p>
      <div className="mt-10">
        <Suspense fallback={<div className="min-h-[60vh]" />}>
          <Form />
        </Suspense>
      </div>
    </div>
  );
}

async function Form() {
  await connection();
  const reviewer = reviewerLogins();
  return (
    <>
      {reviewer?.arbiterPassword && (
        <div className="mb-8 rounded-[20px] border border-amber/30 bg-amber-soft p-5">
          <p className="flex items-center gap-2 text-[0.82rem] font-semibold uppercase tracking-wide text-amber">
            <FlaskConicalIcon className="size-4" aria-hidden /> For reviewers · test network only
          </p>
          <p className="mt-2 text-[0.95rem] text-ink-2">
            Made-up details are fine here, and no email is sent. After you register, open the{" "}
            <Link href="/admin" className="font-semibold underline underline-offset-4">arbiter page</Link>, sign in with the
            reviewer password shown there and verify your account. Then sign in as your landlord and list a home.
          </p>
        </div>
      )}
      <RegisterForm testWallets={testWalletsAvailable()} />
    </>
  );
}
