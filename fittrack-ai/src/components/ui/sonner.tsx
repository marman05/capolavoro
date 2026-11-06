"use client";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      position="top-center"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: "!rounded-2xl" } }}
      {...props}
    />
  );
}
export { Toaster };
