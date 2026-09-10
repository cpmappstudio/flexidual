import Image from "next/image";

export function TeacherIcon({ label }: { label: string }) {
  return (
    <Image
      src="/professors-icon.svg"
      alt={label}
      title={label}
      width={16}
      height={16}
      className="inline-block size-4 shrink-0 align-text-bottom object-contain"
    />
  );
}
