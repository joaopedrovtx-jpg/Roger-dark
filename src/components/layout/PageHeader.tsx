import { UserMenu } from "./UserMenu";

interface PageHeaderProps {
  name: string;
  avatarUrl?: string | null;
}

/** Só o menu do usuário (saudação removida) */
export function PageHeader({ name, avatarUrl }: PageHeaderProps) {
  return (
    <div className="w-full flex items-center justify-end">
      <UserMenu name={name} avatarUrl={avatarUrl} />
    </div>
  );
}
