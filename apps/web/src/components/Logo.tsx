type Props = { className?: string; withWordmark?: boolean; size?: number };

export function Logo({ className, withWordmark = true, size = 28 }: Props) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <img
        src="/logo.png"
        alt="Anact Ortho"
        width={size}
        height={size}
        className="shrink-0 rounded-lg ring-1 ring-white/10"
        style={{ width: size, height: size }}
      />
      {withWordmark ? (
        <span className="font-brand text-lg tracking-wide text-court-neon">
          Anact <span className="text-court-accent2">Ortho</span>
        </span>
      ) : null}
    </div>
  );
}
