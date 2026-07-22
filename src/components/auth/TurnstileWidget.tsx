"use client";

import { Turnstile } from "@marsidev/react-turnstile";

export function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const siteKey =
    (typeof process !== "undefined" &&
      (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY as string)) ||
    "";

  if (!siteKey) return null;

  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={onToken}
      onError={() => onToken(null)}
      onExpire={() => onToken(null)}
      options={{
        theme: "dark",
      }}
    />
  );
}
