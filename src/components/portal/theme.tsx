import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import alenaLogoBlack from "@/assets/alena-logo-black.png.asset.json";
import alenaLogoWhite from "@/assets/alena-logo-white.png.asset.json";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const STORAGE_KEY = "alena-theme";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial: Theme =
      stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      return next;
    });
  }

  return { theme, toggle };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={className}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}

/** Logo que alterna automáticamente entre versión negra (claro) y blanca (oscuro). */
export function AlenaLogo({
  className,
  alt = "Alena - Informes",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <>
      <img src={alenaLogoBlack.url} alt={alt} className={cn(className, "dark:hidden")} />
      <img src={alenaLogoWhite.url} alt={alt} className={cn(className, "hidden dark:block")} />
    </>
  );
}
