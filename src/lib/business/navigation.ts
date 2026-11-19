export const ownerNavigation = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/route", label: "Route", icon: "route" },
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/more", label: "More", icon: "more" },
] as const;
export const technicianNavigation = [
  { href: "/stops", label: "Today", icon: "route" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/more", label: "More", icon: "more" },
] as const;
export function navigationFor(role: string) {
  return role === "technician"
    ? technicianNavigation
    : ownerNavigation;
}
export function navigationActive(path: string, href: string, tech: boolean) {
  if (href === "/") return path === "/";
  if (tech && href === "/stops")
    return (
      path === "/" ||
      ["/stops", "/service", "/visit"].some(
        (p) => path === p || path.startsWith(p + "/"),
      )
    );
  if (href === "/more")
    return [
      "/more",
      ...(!tech ? ["/team"] : []),
      "/maps",
      "/reports",
      "/issues",
      "/settings",
      "/finance",
      "/legacy",
      ...(!tech ? ["/history"] : []),
    ].some((p) => path === p || path.startsWith(p + "/"));
  if (href === "/route")
    return path === "/route" || path === "/stops" || path.startsWith("/visit/");
  return path === href || path.startsWith(href + "/");
}
