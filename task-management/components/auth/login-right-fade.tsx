"use client";

/**
 * Soft warm-red wash for the right-side form surface. Sits absolute behind the
 * form content; intentionally low-intensity so it doesn't compete with the
 * dramatic left half but keeps the off-white plane from feeling sterile.
 */
export function LoginRightFade() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[15%] -right-[10%] h-[50vw] w-[50vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(225, 6, 0, 0.08), rgba(225, 6, 0, 0) 70%)",
          filter: "blur(8px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[5%] -right-[20%] h-[45vw] w-[45vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(168, 85, 247, 0.06), rgba(168, 85, 247, 0) 70%)",
          filter: "blur(8px)",
        }}
      />
    </>
  );
}
