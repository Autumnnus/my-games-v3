interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
}

export function PageContainer({
  children,
  className = "",
  narrow = false,
}: PageContainerProps) {
  return (
    <main
      className={`mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 ${narrow ? "max-w-2xl" : "max-w-7xl"} ${className}`}
    >
      {children}
    </main>
  );
}
