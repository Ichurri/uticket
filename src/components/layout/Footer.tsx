export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <p>© {new Date().getFullYear()} BoletaVIP. Todos los derechos reservados.</p>
        <p>Boletos digitales para tus eventos favoritos 🇧🇴</p>
      </div>
    </footer>
  );
}
