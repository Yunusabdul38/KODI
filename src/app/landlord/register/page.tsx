import Link from "next/link";
import { testWalletsAvailable } from "@/lib/lightning";
import { connection } from "next/server";
import { Suspense } from "react";
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
  return <RegisterForm testWallets={testWalletsAvailable()} />;
}
