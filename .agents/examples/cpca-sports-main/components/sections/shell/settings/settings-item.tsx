import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Divider } from "@/components/ui/divider";

export default function SettingsItem({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <Heading className="m-0">{title}</Heading>
        <Divider className="mt-2 mb-3" />
        <Text>{description}</Text>
      </div>
      {children}
    </section>
  );
}
