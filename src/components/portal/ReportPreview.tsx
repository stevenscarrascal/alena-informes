import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText } from "lucide-react";

import { createPreviewTokens } from "@/lib/portal.functions";
import { cn } from "@/lib/utils";

/** Obtiene enlaces temporales para renderizar miniaturas de varias versiones. */
export function usePreviewUrls(versionIds: (string | null | undefined)[]) {
  const fetchTokens = useServerFn(createPreviewTokens);
  const ids = Array.from(new Set(versionIds.filter((id): id is string => Boolean(id)))).sort();
  return useQuery({
    queryKey: ["preview-tokens", ids],
    enabled: ids.length > 0,
    staleTime: 1000 * 60 * 60,
    queryFn: () => fetchTokens({ data: { versionIds: ids } }),
  });
}

/** Miniatura no interactiva del HTML del informe. */
export function ReportPreview({
  url,
  title,
  className,
  scale = 0.28,
}: {
  url?: string | undefined;
  title: string;
  className?: string;
  scale?: number;
}) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-lg border border-border bg-white", className)}
    >
      {url ? (
        <>
          <iframe
            src={url}
            title={`Vista previa de ${title}`}
            tabIndex={-1}
            loading="lazy"
            aria-hidden="true"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="pointer-events-none origin-top-left border-0 bg-white"
            style={{
              width: `${100 / scale}%`,
              height: `${100 / scale}%`,
              transform: `scale(${scale})`,
            }}
          />
          <span className="absolute inset-0" />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/40">
          <FileText className="size-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
