export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="text-6xl font-bold tracking-tighter opacity-20">404</span>
      <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
      <a href="/patients" className="text-sm font-medium underline underline-offset-4 hover:opacity-70 transition-opacity">
        Go home
      </a>
    </div>
  );
}
