interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = "", width, height }: SkeletonProps) {
  return (
    <div
      className={`glass-skeleton ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function GameCardSkeleton() {
  return (
    <div className="glass-card p-0 overflow-hidden">
      <Skeleton className="w-full" height={200} />
      <div className="p-3 flex flex-col gap-2">
        <Skeleton height={16} className="w-3/4" />
        <Skeleton height={12} className="w-1/2" />
        <div className="flex gap-2 mt-1">
          <Skeleton height={20} width={60} />
          <Skeleton height={20} width={50} />
        </div>
      </div>
    </div>
  );
}

export function UserCardSkeleton() {
  return (
    <div className="glass-card p-5 flex flex-col items-center gap-3">
      <Skeleton className="rounded-full" width={64} height={64} />
      <Skeleton height={16} className="w-2/3" />
      <Skeleton height={12} className="w-1/2" />
    </div>
  );
}
