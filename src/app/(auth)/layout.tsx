import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-8">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 self-start text-lg font-extrabold">
        <Image src="/icon.svg" alt="" width={32} height={32} className="rounded-lg" /> Treatly
      </Link>
      {children}
    </main>
  );
}
