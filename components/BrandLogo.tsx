type BrandLogoProps = {
  kind: "team" | "league";
  name: string;
  className?: string;
};

export default function BrandLogo({ kind, name, className }: BrandLogoProps) {
  return (
    <img
      className={className || "brand-logo"}
      src={`/api/logo?kind=${kind}&name=${encodeURIComponent(name)}`}
      alt={`${name} ${kind} logo`}
      loading="lazy"
      decoding="async"
    />
  );
}
