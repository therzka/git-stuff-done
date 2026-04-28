import { GitPullRequest } from "lucide-react";
import type { ReactNode } from "react";

type ReferencePillTone = "neutral" | "open" | "merged" | "closed";

const baseClasses =
  "inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold leading-none whitespace-nowrap";

const toneClasses: Record<ReferencePillTone, string> = {
  neutral: "bg-secondary text-muted-foreground",
  open: "bg-[rgb(31,136,61)] text-white",
  merged: "bg-[#8250DF] text-white",
  closed: "bg-secondary text-muted-foreground",
};

type ReferencePillProps = {
  label: string;
  tone?: ReferencePillTone;
  href?: string;
  title?: string;
  className?: string;
  icon?: ReactNode;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
};

export function ReferencePill({
  label,
  tone = "neutral",
  href,
  title,
  className = "",
  icon,
  onClick,
}: ReferencePillProps) {
  const classes = `${baseClasses} ${toneClasses[tone]} ${className}`.trim();
  const content = (
    <>
      {icon}
      <span>{label}</span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        onClick={onClick}
        className={`${classes} transition-opacity hover:opacity-80`}
      >
        {content}
      </a>
    );
  }

  return (
    <span title={title} className={classes}>
      {content}
    </span>
  );
}

export function PullRequestReferencePill({
  label,
  tone,
  href,
  title,
  className,
  onClick,
}: Omit<ReferencePillProps, "icon">) {
  return (
    <ReferencePill
      label={label}
      tone={tone}
      href={href}
      title={title}
      className={className}
      onClick={onClick}
      icon={
        <GitPullRequest className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      }
    />
  );
}
