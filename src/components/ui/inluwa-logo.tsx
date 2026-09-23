import Image from "next/image";

interface InluwaLogoProps {
  size?: number;
  className?: string;
}

export function InluwaLogo({ size = 32, className }: InluwaLogoProps) {
  // Use a cache-busting query parameter so the browser drops the old Kimiyi logo
  return (
    <>
      <img 
        src="/logo.png?v=2" 
        alt="Logo" 
        style={{ height: size * 2.5, width: "auto" }}
        className={`object-contain dark:hidden ${className || ""}`}
      />
      <img 
        src="/logo-dark.png?v=2" 
        alt="Logo Dark" 
        style={{ height: size * 2.5, width: "auto" }}
        className={`object-contain hidden dark:block ${className || ""}`}
      />
    </>
  );
}
