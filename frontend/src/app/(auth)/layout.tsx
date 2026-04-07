import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — car image (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[60%] relative">
        <Image
          src="/images/formula_sae_main.avif"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="60vw"
        />
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/25" />
        {/* Racing accent line — bold, glowing */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-racing shadow-[0_-4px_16px_hsl(var(--racing)/0.4)]" />
        {/* Branding overlay text */}
        <div className="relative z-10 flex flex-col justify-end p-10 text-white">
          <Image
            src="/images/fsae_logo.jpg"
            alt="SCR Racing"
            width={56}
            height={56}
            className="rounded-xl ring-2 ring-racing/40 shadow-lg shadow-racing/20 mb-4"
          />
          <h1 className="font-heading text-5xl font-extrabold uppercase tracking-wide">SCR Racing</h1>
          <p className="mt-2 text-lg text-white/70">
            Engineering speed. Driving innovation.
          </p>
        </div>
      </div>

      {/* Right panel — login card */}
      <div className="flex w-full lg:w-[40%] items-center justify-center bg-background">
        {/* Mobile-only background image */}
        <div className="fixed inset-0 lg:hidden">
          <Image
            src="/images/formula_sae_main.avif"
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        </div>
        <div className="relative z-10 w-full px-4">{children}</div>
      </div>
    </div>
  );
}
