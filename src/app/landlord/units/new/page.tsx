import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { currentLandlord } from "@/lib/auth";
import { testWalletsAvailable } from "@/lib/lightning";
import { UnitForm } from "../../forms";

export const metadata = { title: "List a home", robots: { index: false } };

export default function NewUnitPage() {
  return (
    <div className="container-page max-w-3xl py-10 md:py-14">
      <Link href="/landlord" className="text-[0.92rem] text-ink-3 hover:text-ink">← Dashboard</Link>
      <h1 className="mt-4 text-[2.3rem] sm:text-[2.8rem]">List a home</h1>
      <p className="mt-3 text-[1.02rem] text-ink-2">
        It gets a Kodi code that tenants can check. While a tenant&apos;s deposit is held on it, nobody else can pay for it.
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
  const l = await currentLandlord();
  if (!l?.verified) redirect("/landlord");
  return <UnitForm testWallets={testWalletsAvailable()} />;
}
