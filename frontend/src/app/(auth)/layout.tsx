export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — car image (hidden on mobile) */}
      <div
        className="hidden lg:flex lg:w-[60%] relative bg-cover bg-center"
        style={{ backgroundImage: "url('/images/formula_sae_main.avif')" }}
      >
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        {/* Branding overlay text */}
        <div className="relative z-10 flex flex-col justify-end p-10 text-white">
          <h1 className="text-4xl font-bold tracking-tight">SCR Racing</h1>
          <p className="mt-2 text-lg text-white/80">
            Engineering speed. Driving innovation.
          </p>
        </div>
      </div>

      {/* Right panel — login card */}
      <div className="flex w-full lg:w-[40%] items-center justify-center bg-background">
        {/* Mobile-only background image */}
        <div
          className="fixed inset-0 bg-cover bg-center lg:hidden"
          style={{ backgroundImage: "url('/images/formula_sae_main.avif')" }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        </div>
        <div className="relative z-10 w-full px-4">{children}</div>
      </div>
    </div>
  );
}
