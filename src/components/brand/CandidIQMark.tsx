type CandidIQMarkProps = {
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

/** Hexagonal CandidIQ icon mark — theme colors via CSS variables. */
export function CandidIQMark({ className, style, title = 'CandidIQ' }: CandidIQMarkProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 167 150"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      fill="currentColor"
    >
      <title>{title}</title>
      <circle cx="82.8" cy="74.6" r="22" fill="none" stroke="currentColor" strokeWidth="6" />
      <circle cx="51.6" cy="19.5" r="19.5" />
      <circle cx="114.8" cy="19.4" r="19.5" />
      <circle cx="146.5" cy="74.5" r="19.5" />
      <circle cx="114.8" cy="129.6" r="19.5" />
      <circle cx="51.7" cy="129.6" r="19.5" />
      <circle cx="19.3" cy="74.5" r="19.5" />
    </svg>
  );
}
