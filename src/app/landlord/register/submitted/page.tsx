import { CheckCircle2Icon, Clock3Icon } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Registration received" };

export default function SubmittedPage() {
  return (
    <div className="container-page max-w-2xl py-16">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-green-soft text-green">
        <CheckCircle2Icon className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-[2.3rem]">Thanks. Kodi is checking your details.</h1>
      <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-2">
        We check your ID and call the phone number you gave us. Once you&apos;re verified you can list homes and take
        deposits. To follow the review, sign in with your email and password.
      </p>
      <ol className="mt-8 space-y-3 rounded-[24px] border border-line bg-card p-6 text-[0.97rem]">
        <li className="flex gap-3"><CheckCircle2Icon className="size-5 shrink-0 text-green" /> Registration received</li>
        <li className="flex gap-3"><Clock3Icon className="size-5 shrink-0 text-amber" /> ID and phone check</li>
        <li className="flex gap-3 text-ink-3"><span className="size-5 shrink-0 rounded-full border-2 border-line-2" /> List your homes</li>
      </ol>
      <Link href="/landlord" className="btn btn-primary mt-8">Sign in to follow the review</Link>
    </div>
  );
}
