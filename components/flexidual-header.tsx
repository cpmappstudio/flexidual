import Image from "next/image";

interface FlexidualHeaderProps {
  title: string;
  subtitle: string;
  logoUrl?: string;
}

const FlexidualHeader = ({ title, subtitle, logoUrl }: FlexidualHeaderProps) => {
  return (
    <header className="flex items-center gap-4 px-4 sm:px-6 border-b border-border">
      <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden relative mb-4">
        <Image
          src={logoUrl || "/flexidual-icon.png"}
          alt="Flexidual Logo"
          fill
          className="object-contain p-1.5"
        />
      </div>
      <div className="border-l border-border pl-6">
        <h1 className="font-bold text-3xl text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>
      </div>
    </header>
  );
};
export default FlexidualHeader;