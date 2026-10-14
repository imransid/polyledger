/** A customer in a list: the name people know, the code small underneath. */
export function CustomerName({ name, code }: { name: string; code: string }) {
  return (
    <span className="grid">
      <span>{name}</span>
      <span className="text-xs text-muted-foreground">{code}</span>
    </span>
  );
}
