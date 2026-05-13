import Link from "next/link";

const navItems = [
  { label: "Home", icon: "H", href: "/" },
  { label: "Asset List", icon: "A", href: "/asset-list" },
  { label: "Holder List", icon: "L", href: "/holder-list" },
];

export function AppSidebar({ active }: { active: "home" | "asset-list" | "holder-list" }) {
  return (
    <aside className="hidden bg-[#061d3c] px-3 py-7 text-white shadow-2xl lg:flex lg:flex-col">
      <div className="mb-9 flex items-center gap-3 px-3">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-xl font-bold shadow-lg shadow-blue-950/30">PM</div>
        <div className="text-xl font-bold leading-tight">
          Portfolio
          <br />
          Manager
        </div>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const isActive = item.href.slice(1) === active || (item.href === "/" && active === "home");

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex h-12 items-center gap-3 rounded-lg px-4 text-sm font-medium transition ${
                isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-950/25" : "text-blue-50 hover:bg-white/10"
              }`}
            >
              <span className="grid w-5 place-items-center text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-white/20 font-semibold">A</div>
        <span className="text-sm font-medium">Admin User</span>
        <span className="ml-auto text-lg">v</span>
      </div>
    </aside>
  );
}
