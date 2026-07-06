export function PageSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary"
        role="status"
        aria-label="Cargando"
      />
    </div>
  );
}
