export default function Footer() {
  return (
    <footer className="border-t border-ink/[0.06]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 text-sm text-mute sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold text-ink">Strawping</span> © 2026
        </p>
        <nav aria-label="Footer" className="flex gap-6">
          <a href="#shop" className="focus-ring rounded transition hover:text-ink">Shop</a>
          <a href="#categories" className="focus-ring rounded transition hover:text-ink">Categories</a>
          <a href="#about" className="focus-ring rounded transition hover:text-ink">About</a>
        </nav>
        <p>Pay on delivery</p>
      </div>
    </footer>
  );
}
